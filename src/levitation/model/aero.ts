/**
 * Orbital Levitation Lab: mass properties and the reduced-order aerodynamic
 * load model shared by the analysis and the simulation.
 *
 * Assumptions (all presented in the app as estimates):
 *
 *  1. Jet force. The body intercepts the jet over its frontal disc (radius
 *     R_f = sqrt(A_f / pi), A_f blending axial and side frontal areas with
 *     tilt). Momentum flux is integrated exactly in angle (the arc of each jet
 *     ring that falls inside the disc) and by Gauss-Legendre quadrature in
 *     radius, using the air velocity relative to the body. That replaces the
 *     brief's ~48 point rings-by-angles grid: it resolves a narrow jet under a
 *     wide body, which a uniform grid on the body misses.
 *  2. Force factor kappa blends from the immersed-body value Cd/2 (jet much
 *     wider than the body, lambda = R_f / rh <= 0.5) to impingementCoeff (body
 *     much wider than the jet, lambda >= 2) with a smoothstep. Air outside the
 *     jet (a body moving through still air) always uses Cd/2. The drag crisis
 *     multiplies Cd for smooth rounded bodies (approximate curve).
 *  3. Ground effect (addition to the brief): a body much wider than the jet
 *     intercepts nearly all of a momentum-conserving jet at any height, so the
 *     push alone would not depend on height. Close to the outlet the deflected
 *     air is trapped between body and fan deck and pushes harder; the boost
 *     fades over about half the combined outlet and body radius. This is what
 *     gives wide bodies (the 3 m Orbital sphere) a definite hover height.
 *  4. Side forces: Coanda/pressure-gradient centering, tilt glide (a tilted
 *     flat body is pushed toward the side its top leans, like a tilted
 *     rotor), vortex shedding and turbulent buffeting through the linearised
 *     drag.
 *  5. Torques about the centre of mass: the aerodynamic force acts at the
 *     centre of pressure (cpOffset above the geometric centre, plus the
 *     lopsided frontal-area centroid of asymmetric shapes, plus a jet-gradient
 *     shift for flat undersides); buoyancy and enclosed gas act at the
 *     geometric centre; a drag-anisotropy "broadside" moment stands in for the
 *     Munk moment (long bodies turn sideways, flat bodies stay flat); linear
 *     aerodynamic rotational damping; swirl spin-up.
 */

import type { DesignConfig, MaterialDefinition, Quat, ShapeDefinition, ShapeProperties, Vec3 } from './types';
import { canUseHelium, getMaterial, getShape } from './catalogue';
import { unitGeometry, type UnitGeometry } from './geometry';
import {
  createJetSlice,
  jetAxisOffset,
  jetParams,
  jetSliceAt,
  profileSpeed,
  type JetParams,
  type JetSlice,
} from './jet';
import {
  GAUSS6_W,
  GAUSS6_X,
  GRAVITY,
  NU_AIR,
  RHO_AIR,
  RHO_HELIUM,
  clamp,
  quatRotate,
  quatUp,
  smooth01,
  vec3,
} from './math';

// ---------------------------------------------------------------------------
// Model constants
// ---------------------------------------------------------------------------

/** Peak ground-effect boost for a body that fully covers the outlet. */
export const GROUND_BOOST = 0.6;
/** Ground-effect decay length as a fraction of (outlet radius + footprint radius). */
export const GROUND_LENGTH_FACTOR = 0.5;
/** Broadside (Munk-like) orientation moment coefficient. */
export const ORIENTATION_COEFF = 0.35;
/** Aerodynamic rotational damping coefficient. */
export const ROTATION_DAMPING = 0.08;
/** Air slower than this fraction of the centreline speed counts as still air. */
const JET_EDGE_FRACTION = 0.2;
/** Turbulent torque amplitude: fraction of TI * push * footprint radius. */
export const TURBULENT_TORQUE_COEFF = 0.12;

// ---------------------------------------------------------------------------
// Mass properties
// ---------------------------------------------------------------------------

