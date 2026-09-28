/**
 * Orbital Levitation Lab: the fan's vertical air jet.
 *
 * Reduced-order round turbulent jet (after Pope, "Turbulent Flows", ch. 5):
 *
 *  - Profile: u(r, h) = Uc(h) * exp(-ln2 * (r / rh)^p(h)), with the exponent
 *    p(h) = 2 + 6 exp(-h / 0.6D): flat-topped (p = 8) at the outlet relaxing to
 *    the Gaussian (p = 2) of a developed jet.
 *  - Potential core: Uc = U0 up to Lc = k D, with k set by the fan type
 *    (axial 4.0, straightened axial 5.0, plug fan with flow grid 5.5).
 *  - Far field: the half-velocity radius grows at S = 0.094 + 0.03 * swirl.
 *
 * Deviation from the brief (deliberate, documented): the brief's literal
 * formulas hold Uc = U0 through the core while rh = 0.5D + S h grows from the
 * outlet, which inflates the jet's momentum flux about 3x by the end of the
 * core. A free jet conserves momentum, and every force in this model comes
 * from intercepted momentum, so here the half-width is chosen to conserve it:
 * in the core rh stays near D/2 (widening only as the profile relaxes), and
 * beyond the core rh grows at S while Uc falls to keep rho Uc^2 pi rh^2 I(p)
 * constant. Beyond the core this gives Uc ~ U0 * Lc / h, as in the brief.
 *
 * Swirl u_theta = sw * u * (r / rh) * exp(-h / 3D) (right-handed about +Y) and
 * a weak entrainment inflow u_r = -0.04 * u * (r / rh). Nothing below the
 * outlet plane. A slow jet-axis wander (periods 6 to 11 s, amplitude 0.03 D)
 * travels up the jet at about half the outlet speed.
 */

import type { FanConfig, FanDerived, FanType, Vec3 } from './types';
import { RHO_AIR, lnGamma, smooth01 } from './math';

export interface FanTypeData {
  label: string;
  /** Potential-core length in outlet diameters. */
  coreFactor: number;
  swirlRatio: number;
  baseTurbulence: number;
}

export const FAN_TYPE_DATA: Readonly<Record<FanType, FanTypeData>> = Object.freeze({
  axial: { label: 'Axial fan', coreFactor: 4.0, swirlRatio: 0.25, baseTurbulence: 0.12 },
  'axial-straightened': { label: 'Axial fan with straightener', coreFactor: 5.0, swirlRatio: 0.05, baseTurbulence: 0.07 },
  'plug-flowgrid': { label: 'Plug fan with flow grid', coreFactor: 5.5, swirlRatio: 0.08, baseTurbulence: 0.08 },
});

/** Typical total efficiency used to turn air power into electrical power. */
export const FAN_EFFICIENCY = 0.55;

/** Turbulence intensity: baseline for the fan type scaled by the user setting t in 0..1. */
export function turbulenceIntensity(fan: FanConfig): number {
  const data = FAN_TYPE_DATA[fan.type] ?? FAN_TYPE_DATA['plug-flowgrid'];
  const t = Math.min(1, Math.max(0, fan.turbulence));
  return data.baseTurbulence * (0.5 + 1.5 * t);
}

export function fanDerived(fan: FanConfig): FanDerived {
  const data = FAN_TYPE_DATA[fan.type] ?? FAN_TYPE_DATA['plug-flowgrid'];
  const D = fan.diameterM;
  const U0 = fan.outletSpeedMps;
  const area = (Math.PI * D * D) / 4;
  const flow = U0 * area;
  const airPower = 0.5 * RHO_AIR * flow * U0 * U0;
  return {
    outletAreaM2: area,
    flowM3s: flow,
    momentumFluxN: RHO_AIR * flow * U0,
    airPowerW: airPower,
    electricalPowerW: airPower / FAN_EFFICIENCY,
    approxRpm: (U0 / (0.33 * Math.PI * D)) * 60,
    coreLengthM: data.coreFactor * D,
    swirlRatio: data.swirlRatio,
    turbulenceIntensity: turbulenceIntensity(fan),
  };
}

// ---------------------------------------------------------------------------
// Profile momentum integral I(p): integral of exp(-2 ln2 (r/rh)^p) 2 pi r dr = pi rh^2 I(p)
// ---------------------------------------------------------------------------

function profileIntegralExact(p: number): number {
  return Math.exp(lnGamma(1 + 2 / p)) / Math.pow(2 * Math.LN2, 2 / p);
}

