export type ShaderEventSoundPalette = "mixed" | "space" | "metal" | "bass" | "sweep" | "attack";

export interface ShaderEventSoundControls {
  enabled: boolean;
  palette: ShaderEventSoundPalette;
  density: number;
  reverb: number;
  level: number;
}

export const SHADER_EVENT_SOUND_PALETTES: readonly ShaderEventSoundPalette[] = [
  "mixed", "space", "metal", "bass", "sweep", "attack",
];

export const DEFAULT_SHADER_EVENT_SOUND_CONTROLS: Readonly<ShaderEventSoundControls> = Object.freeze({
  enabled: false,
  palette: "mixed",
  density: 0.46,
  reverb: 0.72,
  level: 0.58,
});

export function normaliseShaderEventSoundControls(
  value: Partial<ShaderEventSoundControls>,
): ShaderEventSoundControls {
  const unit = (candidate: unknown, fallback: number): number =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(1, Math.max(0, candidate))
      : fallback;
  return {
    enabled: value.enabled ?? false,
    palette: SHADER_EVENT_SOUND_PALETTES.includes(value.palette as ShaderEventSoundPalette)
      ? value.palette as ShaderEventSoundPalette
      : "mixed",
    density: unit(value.density, DEFAULT_SHADER_EVENT_SOUND_CONTROLS.density),
    reverb: unit(value.reverb, DEFAULT_SHADER_EVENT_SOUND_CONTROLS.reverb),
    level: unit(value.level, DEFAULT_SHADER_EVENT_SOUND_CONTROLS.level),
  };
}

export function shaderEventBucket(timeS: number, density: number, bpm = 112): number {
  const safeTime = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  const safeDensity = Math.min(1, Math.max(0, density));
  const safeBpm = Number.isFinite(bpm) ? Math.min(180, Math.max(54, bpm)) : 112;
  const subdivision = safeDensity < 0.22 ? 0.25 : safeDensity < 0.48 ? 0.5
    : safeDensity < 0.72 ? 1 : safeDensity < 0.9 ? 2 : 4;
  return Math.floor(safeTime * safeBpm / 60 * subdivision);
}
