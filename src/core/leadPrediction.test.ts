import { describe, expect, it } from 'vitest';
import { MAX_LEAD_FRACTION, PROJECTION_PIPELINE_LEAD_S, ledCentre } from './leadPrediction';

describe('lead prediction', () => {
  it('moves the picture ahead along the motion by the pipeline delay', () => {
    const [x, y] = ledCentre([400, 300], [160, 0], 210, 5);
    expect(x).toBeCloseTo(400 + 160 * (0.005 + PROJECTION_PIPELINE_LEAD_S), 6);
    expect(y).toBe(300);
  });

  it('caps the lead so a fast bob cannot throw the picture off the ball', () => {
    const [x, y] = ledCentre([400, 300], [0, 5000], 210, 50);
    expect(x).toBe(400);
    expect(y - 300).toBeCloseTo(MAX_LEAD_FRACTION * 210, 6);
  });

  it('leaves a still or unknown ball where it is', () => {
    expect(ledCentre([10, 20], [0, 0], 100, 5)).toEqual([10, 20]);
    expect(ledCentre([10, 20], [Number.NaN, 0], 100, 5)).toEqual([10, 20]);
  });
});
