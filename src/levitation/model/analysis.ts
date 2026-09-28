/**
 * Orbital Levitation Lab: fast steady-state analysis of a design.
 *
 * Everything here uses the same load model as the simulation (aero.ts), with
 * turbulence and shedding switched off and the body upright and on the jet
 * axis. It never time-steps, so the envelope can sweep hundreds of designs.
 *
 *  - Equilibrium: the vertical push F(h) is scanned from the resting height to
 *    the ceiling; the first downward crossing of the net weight (dF/dh < 0) is
 *    refined by bisection.
 *  - Stability: numerical derivatives of the loads give the lateral stiffness
 *    and damping, the tilt stiffness, the tilt-to-glide coupling (G) and the
 *    offset-to-tilt coupling (H). A flat body diverges when G H > k K. A
 *    spinning body is gyroscopically stabilised when (I_axial w)^2 > 4 I_t |K|
 *    (the sleeping-top criterion).
 *  - Sway: RMS response of the lateral oscillator (inertial mass, centering
 *    stiffness, jet damping) to Ornstein-Uhlenbeck turbulent forcing (sigma =
 *    TI times the push, correlation time 0.5 rh / U_eff), plus the resonant
 *    response to vortex shedding and the jet-axis wander. This refines the
 *    brief's "2 TI W / k" rule of thumb so the estimate matches the simulation.
 */

import type {
  DesignAnalysis,
  DesignConfig,
  EnvelopeCell,
  FlowRegime,
  LevitationEnvelope,
  Verdict,
} from './types';
import { normaliseDesign } from './catalogue';
import {
  computeLoads,
  createAeroContext,
  createLoads,
  dragCrisisFactor,
  verticalJetForce,
  withFan,
  type AeroContext,
  type BodyKinematics,
  type Loads,
} from './aero';
import { fanDerived } from './jet';
import { NU_AIR, RHO_AIR, clamp, quatFromTilt, smooth01, vec3 } from './math';

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export interface StabilityDetail {
  /** Tilt stiffness about the CM, N m / rad (> 0 restoring). */
  tiltStiffness: number;
  /** Tilt stiffness after the lateral glide coupling. */
  effectiveTiltStiffness: number;
  /** Side force per radian of tilt, N / rad. */
  glideCoupling: number;
  /** Tilt torque per metre of offset, N m / m. */
  offsetCoupling: number;
  /** Steady swirl-driven spin, rad/s. */
  spinRate: number;
  gyroStabilised: boolean;
  /** Static tilt forced by a lopsided shape, rad (0 for symmetric shapes). */
  lopsidedTiltRad: number;
  lopsidedUnstable: boolean;
}

export interface CoreAnalysis {
  verdict: Verdict;
  equilibriumHeightM: number | null;
  liftMargin: number;
  restHeightM: number;
  ceilingHeightM: number;
  netWeightN: number;
  forceAtRestN: number;
  forceAtCeilingN: number;
  verticalStiffness: number | null;
  verticalHz: number | null;
  verticalRmsM: number | null;
  lateralStiffness: number | null;
  lateralDamping: number | null;
  swayHz: number | null;
  sheddingHz: number | null;
  swayAmplitudeM: number | null;
  swayRatio: number | null;
  tiltStability: 'stable' | 'neutral' | 'unstable';
  stability: StabilityDetail | null;
  reynolds: number | null;
  regime: FlowRegime | null;
  effectiveSpeed: number | null;
  lambda: number | null;
  groundFactor: number | null;
  halfWidthM: number | null;
  footprintRadiusM: number;
  touchesFan: boolean;
  touchesCeiling: boolean;
  /** RMS rocking of non-round shapes at hover, degrees (null when round or not hovering). */
  rockingRmsDeg: number | null;
}

/** Rocking beyond this RMS tilt reads as a wobbly hover. */
const ROCKING_LIMIT_DEG = 12;

const kin: BodyKinematics = {
  position: vec3(),
  velocity: vec3(),
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  angularVelocity: vec3(),
};
const L0 = createLoads();
const L1 = createLoads();

function loadsAt(
  ctx: AeroContext,
  h: number,
  out: Loads,
  opts: { dx?: number; tilt?: number; vx?: number; vy?: number } = {},
): Loads {
  kin.position.x = opts.dx ?? 0;
  kin.position.y = h;
  kin.position.z = 0;
  kin.velocity.x = opts.vx ?? 0;
  kin.velocity.y = opts.vy ?? 0;
  kin.velocity.z = 0;
  if (opts.tilt) quatFromTilt(opts.tilt, 0, 0, kin.orientation);
  else {
    kin.orientation.x = 0;
    kin.orientation.y = 0;
    kin.orientation.z = 0;
    kin.orientation.w = 1;
  }
  return computeLoads(ctx, kin, 0, null, out);
}

