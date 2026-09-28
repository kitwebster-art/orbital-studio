import { describe, expect, it } from 'vitest';
import { measureProjectorDelay } from './delayProbe';

describe('projector delay probe', () => {
  it('finds when the camera sees the ball darken after each blink', () => {
    // 91 fps camera; the projector's light leaves the ball 62 ms after the black frame is drawn.
    const blinks = [{ darkDrawnMs: 1000 }, { darkDrawnMs: 1600 }, { darkDrawnMs: 2200 }];
    const trace: Array<[number, number]> = [];
    for (let t = 500; t < 2700; t += 1000 / 91) {
      const dark = blinks.some(({ darkDrawnMs }) => t >= darkDrawnMs + 62 && t < darkDrawnMs + 62 + 250);
      trace.push([t, dark ? 80 : 190]);
    }
    const delay = measureProjectorDelay(trace, blinks)!;
    expect(delay).toBeGreaterThanOrEqual(62);
    expect(delay).toBeLessThan(62 + 12);
  });

  it('gives up when the blink is not visible on the ball', () => {
    const trace: Array<[number, number]> = Array.from({ length: 200 }, (_, i) => [500 + i * 11, 120]);
    expect(measureProjectorDelay(trace, [{ darkDrawnMs: 1000 }])).toBeNull();
  });
});
