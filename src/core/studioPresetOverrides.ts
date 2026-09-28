import {
  normaliseEnvironmentPreviewControls,
  type EnvironmentPreviewControls,
} from "./environmentPreview";
import { clamp } from "./math";
import {
  parseShaderPreset,
  SHADER_PRESET_CATALOG,
  type ShaderPreset,
} from "./shaderRegistry";
import {
  DEFAULT_SHADER_LOOK_CONTROLS,
  normaliseShaderLookControls,
  type ShaderLookControls,
} from "./shaderLookControls";
import {
  normaliseBalloonPhysicsControls,
  normaliseProjectionMaterialControls,
  type BalloonPhysicsControls,
  type ProjectionMaterialControls,
} from "./balloonSurfaceControls";

export const STUDIO_PRESET_OVERRIDE_SCHEMA_VERSION =
  "orbital.studio-preset-override/1.0" as const;
export const STUDIO_PRESET_OVERRIDE_STORAGE_KEY =
  "orbital-studio-preset-overrides-v1";

export interface StudioPresetOverride {
  schemaVersion: typeof STUDIO_PRESET_OVERRIDE_SCHEMA_VERSION;
  cardId: string;
  preset: ShaderPreset;
  lookControls: ShaderLookControls;
  previewExposure: number;
  fanSpeed: number;
  environment: EnvironmentPreviewControls;
  balloonPhysics: BalloonPhysicsControls;
  projectionMaterial: ProjectionMaterialControls;
}

export type StudioPresetOverrideMap = Record<string, StudioPresetOverride>;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createStudioPresetOverride(
  value: Omit<StudioPresetOverride, "schemaVersion" | "balloonPhysics" | "projectionMaterial"> &
    Partial<Pick<StudioPresetOverride, "balloonPhysics" | "projectionMaterial">>,
): StudioPresetOverride {
  const card = SHADER_PRESET_CATALOG.find((candidate) => candidate.id === value.cardId);
  if (!card) {
    throw new Error(`Unknown shader preset card ${value.cardId}`);
  }
  const preset = parseShaderPreset(value.preset);
  if (preset.shaderId !== card.preset.shaderId || preset.seed !== card.preset.seed) {
    throw new Error("Updated preset must retain its original shader and seed");
  }
  return {
    schemaVersion: STUDIO_PRESET_OVERRIDE_SCHEMA_VERSION,
    cardId: card.id,
    preset,
    lookControls: normaliseShaderLookControls(value.lookControls),
    previewExposure: clamp(value.previewExposure),
    fanSpeed: clamp(value.fanSpeed),
    environment: normaliseEnvironmentPreviewControls(value.environment),
    balloonPhysics: normaliseBalloonPhysicsControls(value.balloonPhysics ?? {}),
    projectionMaterial: normaliseProjectionMaterialControls(value.projectionMaterial ?? {}),
  };
}

export function readStudioPresetOverrides(
  storage: StorageLike | null,
): StudioPresetOverrideMap {
  if (!storage) {
    return {};
  }
  try {
    const source = storage.getItem(STUDIO_PRESET_OVERRIDE_STORAGE_KEY);
    if (!source) {
      return {};
    }
    const parsed = JSON.parse(source) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([cardId, candidate]) => {
        if (
          typeof candidate !== "object" ||
          candidate === null ||
          (candidate as { schemaVersion?: unknown }).schemaVersion !==
            STUDIO_PRESET_OVERRIDE_SCHEMA_VERSION
        ) {
          return [];
        }
        try {
          const value = candidate as StudioPresetOverride;
          const lookControls = value.lookControls?.motion === 1
            ? { ...value.lookControls, motion: DEFAULT_SHADER_LOOK_CONTROLS.motion }
            : value.lookControls;
          return [[cardId, createStudioPresetOverride({
            cardId,
            preset: value.preset,
            lookControls,
            previewExposure: value.previewExposure,
            fanSpeed: value.fanSpeed,
            environment: value.environment,
            balloonPhysics: value.balloonPhysics,
            projectionMaterial: value.projectionMaterial,
          })]];
        } catch {
          return [];
        }
      }),
    );
  } catch {
    return {};
  }
}

export function writeStudioPresetOverrides(
  storage: StorageLike | null,
  overrides: StudioPresetOverrideMap,
): void {
  if (!storage) {
    throw new Error("Browser storage is unavailable");
  }
  storage.setItem(
    STUDIO_PRESET_OVERRIDE_STORAGE_KEY,
    JSON.stringify(overrides),
  );
}
