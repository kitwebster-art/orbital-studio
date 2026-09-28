/**
 * Orbital Levitation Lab: shape meshes and the geometric properties derived
 * from them.
 *
 * One mesh builder serves both the renderer and the physics: areas, volumes,
 * frontal areas and inertia are all integrated numerically over the very
 * triangles the app draws, so the two can never disagree.
 *
 * Conventions: body frame, metres, centred on the geometric centre (the
 * centre of the shape's bounding box), body +Y up. Triangles wind
 * counter-clockwise seen from outside, so face normals point outward.
 */

import type { ShapeGeometrySpec, ShapeId, ShapeMesh, Vec3 } from './types';
import { getShape } from './catalogue';

export type MeshDetail = 'low' | 'high';
type Resolution = MeshDetail | 'support';

interface MeshBuffers {
  positions: number[];
  normals: number[];
  indices: number[];
}

function createBuffers(): MeshBuffers {
  return { positions: [], normals: [], indices: [] };
}

function pushVertex(buf: MeshBuffers, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const index = buf.positions.length / 3;
  const len = Math.hypot(nx, ny, nz) || 1;
  buf.positions.push(x, y, z);
  buf.normals.push(nx / len, ny / len, nz / len);
  return index;
}

// ---------------------------------------------------------------------------
// Resolution table (triangle counts: high ~6k-20k, low ~1k-3k)
// ---------------------------------------------------------------------------

const RESOLUTION = {
  latLong: { high: [128, 64], low: [48, 24], support: [24, 12] },
  torus: { high: [160, 48], low: [64, 20], support: [32, 12] },
  lathe: { high: [128, 60], low: [48, 24], support: [24, 16] },
  ribbon: { high: [480, 10], low: [180, 5], support: [64, 2] },
  geodeFacetSplit: { high: 9, low: 4, support: 1 },
} as const;

// ---------------------------------------------------------------------------
// Latitude-longitude surfaces (ellipsoid, superellipsoid)
// ---------------------------------------------------------------------------

type SurfaceFn = (u: number, v: number) => [number, number, number];

/**
 * Closed surface parameterised by longitude u in [0, 2pi) and latitude v in
 * [-pi/2, pi/2], with single pole vertices and fans.
 */
function buildLatLong(nLon: number, nLat: number, point: SurfaceFn, normal: SurfaceFn): MeshBuffers {
  const buf = createBuffers();
  const south = (() => {
    const p = point(0, -Math.PI / 2);
    return pushVertex(buf, p[0], p[1], p[2], 0, -1, 0);
  })();
  const rings: number[] = [];
  for (let j = 1; j < nLat; j += 1) {
    const v = -Math.PI / 2 + (Math.PI * j) / nLat;
    rings.push(buf.positions.length / 3);
    for (let i = 0; i < nLon; i += 1) {
      const u = (2 * Math.PI * i) / nLon;
      const p = point(u, v);
      const n = normal(u, v);
      pushVertex(buf, p[0], p[1], p[2], n[0], n[1], n[2]);
    }
  }
  const north = (() => {
    const p = point(0, Math.PI / 2);
    return pushVertex(buf, p[0], p[1], p[2], 0, 1, 0);
  })();
  const first = rings[0];
  for (let i = 0; i < nLon; i += 1) {
    buf.indices.push(south, first + i, first + ((i + 1) % nLon));
  }
  for (let j = 0; j < rings.length - 1; j += 1) {
    const r0 = rings[j];
    const r1 = rings[j + 1];
    for (let i = 0; i < nLon; i += 1) {
      const i1 = (i + 1) % nLon;
      const a = r0 + i;
      const b = r0 + i1;
      const c = r1 + i1;
      const d = r1 + i;
      buf.indices.push(a, d, c, a, c, b);
    }
  }
  const last = rings[rings.length - 1];
  for (let i = 0; i < nLon; i += 1) {
    buf.indices.push(north, last + ((i + 1) % nLon), last + i);
  }
  return buf;
}