export interface MassModel {
  props: ShapeProperties;
  /** Shell + ballast centre of mass relative to the geometric centre, body frame, m. */
  cmBody: Vec3;
  ballastY: number;
  /** Weight of shell + ballast, N (acts at the centre of mass). */
  structureWeightN: number;
  /** Weight of the enclosed gas, N (acts at the geometric centre). */
  gasWeightN: number;
  helium: boolean;
}

const massCache = new Map<string, MassModel>();

function massKey(design: DesignConfig): string {
  return `${design.shapeId}|${design.sizeM}|${design.materialId}|${design.heliumFraction}`;
}

/** Drag crisis multiplier on Cd for smooth rounded bodies (approximate). */
export function dragCrisisFactor(reynolds: number): number {
  if (!(reynolds > 2e5)) return 1;
  if (reynolds <= 4e5) return 1 - 0.55 * smooth01((reynolds - 2e5) / 2e5);
  if (reynolds <= 3e6) return 0.45 + 0.15 * smooth01(Math.log(reynolds / 4e5) / Math.log(7.5));
  return 0.6;
}

export function computeMassModel(design: DesignConfig): MassModel {
  const key = massKey(design);
  const cached = massCache.get(key);
  if (cached) return cached;
  const shape = getShape(design.shapeId);
  const material = getMaterial(design.materialId);
  const geom = unitGeometry(design.shapeId);
  const s = design.sizeM;

  const surfaceArea = geom.area * s * s;
  const volume = geom.volume * s * s * s;
  const frontalAxial = geom.frontalAxial * s * s;
  const frontalSide = geom.frontalSide * s * s;
  const footprintRadius = Math.sqrt(frontalAxial / Math.PI);

  const shell = (surfaceArea * material.arealDensityGsm * material.overheadFactor) / 1000;
  const ballast = shape.ballastFraction * shell;
  const shellCentroid = {
    x: geom.surfaceCentroid.x * s,
    y: geom.surfaceCentroid.y * s,
    z: geom.surfaceCentroid.z * s,
  };

  // Ballast sits on the axis where it puts the combined centre of mass at the
  // catalogue's cmOffset; clamp it inside the body (open shapes such as the
  // medusa may hang a keel weight below the rim).
  let ballastY = 0;
  if (ballast > 0) {
    ballastY = ((shell + ballast) * shape.cmOffset * s - shell * shellCentroid.y) / ballast;
    const lowest = geom.closed ? geom.minY * s * 0.92 : geom.minY * s - 0.6 * s;
    const highest = geom.maxY * s * 0.92;
    ballastY = clamp(ballastY, lowest, highest);
  }
  const structure = shell + ballast;
  const cmBody = {
    x: structure > 0 ? (shell * shellCentroid.x) / structure : 0,
    y: structure > 0 ? (shell * shellCentroid.y + ballast * ballastY) / structure : 0,
    z: structure > 0 ? (shell * shellCentroid.z) / structure : 0,
  };

  // Shell inertia about the geometric centre from the area-weighted second moments.
  // Principal axes are the body axes for every catalogue shape except the
  // ribbon, whose small products of inertia are neglected.
  const [mxx, myy, mzz] = geom.secondMoments;
  const s2 = s * s;
  let Ixx = shell * (myy + mzz) * s2;
  let Iyy = shell * (mxx + mzz) * s2;
  let Izz = shell * (mxx + myy) * s2;
  // Ballast: a small dense lump on the axis (radius 0.06 s).
  if (ballast > 0) {
    const lump = 0.4 * ballast * (0.06 * s) * (0.06 * s);
    Ixx += ballast * ballastY * ballastY + lump;
    Izz += ballast * ballastY * ballastY + lump;
    Iyy += lump;
  }
  // Shift to the combined centre of mass (parallel axis theorem).
  const c = cmBody;
  const c2 = c.x * c.x + c.y * c.y + c.z * c.z;
  Ixx -= structure * (c2 - c.x * c.x);
  Iyy -= structure * (c2 - c.y * c.y);
  Izz -= structure * (c2 - c.z * c.z);
  const floor = 1e-9 + 1e-4 * structure * s2;

  const helium = canUseHelium(design.shapeId, design.materialId);
  const heliumFraction = helium ? clamp(design.heliumFraction, 0, 1) : 0;
  const gasDensity = heliumFraction * RHO_HELIUM + (1 - heliumFraction) * RHO_AIR;
  const enclosedGas = geom.closed ? volume * gasDensity : 0;
  const buoyancy = geom.closed ? RHO_AIR * volume * GRAVITY : 0;
  const addedVolume = geom.closed ? volume : (4 / 3) * Math.PI * footprintRadius ** 3;
  const addedMass = shape.addedMassCoeff * RHO_AIR * addedVolume;

  const props: ShapeProperties = {
    surfaceAreaM2: surfaceArea,
    volumeM3: volume,
    frontalAreaAxialM2: frontalAxial,
    frontalAreaSideM2: frontalSide,
    heightM: (geom.maxY - geom.minY) * s,
    shellMassKg: shell,
    ballastMassKg: ballast,
    massKg: structure,
    enclosedGasKg: enclosedGas,
    inertialMassKg: structure + enclosedGas + addedMass,
    buoyancyN: buoyancy,
    netWeightN: (structure + enclosedGas) * GRAVITY - buoyancy,
    inertiaBody: { x: Math.max(Ixx, floor), y: Math.max(Iyy, floor), z: Math.max(Izz, floor) },
    cpOffsetM: shape.cpOffset * s,
    cmOffsetM: cmBody.y,
    footprintRadiusM: footprintRadius,
  };
  const model: MassModel = {
    props,
    cmBody,
    ballastY,
    structureWeightN: structure * GRAVITY,
    gasWeightN: enclosedGas * GRAVITY,
    helium,
  };
  if (massCache.size > 512) massCache.clear();
  massCache.set(key, model);
  return model;
}

