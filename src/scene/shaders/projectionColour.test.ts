import { describe, expect, it } from 'vitest';
import { limitProjectionChroma, nativeProjectionLight, projectionLinearToSrgb, projectionSrgbToLinear, type ProjectionRgb } from './projectionColour';

describe('native projector colour signal', () => {
  it('reproduces authored vivid pigments at neutral exposure through one transfer', () => {
    const pigments: ProjectionRgb[] = [[1, 0.025, 0.13], [0.015, 0.58, 1], [1, 0.67, 0.015], [0.4, 0.025, 1], [0.025, 1, 0.36], [0.4, 0.4, 0.4]];
    for (const pigment of pigments) {
      const display = projectionLinearToSrgb(nativeProjectionLight(pigment));
      display.forEach((value, index) => expect(value).toBeCloseTo(pigment[index], 6));
    }
  });

  it('raises dark light levels while retaining pigment ratios and preventing white clipping', () => {
    const light = projectionSrgbToLinear([0.02, 0.58, 1]);
    const boosted = nativeProjectionLight([0.02, 0.58, 1], 2, 3);
    expect(Math.max(...boosted)).toBe(1);
    expect(boosted[0] / boosted[2]).toBeCloseTo(light[0] / light[2], 8);
    expect(boosted[1] / boosted[2]).toBeCloseTo(light[1] / light[2], 8);
    const display = projectionLinearToSrgb(boosted);
    expect(display[0]).toBeLessThan(0.03);
    expect(display[1]).toBeCloseTo(0.58, 6);
    const dim: ProjectionRgb = [0.2, 0.05, 0.01];
    expect(nativeProjectionLight(dim, 1, 1)[0]).toBeGreaterThan(nativeProjectionLight(dim)[0]);
  });

  it('preserves black, monochrome, scalar face shading and zero brightness', () => {
    expect(nativeProjectionLight([0, 0, 0], 2, 3)).toEqual([0, 0, 0]);
    expect(nativeProjectionLight([1, 0.1, 0.3], 0, 3)).toEqual([0, 0, 0]);
    expect(limitProjectionChroma([0.2, 0.02, 0.06])).toEqual([0.2, 0.02, 0.06]);
    const grey = nativeProjectionLight([0.4, 0.4, 0.4]);
    expect(grey[0]).toBe(grey[1]); expect(grey[1]).toBe(grey[2]);
    expect(nativeProjectionLight([0.12, 0.3, 0.5])[2]).toBeLessThan(nativeProjectionLight([0.24, 0.6, 1])[2]);
  });

  it('keeps feathering outside source colour normalization', () => {
    const source = nativeProjectionLight([0.02, 0.58, 1]);
    // The output compositor applies this linear mask once, after gamut limiting.
    const masked = source.map(value => value * 0.25);
    expect(masked[2]).toBe(0.25);
    expect(masked[1] / masked[2]).toBeCloseTo(source[1] / source[2], 8);
    expect(limitProjectionChroma([4, 2, 0.5])).toEqual([1, 0.5, 0.125]);
  });
});
