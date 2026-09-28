/**
 * Self-centring for the structured-light ball projection.
 *
 * The camera sees the projector's light on the ball (no infrared filter), so
 * the camera preview shows where the picture actually lands. On 27 September a
 * thin unlit crescent sat on one side of the egg in every frame, whichever way
 * it moved: a small constant offset, not lag. This measures the lit part of the
 * ball against the ball's outline and slowly nudges the picture until the two
 * share a centre. Pure functions and a small controller, so it is testable
 * without a camera.
 */

export interface CentreMeasurement {
  /** Ball centre minus lit-area centre, in preview pixels: the way the picture should move. */
  errorPx: [number, number];
  /** The ball's centre in the preview picture. */
  centerPx: [number, number];
  /** Share of the ball's core that the projector lights, 0..1. */
  litFraction: number;
  ballRadiusPx: number;
  /**
   * How far out the light reaches, as a fraction of the ball's radius: the radius at
   * which under half of each ring is lit. 1 means lit to the rim. On 27 September it
   * read 0.71: the picture was far too small.
   */
  litEdge: number;
}

/**
 * Compare the lit part of the ball with the ball itself in one preview frame.
 * `gray` and `mask` are row-major, `width` x `height`; the mask marks the ball.
 * Returns null when the frame cannot say anything useful.
 */
export function measureProjectionOffset(gray: ArrayLike<number>, mask: ArrayLike<number>, width: number, height: number): CentreMeasurement | null {
  let count = 0, sx = 0, sy = 0, x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (mask[y * width + x] < 128) continue;
    count++; sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (count < 200) return null;
  const bx = sx / count, by = sy / count, radius = Math.sqrt(count / Math.PI);
  // Blur over a pattern feature, averaging only ball pixels (so the dark background never
  // leaks in at the rim). Grid lines, rings and maze patterns then read as "lit"; only
  // areas the projector truly misses stay at the ball's unlit brightness.
  const k = Math.max(2, Math.round(radius * 0.15));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const sumGray = new Float64Array((w + 1) * (h + 1)), sumMask = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowGray = 0, rowMask = 0;
    for (let x = 0; x < w; x++) {
      const i = (y + y0) * width + x + x0, on = mask[i] >= 128 ? 1 : 0;
      rowGray += on * gray[i]; rowMask += on;
      sumGray[(y + 1) * (w + 1) + x + 1] = sumGray[y * (w + 1) + x + 1] + rowGray;
      sumMask[(y + 1) * (w + 1) + x + 1] = sumMask[y * (w + 1) + x + 1] + rowMask;
    }
  }
  const blurred = (x: number, y: number) => {
    const ax = Math.max(0, x - k), ay = Math.max(0, y - k), cx = Math.min(w - 1, x + k), cy = Math.min(h - 1, y + k);
    const box = (t: Float64Array) => t[(cy + 1) * (w + 1) + cx + 1] - t[ay * (w + 1) + cx + 1] - t[(cy + 1) * (w + 1) + ax] + t[ay * (w + 1) + ax];
    const n = box(sumMask);
    return n > 0 ? box(sumGray) / n : 0;
  };
  // Nearly the whole ball: a thin unlit crescent lives at the rim (the masked blur keeps the dark
  // background out, and the limb dims evenly all round, so the centre stays unbiased).
  const core: number[] = [], xs: number[] = [], ys: number[] = [];
  const limit = (0.97 * radius) ** 2;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (mask[y * width + x] < 128 || (x - bx) ** 2 + (y - by) ** 2 > limit) continue;
    core.push(blurred(x - x0, y - y0)); xs.push(x); ys.push(y);
  }
  if (core.length < 150) return null;
  // Unlit reference: the darkest few percent of the blurred core (the ball's own, infrared-only
  // brightness wherever the picture misses). On 27 September Otsu's split instead cut through a
  // maze pattern's dark lines, read the egg as half lit and missed a real unlit crescent.
  const sorted = [...core].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.9)];
  // Evenly lit (or evenly unlit): nothing to correct from this frame.
  if (hi - lo < 20) return { errorPx: [0, 0], centerPx: [bx, by], litFraction: 1, ballRadiusPx: radius, litEdge: 1 };
  const threshold = lo + 0.3 * (hi - lo);
  let lit = 0, lx = 0, ly = 0;
  for (let i = 0; i < core.length; i++) if (core[i] >= threshold) { lit++; lx += xs[i]; ly += ys[i]; }
  const litFraction = lit / core.length;
  if (litFraction < 0.25) return null;
  // Lit share in rings from half the radius out to the rim (masked blur: no background mixed in).
  const ringCount = 10, ringLit = new Float64Array(ringCount), ringAll = new Float64Array(ringCount);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (mask[y * width + x] < 128) continue;
    const r = Math.hypot(x - bx, y - by) / radius;
    if (r < 0.5 || r >= 1) continue;
    const ring = Math.min(ringCount - 1, Math.floor((r - 0.5) / 0.05));
    ringAll[ring]++;
    if (blurred(x - x0, y - y0) >= threshold) ringLit[ring]++;
  }
  let litEdge = 1;
  let previousShare = 1, previousR = 0.5;
  for (let i = 0; i < ringCount; i++) {
    if (ringAll[i] < 20) continue;
    const share = ringLit[i] / ringAll[i], r = 0.5 + 0.05 * (i + 0.5);
    if (share < 0.5) { litEdge = previousR + (r - previousR) * (previousShare - 0.5) / Math.max(1e-6, previousShare - share); break; }
    previousShare = share; previousR = r;
  }
  return { errorPx: [bx - lx / lit, by - ly / lit], centerPx: [bx, by], litFraction, ballRadiusPx: radius, litEdge };
}

