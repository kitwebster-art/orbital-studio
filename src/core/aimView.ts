/**
 * Camera aim view for the Test bench: a small, brightened picture the bridge
 * sends about three times a second while the operator aims and focuses the
 * camera. Setup only. The tracking path never sends images to the browser.
 */

export interface CameraPreview {
  format: 'png';
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  sequence: number;
  framePngBase64: string;
  maskPngBase64: string | null;
  /** Fraction of the picture the detector currently marks as the ball, 0..1. */
  maskFraction: number;
  /** The display stretch applied: sensor values lo..hi were mapped to 0..255. */
  stretch: [number, number];
  /** True sensor levels (0..255) before brightening, for exposure decisions. */
  levels: { min: number; max: number; mean: number; clippedFraction: number };
  threshold: number | null;
  /** Rendered stand-in from the simulated bridge, not a camera picture. */
  simulated: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`preview.${name} must be a finite number`);
  return v;
};

/** Validate the bridge's preview payload. Fails closed on anything malformed. */
export function parseCameraPreview(value: unknown): CameraPreview {
  if (!isRecord(value)) throw new Error('preview must be an object');
  if (value.format !== 'png') throw new Error('preview.format must be png');
  if (typeof value.frame_png_base64 !== 'string' || !value.frame_png_base64) throw new Error('preview.frame_png_base64 is required');
  const levels = isRecord(value.levels) ? value.levels : {};
  const stretch = Array.isArray(value.stretch) && value.stretch.length === 2 ? value.stretch : [0, 255];
  return {
    format: 'png',
    width: finite(value.width, 'width'),
    height: finite(value.height, 'height'),
    frameWidth: finite(value.frame_width ?? value.width, 'frame_width'),
    frameHeight: finite(value.frame_height ?? value.height, 'frame_height'),
    sequence: finite(value.sequence ?? 0, 'sequence'),
    framePngBase64: value.frame_png_base64,
    maskPngBase64: typeof value.mask_png_base64 === 'string' && value.mask_png_base64 ? value.mask_png_base64 : null,
    maskFraction: finite(value.mask_fraction ?? 0, 'mask_fraction'),
    stretch: [finite(stretch[0], 'stretch'), finite(stretch[1], 'stretch')],
    levels: {
      min: finite(levels.min ?? 0, 'levels.min'),
      max: finite(levels.max ?? 0, 'levels.max'),
      mean: finite(levels.mean ?? 0, 'levels.mean'),
      clippedFraction: finite(levels.clipped_fraction ?? 0, 'levels.clipped_fraction'),
    },
    threshold: typeof value.threshold === 'number' && Number.isFinite(value.threshold) ? value.threshold : null,
    simulated: value.simulated === true,
  };
}

export type AimTone = 'good' | 'warn' | 'bad';
export interface AimAdvice {
  /** The worse of the two tones. */
  tone: AimTone;
  exposure: string;
  exposureTone: AimTone;
  ball: string;
  ballTone: AimTone;
}

/**
 * Plain-language advice from the true sensor levels and the detector mask.
 * The picture on screen is brightened, so exposure advice must come from these
 * numbers, not from how bright the preview looks.
 */
export function aimAdvice(preview: Pick<CameraPreview, 'levels' | 'maskFraction'> & { threshold?: number | null }): AimAdvice {
  const { max, clippedFraction } = preview.levels;
  // The detector ignores anything below its threshold (the balloon profile floors it at 120).
  const threshold = typeof preview.threshold === 'number' && Number.isFinite(preview.threshold) ? preview.threshold : 120;
  let exposure: string;
  let exposureTone: AimTone;
  if (clippedFraction > 0.1) {
    exposure = `Too bright: ${(clippedFraction * 100).toFixed(1)}% of the picture is clipped. Lower the exposure or the light.`;
    exposureTone = 'bad';
  } else if (clippedFraction > 0.02) {
    exposure = `Exposure good for tracking: ${(clippedFraction * 100).toFixed(1)}% of the picture is clipped, a bright highlight that does not affect the ball's outline.`;
    exposureTone = 'good';
  } else if (max < threshold) {
    exposure = `Too dark for the tracker: brightest pixel ${Math.round(max)} of 255, and it needs at least ${Math.round(threshold)}. Light the ball with the projector grid, or raise the exposure.`;
    exposureTone = 'bad';
  } else if (max < threshold + 60) {
    exposure = `A little dark: brightest pixel ${Math.round(max)} of 255, close to the tracker's threshold of ${Math.round(threshold)}. More light or exposure will steady the tracking.`;
    exposureTone = 'warn';
  } else {
    exposure = `Exposure good: brightest pixel ${Math.round(max)} of 255.`;
    exposureTone = 'good';
  }
  const f = preview.maskFraction;
  let ball: string;
  let ballTone: AimTone;
  if (f <= 0.002) {
    ball = 'No ball detected. Point the camera at the lit ball.';
    ballTone = 'bad';
  } else if (f < 0.04) {
    ball = `Ball detected but small (${(f * 100).toFixed(1)}% of the picture). Move the camera closer or zoom in.`;
    ballTone = 'warn';
  } else if (f > 0.55) {
    ball = `Ball fills ${(f * 100).toFixed(0)}% of the picture. Move the camera back so the ball has room to move.`;
    ballTone = 'warn';
  } else {
    ball = `Ball detected (${(f * 100).toFixed(0)}% of the picture). Keep it near the centre cross.`;
    ballTone = 'good';
  }
  const rank: Record<AimTone, number> = { good: 0, warn: 1, bad: 2 };
  return { tone: rank[exposureTone] >= rank[ballTone] ? exposureTone : ballTone, exposure, exposureTone, ball, ballTone };
}
