import { describe, expect, it } from 'vitest';
import { aimAdvice, parseCameraPreview } from './aimView';

const payload = {
  format: 'png', width: 512, height: 384, frame_width: 1024, frame_height: 768, sequence: 7,
  frame_png_base64: 'iVBORw0KGgo=', mask_png_base64: null, mask_fraction: 0.12,
  stretch: [4, 80], levels: { min: 2, max: 79, mean: 14, clipped_fraction: 0 }, threshold: 120,
};

describe('camera aim view', () => {
  it('parses the bridge preview and fails closed on bad payloads', () => {
    const preview = parseCameraPreview(payload);
    expect(preview.frameWidth).toBe(1024);
    expect(preview.levels.max).toBe(79);
    expect(preview.maskPngBase64).toBeNull();
    expect(preview.simulated).toBe(false);
    expect(parseCameraPreview({ ...payload, simulated: true }).simulated).toBe(true);
    expect(() => parseCameraPreview({ ...payload, format: 'jpeg' })).toThrow();
    expect(() => parseCameraPreview({ ...payload, frame_png_base64: '' })).toThrow();
    expect(() => parseCameraPreview({ ...payload, width: 'wide' })).toThrow();
  });

  it('bases exposure advice on true sensor levels, not the brightened picture', () => {
    // The first real snapshot on 27 September: brightest pixel 79, nothing detected.
    const dark = aimAdvice({ levels: { min: 2, max: 79, mean: 14, clippedFraction: 0 }, maskFraction: 0, threshold: 120 });
    expect(dark.tone).toBe('bad');
    expect(dark.exposure).toMatch(/Too dark for the tracker/);
    expect(aimAdvice({ levels: { min: 2, max: 150, mean: 30, clippedFraction: 0 }, maskFraction: 0.1, threshold: 120 }).exposureTone).toBe('warn');
    expect(dark.ball).toMatch(/No ball/);
    expect(dark.exposureTone).toBe('bad');
    expect(dark.ballTone).toBe('bad');
    const good = aimAdvice({ levels: { min: 5, max: 210, mean: 40, clippedFraction: 0.001 }, maskFraction: 0.15 });
    expect(good.tone).toBe('good');
    expect(good.exposureTone).toBe('good');
    expect(good.ballTone).toBe('good');
    // A clipped highlight on the ball is fine for its outline; only heavy clipping is flagged.
    const highlight = aimAdvice({ levels: { min: 5, max: 255, mean: 120, clippedFraction: 0.028 }, maskFraction: 0.15 });
    expect(highlight.exposureTone).toBe('good');
    expect(highlight.exposure).toMatch(/clipped/);
    expect(aimAdvice({ levels: { min: 5, max: 255, mean: 200, clippedFraction: 0.2 }, maskFraction: 0.15 }).exposureTone).toBe('bad');
    expect(aimAdvice({ levels: { min: 5, max: 210, mean: 40, clippedFraction: 0 }, maskFraction: 0.01 }).ball).toMatch(/small/);
    expect(aimAdvice({ levels: { min: 5, max: 210, mean: 40, clippedFraction: 0 }, maskFraction: 0.7 }).ball).toMatch(/back/);
  });
});
