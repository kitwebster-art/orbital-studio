import { describe, expect, it } from 'vitest';
import { applyHomography, containedContentRect, homographyJacobian, mapEllipseThroughHomography, orthoFramingForEllipse, projectorSurfaceSignature, scanAnchoredAffine, projectorPixelToTwin, lensShiftForScan, scanToRigFields } from './scanMapping';
import { parseStructuredLightResult } from './structuredLight';
import { SAMPLE_RESULT } from './structuredLight.fixture';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('homography mapping', () => {
  it('maps points and matches a numeric Jacobian', () => {
    const h = [1.2, 0.1, 30, -0.05, 1.1, 12, 0.0002, -0.0001, 1];
    const [u, v] = applyHomography(h, 100, 200);
    close(u, (1.2 * 100 + 0.1 * 200 + 30) / (0.02 - 0.02 + 1));
    const J = homographyJacobian(h, 100, 200), d = 1e-4;
    const [ux, vx] = applyHomography(h, 100 + d, 200), [uy, vy] = applyHomography(h, 100, 200 + d);
    close(J[0][0], (ux - u) / d, 1e-4); close(J[1][0], (vx - v) / d, 1e-4);
    close(J[0][1], (uy - u) / d, 1e-4); close(J[1][1], (vy - v) / d, 1e-4);
    expect(() => applyHomography([0, 0, 0, 0, 0, 0, 0, 0, 0], 1, 1)).toThrow();
  });
  it('scales, translates and rotates an ellipse exactly for an affine homography', () => {
    const e = { centerPx: [10, 20] as [number, number], majorPx: 40, minorPx: 20, angleDeg: 0 };
    const scaled = mapEllipseThroughHomography([2, 0, 5, 0, 2, 7, 0, 0, 1], e);
    expect(scaled.centerPx).toEqual([25, 47]); close(scaled.majorPx, 80); close(scaled.minorPx, 40); close(scaled.angleDeg, 0);
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const rotated = mapEllipseThroughHomography([c, -s, 0, s, c, 0, 0, 0, 1], { ...e, angleDeg: 10 });
    close(rotated.majorPx, 40); close(rotated.minorPx, 20); close(rotated.angleDeg, 40);
    const circle = mapEllipseThroughHomography([1, 0, 0, 0, 3, 0, 0, 0, 1], { ...e, majorPx: 10, minorPx: 10 });
    close(circle.majorPx, 30); close(circle.minorPx, 10); close(Math.abs(circle.angleDeg), 90);
  });
  it('agrees with mapping boundary points of a small ellipse under a projective homography', () => {
    const h = [1.1, 0.05, 40, 0.02, 0.95, -10, 0.0003, 0.0001, 1];
    const e = { centerPx: [300, 200] as [number, number], majorPx: 2, minorPx: 1, angleDeg: 25 };
    const m = mapEllipseThroughHomography(h, e);
    const t = 25 * Math.PI / 180;
    const tip = applyHomography(h, 300 + Math.cos(t), 200 + Math.sin(t));
    const r = Math.hypot(tip[0] - m.centerPx[0], tip[1] - m.centerPx[1]);
    expect(r).toBeLessThanOrEqual(m.majorPx / 2 + 1e-3); expect(r).toBeGreaterThanOrEqual(m.minorPx / 2 - 1e-3);
  });
});

describe('output framing and layout fields', () => {
  it('frames the sphere so its silhouette lands on the projector ellipse', () => {
    const f = orthoFramingForEllipse({ centerPx: [960, 540], majorPx: 400, minorPx: 300, angleDeg: 30 }, 1920, 1080, 0.25);
    const s = 0.25 / 200;
    close(f.right - f.left, 1920 * s); close(f.top - f.bottom, 1080 * s);
    close(-f.left / (f.right - f.left) * 1920, 960); close(f.top / (f.top - f.bottom) * 1080, 540);
    close(f.radii[0], 0.25); close(f.radii[1], 150 * s); close(f.shapeAngleRad, -Math.PI / 6);
    expect(() => orthoFramingForEllipse({ centerPx: [0, 0], majorPx: 0, minorPx: 1, angleDeg: 0 }, 10, 10, 1)).toThrow();
  });
  it('converts the camera-frame estimate into world layout fields', () => {
    const fields = scanToRigFields(parseStructuredLightResult(SAMPLE_RESULT), { x: 0.25, y: 1, z: 2 });
    expect(fields.ballDiameterM).toBe(0.62);
    expect(fields.ballCenterM).toEqual({ x: 0.25, y: 1, z: 0 });
    expect(fields.projectorPositionM).toEqual({ x: 0.6, y: 0.98, z: 1.99 });
    const none = scanToRigFields(parseStructuredLightResult({ ...SAMPLE_RESULT, estimate3d: { ...SAMPLE_RESULT.estimate3d, available: false } }), { x: 0, y: 1, z: 2 });
    expect(none.ballCenterM).toBeNull();
  });
});

