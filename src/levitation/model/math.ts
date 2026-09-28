/**
 * Orbital Levitation Lab: small vector, quaternion and numeric helpers.
 *
 * Pure TypeScript, no three.js. Every function that returns a Vec3 or Quat
 * accepts an optional `out` argument so hot loops (the simulation substeps and
 * the app's particle sampling) can run without allocating.
 */

import type { Quat, Vec3 } from './types';

// ---------------------------------------------------------------------------
// Physical constants (SI)
// ---------------------------------------------------------------------------

/** Air density at about 20 C and sea level, kg/m^3. */
export const RHO_AIR = 1.204;
/** Helium density at the same conditions, kg/m^3. */
export const RHO_HELIUM = 0.166;
/** Gravitational acceleration, m/s^2. */
export const GRAVITY = 9.81;
/** Kinematic viscosity of air, m^2/s. */
export const NU_AIR = 1.5e-5;

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export function clamp(value: number, min = 0, max = 1): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite smoothstep of x already normalised to 0..1 (clamped). */
export function smooth01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

/** Classic smoothstep(edge0, edge1, x). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  return smooth01((x - edge0) / (edge1 - edge0));
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// ---------------------------------------------------------------------------
// Vec3
// ---------------------------------------------------------------------------

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function v3set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function v3copy(a: Vec3, out: Vec3 = vec3()): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function v3clone(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}

export function v3add(a: Vec3, b: Vec3, out: Vec3 = vec3()): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function v3sub(a: Vec3, b: Vec3, out: Vec3 = vec3()): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function v3scale(a: Vec3, s: number, out: Vec3 = vec3()): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** out = a + b * s */
export function v3addScaled(a: Vec3, b: Vec3, s: number, out: Vec3 = vec3()): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function v3dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function v3cross(a: Vec3, b: Vec3, out: Vec3 = vec3()): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function v3length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function v3lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function v3distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function v3normalize(a: Vec3, out: Vec3 = vec3()): Vec3 {
  const len = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (len < 1e-12) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const inv = 1 / len;
  out.x = a.x * inv;
  out.y = a.y * inv;
  out.z = a.z * inv;
  return out;
}

export function v3lerp(a: Vec3, b: Vec3, t: number, out: Vec3 = vec3()): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/** Horizontal (XZ) length of a vector. */
export function v3horizontalLength(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.z * a.z);
}

// ---------------------------------------------------------------------------
// Quaternions (unit, body-to-world)
// ---------------------------------------------------------------------------

export function quatIdentity(out: Quat = { x: 0, y: 0, z: 0, w: 1 }): Quat {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.w = 1;
  return out;
}

export function quatCopy(q: Quat, out: Quat = quatIdentity()): Quat {
  out.x = q.x;
  out.y = q.y;
  out.z = q.z;
  out.w = q.w;
  return out;
}

export function quatClone(q: Quat): Quat {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** Hamilton product a * b (apply b first, then a). */
export function quatMultiply(a: Quat, b: Quat, out: Quat = quatIdentity()): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}

export function quatConjugate(q: Quat, out: Quat = quatIdentity()): Quat {
  out.x = -q.x;
  out.y = -q.y;
  out.z = -q.z;
  out.w = q.w;
  return out;
}

export function quatNormalize(q: Quat, out: Quat = quatIdentity()): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-12) return quatIdentity(out);
  const inv = 1 / len;
  out.x = q.x * inv;
  out.y = q.y * inv;
  out.z = q.z * inv;
  out.w = q.w * inv;
  return out;
}

/** Rotation of `angleRad` about `axis` (normalised internally). */
export function quatFromAxisAngle(axis: Vec3, angleRad: number, out: Quat = quatIdentity()): Quat {
  const len = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  if (len < 1e-12) return quatIdentity(out);
  const half = angleRad * 0.5;
  const s = Math.sin(half) / len;
  out.x = axis.x * s;
  out.y = axis.y * s;
  out.z = axis.z * s;
  out.w = Math.cos(half);
  return out;
}

