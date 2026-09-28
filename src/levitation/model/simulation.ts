/**
 * Orbital Levitation Lab: time simulation of one body in the fan jet.
 *
 * Rigid body with six degrees of freedom:
 *  - Translation of the centre of mass with the inertial mass (structure +
 *    enclosed gas + added air mass). The reported position is the geometric
 *    centre, kept consistent with the centre-of-mass offset.
 *  - Rotation integrated as world-frame angular momentum L with
 *    omega = R I^-1 R^T L, so Euler's equations (and gyroscopic effects such
 *    as a spinning halo resisting tilt) emerge without special cases.
 *  - Aerodynamic damping is applied implicitly, so tiny, light bodies stay
 *    stable at the fixed 1/240 s substep.
 *  - Floor (fan deck) and ceiling are penalty contacts on a sparse outline of
 *    the mesh, with friction, so a weighted body rights itself on the grille.
 *  - Turbulence is a 3D Ornstein-Uhlenbeck velocity (sigma = TI * U_eff,
 *    tau = 0.5 rh / U_eff); shedding is a sinusoid at the Strouhal frequency
 *    whose direction wanders slowly. Deterministic for a given seed.
 */

import type { DesignConfig, ForceBreakdown, SimState, SimStatus, Vec3 } from './types';
import { normaliseDesign } from './catalogue';
import {
  computeLoads,
  createAeroContext,
  createLoads,
  outlineExtent,
  type AeroContext,
  type BodyKinematics,
  type Loads,
  type NoiseInputs,
} from './aero';
import { analyseDesign } from './analysis';
import { StateHistory } from './history';
import {
  RHO_AIR,
  clamp,
  createRng,
  quatIdentity,
  quatIntegrate,
  quatRotate,
  quatRotateInverse,
  quatUp,
  radToDeg,
  vec3,
  v3clone,
  type Rng,
} from './math';

/** Fixed internal substep, s. */
export const SUBSTEP_S = 1 / 240;
const MAX_FRAME_S = 0.1;
const CONTACT_HZ = 6;
const CONTACT_DAMPING_RATIO = 0.7;
const FRICTION = 0.5;
const STATUS_SPEED = 0.25;
/** End-over-end turning rate (rad/s, smoothed) above which the body is tumbling, not holding an attitude. */
const TUMBLE_RATE = 1.2;
/** Hovering means inside the jet: lateral offset within this multiple of (jet half-width + footprint radius). */
const IN_JET_REACH = 1.25;
/** Beyond this multiple the body has left the jet, whatever its speed. */
const ESCAPED_REACH = 1.6;
const BODY_UP = { x: 0, y: 1, z: 0 };
const tumbleUp = { x: 0, y: 0, z: 0 };

// Module scratch vectors (the simulation is single-threaded; never held across calls).
const scratchA = vec3();
const scratchB = vec3();
const scratchC = vec3();
const scratchD = vec3();
const scratchE = vec3();
const scratchF = vec3();

export interface ResetOptions {
  /** Start at the analysed hover height (with the steady swirl spin) when one exists. */
  atEquilibrium?: boolean;
  /** Optional initial spin about the body axis, revolutions per second. */
  spinRps?: number;
}

function sameBody(a: DesignConfig, b: DesignConfig): boolean {
  return (
    a.shapeId === b.shapeId &&
    a.sizeM === b.sizeM &&
    a.materialId === b.materialId &&
    a.heliumFraction === b.heliumFraction
  );
}

function copyForces(loads: Loads): ForceBreakdown {
  return {
    weight: v3clone(loads.weight),
    buoyancy: v3clone(loads.buoyancy),
    jet: v3clone(loads.jet),
    centering: v3clone(loads.centering),
    shedding: v3clone(loads.shedding),
    turbulence: v3clone(loads.turbulence),
    total: v3clone(loads.total),
  };
}

export class LevitationSimulation {
  readonly history: StateHistory;
  private designValue: DesignConfig;
  private ctx: AeroContext;
  private readonly seed: number;
  private rng: Rng;

  // Rigid-body state.
  private readonly pCm = vec3();
  private readonly vCm = vec3();
  private readonly q = quatIdentity();
  private readonly L = vec3();
  private time = 0;
  private accumulator = 0;

