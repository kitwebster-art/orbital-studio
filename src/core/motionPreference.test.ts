import { describe, expect, it } from "vitest";
import { prefersReducedMotion, sampleMotion } from "./motionPreference";

describe("motion preference", () => {
  it("reads a reduced-motion media query safely", () => {
    expect(prefersReducedMotion({ matches: true })).toBe(true);
    expect(prefersReducedMotion({ matches: false })).toBe(false);
    expect(prefersReducedMotion(null)).toBe(false);
  });

  it("freezes decorative time while preserving the normal sample", () => {
    expect(sampleMotion(12.5, 0.016, true)).toEqual({ timeS: 0, deltaS: 0 });
    expect(sampleMotion(12.5, 0.016, false)).toEqual({
      timeS: 12.5,
      deltaS: 0.016,
    });
  });

  it("sanitises invalid normal samples", () => {
    expect(sampleMotion(Number.NaN, -1, false)).toEqual({ timeS: 0, deltaS: 0 });
  });
});
