import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHADER_LOOK_CONTROLS,
  SHADER_LOOK_CONTROL_DEFINITIONS,
  advanceShaderAnimationTime,
  normaliseShaderLookControls,
  projectionStartingLook,
} from "./shaderLookControls";

describe("shader finishing controls", () => {
  it("defines thirteen renderer-level controls with unique ids", () => {
    expect(SHADER_LOOK_CONTROL_DEFINITIONS).toHaveLength(13);
    expect(new Set(SHADER_LOOK_CONTROL_DEFINITIONS.map((control) => control.id)).size).toBe(13);
    expect(Object.keys(DEFAULT_SHADER_LOOK_CONTROLS)).toHaveLength(13);
  });

  it("clamps unsafe values and restores non-finite values", () => {
    expect(normaliseShaderLookControls({ motion: 99, scale: -4, hue: Number.NaN })).toMatchObject({
      motion: 4,
      scale: 0.35,
      hue: 0,
    });
  });

  it("migrates older presets and bounds projection finishing", () => {
    expect(normaliseShaderLookControls({contrast:1.4})).toMatchObject({exposure:0,brightness:1,shellGrid:0.25,contrast:1.4});
    expect(normaliseShaderLookControls({exposure:99,brightness:-1,shellGrid:3,shellGridWidth:NaN})).toMatchObject({exposure:3,brightness:0,shellGrid:1,shellGridWidth:0.008});
  });
  it("starts selected presets at full native colour with neutral exposure and retains shape and shell settings", () => {
    expect(projectionStartingLook({ exposure:-3,brightness:0,saturation:0,level:0,contrast:0.4,shellGrid:0.7,motion:2 })).toMatchObject({exposure:0,brightness:1,saturation:1,level:1,contrast:1,shellGrid:0.7,motion:2});
    expect(projectionStartingLook({ exposure:3,brightness:2,saturation:3,hue:0.2,scale:1.3,shellGridDensity:22 })).toMatchObject({exposure:0,brightness:1,saturation:1,hue:0.2,scale:1.3,shellGridDensity:22});
    expect(projectionStartingLook()).toMatchObject({exposure:0,brightness:1,saturation:1});
  });
  it("advances, accelerates and freezes an independent animation clock", () => {
    expect(advanceShaderAnimationTime(4, 0.25, 1)).toBe(4.25);
    expect(advanceShaderAnimationTime(4, 0.25, 2.5)).toBe(4.625);
    expect(advanceShaderAnimationTime(4, 0.25, 0)).toBe(4);
    expect(advanceShaderAnimationTime(4, 0.25, 99)).toBe(5);
  });
});