  // Noise state.
  private readonly noise: NoiseInputs = {
    turbulence: vec3(),
    torqueNoise: vec3(),
    shedPhase: 0,
    shedAngle: 0,
    wander: true,
  };
  private shedAngleRate = 0;

  // Derived per-substep kinematics and loads.
  private readonly kin: BodyKinematics = {
    position: vec3(),
    velocity: vec3(),
    orientation: quatIdentity(),
    angularVelocity: vec3(),
  };
  private readonly loads: Loads = createLoads();
  private readonly extent = { min: 0, max: 0, minIndex: 0, maxIndex: 0 };
  private touchingFloor = false;
  private touchingCeiling = false;
  private smoothVy = 0;
  private smoothTumble = 0;
  private squash = 0;
  private wobble = 0;
  private current: SimState;

  constructor(design: DesignConfig, seed = 1) {
    this.designValue = normaliseDesign(design);
    this.ctx = createAeroContext(this.designValue);
    this.seed = Number.isFinite(seed) ? seed : 1;
    this.rng = createRng(this.seed);
    this.history = new StateHistory(2);
    this.current = this.reset();
  }

  get design(): DesignConfig {
    return this.designValue;
  }

  get state(): SimState {
    return this.current;
  }

  /**
   * Change the design. If only the fan, ceiling or turbulence changed the body
   * keeps its pose and velocity; any change to the body itself resets.
   */
  setDesign(design: DesignConfig): void {
    const next = normaliseDesign(design);
    const keep = sameBody(next, this.designValue);
    this.designValue = next;
    this.ctx = createAeroContext(next);
    if (!keep) {
      this.reset();
      return;
    }
    // Keep the body below a lowered ceiling.
    outlineExtent(this.ctx, this.q, this.extent);
    const rcm = quatRotate(this.q, this.ctx.mass.cmBody, vec3());
    const gcY = this.pCm.y - rcm.y;
    const maxY = next.ceilingM - this.extent.max;
    if (gcY > maxY) {
      this.pCm.y = maxY + rcm.y;
      if (this.vCm.y > 0) this.vCm.y = 0;
    }
    this.current = this.buildState();
  }

  /**
   * Put the body back: by default resting just above the fan outlet so the
   * lift-off can be watched; with atEquilibrium at the analysed hover height.
   */
  reset(options: ResetOptions = {}): SimState {
    this.rng = createRng(this.seed);
    this.time = 0;
    this.accumulator = 0;
    this.smoothVy = 0;
    this.smoothTumble = 0;
    this.squash = 0;
    this.wobble = 0;
    this.noise.turbulence.x = 0;
    this.noise.turbulence.y = 0;
    this.noise.turbulence.z = 0;
    this.noise.torqueNoise.x = 0;
    this.noise.torqueNoise.y = 0;
    this.noise.torqueNoise.z = 0;
    this.noise.shedPhase = this.rng.next() * 2 * Math.PI;
    this.noise.shedAngle = this.rng.next() * 2 * Math.PI;
    this.shedAngleRate = 0;
    quatIdentity(this.q);
    this.vCm.x = 0;
    this.vCm.y = 0;
    this.vCm.z = 0;
    this.L.x = 0;
    this.L.y = 0;
    this.L.z = 0;

    const ctx = this.ctx;
    let height = ctx.restHeight + 0.001;
    let spin = options.spinRps !== undefined ? options.spinRps * 2 * Math.PI : 0;
    // A millimetre-scale, seed-dependent nudge so the symmetric start is not exact.
    let x = (this.rng.next() - 0.5) * 0.004;
    let z = (this.rng.next() - 0.5) * 0.004;
    if (options.atEquilibrium) {
      const analysis = analyseDesign(this.designValue);
      if (analysis.equilibriumHeightM !== null) {
        height = analysis.equilibriumHeightM;
        x = 0;
        z = 0;
        if (options.spinRps === undefined) {
          const probe = this.probeLoads(height);
          spin = ctx.shape.swirlCoupling * probe.swirlRate;
        }
      }
    }
    const rcm = quatRotate(this.q, ctx.mass.cmBody, vec3());
    this.pCm.x = x + rcm.x;
    this.pCm.y = height + rcm.y;
    this.pCm.z = z + rcm.z;
    this.L.y = ctx.props.inertiaBody.y * spin;
    this.updateKinematics();
    computeLoads(ctx, this.kin, this.time, this.noise, this.loads);
    this.updateContactsFlags();
    this.history.clear();
    this.current = this.buildState();
    this.history.push(this.current);
    return this.current;
  }

