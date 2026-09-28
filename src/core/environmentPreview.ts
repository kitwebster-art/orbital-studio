import { clamp } from "./math";

export interface EnvironmentPreviewControls {
  warehouseEnabled: boolean;
  peopleEnabled: boolean;
  lighting: number;
  warmth: number;
  concretePatina: number;
}

export const ENVIRONMENT_LIGHTING_PRESETS = {
  gallery: { label: "Balanced gallery", lighting: 0.62, warmth: 0.58 },
  golden: { label: "Warm late afternoon", lighting: 0.78, warmth: 0.84 },
  moonlit: { label: "Cool moonlit", lighting: 0.38, warmth: 0.12 },
  worklight: { label: "Industrial worklight", lighting: 0.88, warmth: 0.48 },
  blackout: { label: "Projection blackout", lighting: 0.08, warmth: 0.35 },
} as const;

export type EnvironmentLightingPreset = keyof typeof ENVIRONMENT_LIGHTING_PRESETS;

export const DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS: Readonly<EnvironmentPreviewControls> =
  Object.freeze({
    warehouseEnabled: true,
    peopleEnabled: true,
    lighting: 0.62,
    warmth: 0.58,
    concretePatina: 0.72,
  });

export const DEFAULT_FAN_PREVIEW_SPEED = 0.82;

/**
 * Visual-only lift model for the synthetic scene. The minimum keeps the
 * inflated envelope clear of the fan housing, while the upper range makes the
 * airflow change readable at human scale. Physical lift must be measured.
 */
export function fanSpeedToHoverOffsetM(speed: number): number {
  return 0.65 + clamp(speed) * 1.9;
}

export function fanSpeedToClearanceM(speed: number): number {
  return 0.61 + clamp(speed) * 1.9;
}

export function normaliseEnvironmentPreviewControls(
  controls: Partial<EnvironmentPreviewControls>,
): EnvironmentPreviewControls {
  return {
    warehouseEnabled:
      controls.warehouseEnabled ??
      DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.warehouseEnabled,
    peopleEnabled:
      controls.peopleEnabled ?? DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.peopleEnabled,
    lighting: clamp(
      controls.lighting ?? DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.lighting,
    ),
    warmth: clamp(
      controls.warmth ?? DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.warmth,
    ),
    concretePatina: clamp(
      controls.concretePatina ?? DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.concretePatina,
    ),
  };
}