function signedPow(value: number, exponent: number): number {
  const mag = Math.abs(value);
  if (mag < 1e-15) return 0;
  return Math.sign(value) * Math.pow(mag, exponent);
}

function buildEllipsoid(radii: Vec3, res: Resolution): MeshBuffers {
  const [nLon, nLat] = RESOLUTION.latLong[res];
  const { x: a, y: b, z: c } = radii;
  return buildLatLong(
    nLon,
    nLat,
    (u, v) => [a * Math.cos(v) * Math.cos(u), b * Math.sin(v), c * Math.cos(v) * Math.sin(u)],
    (u, v) => {
      const x = a * Math.cos(v) * Math.cos(u);
      const y = b * Math.sin(v);
      const z = c * Math.cos(v) * Math.sin(u);
      return [x / (a * a), y / (b * b), z / (c * c)];
    },
  );
}

function buildSuperellipsoid(radii: Vec3, e1: number, e2: number, res: Resolution): MeshBuffers {
  const [nLon, nLat] = RESOLUTION.latLong[res];
  const { x: a, y: b, z: c } = radii;
  return buildLatLong(
    nLon,
    nLat,
    (u, v) => {
      const cv = signedPow(Math.cos(v), e1);
      return [a * cv * signedPow(Math.cos(u), e2), b * signedPow(Math.sin(v), e1), c * cv * signedPow(Math.sin(u), e2)];
    },
    (u, v) => {
      const cv = signedPow(Math.cos(v), 2 - e1);
      return [
        (cv * signedPow(Math.cos(u), 2 - e2)) / a,
        signedPow(Math.sin(v), 2 - e1) / b,
        (cv * signedPow(Math.sin(u), 2 - e2)) / c,
      ];
    },
  );
}

// ---------------------------------------------------------------------------
// Torus (halo)
// ---------------------------------------------------------------------------

