import { describe, expect, it } from "vitest";
import { createDefaultSurfaceRegionAssignments } from "./mappingLab";
import { createDefaultProjectionRig } from "./projectionRig";
import { createShaderPreset } from "./shaderRegistry";
import { DEFAULT_SHADER_LOOK_CONTROLS } from "./shaderLookControls";
import { DEFAULT_LIVING_SKIN_CONTROLS } from "./livingSkin";
import { DEFAULT_INSTALLATION_RIG_CONTROLS } from "./installationRig";
import { DEFAULT_SHADER_EVENT_SOUND_CONTROLS } from "./shaderEventSound";
import {
  createRenderProject,
  createShaderManifest,
  parseRenderProject,
  serialiseRenderProject,
} from "./renderProject";

describe("native render project handoff", () => {
  it("exports a stable complete shader manifest", () => {
    const first = createShaderManifest();
    const second = createShaderManifest();
    expect(first.checksum).toBe(second.checksum);
    expect(first.shaders).toHaveLength(43);
    expect(first.shaders.find((shader) => shader.id === "geometric-grid")?.nativeImplementation)
      .toBe("wgsl:geometric-grid");
  });

  it("round trips the current shader, regions and five portrait outputs", () => {
    const project = createRenderProject({
      shaderPreset: createShaderPreset("geometric-grid", {
        gridScale: 0.7,
        lineWidth: 0.2,
      }, 52061),
      shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS, motion: 2.25 },
      surfaceRegionsEnabled: true,
      surfaceRegions: createDefaultSurfaceRegionAssignments(),
      previewExposure: 0.82,
      livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS, patchCount: 12 },
      installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS, prototypeProjectorIndex: 3 },
      shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS, enabled: true, palette: "metal" },
    }, createDefaultProjectionRig(), "2026-08-12T00:00:00.000Z");
    const parsed = parseRenderProject(JSON.parse(serialiseRenderProject(project)));
    expect(parsed.shader.preset.parameters.gridScale).toBe(0.7);
    expect(parsed.shader.look.motion).toBe(2.25);
    expect(parsed.surfaceRegions.assignments).toHaveLength(4);
    expect(parsed.output.spanningRaster).toEqual({ widthPx: 6000, heightPx: 1920 });
    expect(parsed.safety.fanCommandsIncluded).toBe(false);
    expect(parsed.livingSkins.patchCount).toBe(12);
    expect(parsed.schemaVersion).toBe("orbital.render-project/1.2");
    expect(parsed.output.activeProjectorIndices).toEqual([3]);
    expect(parsed.projectionRig.projectors.map((projector) => projector.enabled))
      .toEqual([false, false, false, true, false]);
    expect(parsed.installationRig.cameraLens.id).toBe("generic-6mm");
    expect(parsed.installationRig.physicalValidation).toBe("not-validated");
    expect(parsed.shaderEventSound).toMatchObject({ nativeAudioIncluded: false, audioOwner: "ableton-max" });
  });

  it("rejects a project from a different shader manifest", () => {
    const project = createRenderProject({
      shaderPreset: createShaderPreset("geometric-grid"),
      shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS },
      surfaceRegionsEnabled: false,
      surfaceRegions: createDefaultSurfaceRegionAssignments(),
      previewExposure: 0.68,
      livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS },
      installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS },
      shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS },
    }, createDefaultProjectionRig());
    project.shaderManifest.checksum = "fnv1a32:deadbeef";
    expect(() => parseRenderProject(project)).toThrow(/checksum/);
  });
});