const I_TABLE_MIN = 2;
const I_TABLE_MAX = 8;
const I_TABLE_STEPS = 240;
const I_TABLE = (() => {
  const table = new Float64Array(I_TABLE_STEPS + 1);
  for (let i = 0; i <= I_TABLE_STEPS; i += 1) {
    table[i] = profileIntegralExact(I_TABLE_MIN + ((I_TABLE_MAX - I_TABLE_MIN) * i) / I_TABLE_STEPS);
  }
  return table;
})();

/** Momentum shape factor of the profile with exponent p (2..8), tabulated. */
export function profileMomentumFactor(p: number): number {
  const x = ((p - I_TABLE_MIN) / (I_TABLE_MAX - I_TABLE_MIN)) * I_TABLE_STEPS;
  if (x <= 0) return I_TABLE[0];
  if (x >= I_TABLE_STEPS) return I_TABLE[I_TABLE_STEPS];
  const i = Math.floor(x);
  const f = x - i;
  return I_TABLE[i] + (I_TABLE[i + 1] - I_TABLE[i]) * f;
}

// ---------------------------------------------------------------------------
// Jet parameters (memoised per fan setting)
// ---------------------------------------------------------------------------

export interface JetParams {
  D: number;
  U0: number;
  type: FanType;
  coreFactor: number;
  swirlRatio: number;
  turbulenceIntensity: number;
  coreLength: number;
  spreadRate: number;
  /** I(8): momentum factor of the outlet profile. */
  outletFactor: number;
  rhAtCoreEnd: number;
  factorAtCoreEnd: number;
  wanderAmplitude: number;
  convectionSpeed: number;
  /** rho-free momentum flux Uc^2 pi rh^2 I(p), constant with height. */
  momentumPerRho: number;
}

const jetParamCache = new Map<string, JetParams>();
let lastFanD = NaN;
let lastFanU = NaN;
let lastFanType: FanType | null = null;
let lastFanT = NaN;
let lastParams: JetParams | null = null;

export function jetParams(fan: FanConfig): JetParams {
  // Fast path: particle sampling calls this thousands of times per frame with the same fan.
  if (
    lastParams !== null &&
    fan.diameterM === lastFanD &&
    fan.outletSpeedMps === lastFanU &&
    fan.type === lastFanType &&
    fan.turbulence === lastFanT
  ) {
    return lastParams;
  }
  const params = computeJetParams(fan);
  lastFanD = fan.diameterM;
  lastFanU = fan.outletSpeedMps;
  lastFanType = fan.type;
  lastFanT = fan.turbulence;
  lastParams = params;
  return params;
}

function computeJetParams(fan: FanConfig): JetParams {
  const key = `${fan.diameterM}|${fan.outletSpeedMps}|${fan.type}|${fan.turbulence}`;
  const cached = jetParamCache.get(key);
  if (cached) return cached;
  const data = FAN_TYPE_DATA[fan.type] ?? FAN_TYPE_DATA['plug-flowgrid'];
  const D = Math.max(1e-3, fan.diameterM);
  const U0 = Math.max(0, fan.outletSpeedMps);
  const coreLength = data.coreFactor * D;
  const outletFactor = profileMomentumFactor(8);
  const pCore = 2 + 6 * Math.exp(-coreLength / (0.6 * D));
  const factorAtCoreEnd = profileMomentumFactor(pCore);
  const rhAtCoreEnd = 0.5 * D * Math.sqrt(outletFactor / factorAtCoreEnd);
  const params: JetParams = {
    D,
    U0,
    type: fan.type,
    coreFactor: data.coreFactor,
    swirlRatio: data.swirlRatio,
    turbulenceIntensity: turbulenceIntensity(fan),
    coreLength,
    spreadRate: 0.094 + 0.03 * data.swirlRatio,
    outletFactor,
    rhAtCoreEnd,
    factorAtCoreEnd,
    wanderAmplitude: 0.03 * D,
    convectionSpeed: Math.max(0.3, 0.5 * U0),
    momentumPerRho: U0 * U0 * Math.PI * 0.25 * D * D * outletFactor,
  };
  if (jetParamCache.size > 256) jetParamCache.clear();
  jetParamCache.set(key, params);
  return params;
}

export interface JetSlice {
  /** Centreline speed, m/s. */
  Uc: number;
  /** Half-velocity radius, m. */
  rh: number;
  /** Profile exponent. */
  p: number;
  /** Swirl decay factor exp(-h / 3D). */
  swirlDecay: number;
}