export function flowRegime(reynolds: number): FlowRegime {
  if (reynolds < 1e3) return 'laminar';
  if (reynolds < 2e5) return 'subcritical';
  if (reynolds < 4e5) return 'transitional';
  return 'supercritical';
}

/** Oscillator (m, c, k) RMS response to OU forcing (sigma, correlation time tau). */
function ouResponseRms(sigmaF: number, tau: number, m: number, c: number, k: number): number {
  if (!(k > 0) || !(c > 0) || !(m > 0)) return Infinity;
  const gamma = c / m;
  const w2 = k / m;
  const variance = (sigmaF * sigmaF * tau * (1 + gamma * tau)) / (c * k * (1 + gamma * tau + w2 * tau * tau));
  return Math.sqrt(Math.max(0, variance));
}

function harmonicResponse(force: number, omega: number, m: number, c: number, k: number): number {
  const re = k - m * omega * omega;
  const im = c * omega;
  return force / Math.max(1e-12, Math.sqrt(re * re + im * im));
}

/** Vertical push at centre height h with the body offset d from the jet axis (upright, still). */
function forceAtOffset(ctx: AeroContext, h: number, d: number): number {
  return d > 0 ? loadsAt(ctx, h, L1, { dx: d }).jet.y : verticalJetForce(ctx, h);
}

/** First downward crossing of force(h) = W between lo and hi, refined by bisection. */
function findCrossing(force: (h: number) => number, W: number, lo: number, hi: number, steps: number): number | null {
  let prevH = lo;
  for (let i = 1; i <= steps; i += 1) {
    const h = lo + ((hi - lo) * i) / steps;
    if (force(h) < W) {
      let a = prevH;
      let b = h;
      for (let it = 0; it < 18; it += 1) {
        const mid = 0.5 * (a + b);
        if (force(mid) >= W) a = mid;
        else b = mid;
      }
      return 0.5 * (a + b);
    }
    prevH = h;
  }
  return null;
}

/**
 * Fill the hover-dependent fields of `result` at height hEq. `force` is the
 * vertical push used for the vertical stiffness. Returns the per-axis RMS
 * sideways wander (m), or Infinity when nothing holds the body in the jet.
 */
