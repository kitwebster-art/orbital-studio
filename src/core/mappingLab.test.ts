import { describe, expect, it } from "vitest";

import { CURATED_SHADER_REGISTRY } from "./shaderRegistry";

import {
  MAPPING_VIEW_MODES,
  SHADER_RENDER_MODE_IDS,
  SURFACE_REGION_DEFINITIONS,
  createDefaultSurfaceRegionAssignments,
  mappingViewLabel,
  shaderFamilyIndex,
  shaderRenderModeIndex,
  validateSurfaceRegionAssignments,
} from "./mappingLab";

describe("mapping lab contract", () => {
  it("defines focused sphere, UV and projector views", () => {
    expect(MAPPING_VIEW_MODES).toHaveLength(7);
    expect(mappingViewLabel("uv")).toBe("UV coverage proxy");
    expect(mappingViewLabel("projector-5")).toBe("Projector 5 post-warp output");
  });

  it("covers four independently assignable surface regions", () => {
    const assignments = createDefaultSurfaceRegionAssignments();
    expect(SURFACE_REGION_DEFINITIONS).toHaveLength(4);
    expect(assignments).toHaveLength(4);
    expect(validateSurfaceRegionAssignments(assignments)).toEqual(assignments);
    expect(shaderFamilyIndex("geometric")).toBeGreaterThan(0);
  });

  it("gives every procedural algorithm a stable renderer slot", () => {
    expect(new Set(SHADER_RENDER_MODE_IDS).size).toBe(SHADER_RENDER_MODE_IDS.length);
    expect(SHADER_RENDER_MODE_IDS).toEqual(
      CURATED_SHADER_REGISTRY.shaders.map((shader) => shader.id),
    );
    SHADER_RENDER_MODE_IDS.forEach((shaderId, index) => {
      expect(shaderRenderModeIndex(shaderId)).toBe(index);
    });
    expect(shaderRenderModeIndex("unknown-shader")).toBe(0);
  });

  it("rejects duplicate or incomplete region assignments", () => {
    const assignments = [...createDefaultSurfaceRegionAssignments()];
    assignments[1] = { ...assignments[0] };
    expect(() => validateSurfaceRegionAssignments(assignments)).toThrow(
      "duplicate region",
    );
    expect(() => validateSurfaceRegionAssignments(assignments.slice(0, 3))).toThrow(
      "must contain 4 assignments",
    );
  });
});
