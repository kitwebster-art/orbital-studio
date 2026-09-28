/**
 * Pure 2D mapping from a tracked camera-space ellipse to a projector-space
 * ellipse through the structured-light homography. Exact only at the depth the
 * scan was taken; the UI must say so.
 */
import type { Vec3 } from './contracts';
import type { StructuredLightResult } from './structuredLight';

export interface ImageEllipse {
  /** Centre in pixels, image coordinates (x right, y down). */
  centerPx: [number, number];
  /** Full diameters in pixels. */
  majorPx: number;
  minorPx: number;
  /** Major-axis angle in degrees, measured in image coordinates. */
  angleDeg: number;
}

export type Homography = readonly number[];

export function applyHomography(h: Homography, x: number, y: number): [number, number] {
  const w = h[6] * x + h[7] * y + h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) throw new Error('Homography is singular at this point');
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** 2x2 Jacobian [[du/dx, du/dy], [dv/dx, dv/dy]] of the homography at (x, y). */
export function homographyJacobian(h: Homography, x: number, y: number): [[number, number], [number, number]] {
  const w = h[6] * x + h[7] * y + h[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) throw new Error('Homography is singular at this point');
  const [u, v] = applyHomography(h, x, y);
  return [
    [(h[0] - u * h[6]) / w, (h[1] - u * h[7]) / w],
    [(h[3] - v * h[6]) / w, (h[4] - v * h[7]) / w],
  ];
}

/**
 * The homography linearised at the scanned ball: exact there, and an affine map
 * (constant size scale) everywhere else. The scan sees the ball's outline at one
 * spot only, so the homography's perspective terms are barely constrained. On
 * 27 September a scan's terms scaled the projected ball 3.3x above the scan spot
 * and 1.2x below it, while the tracked ball stayed within 1% of one size. With
 * the camera beside the projector the true mapping at the ball's depth is close
 * to affine, so live tracking uses this instead of the raw homography.
 */
export function scanAnchoredAffine(h: Homography, anchorX: number, anchorY: number, sizeScale?: number): Homography {
  const [u, v] = applyHomography(h, anchorX, anchorY);
  let [[a, b], [c, d]] = homographyJacobian(h, anchorX, anchorY);
  // When the scan also measured the ball's outline in both pictures, that ratio is the
  // better size scale: the fitted Jacobian read 8% small on 27 September.
  const det = Math.abs(a * d - b * c);
  if (sizeScale !== undefined && Number.isFinite(sizeScale) && sizeScale > 0 && det > 0) {
    const k = sizeScale / Math.sqrt(det);
    a *= k; b *= k; c *= k; d *= k;
  }
  return [a, b, u - a * anchorX - b * anchorY, c, d, v - c * anchorX - d * anchorY, 0, 0, 1];
}

/** Map a camera ellipse to projector pixels: centre through H, axes through the local Jacobian. */
export function mapEllipseThroughHomography(h: Homography, ellipse: ImageEllipse): ImageEllipse {
  const [cx, cy] = ellipse.centerPx;
  const center = applyHomography(h, cx, cy);
  const J = homographyJacobian(h, cx, cy);
  const t = ellipse.angleDeg * Math.PI / 180, a = ellipse.majorPx / 2, b = ellipse.minorPx / 2;
  // Columns of M are the two semi-axis vectors.
  const m = [[a * Math.cos(t), -b * Math.sin(t)], [a * Math.sin(t), b * Math.cos(t)]];
  const n = [
    [J[0][0] * m[0][0] + J[0][1] * m[1][0], J[0][0] * m[0][1] + J[0][1] * m[1][1]],
    [J[1][0] * m[0][0] + J[1][1] * m[1][0], J[1][0] * m[0][1] + J[1][1] * m[1][1]],
  ];
  // S = N N^T is the image ellipse's shape matrix.
  const p = n[0][0] ** 2 + n[0][1] ** 2, r = n[1][0] ** 2 + n[1][1] ** 2, q = n[0][0] * n[1][0] + n[0][1] * n[1][1];
  const mean = (p + r) / 2, spread = Math.hypot((p - r) / 2, q);
  const major = Math.sqrt(Math.max(0, mean + spread)), minor = Math.sqrt(Math.max(0, mean - spread));
  const angleDeg = spread < 1e-12 ? 0 : 0.5 * Math.atan2(2 * q, p - r) * 180 / Math.PI;
  return { centerPx: center, majorPx: 2 * major, minorPx: 2 * minor, angleDeg };
}