/**
 * Physical properties of a design, integrated from the same mesh the app
 * renders (memoised by shape, size, material and helium).
 */
export function shapeProperties(design: DesignConfig): ShapeProperties {
  const p = computeMassModel(design).props;
  return { ...p, inertiaBody: { ...p.inertiaBody } };
}

// ---------------------------------------------------------------------------
// Aerodynamic context (per design)
// ---------------------------------------------------------------------------

export interface AeroContext {
  design: DesignConfig;
  shape: ShapeDefinition;
  material: MaterialDefinition;
  geom: UnitGeometry;
  mass: MassModel;
  props: ShapeProperties;
  jet: JetParams;
  s: number;
  areaAxial: number;
  areaSide: number;
  /** Centre of pressure relative to the geometric centre, body frame, m. */
  cpBody: Vec3;
  holeRadius: number;
  /** 0 (round) to 1 (plate-like): how much a lopsided jet tilts it. */
  flatness: number;
  /** (CdA_side - CdA_axial) / sum: > 0 wants to turn broadside. */
  anisotropy: number;
  /** Spin damping relative to tumbling damping (smooth bodies spin freely). */
  spinDampingFactor: number;
  /** Contact outline points, body frame, m (xyz triples). */
  support: Float32Array;
  /** Resting centre height (lowest point on the outlet plane), m. */
  restHeight: number;
  /** Highest centre height before the top touches the ceiling, m. */
  ceilingHeight: number;
}

export function createAeroContext(design: DesignConfig): AeroContext {
  const shape = getShape(design.shapeId);
  const material = getMaterial(design.materialId);
  const geom = unitGeometry(design.shapeId);
  const mass = computeMassModel(design);
  const s = design.sizeM;
  const support = new Float32Array(geom.support.length);
  for (let i = 0; i < support.length; i += 1) support[i] = geom.support[i] * s;
  const dAx = shape.cdAxial * geom.frontalAxial;
  const dSide = shape.cdSide * geom.frontalSide;
  return {
    design,
    shape,
    material,
    geom,
    mass,
    props: mass.props,
    jet: jetParams(design.fan),
    s,
    areaAxial: geom.frontalAxial * s * s,
    areaSide: geom.frontalSide * s * s,
    cpBody: { x: geom.frontalCentroidX * s, y: shape.cpOffset * s, z: geom.frontalCentroidZ * s },
    holeRadius: geom.holeRadius * s,
    flatness: clamp(shape.tiltLiftSlope / 0.25, 0, 1),
    anisotropy: (dSide - dAx) / Math.max(1e-9, dSide + dAx),
    spinDampingFactor: 0.15 + 0.85 * (1 - clamp(shape.smoothness, 0, 1)),
    support,
    restHeight: -geom.minY * s,
    ceilingHeight: design.ceilingM - geom.maxY * s,
  };
}

