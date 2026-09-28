import { describe, expect, it } from "vitest";
import { createDefaultProjectionRig } from "./projectionRig";
import {
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  applyProjectionCalibrationToRig,
  runSimulatedAutomaticCalibration,
  warpCornersToCss,
  parseProjectionCalibrationResult,
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
    expect(calibrated.projectors[0].targetM.y).toBeCloseTo(rig.projectors[0].targetM.y, 1);
    expect(calibrated.projectors[0].fovDeg).toBeGreaterThan(rig.projectors[0].fovDeg + 1);
  });

  it("formats the four-point warp for a preview clip path", () => {
    const result = runSimulatedAutomaticCalibration(createDefaultProjectionRig());
    expect(warpCornersToCss(result.projectors[0].warpCorners).split(", ")).toHaveLength(4);
  });
});

it("maps imported projector solves by identity and rejects duplicate or folded solves", () => {
  const rig = createDefaultProjectionRig();
  const result = runSimulatedAutomaticCalibration(rig);
  const expected = { ...result.projectors[0].cameraSolve.positionM };
  result.projectors.reverse();
  const applied = applyProjectionCalibrationToRig(rig, result, DEFAULT_PROJECTION_CALIBRATION_SETTINGS);
  expect(applied.projectors[0].positionM).toEqual(expected);
  const duplicate = structuredClone(result); duplicate.projectors[0].projectorId = duplicate.projectors[1].projectorId;
  expect(() => parseProjectionCalibrationResult(duplicate)).toThrow("unique");
  const folded = structuredClone(result); folded.projectors[0].warpCorners[1] = folded.projectors[0].warpCorners[3];
  expect(() => parseProjectionCalibrationResult(folded)).toThrow("convex");
});

it("imports one measured head without changing or claiming calibration for four placeholders", () => {
 const rig=createDefaultProjectionRig(),result=runSimulatedAutomaticCalibration(rig);
 result.mode="measured";result.projectors=[result.projectors[0]];
 const applied=applyProjectionCalibrationToRig(rig,result,DEFAULT_PROJECTION_CALIBRATION_SETTINGS);
 expect(applied.calibration.calibratedProjectorIds).toEqual(["projector-1"]);
 expect(applied.calibration.projectorErrorsPx?.["projector-1"]).toBe(result.projectors[0].maxErrorPx);
 expect(applied.projectors[1]).toEqual(rig.projectors[1]);
});
