import { clamp } from "./math";

export interface EnvironmentPreviewControls {
  warehouseEnabled: boolean;
  peopleEnabled: boolean;
  lighting: number;
}

export const DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS: Readonly<EnvironmentPreviewControls> =
  Object.freeze({
    warehouseEnabled: true,
    peopleEnabled: true,
    lighting: 0.62,
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
  };
}