describe('projector window layout guard', () => {
  it('places a contained raster exactly as object-fit: contain does', () => {
    expect(containedContentRect(1920, 1080, 1920, 1080)).toEqual({ width: 1920, height: 1080, offsetX: 0, offsetY: 0 });
    // Windowed popup: header and meta bar shrink the box, so the raster letterboxes left and right.
    const r = containedContentRect(1920, 1000, 1920, 1080);
    close(r.height, 1000); close(r.width, 1920 * 1000 / 1080); close(r.offsetX, (1920 - r.width) / 2); close(r.offsetY, 0);
    expect(containedContentRect(0, 100, 1920, 1080).width).toBe(0);
  });

  it('changes when the window leaves full screen, moves or rescales, and not otherwise', () => {
    const full = { boxLeft: 0, boxTop: 0, boxWidth: 1920, boxHeight: 1080, rasterWidth: 1920, rasterHeight: 1080, devicePixelRatio: 1, screenX: 1512, screenY: 0 };
    const a = projectorSurfaceSignature(full);
    expect(a).not.toBeNull();
    expect(projectorSurfaceSignature({ ...full })).toBe(a);
    expect(projectorSurfaceSignature({ ...full, boxTop: 38, boxHeight: 1000 })).not.toBe(a);
    expect(projectorSurfaceSignature({ ...full, screenX: 0 })).not.toBe(a);
    expect(projectorSurfaceSignature({ ...full, rasterWidth: 1280, rasterHeight: 720 })).not.toBe(a);
    // Same physical layout expressed at a HiDPI scale is the same device-pixel layout.
    expect(projectorSurfaceSignature({ ...full, boxWidth: 960, boxHeight: 540, devicePixelRatio: 2 })).toBe(a);
    expect(projectorSurfaceSignature({ ...full, boxWidth: 0 })).toBeNull();
  });
});

describe('scan-anchored affine mapping', () => {
  // The 27 September 21:35 scan: strong, poorly constrained perspective terms.
  const h = [-4.634154663, -2.161413358, 2273.747208651, -1.870686048, -4.226518423, 1298.035591063, -0.002784934, -0.002081468, 1.0];
  const anchor: [number, number] = [603.264, 289.968];
  it('matches the homography at the scanned ball and keeps one size scale everywhere', () => {
    const affine = scanAnchoredAffine(h, anchor[0], anchor[1]);
    const [u, v] = applyHomography(h, anchor[0], anchor[1]);
    const [au, av] = applyHomography(affine, anchor[0], anchor[1]);
    expect(au).toBeCloseTo(u, 6); expect(av).toBeCloseTo(v, 6);
    const size = (y: number) => mapEllipseThroughHomography(affine, { centerPx: [anchor[0], y], majorPx: 218, minorPx: 210, angleDeg: 0 });
    const high = size(90), low = size(490);
    expect(high.majorPx).toBeCloseTo(low.majorPx, 6);
    // The raw homography changed the size by almost three times over the same range.
    const raw = (y: number) => mapEllipseThroughHomography(h, { centerPx: [anchor[0], y], majorPx: 218, minorPx: 210, angleDeg: 0 }).majorPx;
    expect(raw(90) / raw(490)).toBeGreaterThan(2);
  });
});

describe('twin placement from the projector picture', () => {
  const projector = { x: 0, y: 1, z: 2 }, aim = { x: 0, y: 1, z: 0 };
  it('puts the scanned ball on the rig ball and moves the twin ball with the picture', () => {
    const at = projectorPixelToTwin(projector, aim, 40, 1080, [822, 770], 520, [822, 770], 520)!;
    expect(at.x).toBeCloseTo(0, 9); expect(at.y).toBeCloseTo(1, 9); expect(at.z).toBeCloseTo(0, 9);
    // Lower in the projector picture (bigger v) means lower in the twin.
    const lower = projectorPixelToTwin(projector, aim, 40, 1080, [822, 770], 520, [822, 1000], 520)!;
    expect(lower.y).toBeLessThan(1);
    // Smaller in the picture means further from the projector.
    const further = projectorPixelToTwin(projector, aim, 40, 1080, [822, 770], 520, [822, 770], 260)!;
    expect(further.z).toBeCloseTo(-2, 9);
  });
  it('shifts the twin picture so the rig ball sits where the scan saw it', () => {
    expect(lensShiftForScan([960, 540], 1920, 1080)).toEqual({ x: 0, y: 0 });
    const shift = lensShiftForScan([822, 770], 1920, 1080);
    expect(shift.x).toBeCloseTo(-0.14375, 6); expect(shift.y).toBeCloseTo(-0.4259, 3);
  });
});
