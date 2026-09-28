/**
 * Orbital Levitation Lab: what a camera-tracked projection system would see
 * and draw.
 *
 *  - projectionPose: the pose a latency-delayed tracker would feed the
 *    projector, optionally with the Orbital Tracker's bounded constant-velocity
 *    prediction (predicted travel capped at 0.15 m).
 *  - observeSilhouette: a single camera's view of the body as the ellipse the
 *    Orbital Tracker reports (second moments of the silhouette area, full
 *    diameters 4 sqrt(eigenvalue), angle from +x toward +y in image pixels,
 *    y down, folded into [0, 180)).
 *  - transformPoints: body-to-world transform with the visual squash.
 */

import type { ProjectionPose, Quat, TrackedEllipse, Vec3, VirtualCamera } from './types';
import type { StateHistory } from './history';
import { quatIntegrate, v3clone } from './math';

/** Mirrors the tracker's bounded prediction: never extrapolate further than this. */
export const MAX_PREDICTION_TRAVEL_M = 0.15;
/** Cap on predicted rotation, rad. */
const MAX_PREDICTION_ROTATION = Math.PI / 4;

/**
 * Pose the projection system would draw at `nowS` given `latencyMs` of
 * end-to-end delay. errorM is the distance to where the body really is.
 */
export function projectionPose(
  history: StateHistory,
  nowS: number,
  latencyMs: number,
  prediction: boolean,
): ProjectionPose {
  const truth = history.sampleAt(nowS);
  if (!truth) {
    return { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, errorM: 0 };
  }
  const latencyS = Math.max(0, Number.isFinite(latencyMs) ? latencyMs : 0) / 1000;
  const seen = history.sampleAt(nowS - latencyS) ?? truth;
  const position = v3clone(seen.position);
  let orientation: Quat = { ...seen.orientation };
  if (prediction && latencyS > 0) {
    let dx = seen.velocity.x * latencyS;
    let dy = seen.velocity.y * latencyS;
    let dz = seen.velocity.z * latencyS;
    const travel = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (travel > MAX_PREDICTION_TRAVEL_M) {
      const k = MAX_PREDICTION_TRAVEL_M / travel;
      dx *= k;
      dy *= k;
      dz *= k;
    }
    position.x += dx;
    position.y += dy;
    position.z += dz;
    const w = seen.angularVelocity;
    const rate = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
    const angle = rate * latencyS;
    const scale = angle > MAX_PREDICTION_ROTATION ? MAX_PREDICTION_ROTATION / angle : 1;
    orientation = quatIntegrate(orientation, { x: w.x * scale, y: w.y * scale, z: w.z * scale }, latencyS);
  }
  const ex = position.x - truth.position.x;
  const ey = position.y - truth.position.y;
  const ez = position.z - truth.position.z;
  return { position, orientation, errorM: Math.sqrt(ex * ex + ey * ey + ez * ez) };
}

/**
 * Body-to-world transform of xyz triples: world = position + R (S local), with
 * the volume-preserving squash S = (1/sqrt(1 - squash), 1 - squash,
 * 1/sqrt(1 - squash)) in the body frame. Allocation-free when `out` is given.
 */
export function transformPoints(
  local: Float32Array,
  position: Vec3,
  orientation: Quat,
  squash: number,
  out?: Float32Array,
): Float32Array {
  const result = out && out.length >= local.length ? out : new Float32Array(local.length);
  const sq = Math.min(0.9, Math.max(0, Number.isFinite(squash) ? squash : 0));
  const sy = 1 - sq;
  const sxz = 1 / Math.sqrt(sy);
  const { x: qx, y: qy, z: qz, w: qw } = orientation;
  // Rotation matrix from the unit quaternion.
  const r00 = 1 - 2 * (qy * qy + qz * qz);
  const r01 = 2 * (qx * qy - qw * qz);
  const r02 = 2 * (qx * qz + qw * qy);
  const r10 = 2 * (qx * qy + qw * qz);
  const r11 = 1 - 2 * (qx * qx + qz * qz);
  const r12 = 2 * (qy * qz - qw * qx);
  const r20 = 2 * (qx * qz - qw * qy);
  const r21 = 2 * (qy * qz + qw * qx);
  const r22 = 1 - 2 * (qx * qx + qy * qy);
  const px = position.x;
  const py = position.y;
  const pz = position.z;
  for (let i = 0; i + 2 < local.length; i += 3) {
    const x = local[i] * sxz;
    const y = local[i + 1] * sy;
    const z = local[i + 2] * sxz;
    result[i] = px + r00 * x + r01 * y + r02 * z;
    result[i + 1] = py + r10 * x + r11 * y + r12 * z;
    result[i + 2] = pz + r20 * x + r21 * y + r22 * z;
  }
  return result;
}

let projX = new Float64Array(0);
let projY = new Float64Array(0);
let order = new Uint32Array(0);
let hull = new Uint32Array(0);

