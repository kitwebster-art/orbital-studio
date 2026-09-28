import { describe, expect, it } from "vitest";
import { createDefaultProjectionRig } from "./projectionRig";
import {
  CAMERA_LENS_PRESETS,
  DEFAULT_INSTALLATION_RIG_CONTROLS,
  createInstallationHeadPlans,
  installationRigSummary,
  normaliseInstallationRigControls,
} from "./installationRig";

describe("installation rig planner", () => {
  it("supports the one-head prototype and five-projector production rehearsal", () => {
    const rig = createDefaultProjectionRig();
    expect(installationRigSummary(rig, { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "prototype-1" }))
      .toMatchObject({ activeProjectors: 1, activeCameras: 1, activeNir: 1, cameraCoLocated: false });
    expect(installationRigSummary(rig, { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "production-5" }))
      .toMatchObject({ activeProjectors: 5, activeCameras: 3, activeNir: 3 });
  });

  it("can isolate any one projector with one colocated-station camera and NIR light", () => {
    const plans = createInstallationHeadPlans(createDefaultProjectionRig(), {
      ...DEFAULT_INSTALLATION_RIG_CONTROLS,
      prototypeProjectorIndex: 4,
    });
    expect(plans.filter((plan) => plan.active).map((plan) => plan.projectorIndex)).toEqual([4]);
    expect(plans[4]).toMatchObject({ cameraActive: true, nirActive: true });
  });

  it("derives portrait image size and deliberately offsets tracking cameras", () => {
    const plans = createInstallationHeadPlans(createDefaultProjectionRig(), { ...DEFAULT_INSTALLATION_RIG_CONTROLS });
    expect(plans[0]!.projectedHeightM).toBeGreaterThan(plans[0]!.projectedWidthM);
    expect(plans[0]!.projectorDistanceM).toBeGreaterThan(5);
    expect(plans[0]!.cameraPositionM).not.toEqual(createDefaultProjectionRig().projectors[0].positionM);
  });

  it("bounds planning controls and computes finite lens fields of view", () => {
    expect(normaliseInstallationRigControls({ prototypeProjectorIndex: 99, hazeDensity: 9, cameraSeparationM: -2, cameraLensId: "bad" }))
      .toMatchObject({ prototypeProjectorIndex: 4, hazeDensity: 1, cameraSeparationM: 0, cameraLensId: "generic-6mm" });
    expect(CAMERA_LENS_PRESETS.every((lens) => Number.isFinite(lens.horizontalFovDeg) && lens.horizontalFovDeg > 0)).toBe(true);
  });
});