/**
 * Live calibration model: a position correction and a size factor that vary
 * smoothly with where the ball is in the camera picture. Features are measured
 * from the scan's ball (`anchorPx`) in scanned ball diameters (`scalePx`), so the
 * gradients read as "change per ball-width moved".
 */
export interface LiveCalibration {
  anchorPx: [number, number];
  scalePx: number;
  /** Camera-pixel shift at the anchor, and its change per ball-width moved in x and in y. */
  offsetPx: [number, number];
  offsetGradX: [number, number];
  offsetGradY: [number, number];
  /** Natural log of the size factor at the anchor, and its change per ball-width moved in x and y. */
  logSize: number;
  logSizeGrad: [number, number];
}

export function neutralCalibration(anchorPx: [number, number] = [0, 0], scalePx = 200): LiveCalibration {
  return { anchorPx: [...anchorPx], scalePx, offsetPx: [0, 0], offsetGradX: [0, 0], offsetGradY: [0, 0], logSize: 0, logSizeGrad: [0, 0] };
}

/** The correction and size factor the model gives for a ball at `positionPx` (camera pixels). */
export function calibrationAt(model: LiveCalibration, positionPx: readonly [number, number]): { correctionPx: [number, number]; sizeScale: number } {
  const u = (positionPx[0] - model.anchorPx[0]) / model.scalePx, v = (positionPx[1] - model.anchorPx[1]) / model.scalePx;
  // Beyond two ball-widths from anything measured, hold the edge value rather than extrapolating.
  const cu = Math.max(-2, Math.min(2, u)), cv = Math.max(-2, Math.min(2, v));
  const sizeScale = Math.exp(model.logSize + model.logSizeGrad[0] * cu + model.logSizeGrad[1] * cv);
  return {
    correctionPx: [
      model.offsetPx[0] + model.offsetGradX[0] * cu + model.offsetGradY[0] * cv,
      model.offsetPx[1] + model.offsetGradX[1] * cu + model.offsetGradY[1] * cv,
    ],
    // Manual fine-tuning may go wider than self-fit (0.7 to 1.5); self-fit keeps to SIZE_RANGE.
    sizeScale: Math.min(1.5, Math.max(0.7, sizeScale)),
  };
}

/**
 * Learns the live calibration from camera measurements (normalised least-mean-squares).
 * Each measurement says "at this spot the picture is off by this much and reaches this
 * far": the value at the anchor and the slopes all move towards removing it. Slopes
 * learn more slowly and decay gently, so a ball that stays in one place keeps a plain
 * offset, and one that bobs builds up a correction that differs top to bottom.
 */
export class AutoCentre {
  model: LiveCalibration = neutralCalibration();
  /** Correction and size factor at the most recent measurement, for readouts. */
  correctionPx: [number, number] = [0, 0];
  sizeScale = 1;
  /** Where the lit edge should sit, as a fraction of the ball radius seen by the camera. */
  static readonly TARGET_EDGE = 0.93;
  /** The scan measures the size; self-fit only fine-tunes it. */
  static readonly SIZE_RANGE: readonly [number, number] = [0.9, 1.15];
  constructor(
    private readonly timeConstantS = 2.5,
    private readonly maxFractionOfDiameter = 0.25,
  ) {}

