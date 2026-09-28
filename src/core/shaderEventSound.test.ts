import { describe, expect, it } from "vitest";
import {
  normaliseShaderEventSoundControls,
  shaderEventBucket,
} from "./shaderEventSound";

describe("shader event sound controls", () => {
  it("bounds event controls and rejects unknown palettes", () => {
    expect(normaliseShaderEventSoundControls({ palette: "bad" as never, density: 8, reverb: -2 }))
      .toMatchObject({ palette: "mixed", density: 1, reverb: 0 });
  });

  it("quantises event cadence to BPM and rhythmic density", () => {
    expect(shaderEventBucket(2, 1, 120)).toBe(16);
    expect(shaderEventBucket(2, 0, 120)).toBe(1);
    expect(shaderEventBucket(Number.NaN, 1, 1)).toBe(0);
  });
});