/** Same context with a different fan (used by speed searches). */
export function withFan(ctx: AeroContext, fan: DesignConfig['fan']): AeroContext {
  return { ...ctx, design: { ...ctx.design, fan }, jet: jetParams(fan) };
}

// ---------------------------------------------------------------------------
// Loads
// ---------------------------------------------------------------------------

export interface BodyKinematics {
  /** Geometric centre, world. */
  position: Vec3;
  /** Velocity of the geometric centre, world. */
  velocity: Vec3;
  orientation: Quat;
  /** World angular velocity. */
  angularVelocity: Vec3;
}

export interface NoiseInputs {
  /** Turbulent velocity fluctuation, m/s. */
  turbulence: Vec3;
  /** Unit-variance turbulent torque noise. */
  torqueNoise: Vec3;
  shedPhase: number;
  /** Direction of the shedding side force in the horizontal plane, rad. */
  shedAngle: number;
  /** Include the slow jet-axis wander. */
  wander: boolean;
}

export interface Loads {
  weight: Vec3;
  buoyancy: Vec3;
  jet: Vec3;
  centering: Vec3;
  shedding: Vec3;
  turbulence: Vec3;
  total: Vec3;
  /** Torque about the centre of mass (world), excluding rotational damping and contacts. */
  torque: Vec3;
  /** Linear rotational damping coefficient for tumbling, N m s. */
  rotationalDamping: number;
  /** Linear damping coefficient for spin about the body axis, N m s. */
  spinDamping: number;
  /** Linearised translational damping, N s / m. */
  dampingVertical: number;
  dampingLateral: number;
  effectiveSpeed: number;
  reynolds: number;
  /** Vertical aerodynamic push (>= 0), N. */
  verticalPush: number;
  /** Part of the push that comes from the jet itself (drives turbulence), N. */
  jetPush: number;
  footprintRadius: number;
  halfWidth: number;
  /** Distance from the (wandering) jet axis at the body's height, m. */
  axisOffset: number;
  swirlRate: number;
  groundFactor: number;
  kappa: number;
  lambda: number;
  throughFactor: number;
  interceptFraction: number;
  tiltRad: number;
}

export function createLoads(): Loads {
  return {
    weight: vec3(),
    buoyancy: vec3(),
    jet: vec3(),
    centering: vec3(),
    shedding: vec3(),
    turbulence: vec3(),
    total: vec3(),
    torque: vec3(),
    rotationalDamping: 0,
    spinDamping: 0,
    dampingVertical: 0,
    dampingLateral: 0,
    effectiveSpeed: 0,
    reynolds: 0,
    verticalPush: 0,
    jetPush: 0,
    footprintRadius: 0,
    halfWidth: 0,
    axisOffset: 0,
    swirlRate: 0,
    groundFactor: 1,
    kappa: 0,
    lambda: 0,
    throughFactor: 1,
    interceptFraction: 0,
    tiltRad: 0,
  };
}

/** Accumulators for the disc integral (all per unit air density). */
const acc = {
  yJet: 0,
  yStill: 0,
  dJet: 0,
  dStill: 0,
  tJet: 0,
  tStill: 0,
  raw: 0,
  u2: 0,
  u2r: 0,
  absJet: 0,
  absStill: 0,
};

const breaks = new Float64Array(16);

