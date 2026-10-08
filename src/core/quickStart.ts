import { parseTestRigSetup, type TestRigSetup } from './testRig';
import { parseTestProfile, type TestProfile } from './testSession';
/**
 * Quick start for the physical test bench: the settings and checks behind the
 * two buttons (Scan, Go live). Pure, so the decisions can be tested
 * without a camera, a projector or a browser.
 */

/** Camera settings the quick flow switches between. Values proven on the 27 September home rig. */
export const QUICK_CAMERA = Object.freeze({
  /** Tracking with the 850 nm light on: 10 ms is the longest exposure that keeps 91 fps. */
  tracking: { exposureUs: 10000, fps: 91 },
  /**
   * Scan with the infrared light off. The exposure is a starting point only:
   * the scan measures the projector on the ball and shortens it until the ball
   * is not clipped (a translucent balloon under a projector saturated at 16.6 ms
   * on 27 September, which made the stripes unreadable).
   */
  scan: { exposureUs: 4000, fps: 50, minExposureUs: 500, maxExposureUs: 16600 },
});

export interface ExposureDecision { done: boolean; nextUs: number; reason: string }

/**
 * One step of the scan's auto-exposure under a full-white projector frame.
 * Aim: at most 3% of the picture clipped. If halving the exposure barely
 * reduces the clipped area, what is left is a mirror-like reflection (the
 * projector lens seen in a shiny table), not the ball, so stop there.
 */
export function nextScanExposure(currentUs: number, levels: PreviewLevels, previousClipped: number | null): ExposureDecision {
  const { minExposureUs } = QUICK_CAMERA.scan;
  const clipped = levels.clippedFraction;
  if (clipped <= 0.03) return { done: true, nextUs: currentUs, reason: 'ball bright and not clipped' };
  if (currentUs <= minExposureUs) return { done: true, nextUs: currentUs, reason: 'shortest exposure reached' };
  if (previousClipped !== null && clipped > previousClipped * 0.8) {
    return { done: true, nextUs: currentUs, reason: 'what is still clipped is a reflection, not the ball' };
  }
  return { done: false, nextUs: Math.max(minExposureUs, Math.round(currentUs / 2)), reason: 'ball clipped, halving the exposure' };
}

export const BALL_SIZE_OPTIONS: ReadonlyArray<{ label: string; diameterM: number | null }> = Object.freeze([
  { label: '50 cm ball', diameterM: 0.5 },
  { label: '1 m ball', diameterM: 1 },
  { label: '2 m balloon', diameterM: 2 },
  { label: '3 m ball', diameterM: 3 },
  { label: 'Not sure', diameterM: null },
]);

export interface PreviewLevels { max: number; clippedFraction: number }

/**
 * With the projector blacked out, is the infrared light off? The 850 nm light
 * makes the ball the brightest thing the camera sees (about 240 of 255 at the
 * tracking exposure); with it off, a dark room reads well under 90.
 */
export function infraredLooksOff(levels: PreviewLevels, maskFraction?: number): boolean {
  // Room lamps in view keep the brightest pixel high, so also accept "no ball-sized bright area".
  // An unknown mask falls back to brightness alone.
  return levels.max < 90 || (maskFraction !== undefined && maskFraction < 0.01);
}

/** Is the infrared light on and lighting the ball: bright, and a ball-sized area detected. */
export function infraredLooksOn(levels: PreviewLevels, maskFraction: number): boolean {
  return levels.max >= 150 && maskFraction >= 0.01;
}

/** True when the camera already has the wanted settings, so the flow can skip a stop and restart. */
export function cameraSettingsMatch(settings: Record<string, unknown> | undefined, wanted: { exposureUs: number; fps: number }): boolean {
  if (!settings) return false;
  const exposure = Number(settings.exposure_us);
  const fps = Number(settings.fps);
  return Math.abs(exposure - wanted.exposureUs) < 1 && Math.abs(fps - wanted.fps) < 0.5;
}

/** A venue preparation preset, never a measured layout or a hardware command. */
export function prepare4ATonightProfile(current: TestProfile): { profile: TestProfile; proposedRig: TestRigSetup; layoutNeedsReview: boolean } {
  const previous = parseTestProfile(current);
  const proposedRig = { ...structuredClone(previous.rig), ballDiameterM: 2 };
  let layoutNeedsReview = false;
  try { parseTestRigSetup(proposedRig); } catch { layoutNeedsReview = true; }
  const context = '4A Fitzroy, 7 October 2026. Approximately 2 m balloon: measure the inflated diameter. Camera position changed; larger fan. Recheck the full camera view and projector alignment, then run a fresh stationary scan. Existing lens positions and hardware settings are retained as unverified starting values. Fan speed is physical equipment control, not controlled by this app.';
  const notes = previous.notes.includes('4A Fitzroy, 7 October 2026.') ? previous.notes : [previous.notes, context].filter(Boolean).join('\n\n');
  const profile = parseTestProfile({ ...previous, name: '4A Fitzroy / tonight / 2 m balloon', notes, rig: layoutNeedsReview ? previous.rig : proposedRig });
  return { profile, proposedRig, layoutNeedsReview };
}