  /** Advance by dtS (clamped to 0.1 s) in fixed 1/240 s substeps. */
  step(dtS: number): SimState {
    const dt = Number.isFinite(dtS) ? clamp(dtS, 0, MAX_FRAME_S) : 0;
    this.accumulator += dt / SUBSTEP_S;
    let n = Math.floor(this.accumulator + 1e-6);
    this.accumulator = Math.max(0, this.accumulator - n);
    n = Math.min(n, Math.ceil(MAX_FRAME_S / SUBSTEP_S) + 1);
    const startVy = this.kin.velocity.y;
    for (let i = 0; i < n; i += 1) this.substep(SUBSTEP_S);
    if (n > 0) {
      const alpha = 1 - Math.exp(-(n * SUBSTEP_S) / 0.5);
      this.smoothVy += (0.5 * (startVy + this.kin.velocity.y) - this.smoothVy) * alpha;
      this.current = this.buildState(n * SUBSTEP_S);
      this.history.push(this.current);
    }
    return this.current;
  }

  /** Give the body a push: linear impulse (N s) and optional angular impulse (N m s), world frame. */
  applyImpulse(linearNs: Vec3, angularNms?: Vec3): void {
    const m = this.ctx.props.inertialMassKg;
    this.vCm.x += linearNs.x / m;
    this.vCm.y += linearNs.y / m;
    this.vCm.z += linearNs.z / m;
    if (angularNms) {
      this.L.x += angularNms.x;
      this.L.y += angularNms.y;
      this.L.z += angularNms.z;
    }
    this.updateKinematics();
    this.current = this.buildState();
  }

  // -------------------------------------------------------------------------

  private probeLoads(height: number): Loads {
    const probe: BodyKinematics = {
      position: { x: 0, y: height, z: 0 },
      velocity: vec3(),
      orientation: quatIdentity(),
      angularVelocity: vec3(),
    };
    return computeLoads(this.ctx, probe, 0, null, createLoads());
  }

  /** Geometric-centre kinematics from the centre-of-mass state. */
  private updateKinematics(): void {
    const ctx = this.ctx;
    const I = ctx.props.inertiaBody;
    const kin = this.kin;
    kin.orientation.x = this.q.x;
    kin.orientation.y = this.q.y;
    kin.orientation.z = this.q.z;
    kin.orientation.w = this.q.w;
    const Lb = quatRotateInverse(this.q, this.L, scratchA);
    scratchB.x = Lb.x / I.x;
    scratchB.y = Lb.y / I.y;
    scratchB.z = Lb.z / I.z;
    const w = quatRotate(this.q, scratchB, kin.angularVelocity);
    const rcm = quatRotate(this.q, ctx.mass.cmBody, scratchC);
    kin.position.x = this.pCm.x - rcm.x;
    kin.position.y = this.pCm.y - rcm.y;
    kin.position.z = this.pCm.z - rcm.z;
    // v_gc = v_cm + w x (gc - cm) = v_cm - w x rcm
    kin.velocity.x = this.vCm.x - (w.y * rcm.z - w.z * rcm.y);
    kin.velocity.y = this.vCm.y - (w.z * rcm.x - w.x * rcm.z);
    kin.velocity.z = this.vCm.z - (w.x * rcm.y - w.y * rcm.x);
  }

  private updateNoise(h: number): void {
    const loads = this.loads;
    const Ueff = Math.max(loads.effectiveSpeed, 0.3);
    const tau = Math.max(0.01, (0.5 * Math.max(loads.halfWidth, 0.01)) / Ueff);
    const a = Math.exp(-h / tau);
    const b = Math.sqrt(Math.max(0, 1 - a * a));
    const sigma = this.ctx.jet.turbulenceIntensity * loads.effectiveSpeed;
    const rng = this.rng;
    const t = this.noise.turbulence;
    t.x = a * t.x + sigma * b * rng.gaussian();
    t.y = a * t.y + sigma * b * rng.gaussian();
    t.z = a * t.z + sigma * b * rng.gaussian();
    const n = this.noise.torqueNoise;
    n.x = a * n.x + b * rng.gaussian();
    n.y = a * n.y + b * rng.gaussian();
    n.z = a * n.z + b * rng.gaussian();
    const f = (this.ctx.shape.strouhal * loads.effectiveSpeed) / this.ctx.s;
    this.noise.shedPhase = (this.noise.shedPhase + 2 * Math.PI * f * h) % (2 * Math.PI);
    // Slowly wandering shedding direction (OU turn rate, 0.4 rad/s, 4 s).
    const ar = Math.exp(-h / 4);
    this.shedAngleRate = ar * this.shedAngleRate + 0.4 * Math.sqrt(1 - ar * ar) * rng.gaussian();
    this.noise.shedAngle += this.shedAngleRate * h;
  }