/**
 * Integrate over a disc of radius R whose centre is d from the jet axis.
 * Radial Gauss-Legendre in jet-ring radius, exact arc length in angle.
 * `full` = false integrates only u^2 (used for the halo hole).
 */
function integrateDisc(
  slice: JetSlice,
  swirl: number,
  d: number,
  R: number,
  vy: number,
  vd: number,
  vt: number,
  full: boolean,
): void {
  acc.yJet = 0;
  acc.yStill = 0;
  acc.dJet = 0;
  acc.dStill = 0;
  acc.tJet = 0;
  acc.tStill = 0;
  acc.raw = 0;
  acc.u2 = 0;
  acc.u2r = 0;
  acc.absJet = 0;
  acc.absStill = 0;
  if (!(R > 0)) return;
  const r0 = Math.max(0, d - R);
  const r1 = d + R;
  let n = 0;
  breaks[n++] = r0;
  const inner = R - d;
  if (inner > r0 && inner < r1) breaks[n++] = inner;
  const rh = slice.rh;
  const jetBreaks = [0.45, 0.8, 1.1, 1.5, 2.1, 3.0];
  for (let i = 0; i < jetBreaks.length; i += 1) {
    const b = jetBreaks[i] * rh;
    if (b > r0 && b < r1) breaks[n++] = b;
  }
  breaks[n++] = r1;
  // Insertion sort (n <= 9).
  for (let i = 1; i < n; i += 1) {
    const v = breaks[i];
    let j = i - 1;
    while (j >= 0 && breaks[j] > v) {
      breaks[j + 1] = breaks[j];
      j -= 1;
    }
    breaks[j + 1] = v;
  }
  const Uc = slice.Uc;
  const jetEdge = JET_EDGE_FRACTION * Uc;
  const swirlScale = swirl * slice.swirlDecay;
  const centred = d < 1e-9;
  for (let k = 0; k < n - 1; k += 1) {
    const a = breaks[k];
    const b = breaks[k + 1];
    if (b - a < 1e-12) continue;
    const mid = 0.5 * (a + b);
    const half = 0.5 * (b - a);
    for (let g = 0; g < 6; g += 1) {
      const r = mid + half * GAUSS6_X[g];
      const wq = half * GAUSS6_W[g];
      let alpha: number;
      if (centred || r <= inner) {
        alpha = Math.PI;
      } else {
        const cosA = (r * r + d * d - R * R) / (2 * r * d);
        alpha = cosA >= 1 ? 0 : cosA <= -1 ? Math.PI : Math.acos(cosA);
      }
      if (alpha <= 0) continue;
      const dA = 2 * alpha * r * wq;
      const u = profileSpeed(slice, r);
      const u2 = u * u;
      const arc = alpha >= Math.PI - 1e-12 ? 0 : Math.sin(alpha) / alpha;
      acc.u2 += u2 * dA;
      acc.u2r += u2 * r * arc * dA;
      if (!full) continue;
      const rr = r / rh;
      const ur = -0.04 * u * rr;
      const ut = swirlScale * u * rr;
      const wy = u - vy;
      const wd = arc * ur - vd;
      const wt = arc * ut - vt;
      const mag = Math.sqrt(wy * wy + wd * wd + wt * wt);
      const jet = jetEdge > 0 ? Math.min(1, u / jetEdge) : 0;
      const still = 1 - jet;
      const m = mag * dA;
      acc.yJet += jet * m * wy;
      acc.yStill += still * m * wy;
      acc.dJet += jet * m * wd;
      acc.dStill += still * m * wd;
      acc.tJet += jet * m * wt;
      acc.tStill += still * m * wt;
      acc.absJet += jet * m;
      acc.absStill += still * m;
      acc.raw += wy * Math.abs(wy) * dA;
    }
  }
}