export interface OrthoFraming {
  /** Frustum in world units relative to the sphere centre (camera looks down -Z). */
  left: number; right: number; top: number; bottom: number;
  /** Sphere radii in world units along the rotated ellipse axes (x = major, y = minor, z = depth). */
  radii: [number, number, number];
  /** Rotation of the major axis in world XY (y up), radians. */
  shapeAngleRad: number;
}

/**
 * Orthographic framing that makes a sphere of nominal radius R appear exactly as
 * the projector-space ellipse on a W x H raster. World units per pixel s = R / (major/2).
 */
export function orthoFramingForEllipse(e: ImageEllipse, width: number, height: number, radiusM: number): OrthoFraming {
  if (!(e.majorPx > 0) || !(e.minorPx > 0) || !(radiusM > 0)) throw new Error('Ellipse and radius must be positive');
  const s = radiusM / (e.majorPx / 2);
  const [cx, cy] = e.centerPx;
  return {
    left: -cx * s, right: (width - cx) * s,
    top: cy * s, bottom: -(height - cy) * s,
    radii: [radiusM, (e.minorPx / 2) * s, radiusM],
    // Image y points down and world y points up, so the rotation sense flips.
    shapeAngleRad: -e.angleDeg * Math.PI / 180,
  };
}

/** Convert a scan's camera-frame estimate (OpenCV: X right, Y down, Z forward) to test-rig world fields.
 * Assumes the camera looks horizontally towards -Z world (towards the ball), which is the bench convention. */
export function scanToRigFields(result: StructuredLightResult, cameraWorldM: Vec3): { ballDiameterM: number | null; ballCenterM: Vec3 | null; projectorPositionM: Vec3 | null } {
  const e = result.estimate3d;
  if (!e?.available) return { ballDiameterM: null, ballCenterM: null, projectorPositionM: null };
  const toWorld = (p: [number, number, number] | null, origin: [number, number, number] | null): Vec3 | null => {
    if (!p) return null;
    const o = origin ?? [0, 0, 0];
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return { x: round(cameraWorldM.x + (p[0] - o[0])), y: round(cameraWorldM.y - (p[1] - o[1])), z: round(cameraWorldM.z - (p[2] - o[2])) };
  };
  return {
    ballDiameterM: e.ball_diameter_m,
    ballCenterM: toWorld(e.ball_center_m, e.camera_position_m),
    projectorPositionM: toWorld(e.projector_position_m, e.camera_position_m),
  };
}

/**
 * Where a W x H raster actually lands inside a box styled `object-fit: contain`.
 * Both the scan patterns and the live output use this same rule, so projector
 * raster pixel (u, v) means the same physical spot in both.
 */
export function containedContentRect(boxWidth: number, boxHeight: number, rasterWidth: number, rasterHeight: number): { width: number; height: number; offsetX: number; offsetY: number } {
  if (!(boxWidth > 0) || !(boxHeight > 0) || !(rasterWidth > 0) || !(rasterHeight > 0)) return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  const scale = Math.min(boxWidth / rasterWidth, boxHeight / rasterHeight);
  const width = rasterWidth * scale, height = rasterHeight * scale;
  return { width, height, offsetX: (boxWidth - width) / 2, offsetY: (boxHeight - height) / 2 };
}

/**
 * Identity of the projector window's on-screen layout, in device pixels. A scan
 * is only valid while this is unchanged: leaving full screen, resizing or moving
 * the window changes where every raster pixel lands on the ball.
 */