/** Rotate vector v by unit quaternion q (body-to-world when q is an orientation). */
export function quatRotate(q: Quat, v: Vec3, out: Vec3 = vec3()): Vec3 {
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Rotate v by the inverse of q (world-to-body). */
export function quatRotateInverse(q: Quat, v: Vec3, out: Vec3 = vec3()): Vec3 {
  const cx = -q.x;
  const cy = -q.y;
  const cz = -q.z;
  const tx = 2 * (cy * v.z - cz * v.y);
  const ty = 2 * (cz * v.x - cx * v.z);
  const tz = 2 * (cx * v.y - cy * v.x);
  const x = v.x + q.w * tx + (cy * tz - cz * ty);
  const y = v.y + q.w * ty + (cz * tx - cx * tz);
  const z = v.z + q.w * tz + (cx * ty - cy * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** World direction of the body +Y axis (the shape's "up"). */
export function quatUp(q: Quat, out: Vec3 = vec3()): Vec3 {
  out.x = 2 * (q.x * q.y - q.w * q.z);
  out.y = 1 - 2 * (q.x * q.x + q.z * q.z);
  out.z = 2 * (q.y * q.z + q.w * q.x);
  return out;
}

/** Spherical linear interpolation along the shorter arc. */
export function slerp(a: Quat, b: Quat, t: number, out: Quat = quatIdentity()): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let k0: number;
  let k1: number;
  if (cos > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const theta = Math.acos(Math.min(1, cos));
    const sin = Math.sin(theta);
    k0 = Math.sin((1 - t) * theta) / sin;
    k1 = Math.sin(t * theta) / sin;
  }
  out.x = a.x * k0 + bx * k1;
  out.y = a.y * k0 + by * k1;
  out.z = a.z * k0 + bz * k1;
  out.w = a.w * k0 + bw * k1;
  return quatNormalize(out, out);
}

/**
 * Advance orientation q by a world-frame angular velocity over dt using the
 * exact exponential map: q' = exp(omega * dt / 2) * q.
 */
export function quatIntegrate(q: Quat, omegaWorld: Vec3, dt: number, out: Quat = quatIdentity()): Quat {
  const wx = omegaWorld.x;
  const wy = omegaWorld.y;
  const wz = omegaWorld.z;
  const rate = Math.sqrt(wx * wx + wy * wy + wz * wz);
  const angle = rate * dt;
  if (angle < 1e-12) return quatCopy(q, out);
  const half = angle * 0.5;
  const s = Math.sin(half) / rate;
  const dq: Quat = { x: wx * s, y: wy * s, z: wz * s, w: Math.cos(half) };
  quatMultiply(dq, q, out);
  return quatNormalize(out, out);
}

/**
 * Tilt of the body +Y axis away from world +Y, in radians (0 = upright,
 * pi = upside down). Spin about the body axis does not change it.
 */
export function eulerTilt(q: Quat): number {
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return Math.acos(clamp(upY, -1, 1));
}

/**
 * Rotation that tilts body +Y by `tiltRad` toward the horizontal direction
 * `azimuthRad` (measured from +X toward +Z), after spinning by `spinRad`
 * about body Y.
 */
export function quatFromTilt(tiltRad: number, azimuthRad = 0, spinRad = 0, out: Quat = quatIdentity()): Quat {
  // Axis perpendicular to the lean direction (cos a, 0, sin a): axis = up x lean,
  // so a positive rotation carries body +Y toward the lean direction.
  const ax = Math.sin(azimuthRad);
  const az = -Math.cos(azimuthRad);
  const tilt = quatFromAxisAngle({ x: ax, y: 0, z: az }, tiltRad);
  const spin = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, spinRad);
  return quatMultiply(tilt, spin, out);
}

// ---------------------------------------------------------------------------
// Deterministic random numbers
// ---------------------------------------------------------------------------

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal. */
  gaussian(): number;
}

/** Small, fast, seedable generator (mulberry32) with Box-Muller normals. */
export function createRng(seed: number): Rng {
  let state = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  let spare: number | null = null;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = (): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    while (u < 1e-12) u = next();
    const v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
  return { next, gaussian };
}

// ---------------------------------------------------------------------------
// Special functions and quadrature
// ---------------------------------------------------------------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61503188399117, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** Natural log of the Gamma function (Lanczos g = 7; relative error about 1e-8, ample for profile integrals). */
export function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const zz = z - 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i += 1) x += LANCZOS[i] / (zz + i);
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

export function gamma(z: number): number {
  return Math.exp(lnGamma(z));
}

/** 6-point Gauss-Legendre nodes and weights on [-1, 1]. */
export const GAUSS6_X = [
  -0.9324695142031521, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969,
  0.6612093864662645, 0.9324695142031521,
];
export const GAUSS6_W = [
  0.1713244923791704, 0.3607615730481386, 0.467913934572691, 0.467913934572691,
  0.3607615730481386, 0.1713244923791704,
];