function evaluateHover(ctx: AeroContext, hEq: number, result: CoreAnalysis, force: (h: number) => number): number {
  const props = ctx.props;
  const hRest = result.restHeightM;
  const hTop = result.ceilingHeightM;
  result.equilibriumHeightM = hEq;
  result.rockingRmsDeg = null;

  // Vertical stiffness and base loads at the hover point.
  const dh = Math.max(0.005, 0.01 * ctx.s);
  const hLo = Math.max(hRest, hEq - dh);
  const kv = -(force(hEq + dh) - force(hLo)) / (hEq + dh - hLo);
  const base = loadsAt(ctx, hEq, L0);
  const m = props.inertialMassKg;
  const Ueff = base.effectiveSpeed;
  const rh = base.halfWidth;
  const Rf = base.footprintRadius;
  const push = Math.max(1e-9, base.verticalPush);
  const jetPush = base.jetPush;
  const TI = ctx.jet.turbulenceIntensity;
  const tauC = (0.5 * rh) / Math.max(Ueff, 0.3);
  result.verticalStiffness = kv;
  result.verticalHz = kv > 0 ? Math.sqrt(kv / m) / (2 * Math.PI) : 0;
  result.reynolds = base.reynolds;
  result.regime = flowRegime(base.reynolds);
  result.effectiveSpeed = Ueff;
  result.lambda = base.lambda;
  result.groundFactor = base.groundFactor;
  result.halfWidthM = rh;
  result.footprintRadiusM = Rf;
  result.sheddingHz = (ctx.shape.strouhal * Ueff) / ctx.s;

  const cv = Math.max(1e-9, base.dampingVertical);
  const verticalRms = ouResponseRms(2 * TI * jetPush, tauC, m, cv, Math.max(kv, 1e-9));
  result.verticalRmsM = verticalRms;

  // Lateral stiffness, damping and the tilt couplings (numerical derivatives).
  const reach = rh + Rf;
  const dx = 0.02 * reach;
  const off = loadsAt(ctx, hEq, L1, { dx });
  const kLat = -(off.total.x - base.total.x) / dx;
  const H = -(off.torque.z - base.torque.z) / dx;
  const dv = 0.05;
  const moving = loadsAt(ctx, hEq, L1, { vx: dv });
  const cLat = Math.max(1e-9, -(moving.total.x - base.total.x) / dv);
  const dTheta = 0.03;
  const tilted = loadsAt(ctx, hEq, L1, { tilt: dTheta });
  const G = (tilted.total.x - base.total.x) / dTheta;
  const K = (tilted.torque.z - base.torque.z) / dTheta;
  result.lateralStiffness = kLat;
  result.lateralDamping = cLat;

  const scale = push * ctx.s;
  const Keff = kLat > 0 ? K - (G * H) / kLat : -Math.abs(K) - 0.05 * scale;
  const inertia = props.inertiaBody;
  const Iax = inertia.y;
  const It = Math.max(inertia.x, inertia.z);
  const spin = ctx.shape.swirlCoupling * base.swirlRate;
  // Gyroscopic stiffness of the steady spin: a statically unstable top stands
  // when (I_axial w)^2 > 4 I_t |K| (sleeping-top criterion, 20% margin).
  const gyroStiffness = (Iax * spin) ** 2 / (4.8 * It);
  const Kg = Keff + gyroStiffness;
  const gyro = Keff < -0.02 * scale && Kg > 0;
  const lopsided = Math.hypot(base.torque.x, base.torque.z);
  let lopsidedTilt = 0;
  let lopsidedUnstable = false;
  const maxCentering = ctx.shape.coandaCoeff * push * 0.43;
  if (lopsided > 0.01 * scale) {
    if (Kg <= 0) lopsidedUnstable = true;
    else {
      lopsidedTilt = lopsided / Kg;
      if (lopsidedTilt > 0.45 || Math.abs(G) * lopsidedTilt > 0.6 * maxCentering) lopsidedUnstable = true;
    }
  }
  const norm = Kg / Math.max(1e-9, scale);
  let tilt: 'stable' | 'neutral' | 'unstable';
  if (lopsidedUnstable) tilt = 'unstable';
  else if (gyro || norm > 0.02) tilt = 'stable';
  else if (norm >= -0.02) tilt = 'neutral';
  else tilt = 'unstable';
  result.tiltStability = tilt;
  result.stability = {
    tiltStiffness: K,
    effectiveTiltStiffness: Keff,
    glideCoupling: G,
    offsetCoupling: H,
    spinRate: spin,
    gyroStabilised: gyro,
    lopsidedTiltRad: lopsidedTilt,
    lopsidedUnstable,
  };

  // Lateral sway (a quasi-static tilt softens the lateral spring for flat bodies).
  let kSway = kLat;
  if (K + gyroStiffness > 0 && Kg > 0) kSway = kLat - (G * H) / (K + gyroStiffness);
  let axisSigma = Infinity;
  if (kSway > 0) {
    const sigmaF = TI * jetPush;
    const turb = ouResponseRms(sigmaF, tauC, m, cLat, kSway);
    const shedForce = ctx.shape.sheddingLiftCoeff * push;
    const shedOmega = 2 * Math.PI * (result.sheddingHz ?? 0);
    const shed = harmonicResponse(shedForce, shedOmega, m, cLat, kSway);
    const wanderAmp = ctx.jet.wanderAmplitude * smooth01(hEq / (2 * ctx.jet.D));
    const wanderOmega = (2 * Math.PI) / 8;
    const wander = wanderAmp * harmonicResponse(kSway, wanderOmega, m, cLat, kSway);
    const rms = Math.sqrt(2 * turb * turb + 0.5 * shed * shed + (0.73 * wander) ** 2);
    result.swayAmplitudeM = rms;
    result.swayRatio = rms / reach;
    result.swayHz = Math.sqrt(kSway / m) / (2 * Math.PI);
    axisSigma = rms / Math.SQRT2;
  } else {
    result.swayAmplitudeM = Infinity;
    result.swayRatio = Infinity;
    result.swayHz = 0;
  }

  // Rocking: tilt response of shapes whose tilt is visible (not round).
  const leverY = Math.abs(ctx.cpBody.y - ctx.mass.cmBody.y);
  const round = leverY < 0.02 * ctx.s && Math.abs(ctx.anisotropy) < 0.05 && ctx.flatness < 0.2;
  if (!round && tilt !== 'unstable' && Kg > 0) {
    const sigmaTorque = TI * jetPush * Math.hypot(0.12 * Rf, leverY);
    result.rockingRmsDeg = (ouResponseRms(sigmaTorque, tauC, It, Math.max(1e-12, base.rotationalDamping), Kg) * 180) / Math.PI;
  }
  result.touchesFan = hEq - 2 * verticalRms < hRest;
  result.touchesCeiling = hEq + 2 * verticalRms > hTop;

  const ratio = result.swayRatio ?? Infinity;
  if (tilt === 'unstable') result.verdict = 'unstable-tumble';
  else if (!(kSway > 0) || ratio > 0.6) result.verdict = 'escapes-jet';
  else if (ratio > 0.25 || result.touchesFan || result.touchesCeiling || (result.rockingRmsDeg ?? 0) > ROCKING_LIMIT_DEG) {
    result.verdict = 'wobbly-hover';
  } else result.verdict = 'stable-hover';
  return axisSigma;
}

