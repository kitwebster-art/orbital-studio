import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHADER_LOOK_CONTROLS,
  SHADER_LOOK_CONTROL_DEFINITIONS,
  advanceShaderAnimationTime,
  normaliseShaderLookControls,
} from "./shaderLookControls";

describe("shader finishing controls", () => {
  it("defines eight renderer-level controls with unique ids", () => {
    expect(SHADER_LOOK_CONTROL_DEFINITIONS).toHaveLength(8);
    expect(new Set(SHADER_LOOK_CONTROL_DEFINITIONS.map((control) => control.id)).size).toBe(8);
    expect(Object.keys(DEFAULT_SHADER_LOOK_CONTROLS)).toHaveLength(8);
  });

  it("clamps unsafe values and restores non-finite values", () => {
    expect(normaliseShaderLookControls({ motion: 99, scale: -4, hue: Number.NaN })).toMatchObject({
      motion: 2.5,
      scale: 0.35,
      hue: 0,
    });
  });

  it("advances, accelerates and freezes an independent animation clock", () => {
    expect(advanceShaderAnimationTime(4, 0.25, 1)).toBe(4.25);
    expect(advanceShaderAnimationTime(4, 0.25, 2.5)).toBe(4.625);
    expect(advanceShaderAnimationTime(4, 0.25, 0)).toBe(4);
    expect(advanceShaderAnimationTime(4, 0.25, 99)).toBe(4.625);
  });
});
