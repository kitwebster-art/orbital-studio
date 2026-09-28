import { describe, expect, it } from 'vitest';
import { BALL_SIZE_OPTIONS, QUICK_CAMERA, cameraSettingsMatch, infraredLooksOff, infraredLooksOn, nextScanExposure } from './quickStart';

describe('quick start decisions', () => {
  it('keeps tracking at 91 fps and every scan exposure within the scan frame period', () => {
    expect(QUICK_CAMERA.tracking.exposureUs).toBeLessThan(1e6 / QUICK_CAMERA.tracking.fps);
    expect(QUICK_CAMERA.scan.maxExposureUs).toBeLessThan(1e6 / QUICK_CAMERA.scan.fps);
    expect(QUICK_CAMERA.scan.exposureUs).toBeLessThanOrEqual(QUICK_CAMERA.scan.maxExposureUs);
  });

  it('shortens the scan exposure until the ball is no longer clipped', () => {
    // 27 September: 17% of the picture clipped under full white at 16.6 ms.
    const first = nextScanExposure(4000, { max: 255, clippedFraction: 0.17 }, null);
    expect(first).toMatchObject({ done: false, nextUs: 2000 });
    expect(nextScanExposure(2000, { max: 255, clippedFraction: 0.02 }, 0.17).done).toBe(true);
    // Halving barely helped: the rest is the table's mirror reflection of the lens.
    expect(nextScanExposure(1000, { max: 255, clippedFraction: 0.025 * 1.4 }, 0.04)).toMatchObject({ done: true });
    expect(nextScanExposure(500, { max: 255, clippedFraction: 0.2 }, 0.4)).toMatchObject({ done: true, reason: 'shortest exposure reached' });
  });

  it('tells infrared on from off using the 27 September home rig levels', () => {
    // Infrared on at 10 ms: ball body about 240, detected area about 16% of the picture.
    expect(infraredLooksOn({ max: 242, clippedFraction: 0.004 }, 0.157)).toBe(true);
    expect(infraredLooksOff({ max: 242, clippedFraction: 0.004 })).toBe(false);
    // Infrared off, projector black, room dark.
    expect(infraredLooksOff({ max: 41, clippedFraction: 0 })).toBe(true);
    // Infrared off but room lamps in view keep the brightest pixel at 255: no bright ball detected.
    expect(infraredLooksOff({ max: 255, clippedFraction: 0.001 }, 0.002)).toBe(true);
    expect(infraredLooksOff({ max: 255, clippedFraction: 0.004 }, 0.157)).toBe(false);
    expect(infraredLooksOn({ max: 41, clippedFraction: 0 }, 0)).toBe(false);
    // A bright speck with no ball detected is not the light being on.
    expect(infraredLooksOn({ max: 255, clippedFraction: 0.0001 }, 0.001)).toBe(false);
  });

  it('knows when the camera already has the wanted settings', () => {
    expect(cameraSettingsMatch({ exposure_us: 10000, fps: 91 }, QUICK_CAMERA.tracking)).toBe(true);
    expect(cameraSettingsMatch({ exposure_us: 7000, fps: 91 }, QUICK_CAMERA.tracking)).toBe(false);
    expect(cameraSettingsMatch(undefined, QUICK_CAMERA.tracking)).toBe(false);
  });

  it('offers the usual ball sizes and an honest not-sure option', () => {
    expect(BALL_SIZE_OPTIONS.map(o => o.diameterM)).toEqual([0.5, 1, 3, null]);
  });
});
