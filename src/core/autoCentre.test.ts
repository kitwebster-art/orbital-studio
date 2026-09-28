import { describe, expect, it } from 'vitest';
import { AutoCentre, calibrationAt, measureProjectionOffset } from './autoCentre';

function scene(offsetX: number, offsetY: number, projectedRadius = 60) {
  const w = 256, h = 192, cx = 128, cy = 96, r = 60;
  const gray = new Uint8Array(w * h), mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) { gray[i] = 15; continue; }
    mask[i] = 255;
    // Infrared-only body at 70; the projected disc (same size as the ball) adds light, with grid lines.
    const lit = (x - cx - offsetX) ** 2 + (y - cy - offsetY) ** 2 <= projectedRadius * projectedRadius;
    gray[i] = lit ? ((x % 8 === 0 || y % 8 === 0) ? 120 : 200) : 70;
  }
  return { gray, mask, w, h };
}

describe('auto-centring', () => {
  it('points the correction against the projection offset', () => {
    // 27 September: the picture sat left of the egg, leaving an unlit crescent on the right.
    const { gray, mask, w, h } = scene(-8, 0);
    const m = measureProjectionOffset(gray, mask, w, h)!;
    expect(m.errorPx[0]).toBeGreaterThan(2);
    expect(Math.abs(m.errorPx[1])).toBeLessThan(1);
    expect(m.litFraction).toBeGreaterThan(0.7);
  });

  it('reads a centred projection as no error', () => {
    const { gray, mask, w, h } = scene(0, 0);
    const m = measureProjectionOffset(gray, mask, w, h)!;
    expect(Math.hypot(...m.errorPx)).toBeLessThan(0.6);
  });

  it('sees a picture that stops short of the rim and grows it to fit', () => {
    // Size is fine-tuned within the scan's measurement: a picture 8% short grows back to the rim.
    const small = scene(0, 0, 50);
    const m = measureProjectionOffset(small.gray, small.mask, small.w, small.h)!;
    expect(m.litEdge).toBeLessThan(0.9);
    const control = new AutoCentre(1);
    for (let step = 0; step < 80; step++) {
      const s = scene(0, 0, Math.min(70, Math.round(50 * control.sizeScale)));
      const r = measureProjectionOffset(s.gray, s.mask, s.w, s.h);
      if (r) control.update(r.errorPx, 120, 0.3, r.litEdge);
    }
    expect(50 * control.sizeScale).toBeGreaterThan(54);
    expect(50 * control.sizeScale).toBeLessThanOrEqual(50 * 1.15 + 1e-9);
  });

  it('converges in a closed loop and stays bounded', () => {
    const control = new AutoCentre(1);
    let trueOffset = -10;
    for (let step = 0; step < 60; step++) {
      const { gray, mask, w, h } = scene(Math.round(trueOffset + control.correctionPx[0]), 0);
      const m = measureProjectionOffset(gray, mask, w, h);
      if (m) control.update(m.errorPx, 120, 0.3);
    }
    // Within about 4% of the radius: the pattern-proof blur hides the thinnest crescents.
    expect(Math.abs(trueOffset + control.correctionPx[0])).toBeLessThanOrEqual(2.5);
    trueOffset = 0;
    const capped = new AutoCentre(0.1, 0.25);
    for (let i = 0; i < 50; i++) capped.update([100, 0], 120, 1);
    expect(capped.correctionPx[0]).toBeCloseTo(30, 6);
  });

  it('learns an error that changes with height, not just one offset', () => {
    // True misalignment: 6 px right at the scan spot, growing by 10 px per ball-width lower,
    // and the picture needs about 10% more size near the top than at the bottom.
    const anchor: [number, number] = [500, 300], diameter = 200;
    const trueShift = (y: number) => 6 + 10 * (y - anchor[1]) / diameter;
    const trueLogSize = (y: number) => Math.log(1.03) - 0.05 * (y - anchor[1]) / diameter;
    const control = new AutoCentre(1);
    control.setAnchor(anchor, diameter);
    let seed = 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let step = 0; step < 3000; step++) {
      const y = anchor[1] + (random() - 0.5) * 2 * diameter, at: [number, number] = [anchor[0], y];
      const now = calibrationAt(control.model, at);
      // Residual: what the camera would measure with the current correction; lit edge from the size error.
      const error: [number, number] = [trueShift(y) - now.correctionPx[0], 0];
      const edge = AutoCentre.TARGET_EDGE * Math.exp(Math.log(now.sizeScale) - trueLogSize(y));
      control.update(error, diameter, 0.3, Math.min(1, edge), at);
    }
    for (const y of [anchor[1] - 150, anchor[1], anchor[1] + 150]) {
      const now = calibrationAt(control.model, [anchor[0], y]);
      expect(Math.abs(now.correctionPx[0] - trueShift(y))).toBeLessThan(1.5);
      expect(Math.abs(Math.log(now.sizeScale) - trueLogSize(y))).toBeLessThan(0.03);
    }
  });
});

describe('auto-centring with a textured look', () => {
  it('finds the unlit crescent under a maze pattern instead of the pattern lines', () => {
    // 27 September: a maze look, the picture shifted right by a third of the egg's radius.
    const w = 256, h = 192, cx = 128, cy = 96, r = 54, shift = 18;
    const gray = new Uint8Array(w * h), mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) { gray[i] = 8; continue; }
      mask[i] = 255;
      const lit = (x - cx - shift) ** 2 + (y - cy) ** 2 <= r * r;
      const maze = Math.sin(x * 0.55 + Math.sin(y * 0.3) * 2) > 0.1;
      gray[i] = lit ? (maze ? 215 : 95) : 85;
    }
    const m = measureProjectionOffset(gray, mask, w, h)!;
    expect(m.errorPx[0]).toBeLessThan(-4); // move the picture left
    expect(Math.abs(m.errorPx[1])).toBeLessThan(2);
    expect(m.litFraction).toBeGreaterThan(0.6);
  });
});