  private substep(h: number): void {
    const ctx = this.ctx;
    const props = ctx.props;
    const m = props.inertialMassKg;
    const I = props.inertiaBody;
    this.updateKinematics();
    this.updateNoise(h);
    const loads = computeLoads(ctx, this.kin, this.time, this.noise, this.loads);

    let Fx = loads.total.x;
    let Fy = loads.total.y;
    let Fz = loads.total.z;
    let Tx = loads.torque.x;
    let Ty = loads.torque.y;
    let Tz = loads.torque.z;
    let contactRotDamping = 0;

    // Penalty contacts with the fan deck (y = 0) and the ceiling.
    const kin = this.kin;
    const w = kin.angularVelocity;
    const rcm = quatRotate(this.q, ctx.mass.cmBody, scratchC);
    outlineExtent(ctx, this.q, this.extent);
    const kc = m * (2 * Math.PI * CONTACT_HZ) ** 2;
    const cc = 2 * CONTACT_DAMPING_RATIO * Math.sqrt(kc * m);
    const Imax = Math.max(I.x, I.y, I.z);
    const support = ctx.support;
    const contact = (index: number, planeY: number, sign: 1 | -1): void => {
      scratchD.x = support[index];
      scratchD.y = support[index + 1];
      scratchD.z = support[index + 2];
      const r = quatRotate(this.q, scratchD, scratchE);
      const py = kin.position.y + r.y;
      const pen = sign > 0 ? planeY - py : py - planeY;
      if (pen <= 0) return;
      // Contact point velocity v_gc + w x r.
      const vcx = kin.velocity.x + (w.y * r.z - w.z * r.y);
      const vcy = kin.velocity.y + (w.z * r.x - w.x * r.z);
      const vcz = kin.velocity.z + (w.x * r.y - w.y * r.x);
      const N = Math.max(0, kc * pen - sign * cc * vcy);
      const vt = Math.hypot(vcx, vcz);
      let ffx = 0;
      let ffz = 0;
      if (vt > 1e-9) {
        const mag = Math.min(FRICTION * N, cc * vt);
        ffx = (-mag * vcx) / vt;
        ffz = (-mag * vcz) / vt;
      }
      const fy = sign * N;
      Fx += ffx;
      Fy += fy;
      Fz += ffz;
      // Lever from the centre of mass: r - rcm.
      const lx = r.x - rcm.x;
      const ly = r.y - rcm.y;
      const lz = r.z - rcm.z;
      Tx += ly * ffz - lz * fy;
      Ty += lz * ffx - lx * ffz;
      Tz += lx * fy - ly * ffx;
      contactRotDamping += 2 * Imax;
    };
    contact(this.extent.minIndex, 0, 1);
    contact(this.extent.maxIndex, this.designValue.ceilingM, -1);

    // Translation: linearised backward Euler on the aerodynamic damping.
    const cl = loads.dampingLateral;
    const cv = loads.dampingVertical;
    this.vCm.x += (h * Fx) / (m + h * cl);
    this.vCm.y += (h * Fy) / (m + h * cv);
    this.vCm.z += (h * Fz) / (m + h * cl);
    this.pCm.x += h * this.vCm.x;
    this.pCm.y += h * this.vCm.y;
    this.pCm.z += h * this.vCm.z;

    // Rotation: explicit torque on L, implicit damping in the body frame.
    this.L.x += h * Tx;
    this.L.y += h * Ty;
    this.L.z += h * Tz;
    const damp = loads.rotationalDamping + contactRotDamping;
    const spinDamp = loads.spinDamping + contactRotDamping;
    const Lb = quatRotateInverse(this.q, this.L, scratchA);
    Lb.x /= 1 + (h * damp) / I.x;
    Lb.y /= 1 + (h * spinDamp) / I.y;
    Lb.z /= 1 + (h * damp) / I.z;
    quatRotate(this.q, Lb, this.L);
    scratchB.x = Lb.x / I.x;
    scratchB.y = Lb.y / I.y;
    scratchB.z = Lb.z / I.z;
    const omega = quatRotate(this.q, scratchB, scratchF);
    quatIntegrate(this.q, omega, h, this.q);
    this.time += h;
  }

