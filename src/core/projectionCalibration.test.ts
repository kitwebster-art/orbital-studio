import { describe, expect, it } from "vitest";
import { createDefaultProjectionRig } from "./projectionRig";
import {
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  applyProjectionCalibrationToRig,
  runSimulatedAutomaticCalibration,
  warpCornersToCss,
} from "./projectionCalibration";

describe("projection calibration", () => {
  it("builds five deterministic post-warp outputs and all setup stages", () => {
    const result = runSimulatedAutomaticCalibration(
      createDefaultProjectionRig(),
      DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
      new Date("2026-08-07T00:00:00.000Z"),
    );
    expect(result.mode).toBe("simulated");
    expect(result.projectors).toHaveLength(5);
    expect(result.stages.every((stage) => stage.complete)).toBe(true);
    expect(result.projectors.flatMap((projector) => projector.warpCorners).every(
      (point) => point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1,
    )).toBe(true);
  });

  it("applies solved blend and optical settings without claiming measurement", () => {
    const rig = createDefaultProjectionRig();
    const settings = { overlap: 0.18, featherGamma: 2.6, blackLevel: 0.035 };
    const result = runSimulatedAutomaticCalibration(rig, settings);
    const calibrated = applyProjectionCalibrationToRig(rig, result, settings);
    expect(calibrated.calibration.state).toBe("simulated");
    expect(calibrated.calibration.pattern).toBe("seam");
    expect(calibrated.projectors[0].gamma).toBe(2.6);
    expect(calibrated.projectors[0].blackLevel).toBe(0.035);
    expect(calibrated.projectors[0].blend.right).toBeGreaterThan(0.1);
  });

  it("formats the four-point warp for a preview clip path", () => {
    const result = runSimulatedAutomaticCalibration(createDefaultProjectionRig());
    expect(warpCornersToCss(result.projectors[0].warpCorners).split(", ")).toHaveLength(4);
  });
});
