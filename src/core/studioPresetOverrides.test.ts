import { describe, expect, it } from "vitest";

import { DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS } from "./environmentPreview";
import { SHADER_PRESET_CATALOG } from "./shaderRegistry";
import { DEFAULT_SHADER_LOOK_CONTROLS } from "./shaderLookControls";
import {
  createStudioPresetOverride,
  readStudioPresetOverrides,
  writeStudioPresetOverrides,
} from "./studioPresetOverrides";

describe("studio preset overrides", () => {
  it("round-trips shader and shared scene parameters", () => {
    const card = SHADER_PRESET_CATALOG[0]!;
    const updated = createStudioPresetOverride({
      cardId: card.id,
      preset: card.preset,
      lookControls: { ...DEFAULT_SHADER_LOOK_CONTROLS, scale: 1.7 },
      previewExposure: 0.44,
      fanSpeed: 0.86,
      environment: { ...DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS, lighting: 0.72 },
    });
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeStudioPresetOverrides(storage, { [card.id]: updated });
    const restored = readStudioPresetOverrides(storage)[card.id];
    expect(restored?.fanSpeed).toBe(0.86);
    expect(restored?.lookControls.scale).toBe(1.7);
    expect(restored?.environment.lighting).toBe(0.72);
  });

  it("ignores malformed stored data", () => {
    const storage = {
      getItem: () => "not-json",
      setItem: () => undefined,
    };
    expect(readStudioPresetOverrides(storage)).toEqual({});
  });
});
