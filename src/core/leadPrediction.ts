/**
 * Lead the projected ball along its motion. Camera exposure, transfer, the
 * browser frame and the projector's own processing add a fixed delay, so a
 * moving ball ran ahead of its picture (27 September: the egg moved at about
 * 160 px/s typically and 500 px/s on fast bobs). Projecting where the ball will
 * be when the light lands closes most of that gap.
 */

/** Delay after a tracking frame is received until its light reaches the ball: browser frame plus projector. */
export const PROJECTION_PIPELINE_LEAD_S = 0.045;
/** Never lead further than this, so a turn-around cannot throw the picture far off the ball. */
export const MAX_LEAD_S = 0.12;
/** And never by more than this fraction of the ball's width. */
export const MAX_LEAD_FRACTION = 0.35;

export function ledCentre(
  centerPx: readonly [number, number],
  velocityPxPerS: readonly [number, number],
  majorPx: number,
  frameAgeMs: number,
  pipelineLeadS = PROJECTION_PIPELINE_LEAD_S,
): [number, number] {
  const [vx, vy] = velocityPxPerS;
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return [centerPx[0], centerPx[1]];
  const leadS = Math.min(MAX_LEAD_S, Math.max(0, frameAgeMs) / 1000 + pipelineLeadS);
  let dx = vx * leadS, dy = vy * leadS;
  const limit = MAX_LEAD_FRACTION * Math.max(0, majorPx);
  const length = Math.hypot(dx, dy);
  if (length > limit && length > 0) { dx *= limit / length; dy *= limit / length; }
  return [centerPx[0] + dx, centerPx[1] + dy];
}