  private updateContactsFlags(): void {
    outlineExtent(this.ctx, this.q, this.extent);
    const y = this.kin.position.y;
    this.touchingFloor = y + this.extent.min < 0.003;
    this.touchingCeiling = y + this.extent.max > this.designValue.ceilingM - 0.003;
  }

  private buildState(elapsed = 0): SimState {
    this.updateKinematics();
    this.updateContactsFlags();
    const ctx = this.ctx;
    const kin = this.kin;
    const loads = this.loads;
    const props = ctx.props;
    const lateral = Math.hypot(kin.position.x, kin.position.z);
    const reach = loads.halfWidth + loads.footprintRadius;
    // End-over-end rate: angular velocity with the spin about the body axis removed.
    const bodyUp = quatRotate(this.q, BODY_UP, tumbleUp);
    const omega = kin.angularVelocity;
    const along = omega.x * bodyUp.x + omega.y * bodyUp.y + omega.z * bodyUp.z;
    const perp = Math.hypot(omega.x - along * bodyUp.x, omega.y - along * bodyUp.y, omega.z - along * bodyUp.z);
    // Quick to notice tumbling, slow to forget it, so a pause mid-tumble is not called a hover.
    if (elapsed > 0) {
      const tau = perp > this.smoothTumble ? 0.3 : 2.0;
      this.smoothTumble += (perp - this.smoothTumble) * (1 - Math.exp(-elapsed / tau));
    }

    // "Hovering" is a claim about the jet holding the body, so it needs the body
    // inside the jet and not tumbling. Slow motion elsewhere is not hovering.
    let status: SimStatus;
    if (props.netWeightN > 0 && lateral > ESCAPED_REACH * reach) status = 'escaped';
    else if (this.touchingCeiling) status = 'at-ceiling';
    else if (this.touchingFloor) status = 'on-fan';
    else if (props.netWeightN <= 0) status = 'buoyant-drift';
    else if (this.smoothTumble > TUMBLE_RATE) status = 'tumbling';
    else if (this.smoothVy > STATUS_SPEED) status = 'rising';
    else if (this.smoothVy < -STATUS_SPEED || lateral > IN_JET_REACH * reach) status = 'falling';
    else status = 'hovering';

    // Visual skin response for elastic materials.
    const elasticity = ctx.material.elasticity;
    const Ueff = loads.effectiveSpeed;
    const qd = 0.5 * RHO_AIR * Ueff * Ueff;
    const squashTarget = 0.25 * elasticity * (qd / (qd + 40));
    const turb = this.noise.turbulence;
    const gust = Math.sqrt(turb.x * turb.x + turb.y * turb.y + turb.z * turb.z) / Math.max(Ueff, 0.3);
    const wobbleTarget = clamp(
      elasticity * ((qd / (qd + 25)) * (0.3 + 3 * ctx.jet.turbulenceIntensity) + 0.6 * gust),
      0,
      1,
    );
    if (elapsed > 0) {
      this.squash += (squashTarget - this.squash) * (1 - Math.exp(-elapsed / 0.2));
      this.wobble += (wobbleTarget - this.wobble) * (1 - Math.exp(-elapsed / 0.35));
    } else {
      this.squash = squashTarget;
      this.wobble = wobbleTarget;
    }

    const up = quatUp(this.q, scratchA);
    const w = kin.angularVelocity;
    return {
      timeS: this.time,
      position: v3clone(kin.position),
      velocity: v3clone(kin.velocity),
      orientation: { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w },
      angularVelocity: v3clone(w),
      forces: copyForces(loads),
      status,
      effectiveSpeedMps: Ueff,
      heightM: kin.position.y,
      lateralOffsetM: lateral,
      tiltDeg: radToDeg(Math.acos(clamp(up.y, -1, 1))),
      spinRps: (w.x * up.x + w.y * up.y + w.z * up.z) / (2 * Math.PI),
      squash: clamp(this.squash, 0, 0.25),
      wobble: clamp(this.wobble, 0, 1),
    };
  }
}