/**
 * Silhouette ellipse of a point set seen by a pinhole camera: the points are
 * projected, their 2D convex hull is taken, and the ellipse comes from the
 * area-weighted second moments of the hull polygon (as the Orbital Tracker
 * does with the pixel moments of the segmented blob). Null when fewer than 3
 * points are in front of the camera.
 */
export function observeSilhouette(worldPoints: Float32Array, camera: VirtualCamera): TrackedEllipse | null {
  // Camera basis: forward f, right r = f x up, true up u = r x f.
  let fx = camera.target.x - camera.position.x;
  let fy = camera.target.y - camera.position.y;
  let fz = camera.target.z - camera.position.z;
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) return null;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = fy * camera.up.z - fz * camera.up.y;
  let ry = fz * camera.up.x - fx * camera.up.z;
  let rz = fx * camera.up.y - fy * camera.up.x;
  const rl = Math.hypot(rx, ry, rz);
  if (!(rl > 1e-12)) return null;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const width = camera.widthPx;
  const height = camera.heightPx;
  const focal = (0.5 * height) / Math.tan((camera.verticalFovDeg * Math.PI) / 360);
  const cx = 0.5 * width;
  const cy = 0.5 * height;

  const count = Math.floor(worldPoints.length / 3);
  if (projX.length < count) {
    projX = new Float64Array(count);
    projY = new Float64Array(count);
    order = new Uint32Array(count);
    hull = new Uint32Array(2 * count + 2);
  }
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const dx = worldPoints[3 * i] - camera.position.x;
    const dy = worldPoints[3 * i + 1] - camera.position.y;
    const dz = worldPoints[3 * i + 2] - camera.position.z;
    const depth = dx * fx + dy * fy + dz * fz;
    if (!(depth > 1e-6)) continue;
    projX[n] = cx + (focal * (dx * rx + dy * ry + dz * rz)) / depth;
    projY[n] = cy - (focal * (dx * ux + dy * uy + dz * uz)) / depth;
    order[n] = n;
    n += 1;
  }
  if (n < 3) return null;

  // Andrew's monotone chain convex hull.
  const idx = order.subarray(0, n);
  idx.sort((a, b) => projX[a] - projX[b] || projY[a] - projY[b]);
  const cross = (o: number, a: number, b: number): number =>
    (projX[a] - projX[o]) * (projY[b] - projY[o]) - (projY[a] - projY[o]) * (projX[b] - projX[o]);
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    while (k >= 2 && cross(hull[k - 2], hull[k - 1], idx[i]) <= 0) k -= 1;
    hull[k++] = idx[i];
  }
  for (let i = n - 2, lower = k + 1; i >= 0; i -= 1) {
    while (k >= lower && cross(hull[k - 2], hull[k - 1], idx[i]) <= 0) k -= 1;
    hull[k++] = idx[i];
  }
  const m = k - 1;
  if (m < 3) return null;

  // Polygon area moments (Green's theorem), relative to the first vertex for precision.
  const ox = projX[hull[0]];
  const oy = projY[hull[0]];
  let a2 = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < m; i += 1) {
    const x0 = projX[hull[i]] - ox;
    const y0 = projY[hull[i]] - oy;
    const x1 = projX[hull[(i + 1) % m]] - ox;
    const y1 = projY[hull[(i + 1) % m]] - oy;
    const c = x0 * y1 - x1 * y0;
    a2 += c;
    sx += (x0 + x1) * c;
    sy += (y0 + y1) * c;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  const area = 0.5 * a2;
  if (!(Math.abs(area) > 1e-9)) return null;
  const mx = sx / (6 * area);
  const my = sy / (6 * area);
  const cxx = sxx / (12 * area) - mx * mx;
  const cyy = syy / (12 * area) - my * my;
  const cxy = sxy / (24 * area) - mx * my;
  // Eigen-decomposition of the 2x2 covariance.
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (0.25 * tr * tr) - det));
  const l1 = Math.max(0, 0.5 * tr + disc);
  const l2 = Math.max(0, 0.5 * tr - disc);
  let vx: number;
  let vy: number;
  if (Math.abs(cxy) > 1e-12) {
    vx = l1 - cyy;
    vy = cxy;
  } else if (cxx >= cyy) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }
  let angle = (Math.atan2(vy, vx) * 180) / Math.PI;
  angle = ((angle % 180) + 180) % 180;
  const centreX = ox + mx;
  const centreY = oy + my;
  // A camera cannot measure a body whose silhouette centre has left its frame:
  // report lost, as the Orbital Tracker would, rather than an off-frame ellipse.
  if (centreX < 0 || centreX > width || centreY < 0 || centreY > height) return null;
  return {
    centerPx: [centreX, centreY],
    centerNorm: [centreX / width, centreY / height],
    majorPx: 4 * Math.sqrt(l1),
    minorPx: 4 * Math.sqrt(l2),
    angleDeg: angle,
    areaPx: Math.abs(area),
  };
}
