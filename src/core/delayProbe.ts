/**
 * Projector delay probe. Studio blacks out the projected ball for a moment and
 * the camera bridge reports the ball's centre brightness on every frame. The
 * time from drawing the first black frame to the first camera frame where the
 * ball has darkened is the delay the motion lead must cover (display, projector
 * and camera transfer together). Pure, so it is testable without hardware.
 */

export interface DelaySample { darkDrawnMs: number }

/**
 * `trace` holds [time ms on Studio's clock, brightness]. Returns the median delay
 * in ms over the blinks whose darkening was clearly visible, or null.
 */
export function measureProjectorDelay(trace: ReadonlyArray<readonly [number, number]>, blinks: readonly DelaySample[], minimumStep = 12): number | null {
  const median = (values: number[]) => { const v = [...values].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
  const delays: number[] = [];
  for (const { darkDrawnMs: t0 } of blinks) {
    const before = median(trace.filter(([t]) => t >= t0 - 300 && t <= t0 - 20).map(([, level]) => level));
    const after = median(trace.filter(([t]) => t >= t0 + 150 && t <= t0 + 240).map(([, level]) => level));
    if (!Number.isFinite(before) || !Number.isFinite(after) || before - after < minimumStep) continue;
    const threshold = (before + after) / 2;
    const first = trace.find(([t, level]) => t > t0 && level < threshold);
    if (first && first[0] - t0 < 250) delays.push(first[0] - t0);
  }
  return delays.length ? median(delays) : null;
}