/** Lowest and highest world-Y offsets of the body outline relative to its geometric centre. */
export function outlineExtent(ctx: AeroContext, q: Quat, out: { min: number; max: number; minIndex: number; maxIndex: number }): void {
  const r10 = 2 * (q.x * q.y + q.w * q.z);
  const r11 = 1 - 2 * (q.x * q.x + q.z * q.z);
  const r12 = 2 * (q.y * q.z - q.w * q.x);
  const pts = ctx.support;
  let min = Infinity;
  let max = -Infinity;
  let minIndex = 0;
  let maxIndex = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const y = r10 * pts[i] + r11 * pts[i + 1] + r12 * pts[i + 2];
    if (y < min) {
      min = y;
      minIndex = i;
    }
    if (y > max) {
      max = y;
      maxIndex = i;
    }
  }
  out.min = min;
  out.max = max;
  out.minIndex = minIndex;
  out.maxIndex = maxIndex;
}

const tmpUp = vec3();
const tmpAxis = vec3();
const tmpCm = vec3();
const tmpCp = vec3();
const sliceScratch = createJetSlice();
const extentScratch = { min: 0, max: 0, minIndex: 0, maxIndex: 0 };

/**
 * Forces and torques on the body. `noise` = null gives the deterministic,
 * time-averaged loads used by the analysis.
 */