  /** Anchor the model on the scan's ball (camera pixels). Keeps the learned values. */
  setAnchor(anchorPx: [number, number], scalePx: number): void {
    if (Number.isFinite(anchorPx[0]) && Number.isFinite(anchorPx[1]) && scalePx > 0) { this.model.anchorPx = [...anchorPx]; this.model.scalePx = scalePx; }
  }

  /**
   * Feed one measurement, in camera pixels: the residual error at `positionPx` (after the
   * current correction), the ball diameter there, and how far out the light reaches.
   */
  update(errorPx: [number, number], ballDiameterPx: number, dtS: number, litEdge?: number, positionPx?: readonly [number, number]): [number, number] {
    const m = this.model;
    const gain = 1 - Math.exp(-Math.max(0, Math.min(dtS, 2)) / this.timeConstantS);
    const slopeGain = gain * 0.5, leak = 1 - gain * 0.02;
    const at = positionPx ?? m.anchorPx;
    const u = Math.max(-2, Math.min(2, (at[0] - m.anchorPx[0]) / m.scalePx)), v = Math.max(-2, Math.min(2, (at[1] - m.anchorPx[1]) / m.scalePx));
    const norm = 1 + u * u + v * v;
    // Centre first, then size: a picture that is off to one side also stops short of the rim on
    // that side, which must not be mistaken for a picture that is too small.
    const centred = Math.hypot(errorPx[0], errorPx[1]) < 0.03 * Math.max(1, ballDiameterPx);
    if (centred && litEdge !== undefined && Number.isFinite(litEdge)) {
      // Grow while the light stops short of the rim, ease back a little once it overfills.
      const e = AutoCentre.TARGET_EDGE - litEdge;
      m.logSize += gain * e / norm;
      m.logSizeGrad = [leak * m.logSizeGrad[0] + slopeGain * e * u / norm, leak * m.logSizeGrad[1] + slopeGain * e * v / norm];
      m.logSize = Math.max(Math.log(AutoCentre.SIZE_RANGE[0]), Math.min(Math.log(AutoCentre.SIZE_RANGE[1]), m.logSize));
      m.logSizeGrad = m.logSizeGrad.map((g) => Math.max(-0.2, Math.min(0.2, g))) as [number, number];
    }
    if (Math.hypot(errorPx[0], errorPx[1]) > 0.5) {
      for (const axis of [0, 1] as const) {
        const e = errorPx[axis];
        m.offsetPx[axis] += gain * e / norm;
        m.offsetGradX[axis] = leak * m.offsetGradX[axis] + slopeGain * e * u / norm;
        m.offsetGradY[axis] = leak * m.offsetGradY[axis] + slopeGain * e * v / norm;
      }
    }
    const limit = this.maxFractionOfDiameter * Math.max(0, ballDiameterPx);
    const length = Math.hypot(m.offsetPx[0], m.offsetPx[1]);
    if (length > limit && length > 0) m.offsetPx = [m.offsetPx[0] * limit / length, m.offsetPx[1] * limit / length];
    const slopeLimit = 0.3 * m.scalePx;
    for (const grad of [m.offsetGradX, m.offsetGradY]) {
      const g = Math.hypot(grad[0], grad[1]);
      if (g > slopeLimit) { grad[0] *= slopeLimit / g; grad[1] *= slopeLimit / g; }
    }
    const now = calibrationAt(m, at);
    this.correctionPx = now.correctionPx;
    this.sizeScale = now.sizeScale;
    return this.correctionPx;
  }

  /**
   * Manual fine-tune: move the picture by a fraction of the scanned ball width (camera x and y;
   * +x right, +y down) and scale its size by a factor. Written into the model, so it is kept.
   */
  nudge(dxFraction: number, dyFraction: number, sizeFactor = 1): void {
    const m = this.model;
    m.offsetPx = [m.offsetPx[0] + dxFraction * m.scalePx, m.offsetPx[1] + dyFraction * m.scalePx];
    if (sizeFactor > 0) m.logSize = Math.max(Math.log(0.7), Math.min(Math.log(1.5), m.logSize + Math.log(sizeFactor)));
    const now = calibrationAt(m, m.anchorPx);
    this.correctionPx = now.correctionPx; this.sizeScale = now.sizeScale;
  }

  /** Start over (or from a stored model), keeping the current anchor unless one is given. */
  reset(model?: LiveCalibration): void {
    const anchor = this.model.anchorPx, scale = this.model.scalePx;
    this.model = model ? structuredClone(model) : neutralCalibration(anchor, scale);
    const now = calibrationAt(this.model, this.model.anchorPx);
    this.correctionPx = now.correctionPx; this.sizeScale = now.sizeScale;
  }
}
