import type { ImageEllipse } from './scanMapping';

/**
 * Short hold for the structured-light ball output. A single late or unsure
 * tracking frame used to black the projector out for a frame or two, which
 * read as flashing on the 27 September home rig. Within this window the last
 * good outline stays up; after it, the gate blacks out as before. It only
 * covers tracking hiccups, never an operator blackout or a changed window.
 */
export const STRUCTURED_LIGHT_HOLD_MS = 300;

const HOLDABLE_REASONS: ReadonlySet<string> = new Set([
  'LIVE_TRACKING_EXPIRED',
  'LIVE_TRACKING_NOT_READY',
  'STRUCTURED_LIGHT_NO_ELLIPSE',
]);

export interface HeldOutput { ellipse: ImageEllipse | null; blocked: string | null; held: boolean }

export class OutputHold {
  private last: { ellipse: ImageEllipse; atMs: number } | null = null;

  constructor(private readonly holdMs = STRUCTURED_LIGHT_HOLD_MS) {}

  resolve(nowMs: number, blocked: string | null, ellipse: ImageEllipse | null): HeldOutput {
    if (!blocked && ellipse) {
      this.last = { ellipse, atMs: nowMs };
      return { ellipse, blocked: null, held: false };
    }
    if (blocked && HOLDABLE_REASONS.has(blocked) && this.last && nowMs - this.last.atMs <= this.holdMs) {
      return { ellipse: this.last.ellipse, blocked: null, held: true };
    }
    if (blocked && !HOLDABLE_REASONS.has(blocked)) this.last = null;
    return { ellipse: null, blocked, held: false };
  }

  clear(): void { this.last = null; }
}

/**
 * Which sides of the projector picture the ball outline runs past, as a
 * plain-language note, or null when the whole ball is inside. Allows a 1%
 * margin so an outline touching the edge is not reported.
 */
export function ellipseEdgeNote(ellipse: ImageEllipse, width: number, height: number): string | null {
  const a = ellipse.majorPx / 2, b = ellipse.minorPx / 2, t = ellipse.angleDeg * Math.PI / 180;
  const halfW = Math.hypot(a * Math.cos(t), b * Math.sin(t));
  const halfH = Math.hypot(a * Math.sin(t), b * Math.cos(t));
  const [cx, cy] = ellipse.centerPx;
  const slackX = width * 0.01, slackY = height * 0.01;
  const sides: string[] = [];
  if (cy - halfH < -slackY) sides.push('top');
  if (cy + halfH > height + slackY) sides.push('bottom');
  if (cx - halfW < -slackX) sides.push('left');
  if (cx + halfW > width + slackX) sides.push('right');
  if (!sides.length) return null;
  const outside = Math.max(-(cy - halfH), cy + halfH - height, -(cx - halfW), cx + halfW - width, 0);
  const percent = Math.round(100 * outside / Math.max(2 * halfH, 1));
  return `the ball runs ${percent}% off the ${sides.join(' and ')} of the projector's picture: move the projector back, or aim it there`;
}