export function computeLoads(
  ctx: AeroContext,
  kin: BodyKinematics,
  timeS: number,
  noise: NoiseInputs | null,
  out: Loads = createLoads(),
): Loads {
  const shape = ctx.shape;
  const q = kin.orientation;
  const pos = kin.position;
  const vel = kin.velocity;
  const up = quatUp(q, tmpUp);
  const c = clamp(up.y, -1, 1);
  const c2 = c * c;
  const s2 = Math.max(0, 1 - c2);
  const sinT = Math.sqrt(s2);
  out.tiltRad = Math.acos(c);

  const areaF = ctx.areaAxial * c2 + ctx.areaSide * s2;
  const Rf = Math.sqrt(areaF / Math.PI);
  const cdTilt = shape.cdAxial * c2 + shape.cdSide * s2;

  const h = pos.y;
  const slice = jetSliceAt(ctx.jet, h, sliceScratch);
  let ax = 0;
  let az = 0;
  if (noise && noise.wander) {
    jetAxisOffset(ctx.jet, h, timeS, tmpAxis);
    ax = tmpAxis.x;
    az = tmpAxis.z;
  }
  const dx = pos.x - ax;
  const dz = pos.z - az;
  const d = Math.sqrt(dx * dx + dz * dz);
  // Unit vector from the jet axis to the body, and its right-handed tangent.
  const nx = d > 1e-9 ? dx / d : 1;
  const nz = d > 1e-9 ? dz / d : 0;
  const tx = nz;
  const tz = -nx;
  const vd = vel.x * nx + vel.z * nz;
  const vt = vel.x * tx + vel.z * tz;

  // Air through the hole (halo, ribbon) does not push.
  let through = 1;
  if (ctx.holeRadius > 0 && shape.throughFlowFraction > 0) {
    integrateDisc(slice, 0, d, ctx.holeRadius * Math.sqrt(Math.abs(c)), 0, 0, 0, false);
    const holeFlux = acc.u2;
    integrateDisc(slice, 0, d, Rf, 0, 0, 0, false);
    const discFlux = acc.u2;
    const narrowness = discFlux > 0 ? clamp(holeFlux / discFlux, 0, 1) : 0;
    through = 1 - shape.throughFlowFraction * narrowness;
  }
  integrateDisc(slice, ctx.jet.swirlRatio, d, Rf, vel.y, vd, vt, true);

  const Ueff = Math.sqrt(Math.abs(acc.raw) / Math.max(1e-12, areaF));
  const reynolds = (Ueff * ctx.s) / NU_AIR;
  const cdEff = cdTilt * (shape.dragCrisis ? dragCrisisFactor(reynolds) : 1);
  const lambda = Rf / Math.max(1e-9, slice.rh);
  const blend = smooth01((lambda - 0.5) / 1.5);
  const kappa = 0.5 * cdEff + (shape.impingementCoeff - 0.5 * cdEff) * blend;
  const still = 0.5 * cdEff;

  let Fy = RHO_AIR * (kappa * acc.yJet + still * acc.yStill) * through;
  const Fd = RHO_AIR * (kappa * acc.dJet + still * acc.dStill) * through;
  const Ft = RHO_AIR * (kappa * acc.tJet + still * acc.tStill) * through;

  // Ground effect (see header note 3).
  outlineExtent(ctx, q, extentScratch);
  const gap = Math.max(0, h + extentScratch.min);
  const intercept = ctx.jet.momentumPerRho > 0 ? clamp(acc.u2 / ctx.jet.momentumPerRho, 0, 1) : 0;
  const coverage = smooth01((Rf / (0.5 * ctx.jet.D) - 0.8) / 1.2) * intercept;
  const groundLength = GROUND_LENGTH_FACTOR * (0.5 * ctx.jet.D + Rf);
  const ground = 1 + GROUND_BOOST * coverage * Math.exp(-gap / groundLength);
  if (Fy > 0) Fy *= ground;

  const push = Math.max(0, Fy);
  const jetPush = Math.max(0, RHO_AIR * kappa * acc.yJet * through * (Fy > 0 ? ground : 1));

  const jet = out.jet;
  jet.x = Fd * nx + Ft * tx;
  jet.y = Fy;
  jet.z = Fd * nz + Ft * tz;
  // Tilt glide: toward the side the top leans (sin 2 theta = 2 sin cos).
  if (sinT > 1e-6 && shape.tiltLiftSlope !== 0) {
    const glide = shape.tiltLiftSlope * 2 * sinT * c * push;
    jet.x += (glide * up.x) / sinT;
    jet.z += (glide * up.z) / sinT;
  }

  // Coanda / pressure-gradient centering toward the jet axis.
  const sOff = d / (slice.rh + Rf);
  const centre = -shape.coandaCoeff * push * sOff * Math.exp(-sOff * sOff);
  out.centering.x = centre * nx;
  out.centering.y = 0;
  out.centering.z = centre * nz;

  // Vortex shedding and turbulence (simulation only).
  if (noise) {
    const shed = shape.sheddingLiftCoeff * push * Math.sin(noise.shedPhase);
    out.shedding.x = shed * Math.cos(noise.shedAngle);
    out.shedding.y = 0;
    out.shedding.z = shed * Math.sin(noise.shedAngle);
    const scale = jetPush / Math.max(Ueff, 0.3);
    out.turbulence.x = scale * noise.turbulence.x;
    out.turbulence.y = 2 * scale * noise.turbulence.y;
    out.turbulence.z = scale * noise.turbulence.z;
  } else {
    out.shedding.x = 0;
    out.shedding.y = 0;
    out.shedding.z = 0;
    out.turbulence.x = 0;
    out.turbulence.y = 0;
    out.turbulence.z = 0;
  }

  const mass = ctx.mass;
  out.weight.x = 0;
  out.weight.y = -(mass.structureWeightN + mass.gasWeightN);
  out.weight.z = 0;
  out.buoyancy.x = 0;
  out.buoyancy.y = ctx.props.buoyancyN;
  out.buoyancy.z = 0;
  out.total.x = jet.x + out.centering.x + out.shedding.x + out.turbulence.x;
  out.total.y = jet.y + out.turbulence.y + out.weight.y + out.buoyancy.y;
  out.total.z = jet.z + out.centering.z + out.shedding.z + out.turbulence.z;

  // Torques about the centre of mass.
  const rcm = quatRotate(q, mass.cmBody, tmpCm);
  const rcp = quatRotate(q, ctx.cpBody, tmpCp);
  if (ctx.flatness > 0 && acc.u2 > 0) {
    // Jet-gradient shift of the pressure centre toward the jet axis (flat undersides).
    const shift = ctx.flatness * (acc.u2r / acc.u2 - d);
    rcp.x += shift * nx;
    rcp.z += shift * nz;
  }
  const lx = rcp.x - rcm.x;
  const ly = rcp.y - rcm.y;
  const lz = rcp.z - rcm.z;
  const fx = jet.x + out.centering.x + out.shedding.x + out.turbulence.x;
  const fy = jet.y + out.turbulence.y;
  const fz = jet.z + out.centering.z + out.shedding.z + out.turbulence.z;
  let tqx = ly * fz - lz * fy;
  let tqy = lz * fx - lx * fz;
  let tqz = lx * fy - ly * fx;
  // Buoyancy minus gas weight acts at the geometric centre, at -rcm from the CM:
  // (-rcm) x (0, lift, 0) = (rcm.z * lift, 0, -rcm.x * lift).
  const lift = ctx.props.buoyancyN - mass.gasWeightN;
  tqx += rcm.z * lift;
  tqz -= rcm.x * lift;
  // Broadside moment: rotate toward the orientation with the most drag.
  if (sinT > 1e-6) {
    const k = -ORIENTATION_COEFF * push * ctx.s * ctx.anisotropy * 2 * sinT * c;
    // Axis that reduces tilt: (up x Y) / |.| = (-up.z, 0, up.x) / sin.
    tqx += (k * -up.z) / sinT;
    tqz += (k * up.x) / sinT;
  }
  // Rotational damping: tumbling (about the body's horizontal axes) is resisted
  // by pressure drag; spin about the body axis only by skin friction, so
  // smooth bodies spin almost freely (spinDampingFactor).
  const w = kin.angularVelocity;
  const wAxial = w.x * up.x + w.y * up.y + w.z * up.z;
  const wx = w.x - wAxial * up.x;
  const wy = w.y - wAxial * up.y;
  const wz = w.z - wAxial * up.z;
  const wPerp = Math.sqrt(wx * wx + wy * wy + wz * wz);
  const dampBase = ROTATION_DAMPING * RHO_AIR * areaF * Rf * Rf;
  const rotDamp = dampBase * (Ueff + wPerp * Rf);
  const spinDamp = ctx.spinDampingFactor * dampBase * (Ueff + Math.abs(wAxial) * Rf);
  // Swirl spin-up toward swirlCoupling times the local swirl rate (same friction path).
  const swirlRate = (ctx.jet.swirlRatio * profileSpeed(slice, d) * slice.swirlDecay) / Math.max(1e-9, slice.rh);
  tqy += spinDamp * shape.swirlCoupling * swirlRate;
  if (noise) {
    const sigma = TURBULENT_TORQUE_COEFF * ctx.jet.turbulenceIntensity * jetPush * Rf;
    tqx += sigma * noise.torqueNoise.x;
    tqy += sigma * noise.torqueNoise.y;
    tqz += sigma * noise.torqueNoise.z;
  }
  out.torque.x = tqx;
  out.torque.y = tqy;
  out.torque.z = tqz;

  const lateralDamping = RHO_AIR * (kappa * acc.absJet + still * acc.absStill) * through;
  out.rotationalDamping = rotDamp;
  out.spinDamping = spinDamp;
  out.dampingLateral = lateralDamping;
  out.dampingVertical = 2 * lateralDamping * (Fy > 0 ? ground : 1);
  out.effectiveSpeed = Ueff;
  out.reynolds = reynolds;
  out.verticalPush = push;
  out.jetPush = jetPush;
  out.footprintRadius = Rf;
  out.halfWidth = slice.rh;
  out.axisOffset = d;
  out.swirlRate = swirlRate;
  out.groundFactor = ground;
  out.kappa = kappa;
  out.lambda = lambda;
  out.throughFactor = through;
  out.interceptFraction = intercept;
  return out;
}

const staticKin: BodyKinematics = {
  position: vec3(),
  velocity: vec3(),
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  angularVelocity: vec3(),
};
const staticLoads = createLoads();

/** Upright, on-axis, motionless vertical aerodynamic force at centre height h (N). */
export function verticalJetForce(ctx: AeroContext, heightM: number): number {
  staticKin.position.x = 0;
  staticKin.position.y = heightM;
  staticKin.position.z = 0;
  const loads = computeLoads(ctx, staticKin, 0, null, staticLoads);
  return loads.jet.y;
}
