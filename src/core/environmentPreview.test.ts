import { describe, expect, it } from "vitest";

import {
  fanSpeedToClearanceM,
  fanSpeedToHoverOffsetM,
  normaliseEnvironmentPreviewControls,
} from "./environmentPreview";

describe("environment preview", () => {
  it("raises the synthetic balloon monotonically with fan speed", () => {
    expect(fanSpeedToHoverOffsetM(0)).toBeCloseTo(0.65);
    expect(fanSpeedToHoverOffsetM(0.5)).toBeGreaterThan(
      fanSpeedToHoverOffsetM(0),
    );
    expect(fanSpeedToHoverOffsetM(1)).toBeCloseTo(2.55);
    expect(fanSpeedToClearanceM(0.62)).toBeCloseTo(1.788);
  });

  it("clamps lighting while preserving environment switches", () => {
    expect(
      normaliseEnvironmentPreviewControls({
        warehouseEnabled: false,
        peopleEnabled: true,
        lighting: 3,
      }),
    ).toEqual({
      warehouseEnabled: false,
      peopleEnabled: true,
      lighting: 1,
    });
  });
});