export function projectorSurfaceSignature(input: {
  boxLeft: number; boxTop: number; boxWidth: number; boxHeight: number;
  rasterWidth: number; rasterHeight: number; devicePixelRatio: number; screenX: number; screenY: number;
}): string | null {
  const content = containedContentRect(input.boxWidth, input.boxHeight, input.rasterWidth, input.rasterHeight);
  if (!(content.width > 0)) return null;
  const dpr = input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
  const px = (v: number) => Math.round(v * dpr);
  return [
    `raster=${input.rasterWidth}x${input.rasterHeight}`,
    `content=${px(content.width)}x${px(content.height)}`,
    `at=${px(input.boxLeft + content.offsetX)},${px(input.boxTop + content.offsetY)}`,
    `window=${Math.round(input.screenX)},${Math.round(input.screenY)}`,
  ].join(';');
}

export const SCAN_PROFILE_KEY = 'orbital.structured-light-scan/1.0';
export interface StoredScanProfile { schemaVersion: typeof SCAN_PROFILE_KEY; result: StructuredLightResult; useForLive: boolean; savedAt: string; surfaceSignature?: string | null }

/**
 * Lens shift that puts the twin projector's picture where the real one is: the
 * twin aims its projector at the rig's ball, and the scan found that ball at
 * `ballPx` in the real projector's picture, so the picture is offset from the
 * aim by that much. Units match ProjectorDefinition.lensShift (half-frame widths
 * and heights, as used by OrbitalScene's view offset).
 */
export function lensShiftForScan(ballPx: readonly [number, number], widthPx: number, heightPx: number): { x: number; y: number } {
  const clamp = (v: number) => Math.max(-2, Math.min(2, v));
  return { x: clamp((2 * ballPx[0]) / widthPx - 1), y: clamp(1 - (2 * ballPx[1]) / heightPx) };
}

export interface Vec3Like { x: number; y: number; z: number }

/**
 * Where the ball is in the twin, from where it sits in the real projector's
 * picture. The twin projector looks from `projectorM` at `aimM` (the rig ball,
 * which the scan saw at `scanBallPx` with diameter `scanDiameterPx`). A ball at
 * projector pixel `ballPx` with diameter `diameterPx` lies along that pixel's
 * ray, at a distance scaled by its apparent size. So when the real ball drops
 * off the bottom of the projected picture, the twin's ball leaves the bottom of
 * the twin's projector frustum too.
 */
export function projectorPixelToTwin(
  projectorM: Vec3Like, aimM: Vec3Like, verticalFovDeg: number, heightPx: number,
  scanBallPx: readonly [number, number], scanDiameterPx: number,
  ballPx: readonly [number, number], diameterPx: number,
): Vec3Like | null {
  const fx = aimM.x - projectorM.x, fy = aimM.y - projectorM.y, fz = aimM.z - projectorM.z;
  const aimDistance = Math.hypot(fx, fy, fz);
  if (!(aimDistance > 0) || !(diameterPx > 0) || !(scanDiameterPx > 0) || !(heightPx > 0)) return null;
  const forward = { x: fx / aimDistance, y: fy / aimDistance, z: fz / aimDistance };
  // Same basis as OrbitalScene.makeFrustum: right = forward × worldUp, up = right × forward.
  const worldUp = Math.abs(forward.y) > 0.94 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  let rx = forward.y * worldUp.z - forward.z * worldUp.y, ry = forward.z * worldUp.x - forward.x * worldUp.z, rz = forward.x * worldUp.y - forward.y * worldUp.x;
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * forward.z - rz * forward.y, uy = rz * forward.x - rx * forward.z, uz = rx * forward.y - ry * forward.x;
  const focalPx = (heightPx / 2) / Math.tan((verticalFovDeg * Math.PI) / 360);
  const depth = aimDistance * (scanDiameterPx / diameterPx);
  const sx = (ballPx[0] - scanBallPx[0]) / focalPx, sy = -(ballPx[1] - scanBallPx[1]) / focalPx;
  return {
    x: projectorM.x + depth * (forward.x + sx * rx + sy * ux),
    y: projectorM.y + depth * (forward.y + sx * ry + sy * uy),
    z: projectorM.z + depth * (forward.z + sx * rz + sy * uz),
  };
}