export function createJetSlice(): JetSlice {
  return { Uc: 0, rh: 0, p: 2, swirlDecay: 1 };
}

/** Centreline speed, half-width and profile exponent at height h (clamped to h >= 0). */
export function jetSliceAt(params: JetParams, heightM: number, out: JetSlice = createJetSlice()): JetSlice {
  const h = heightM > 0 ? heightM : 0;
  const D = params.D;
  const p = 2 + 6 * Math.exp(-h / (0.6 * D));
  const factor = profileMomentumFactor(p);
  let Uc: number;
  let rh: number;
  if (h <= params.coreLength) {
    Uc = params.U0;
    rh = 0.5 * D * Math.sqrt(params.outletFactor / factor);
  } else {
    rh = params.rhAtCoreEnd + params.spreadRate * (h - params.coreLength);
    Uc = params.U0 * (params.rhAtCoreEnd / rh) * Math.sqrt(params.factorAtCoreEnd / factor);
  }
  out.Uc = Uc;
  out.rh = rh;
  out.p = p;
  out.swirlDecay = Math.exp(-h / (3 * D));
  return out;
}

const scratchSlice = createJetSlice();

export function jetCentrelineSpeed(fan: FanConfig, heightM: number): number {
  if (heightM < 0) return 0;
  return jetSliceAt(jetParams(fan), heightM, scratchSlice).Uc;
}

export function jetHalfWidth(fan: FanConfig, heightM: number): number {
  return jetSliceAt(jetParams(fan), Math.max(0, heightM), scratchSlice).rh;
}

/** Axial speed at radius r from the jet axis for a given slice. */
export function profileSpeed(slice: JetSlice, r: number): number {
  if (r <= 0) return slice.Uc;
  const x = r / slice.rh;
  // exp(-ln2 * x^p); beyond x = 4 the jet is negligible.
  if (x > 4) return 0;
  return slice.Uc * Math.exp(-Math.LN2 * Math.pow(x, slice.p));
}

/** Momentum flux of the jet (rho * integral of u^2 dA), N. Constant with height by construction. */
export function jetMomentumFlux(fan: FanConfig): number {
  return RHO_AIR * jetParams(fan).momentumPerRho;
}

/**
 * Horizontal offset of the wandering jet axis at height h and time t (x, z;
 * y is set to 0). The wander starts at zero at the outlet and reaches its
 * full 0.03 D amplitude two diameters up, travelling upward with the flow.
 */
export function jetAxisOffset(params: JetParams, heightM: number, timeS: number, out: Vec3): Vec3 {
  const h = heightM > 0 ? heightM : 0;
  const amp = params.wanderAmplitude * smooth01(h / (2 * params.D));
  if (amp === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const tau = timeS - h / params.convectionSpeed;
  const w = 2 * Math.PI;
  out.x = amp * (0.62 * Math.sin((w * tau) / 7.3 + 0.4) + 0.38 * Math.sin((w * tau) / 10.9 + 2.1));
  out.y = 0;
  out.z = amp * (0.62 * Math.sin((w * tau) / 8.7 + 1.3) + 0.38 * Math.sin((w * tau) / 6.3 + 4.0));
  return out;
}

const wanderScratch: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Air velocity of the jet at world point p (m/s). Allocation-free when `out`
 * is given; cheap enough for ~12k particles per frame.
 */
export function sampleJet(fan: FanConfig, p: Vec3, timeS = 0, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const h = p.y;
  if (!(h >= 0)) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const params = jetParams(fan);
  const slice = jetSliceAt(params, h, scratchSlice);
  jetAxisOffset(params, h, timeS, wanderScratch);
  const dx = p.x - wanderScratch.x;
  const dz = p.z - wanderScratch.z;
  const r = Math.sqrt(dx * dx + dz * dz);
  const u = profileSpeed(slice, r);
  if (r < 1e-9 || u === 0) {
    out.x = 0;
    out.y = u;
    out.z = 0;
    return out;
  }
  const rr = r / slice.rh;
  const ut = params.swirlRatio * u * rr * slice.swirlDecay;
  const ur = -0.04 * u * rr;
  const nx = dx / r;
  const nz = dz / r;
  // Tangential unit vector for right-handed rotation about +Y: (nz, 0, -nx).
  out.x = ur * nx + ut * nz;
  out.y = u;
  out.z = ur * nz - ut * nx;
  return out;
}
