import { describe, expect, it } from "vitest";

import {
  ORBITAL_SURFACE_FRAGMENT_SHADER,
  ORBITAL_SURFACE_VERTEX_SHADER,
} from "./orbitalSurface";

describe("Orbital seamless surface shader", () => {
  it("uses continuous 3D surface coordinates instead of equirectangular UVs", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("vSurfaceDirection");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("seamlessGrid");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("cellular3");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toMatch(/\b(?:atan|asin)\s*\(/u);
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toMatch(/\b(?:longitude|latitude)\b/u);
  });

  it("contains the authored, coverage, grid, seam-stress and black branches", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 0.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 1.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 2.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 3.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("stressGrid");
  });

  it("routes the full algorithm range through one region-capable evaluator", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("evaluateShader(");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("mode < 42.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("regionStyle");
  });

  it("applies the shared appearance controls inside the GPU shader", () => {
    [
      "uLookScale",
      "uLookRotation",
      "uLookHue",
      "uLookSaturation",
      "uLookContrast",
      "uLookSoftness",
      "uLookLevel",
    ].forEach((uniform) => expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain(uniform));
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("finishShaderColour");
  });

  it("routes every animated surface path through the independent shader clock", () => {
    expect(ORBITAL_SURFACE_VERTEX_SHADER).toContain("shaderTime = uTime");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("authoredTime = uTime");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).not.toContain("uLookMotion");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("uLookMotion");
    expect(ORBITAL_SURFACE_VERTEX_SHADER.match(/\buTime\b/gu)).toHaveLength(2);
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER.match(/\buTime\b/gu)).toHaveLength(2);
  });

  it("uses broad latex bulges instead of high-frequency surface vibration", () => {
    expect(ORBITAL_SURFACE_VERTEX_SHADER).toContain("broadBulge");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).toContain("secondaryBulge");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).not.toContain("direction.y * 8.0");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).not.toContain("direction.x + direction.z) * 13.0");
  });

  it("supports real pre and post mapping projector raster renders", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uOutputPreviewMode");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uOutputPreviewProjector");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("selectedOutputWeight");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("selectedOutputBlack");
  });

  it("keeps projector rasters vivid when the legacy score is in a dim state", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("max(uBrightness, 0.82)");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("max(uEnergy, 0.70)");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("max(uPreviewExposure, 0.78)");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("luminance * 1.8");
  });
});