export function coreAnalysis(ctx: AeroContext): CoreAnalysis {
  const props = ctx.props;
  const W = props.netWeightN;
  const hRest = ctx.restHeight;
  const hTop = Math.max(hRest + 1e-3, ctx.ceilingHeight);
  const Frest = verticalJetForce(ctx, hRest);
  const result: CoreAnalysis = {
    verdict: 'stable-hover',
    equilibriumHeightM: null,
    liftMargin: W > 0 ? Frest / W : Infinity,
    restHeightM: hRest,
    ceilingHeightM: hTop,
    netWeightN: W,
    forceAtRestN: Frest,
    forceAtCeilingN: NaN,
    verticalStiffness: null,
    verticalHz: null,
    verticalRmsM: null,
    lateralStiffness: null,
    lateralDamping: null,
    swayHz: null,
    sheddingHz: null,
    swayAmplitudeM: null,
    swayRatio: null,
    tiltStability: 'neutral',
    stability: null,
    reynolds: null,
    regime: null,
    effectiveSpeed: null,
    lambda: null,
    groundFactor: null,
    halfWidthM: null,
    footprintRadiusM: props.footprintRadiusM,
    touchesFan: false,
    touchesCeiling: false,
    rockingRmsDeg: null,
  };
  if (!(W > 0)) {
    result.verdict = 'buoyant';
    return result;
  }
  if (Frest < W) {
    result.verdict = 'too-heavy';
    return result;
  }

  // On-axis equilibrium: first downward crossing of the net weight.
  const onAxis = (h: number): number => verticalJetForce(ctx, h);
  const found = findCrossing(onAxis, W, hRest, hTop, 40);
  result.forceAtCeilingN = onAxis(hTop);
  if (found === null) {
    result.verdict = 'blown-to-ceiling';
    return result;
  }
  const sigma = evaluateHover(ctx, found, result, onAxis);

  // A swaying body samples the jet off-axis. Average the push over the
  // expected (Rayleigh-distributed) offset with 2-point Gauss-Laguerre
  // quadrature and re-solve, so the height matches the time-averaged motion
  // (this matters for the halo, whose hole stops lining up with the core).
  if (Number.isFinite(sigma) && sigma > 1e-4 && result.verdict !== 'unstable-tumble') {
    const r1 = 1.0824 * sigma;
    const r2 = 2.6131 * sigma;
    const averaged = (h: number): number => 0.8536 * forceAtOffset(ctx, h, r1) + 0.1464 * forceAtOffset(ctx, h, r2);
    if (Math.abs(averaged(found) - W) > 0.005 * W) {
      const refined = findCrossing(averaged, W, hRest, hTop, 24);
      if (refined !== null) evaluateHover(ctx, refined, result, averaged);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

function levitationScore(core: CoreAnalysis): number {
  switch (core.verdict) {
    case 'buoyant':
      return 5;
    case 'too-heavy':
      return Math.round(22 * clamp(core.liftMargin, 0, 1));
    case 'blown-to-ceiling':
      return 18;
    case 'unstable-tumble':
      return 12;
    case 'escapes-jet':
      return 24;
    default:
      break;
  }
  const h = core.equilibriumHeightM ?? core.restHeightM;
  const range = Math.max(1e-6, core.ceilingHeightM - core.restHeightM);
  const position = (h - core.restHeightM) / range;
  const heightScore = smooth01(position / 0.12) * smooth01((1 - position) / 0.12);
  const swayScore = 1 - clamp((core.swayRatio ?? 1) / 0.6, 0, 1);
  const tiltScore = core.tiltStability === 'stable' ? 1 : core.tiltStability === 'neutral' ? 0.85 : 0;
  const marginScore = smooth01((core.liftMargin - 1) / 0.3);
  const bob = core.verticalRmsM ?? range;
  const bobScore = 1 - clamp(bob / (0.2 * range + 0.05), 0, 1);
  const raw = 0.32 * swayScore + 0.18 * heightScore + 0.2 * tiltScore + 0.15 * marginScore + 0.15 * bobScore;
  const capped = core.verdict === 'wobbly-hover' ? Math.min(raw, 0.7) : raw;
  return Math.round(100 * clamp(capped, 0, 1));
}

function projectionScore(ctx: AeroContext): number {
  const m = ctx.material;
  const shape = ctx.shape;
  const value =
    Math.pow(clamp(m.reflectance / 0.88, 0, 1), 0.8) *
    (1 - 0.5 * m.gloss) *
    (1 - 0.6 * m.translucency) *
    (0.55 + 0.45 * shape.smoothness) *
    (0.75 + 0.25 * shape.convexity);
  return Math.round(100 * clamp(value, 0, 1));
}

function trackingScore(ctx: AeroContext, core: CoreAnalysis): number {
  const m = ctx.material;
  const shape = ctx.shape;
  const nir = 0.45 + 0.55 * clamp(m.nir850 / 0.85, 0, 1);
  const size = 0.5 + 0.5 * smooth01((ctx.s - 0.1) / 0.5);
  const hovering = core.verdict === 'stable-hover' || core.verdict === 'wobbly-hover';
  const motion = hovering ? 1 - 0.5 * clamp((core.swayRatio ?? 0) / 0.6, 0, 1) : core.verdict === 'too-heavy' ? 1 : 0.5;
  const tumble = core.tiltStability === 'unstable' ? 0.6 : 1;
  return Math.round(100 * clamp(Math.pow(shape.convexity, 0.8) * nir * size * motion * tumble, 0, 1));
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Material names that read naturally inside a sentence. */
const SKIN_NAMES: Record<string, string> = {
  pvc: 'Matte PVC',
  latex: 'Balloon latex',
  'tpu-nylon': 'TPU-coated nylon',
  silnylon: 'Silnylon',
  tyvek: 'Tyvek',
  'washi-carbon': 'Washi paper',
  mylar: 'Mylar',
  'eps-shell': 'White EPS foam',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  'stable-hover': 'Hovers steadily',
  'wobbly-hover': 'Hovers, but wobbles',
  'too-heavy': 'Too heavy to lift',
  'blown-to-ceiling': 'Blown to the ceiling',
  'unstable-tumble': 'Tumbles out',
  'escapes-jet': 'Slides out of the jet',
  buoyant: 'Floats on its own',
};

export function fmtLength(m: number): string {
  if (!Number.isFinite(m)) return 'unbounded';
  if (Math.abs(m) < 0.995) return `${Math.round(m * 100)} cm`;
  return `${m.toFixed(1)} m`;
}

function fmtHz(hz: number): string {
  if (hz < 0.095) return `${hz.toFixed(2)} Hz`;
  return `${hz.toFixed(1)} Hz`;
}

function fmtMass(kg: number): string {
  if (kg < 0.995) return `${Math.round(kg * 1000)} g`;
  return `${kg.toFixed(1)} kg`;
}

function fmtForce(n: number): string {
  if (Math.abs(n) < 9.95) return `${n.toFixed(1)} N`;
  return `${Math.round(n)} N`;
}

function fmtPower(w: number): string {
  if (w < 995) return `${Math.round(w)} W`;
  return `${(w / 1000).toFixed(1)} kW`;
}

/** Lowest outlet speed that lifts the design off the fan (bisection on U0). */
function minimumOutletSpeed(ctx: AeroContext, W: number): number | null {
  if (!(W > 0)) return null;
  const forceAt = (speed: number): number => {
    const alt = withFan(ctx, { ...ctx.design.fan, outletSpeedMps: speed });
    return verticalJetForce(alt, ctx.restHeight);
  };
  let lo = 0.05;
  let hi = 60;
  if (forceAt(hi) < W) return null;
  for (let it = 0; it < 32; it += 1) {
    const mid = Math.sqrt(lo * hi);
    if (forceAt(mid) >= W) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Highest outlet speed that still leaves an equilibrium below the ceiling (approx). */
function maximumOutletSpeed(ctx: AeroContext, W: number): number | null {
  const Fceil = verticalJetForce(ctx, ctx.ceilingHeight);
  if (!(Fceil > 0) || !(W > 0)) return null;
  return ctx.jet.U0 * Math.sqrt(W / Fceil);
}

function terminalVelocity(ctx: AeroContext, W: number): number {
  const shape = ctx.shape;
  const area = ctx.props.frontalAreaAxialM2;
  let v = Math.sqrt((2 * Math.abs(W)) / (RHO_AIR * shape.cdAxial * area));
  for (let it = 0; it < 4; it += 1) {
    const cd = shape.cdAxial * (shape.dragCrisis ? dragCrisisFactor((v * ctx.s) / NU_AIR) : 1);
    v = Math.sqrt((2 * Math.abs(W)) / (RHO_AIR * cd * area));
  }
  return v;
}

function buildReasons(ctx: AeroContext, core: CoreAnalysis, minSpeed: number | null, projection: number, tracking: number): string[] {
  const reasons: string[] = [];
  const props = ctx.props;
  const shape = ctx.shape;
  const material = ctx.material;
  const fan = fanDerived(ctx.design.fan);
  const W = core.netWeightN;

  if (W > 0) {
    const gas = props.enclosedGasKg > 0 && ctx.design.heliumFraction > 0 ? ' after helium lift' : '';
    reasons.push(
      `It weighs ${fmtMass(props.massKg)}, so the jet has to hold up ${fmtForce(W)}${gas}.`,
    );
  } else {
    reasons.push(
      `The helium inside lifts more than the skin weighs, so it floats up by itself with ${fmtForce(-W)} to spare.`,
    );
    return reasons;
  }

  if (core.verdict === 'too-heavy') {
    reasons.push(
      `Just above the fan the jet pushes with only ${Math.round(core.liftMargin * 100)}% of its weight, so it cannot lift off.`,
    );
    if (minSpeed !== null) reasons.push(`It needs an outlet speed of at least ${minSpeed.toFixed(1)} m/s, or a lighter skin.`);
    else reasons.push('Even the fastest fan in range cannot lift it; try a lighter skin, a smaller size or helium.');
    return reasons;
  }

  reasons.push(
    `Just above the fan the jet pushes with ${core.liftMargin.toFixed(1)} times its weight, so it lifts off.`,
  );

  if (core.verdict === 'blown-to-ceiling') {
    const maxSpeed = maximumOutletSpeed(ctx, W);
    reasons.push('Even at the ceiling the jet still pushes harder than its weight, so it pins itself there.');
    if (maxSpeed !== null) reasons.push(`Slowing the fan to about ${maxSpeed.toFixed(1)} m/s or less would let it hover below the ceiling.`);
    return reasons;
  }

  const hEq = core.equilibriumHeightM ?? 0;
  const lambda = core.lambda ?? 0;
  if (core.verdict === 'unstable-tumble') {
    reasons.push(`The push would balance its weight about ${fmtLength(hEq)} up (centre height), but it cannot stay level there.`);
  } else {
    reasons.push(`It rises until the push matches its weight, about ${fmtLength(hEq)} above the outlet (centre height).`);
  }

  if ((core.groundFactor ?? 1) > 1.05 && lambda > 1.6) {
    reasons.push(
      'It is much wider than the jet, so it catches nearly all of the air at any height. What sets its height is the extra push close to the fan (ground effect), which makes the hover height sensitive to fan speed.',
    );
  } else if (hEq > ctx.jet.coreLength) {
    reasons.push(
      `The jet keeps its full push for about ${fmtLength(ctx.jet.coreLength)} above the outlet (its core). Beyond that it slows and spreads, and that is where the push drops to its weight.`,
    );
  } else if (lambda < 0.6) {
    reasons.push('The jet is wider than the body, so it sits in the air like a ball on a fountain and finds its height where the jet has slowed enough.');
  }

  if (shape.dragCrisis && lambda < 1.4 && (core.regime === 'transitional' || core.regime === 'supercritical')) {
    reasons.push('At this size and speed the air around it turns turbulent and its drag drops (the drag crisis), so it sits lower than you might expect.');
  }

  const stab = core.stability;
  if (stab) {
    if (stab.lopsidedUnstable) {
      reasons.push('Its shape is lopsided, so the push is uneven: it tips, glides sideways and keeps turning over.');
    } else if (stab.gyroStabilised) {
      reasons.push(
        `The fan's swirl spins it at about ${(stab.spinRate / (2 * Math.PI)).toFixed(2)} rev/s, and the spin holds it level like a gyroscope.`,
      );
    } else if (core.tiltStability === 'unstable') {
      if (stab.glideCoupling * stab.offsetCoupling > 0 && stab.tiltStiffness > 0) {
        reasons.push('A small tilt makes it glide off the jet, and off the jet it tilts further: a flat body this wide balances like a plate on a stick.');
      } else {
        reasons.push('Nothing pulls it back upright: once it tips, the air turns it further.');
      }
    } else if (ctx.shape.cmOffset < ctx.shape.cpOffset - 0.1 && ctx.shape.ballastFraction > 0) {
      reasons.push('Its weight sits well below where the air pushes, so it swings back upright like a pendulum.');
    } else if (core.tiltStability === 'neutral') {
      reasons.push('It is round, so tilting changes nothing: it can roll freely without falling out.');
    } else if (core.tiltStability === 'stable' && ctx.anisotropy < -0.2) {
      reasons.push('It lies flat in the jet: the air pushing on its broad underside keeps it level.');
    }
    const spinRps = stab.spinRate / (2 * Math.PI);
    if (!stab.gyroStabilised && spinRps > 0.03 && core.verdict !== 'unstable-tumble') {
      reasons.push(`The fan's swirl turns it slowly, about one turn every ${Math.round(1 / spinRps)} s.`);
    }
  }

  if (core.verdict !== 'unstable-tumble' && core.swayAmplitudeM !== null && Number.isFinite(core.swayAmplitudeM)) {
    const swayWords = `Turbulence and vortex shedding make it sway about ${fmtLength(core.swayAmplitudeM)} (RMS) at around ${fmtHz(core.swayHz ?? 0)}, while the jet's pull toward its axis draws it back.`;
    reasons.push(swayWords);
    if (core.verdict === 'escapes-jet') reasons.push('That sway is too large for the jet to hold: it drifts out and falls.');
  }
  if (core.rockingRmsDeg !== null && core.rockingRmsDeg > 4) {
    reasons.push(`It rocks about ${Math.round(core.rockingRmsDeg)}° either way as the turbulence nudges it.`);
  }
  if (core.touchesFan) reasons.push('It bobs low enough to touch down on the fan now and then.');
  if (core.touchesCeiling) reasons.push('It bobs high enough to brush the ceiling.');
  if (core.verticalHz !== null && core.verticalHz > 0 && core.verdict !== 'unstable-tumble') {
    reasons.push(`It bobs up and down slowly, about once every ${(1 / core.verticalHz).toFixed(0)} s.`);
  }

  const skin = SKIN_NAMES[material.id] ?? material.name;
  if (projection >= 75) reasons.push(`${skin} makes a bright, even projection screen.`);
  else if (material.gloss > 0.7) reasons.push(`${skin} is a mirror rather than a screen: most of the audience sees reflections, not images.`);
  else if (material.translucency > 0.35) reasons.push(`${skin} lets light through, so projections look paler and show on the far side.`);
  else if (projection < 70) reasons.push(`${skin} gives a usable but dimmer, slightly glossy projection surface.`);

  if (tracking >= 75) reasons.push('Its round, bright silhouette is easy for the camera tracker to follow.');
  else if (shape.convexity < 0.75) reasons.push('Its silhouette is not a simple oval, so the camera tracker will struggle with it.');

  reasons.push(
    `The fan moves ${fan.flowM3s.toFixed(1)} m³/s and needs roughly ${fmtPower(fan.electricalPowerW)} of electricity at this speed.`,
  );
  return reasons;
}

function buildSummary(core: CoreAnalysis, minSpeed: number | null, ctx: AeroContext): string {
  const h = core.equilibriumHeightM;
  switch (core.verdict) {
    case 'stable-hover':
      return `Hovers at ${fmtLength(h ?? 0)} with a slow ${fmtHz(core.verticalHz ?? 0)} bob and about ${fmtLength(core.swayAmplitudeM ?? 0)} of sway.`;
    case 'wobbly-hover': {
      const at = fmtLength(h ?? 0);
      if ((core.swayRatio ?? 0) > 0.25) {
        return `Hovers at ${at} but wobbles, swaying about ${fmtLength(core.swayAmplitudeM ?? 0)} at ${fmtHz(core.swayHz ?? 0)}.`;
      }
      if ((core.rockingRmsDeg ?? 0) > ROCKING_LIMIT_DEG) {
        return `Hovers at ${at} but rocks about ${Math.round(core.rockingRmsDeg ?? 0)}° either way as it bobs.`;
      }
      if (core.touchesFan) return `Hovers at ${at}, but bobs low enough to touch down on the fan now and then.`;
      if (core.touchesCeiling) return `Hovers at ${at}, but bobs high enough to brush the ceiling now and then.`;
      return `Hovers at ${at} but wobbles.`;
    }
    case 'too-heavy':
      return minSpeed !== null
        ? `Too heavy: the jet gives only ${Math.round(core.liftMargin * 100)}% of its weight. It needs at least ${minSpeed.toFixed(1)} m/s.`
        : `Too heavy: the jet gives only ${Math.round(core.liftMargin * 100)}% of its weight at any fan speed.`;
    case 'blown-to-ceiling': {
      const max = maximumOutletSpeed(ctx, core.netWeightN);
      return max !== null
        ? `The jet is too strong and pins it to the ${fmtLength(ctx.design.ceilingM)} ceiling. Try about ${max.toFixed(1)} m/s.`
        : `The jet is too strong and pins it to the ${fmtLength(ctx.design.ceilingM)} ceiling.`;
    }
    case 'unstable-tumble':
      return 'Lifts off, then tips over and tumbles out of the jet.';
    case 'escapes-jet':
      return `Lifts to about ${fmtLength(h ?? 0)}, but sways too far and slides out of the jet.`;
    case 'buoyant':
      return 'Lighter than air: it floats up without the fan.';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyseDesign(design: DesignConfig): DesignAnalysis {
  const normalised = normaliseDesign(design);
  const ctx = createAeroContext(normalised);
  const core = coreAnalysis(ctx);
  const fan = fanDerived(normalised.fan);
  const minSpeed = minimumOutletSpeed(ctx, core.netWeightN);
  const projection = projectionScore(ctx);
  const tracking = trackingScore(ctx, core);
  const hovering = core.verdict === 'stable-hover' || core.verdict === 'wobbly-hover' || core.verdict === 'escapes-jet';
  return {
    verdict: core.verdict,
    verdictLabel: VERDICT_LABELS[core.verdict],
    summary: buildSummary(core, minSpeed, ctx),
    score: levitationScore(core),
    equilibriumHeightM: core.equilibriumHeightM,
    liftMargin: Number.isFinite(core.liftMargin) ? core.liftMargin : 0,
    minimumOutletSpeedMps: minSpeed,
    terminalVelocityMps: terminalVelocity(ctx, core.netWeightN),
    reynoldsAtHover: hovering || core.verdict === 'unstable-tumble' ? core.reynolds : null,
    regime: hovering || core.verdict === 'unstable-tumble' ? core.regime : null,
    verticalHz: core.verticalHz,
    swayHz: core.swayHz,
    sheddingHz: core.sheddingHz,
    swayAmplitudeM: core.swayAmplitudeM !== null && Number.isFinite(core.swayAmplitudeM) ? core.swayAmplitudeM : null,
    tiltStability: core.tiltStability,
    projectionScore: projection,
    trackingScore: tracking,
    reasons: buildReasons(ctx, core, minSpeed, projection, tracking),
    fan,
    properties: { ...ctx.props, inertiaBody: { ...ctx.props.inertiaBody } },
  };
}

/**
 * Verdict and score over a grid of outlet speeds and sizes, from the analysis
 * (no time simulation). cells[sizeIndex][speedIndex].
 */
export function levitationEnvelope(design: DesignConfig, speedsMps: number[], sizesM: number[]): LevitationEnvelope {
  const base = normaliseDesign(design);
  const cells: EnvelopeCell[][] = [];
  for (const size of sizesM) {
    const row: EnvelopeCell[] = [];
    const sized = normaliseDesign({ ...base, sizeM: size, ceilingM: design.ceilingM ?? base.ceilingM });
    for (const speed of speedsMps) {
      const d: DesignConfig = { ...sized, fan: { ...sized.fan, outletSpeedMps: clamp(speed, 0.5, 30) } };
      const core = coreAnalysis(createAeroContext(d));
      row.push({ verdict: core.verdict, score: levitationScore(core) });
    }
    cells.push(row);
  }
  return { speedsMps: [...speedsMps], sizesM: [...sizesM], cells };
}