function buildTorus(major: number, tube: number, res: Resolution): MeshBuffers {
  const [nMajor, nMinor] = RESOLUTION.torus[res];
  const buf = createBuffers();
  for (let i = 0; i < nMajor; i += 1) {
    const theta = (2 * Math.PI * i) / nMajor;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    for (let j = 0; j < nMinor; j += 1) {
      const phi = (2 * Math.PI * j) / nMinor;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ring = major + tube * cp;
      pushVertex(buf, ring * ct, tube * sp, ring * st, cp * ct, sp, cp * st);
    }
  }
  for (let i = 0; i < nMajor; i += 1) {
    const i1 = (i + 1) % nMajor;
    for (let j = 0; j < nMinor; j += 1) {
      const j1 = (j + 1) % nMinor;
      const a = i * nMinor + j;
      const b = i1 * nMinor + j;
      const c = i1 * nMinor + j1;
      const d = i * nMinor + j1;
      buf.indices.push(a, d, c, a, c, b);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Icosphere with flat facets (geode)
// ---------------------------------------------------------------------------

function icosphereFacets(detail: number): Array<[number[], number[], number[]]> {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const normalise = (v: number[]): number[] => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  };
  verts = verts.map(normalise);
  for (let level = 0; level < detail; level += 1) {
    const midCache = new Map<string, number>();
    const midpoint = (i: number, j: number): number => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      const cached = midCache.get(key);
      if (cached !== undefined) return cached;
      const a = verts[i];
      const b = verts[j];
      verts.push(normalise([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]));
      midCache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  // Rotate about X so the vertex (0, 1, t) points straight up (+Y).
  const alpha = -Math.atan(t);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  verts = verts.map(([x, y, z]) => [x, y * ca - z * sa, y * sa + z * ca]);
  return faces.map(([a, b, c]) => [verts[a], verts[b], verts[c]]);
}

function buildGeode(radius: number, detail: number, res: Resolution): MeshBuffers {
  const split = RESOLUTION.geodeFacetSplit[res];
  const buf = createBuffers();
  for (const facet of icosphereFacets(detail)) {
    let [A, B, C] = facet.map((v) => [v[0] * radius, v[1] * radius, v[2] * radius]);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const centroid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    if (n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2] < 0) {
      [B, C] = [C, B];
      n = [-n[0], -n[1], -n[2]];
    }
    const base = buf.positions.length / 3;
    const index = (i: number, j: number): number => {
      // Row-major over the barycentric triangle: rows i = 0..split, each with split - i + 1 entries.
      let offset = 0;
      for (let row = 0; row < i; row += 1) offset += split - row + 1;
      return base + offset + j;
    };
    for (let i = 0; i <= split; i += 1) {
      for (let j = 0; j <= split - i; j += 1) {
        const bi = i / split;
        const bj = j / split;
        pushVertex(
          buf,
          A[0] + (B[0] - A[0]) * bi + (C[0] - A[0]) * bj,
          A[1] + (B[1] - A[1]) * bi + (C[1] - A[1]) * bj,
          A[2] + (B[2] - A[2]) * bi + (C[2] - A[2]) * bj,
          n[0],
          n[1],
          n[2],
        );
      }
    }
    for (let i = 0; i < split; i += 1) {
      for (let j = 0; j < split - i; j += 1) {
        buf.indices.push(index(i, j), index(i + 1, j), index(i, j + 1));
        if (i + j < split - 1) {
          buf.indices.push(index(i + 1, j), index(i + 1, j + 1), index(i, j + 1));
        }
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Lathe surfaces (shuttle, medusa, twin)
// ---------------------------------------------------------------------------

/** Centripetal Catmull-Rom through the profile, resampled uniformly by arc length. */
function resampleProfile(profile: Array<[number, number]>, count: number): Array<[number, number]> {
  const pts = profile.map(([r, y]) => [Math.max(0, r), y]);
  const dense: number[][] = [];
  const get = (i: number): number[] => {
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i >= pts.length) {
      const n = pts.length;
      return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
    }
    return pts[i];
  };
  const steps = 24;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const knot = (a: number[], b: number[]): number => Math.sqrt(Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let s = 0; s < steps; s += 1) {
      const t = t1 + ((t2 - t1) * s) / steps;
      const lerp2 = (a: number[], b: number[], ta: number, tb: number): number[] => {
        const w = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const a1 = lerp2(p0, p1, t0, t1);
      const a2 = lerp2(p1, p2, t1, t2);
      const a3 = lerp2(p2, p3, t2, t3);
      const b1 = lerp2(a1, a2, t0, t2);
      const b2 = lerp2(a2, a3, t1, t3);
      dense.push(lerp2(b1, b2, t1, t2));
    }
  }
  dense.push(pts[pts.length - 1]);
  const cumulative = [0];
  for (let i = 1; i < dense.length; i += 1) {
    cumulative.push(cumulative[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const total = cumulative[cumulative.length - 1];
  const out: Array<[number, number]> = [];
  let k = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (total * i) / (count - 1);
    while (k < dense.length - 2 && cumulative[k + 1] < target) k += 1;
    const span = cumulative[k + 1] - cumulative[k] || 1;
    const w = Math.min(1, Math.max(0, (target - cumulative[k]) / span));
    out.push([
      Math.max(0, dense[k][0] + (dense[k + 1][0] - dense[k][0]) * w),
      dense[k][1] + (dense[k + 1][1] - dense[k][1]) * w,
    ]);
  }
  // Keep exact end points (poles and rims).
  out[0] = [pts[0][0], pts[0][1]];
  out[count - 1] = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
  return out;
}

function buildLathe(profile: Array<[number, number]>, res: Resolution): MeshBuffers {
  const [nAround, nAlong] = RESOLUTION.lathe[res];
  const prof = resampleProfile(profile, nAlong + 1);
  const buf = createBuffers();
  const poleEps = 1e-6;
  const rowStart: number[] = [];
  const isPole: boolean[] = [];
  for (let k = 0; k < prof.length; k += 1) {
    const [r, y] = prof[k];
    const prev = prof[Math.max(0, k - 1)];
    const next = prof[Math.min(prof.length - 1, k + 1)];
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    rowStart.push(buf.positions.length / 3);
    if (r < poleEps) {
      isPole.push(true);
      // Outward in-plane normal (dy, -dr) at a pole reduces to straight down or up.
      pushVertex(buf, 0, y, 0, 0, dr >= 0 ? -1 : 1, 0);
      continue;
    }
    isPole.push(false);
    for (let i = 0; i < nAround; i += 1) {
      const theta = (2 * Math.PI * i) / nAround;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      pushVertex(buf, r * ct, y, r * st, dy * ct, -dr, dy * st);
    }
  }
  for (let k = 0; k < prof.length - 1; k += 1) {
    const r0 = rowStart[k];
    const r1 = rowStart[k + 1];
    for (let i = 0; i < nAround; i += 1) {
      const i1 = (i + 1) % nAround;
      if (isPole[k] && isPole[k + 1]) continue;
      if (isPole[k]) {
        buf.indices.push(r0, r1 + i, r1 + i1);
      } else if (isPole[k + 1]) {
        buf.indices.push(r0 + i, r1, r0 + i1);
      } else {
        const a = r0 + i;
        const b = r0 + i1;
        const c = r1 + i1;
        const d = r1 + i;
        buf.indices.push(a, d, c, a, c, b);
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Ribbon (Mobius band when twists = 1)
// ---------------------------------------------------------------------------

function buildRibbon(radius: number, width: number, twists: number, res: Resolution): MeshBuffers {
  const [nU, nV] = RESOLUTION.ribbon[res];
  const buf = createBuffers();
  const dpsi = twists * 0.5;
  for (let i = 0; i <= nU; i += 1) {
    const u = (2 * Math.PI * i) / nU;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const psi = dpsi * u;
    const cpsi = Math.cos(psi);
    const spsi = Math.sin(psi);
    for (let j = 0; j <= nV; j += 1) {
      const v = -width / 2 + (width * j) / nV;
      const ring = radius + v * cpsi;
      const x = ring * cu;
      const y = v * spsi;
      const z = ring * su;
      // Partial derivatives for the surface normal P_u x P_v.
      const pux = -ring * su - v * spsi * dpsi * cu;
      const puy = v * cpsi * dpsi;
      const puz = ring * cu - v * spsi * dpsi * su;
      const pvx = cpsi * cu;
      const pvy = spsi;
      const pvz = cpsi * su;
      pushVertex(buf, x, y, z, puy * pvz - puz * pvy, puz * pvx - pux * pvz, pux * pvy - puy * pvx);
    }
  }
  const row = nV + 1;
  for (let i = 0; i < nU; i += 1) {
    for (let j = 0; j < nV; j += 1) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = (i + 1) * row + j + 1;
      const d = i * row + j + 1;
      buf.indices.push(a, b, c, a, c, d);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Medusa strands (decorative polylines)
// ---------------------------------------------------------------------------

function medusaStrands(rimRadius: number, rimY: number, apexY: number): number[][] {
  const strands: number[][] = [];
  const count = 10;
  const points = 36;
  for (let s = 0; s < count; s += 1) {
    const theta = (2 * Math.PI * (s + 0.5)) / count;
    const length = 0.62 + 0.22 * (0.5 + 0.5 * Math.sin(s * 2.399));
    const phase = s * 1.7;
    const line: number[] = [];
    for (let k = 0; k < points; k += 1) {
      const t = k / (points - 1);
      const r = rimRadius * (0.96 - 0.22 * t);
      const wave = 0.045 * t * Math.sin(phase + t * 9.0);
      const th = theta + wave / Math.max(0.05, r);
      line.push(r * Math.cos(th), rimY - length * t, r * Math.sin(th));
    }
    strands.push(line);
  }
  // Keel line from just under the apex to the ballast weight below the rim
  // (the physics places the keel ballast about 0.48 s below the rim).
  const keel: number[] = [];
  const keelBottom = rimY - 0.48;
  for (let k = 0; k < 12; k += 1) {
    const t = k / 11;
    keel.push(0, apexY - 0.02 + (keelBottom - (apexY - 0.02)) * t, 0);
  }
  strands.push(keel);
  return strands;
}

// ---------------------------------------------------------------------------
// Unit meshes (s = 1) and scaling
// ---------------------------------------------------------------------------

interface UnitMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  flatShading: boolean;
  doubleSided: boolean;
  strands?: Float32Array[];
  /** Offset subtracted to centre on the bounding box (in s units). */
  centreOffset: Vec3;
}

function buildBuffers(spec: ShapeGeometrySpec, res: Resolution): MeshBuffers {
  switch (spec.kind) {
    case 'ellipsoid':
      return buildEllipsoid(spec.radii, res);
    case 'superellipsoid':
      return buildSuperellipsoid(spec.radii, spec.e1, spec.e2, res);
    case 'torus':
      return buildTorus(spec.majorRadius, spec.tubeRadius, res);
    case 'icosphere':
      return buildGeode(spec.radius, spec.detail, res);
    case 'lathe':
      return buildLathe(spec.profile, res);
    case 'ribbon':
      return buildRibbon(spec.radius, spec.width, spec.twists, res);
    default:
      throw new Error('Unsupported geometry');
  }
}

const unitMeshCache = new Map<string, UnitMesh>();

function unitMesh(shapeId: ShapeId, res: Resolution): UnitMesh {
  const key = `${shapeId}:${res}`;
  const cached = unitMeshCache.get(key);
  if (cached) return cached;
  const shape = getShape(shapeId);
  const spec = shape.geometry;
  const buf = buildBuffers(spec, res);
  const positions = Float32Array.from(buf.positions);
  // Centre on the bounding box.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  // Axisymmetric shapes are centred on their axis exactly.
  if (spec.kind !== 'ribbon') {
    centre.x = 0;
    centre.z = 0;
  }
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= centre.x;
    positions[i + 1] -= centre.y;
    positions[i + 2] -= centre.z;
  }
  let strands: Float32Array[] | undefined;
  if (shapeId === 'medusa' && spec.kind === 'lathe') {
    const rim = spec.profile[0];
    const apex = spec.profile[spec.profile.length - 1];
    strands = medusaStrands(rim[0], rim[1], apex[1]).map((line) => {
      const arr = Float32Array.from(line);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] -= centre.x;
        arr[i + 1] -= centre.y;
        arr[i + 2] -= centre.z;
      }
      return arr;
    });
  }
  const mesh: UnitMesh = {
    positions,
    normals: Float32Array.from(buf.normals),
    indices: Uint32Array.from(buf.indices),
    flatShading: spec.kind === 'icosphere',
    doubleSided: spec.kind === 'ribbon' || (spec.kind === 'lathe' && !spec.closed),
    strands,
    centreOffset: centre,
  };
  unitMeshCache.set(key, mesh);
  return mesh;
}

/**
 * Build the render and physics mesh for a shape at a given size. Body frame,
 * centred on the geometric centre, body +Y up; sizeM is the largest
 * horizontal extent. Returns fresh arrays the caller may keep or modify.
 */
export function buildShapeMesh(shapeId: ShapeId, sizeM: number, detail: MeshDetail = 'high'): ShapeMesh {
  const unit = unitMesh(shapeId, detail === 'low' ? 'low' : 'high');
  const s = Number.isFinite(sizeM) && sizeM > 0 ? sizeM : 1;
  const positions = new Float32Array(unit.positions.length);
  for (let i = 0; i < positions.length; i += 1) positions[i] = unit.positions[i] * s;
  const mesh: ShapeMesh = {
    positions,
    normals: unit.normals.slice(),
    indices: unit.indices.slice(),
    flatShading: unit.flatShading,
    doubleSided: unit.doubleSided,
  };
  if (unit.strands) {
    mesh.strands = unit.strands.map((line) => {
      const out = new Float32Array(line.length);
      for (let i = 0; i < line.length; i += 1) out[i] = line[i] * s;
      return out;
    });
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// Geometric properties at unit size (memoised per shape)
// ---------------------------------------------------------------------------

export interface UnitGeometry {
  shapeId: ShapeId;
  /** Watertight surface: volume, buoyancy and enclosed gas apply. */
  closed: boolean;
  area: number;
  volume: number;
  /** Area seen from directly below (the jet's view). */
  frontalAxial: number;
  /** Area seen from the side (mean of the X and Z views). */
  frontalSide: number;
  /** Centroid of the area seen from below, body X and Z (lopsided shapes). */
  frontalCentroidX: number;
  frontalCentroidZ: number;
  minY: number;
  maxY: number;
  maxHorizontalRadius: number;
  /** Area-weighted centroid of the shell surface. */
  surfaceCentroid: Vec3;
  /** Area-weighted second moments per unit area about the geometric centre: [xx, yy, zz, xy, xz, yz]. */
  secondMoments: [number, number, number, number, number, number];
  /** Radius of the opening the jet can pass through (halo, ribbon), else 0. */
  holeRadius: number;
  /** Sparse outline points for contact (xyz triples, unit size). */
  support: Float32Array;
}

function isClosedSpec(spec: ShapeGeometrySpec): boolean {
  if (spec.kind === 'lathe') return spec.closed;
  return spec.kind !== 'ribbon';
}

/** Rasterised area of the mesh projected onto the plane of axes (ia, ib). */
function projectedArea(
  positions: Float32Array,
  indices: Uint32Array,
  ia: number,
  ib: number,
  gridSize: number,
): { area: number; ca: number; cb: number } {
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const a = positions[i + ia];
    const b = positions[i + ib];
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  const pad = 1e-3;
  minA -= pad; maxA += pad; minB -= pad; maxB += pad;
  const cell = Math.max(maxA - minA, maxB - minB) / gridSize;
  const nA = Math.ceil((maxA - minA) / cell) + 1;
  const nB = Math.ceil((maxB - minB) / cell) + 1;
  const grid = new Uint8Array(nA * nB);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t] * 3, i1 = indices[t + 1] * 3, i2 = indices[t + 2] * 3;
    const ax = positions[i0 + ia], ay = positions[i0 + ib];
    const bx = positions[i1 + ia], by = positions[i1 + ib];
    const cx = positions[i2 + ia], cy = positions[i2 + ib];
    const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area2) < 1e-14) continue;
    const sign = area2 > 0 ? 1 : -1;
    const lo0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minA) / cell - 0.5));
    const hi0 = Math.min(nA - 1, Math.ceil((Math.max(ax, bx, cx) - minA) / cell - 0.5));
    const lo1 = Math.max(0, Math.floor((Math.min(ay, by, cy) - minB) / cell - 0.5));
    const hi1 = Math.min(nB - 1, Math.ceil((Math.max(ay, by, cy) - minB) / cell - 0.5));
    for (let q = lo1; q <= hi1; q += 1) {
      const py = minB + (q + 0.5) * cell;
      for (let p = lo0; p <= hi0; p += 1) {
        const idx = q * nA + p;
        if (grid[idx]) continue;
        const px = minA + (p + 0.5) * cell;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * sign;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * sign;
        const w2 = ((ax - px) * (by - py) - (ay - py) * (bx - px)) * sign;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) grid[idx] = 1;
      }
    }
  }
  let count = 0;
  let sa = 0;
  let sb = 0;
  for (let q = 0; q < nB; q += 1) {
    for (let p = 0; p < nA; p += 1) {
      if (!grid[q * nA + p]) continue;
      count += 1;
      sa += minA + (p + 0.5) * cell;
      sb += minB + (q + 0.5) * cell;
    }
  }
  return {
    area: count * cell * cell,
    ca: count > 0 ? sa / count : 0,
    cb: count > 0 ? sb / count : 0,
  };
}

const unitGeometryCache = new Map<ShapeId, UnitGeometry>();

/** Geometric properties of the high-detail mesh at s = 1 (memoised). */
export function unitGeometry(shapeId: ShapeId): UnitGeometry {
  const cached = unitGeometryCache.get(shapeId);
  if (cached) return cached;
  const spec = getShape(shapeId).geometry;
  const mesh = unitMesh(shapeId, 'high');
  const { positions: pos, indices: idx } = mesh;
  const closed = isClosedSpec(spec);

  let area = 0;
  let volume6 = 0;
  let cx = 0, cy = 0, cz = 0;
  let sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3;
    const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2];
    const bx = pos[i1], by = pos[i1 + 1], bz = pos[i1 + 2];
    const qx = pos[i2], qy = pos[i2 + 1], qz = pos[i2 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = qx - ax, e2y = qy - ay, e2z = qz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const triArea = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
    area += triArea;
    // Divergence theorem: signed tetrahedron volumes from the origin.
    volume6 += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
    const sx = ax + bx + qx, sy = ay + by + qy, sz = az + bz + qz;
    cx += (triArea * sx) / 3;
    cy += (triArea * sy) / 3;
    cz += (triArea * sz) / 3;
    // Exact second moments of a uniform triangle: A/12 * (sum v v^T + s s^T).
    const k = triArea / 12;
    sxx += k * (ax * ax + bx * bx + qx * qx + sx * sx);
    syy += k * (ay * ay + by * by + qy * qy + sy * sy);
    szz += k * (az * az + bz * bz + qz * qz + sz * sz);
    sxy += k * (ax * ay + bx * by + qx * qy + sx * sy);
    sxz += k * (ax * az + bx * bz + qx * qz + sx * sz);
    syz += k * (ay * az + by * bz + qy * qz + sy * sz);
  }

  let minY = Infinity, maxY = -Infinity, maxR = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    maxR = Math.max(maxR, Math.hypot(pos[i], pos[i + 2]));
  }

  const grid = 400;
  const below = projectedArea(pos, idx, 0, 2, grid);
  const sideX = projectedArea(pos, idx, 0, 1, grid);
  const sideZ = projectedArea(pos, idx, 2, 1, grid);

  let holeRadius = 0;
  if (spec.kind === 'torus') holeRadius = Math.max(0, spec.majorRadius - spec.tubeRadius);
  if (spec.kind === 'ribbon') holeRadius = Math.max(0, spec.radius - spec.width / 2);

  const support = unitMesh(shapeId, 'support').positions;
  const lopsided = spec.kind === 'ribbon';

  const result: UnitGeometry = {
    shapeId,
    closed,
    area,
    volume: closed ? Math.abs(volume6) / 6 : 0,
    frontalAxial: below.area,
    frontalSide: 0.5 * (sideX.area + sideZ.area),
    frontalCentroidX: lopsided ? below.ca : 0,
    frontalCentroidZ: lopsided ? below.cb : 0,
    minY,
    maxY,
    maxHorizontalRadius: maxR,
    surfaceCentroid: { x: cx / area, y: cy / area, z: cz / area },
    secondMoments: [sxx / area, syy / area, szz / area, sxy / area, sxz / area, syz / area],
    holeRadius,
    support,
  };
  unitGeometryCache.set(shapeId, result);
  return result;
}
