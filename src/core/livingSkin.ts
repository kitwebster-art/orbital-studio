export type LivingSkinSequenceMode = "random" | "cascade" | "face-scan" | "eruption" | "breathing";

export interface LivingSkinControls {
  enabled: boolean;
  patchCount: number;
  variety: number;
  glitch: number;
  flashRate: number;
  sequenceMode: LivingSkinSequenceMode;
  eventHold: number;
  attackSharpness: number;
  breath: number;
  edgeSoftness: number;
  beautyLighting: number;
  glow: number;
  bpm: number;
  phraseEvolution: number;
}

export const DEFAULT_LIVING_SKIN_CONTROLS: Readonly<LivingSkinControls> =
  Object.freeze({
    enabled: false,
    patchCount: 9,
    variety: 0.78,
    glitch: 0.34,
    flashRate: 0.58,
    sequenceMode: "eruption",
    eventHold: 0.78,
    attackSharpness: 0.72,
    breath: 0.66,
    edgeSoftness: 0.42,
    beautyLighting: 0.72,
    glow: 0.38,
    bpm: 112,
    phraseEvolution: 0.82,
  });

export function normaliseLivingSkinControls(
  controls: Partial<LivingSkinControls>,
): LivingSkinControls {
  const unit = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : fallback;
  const rawCount = typeof controls.patchCount === "number" && Number.isFinite(controls.patchCount)
    ? Math.round(controls.patchCount)
    : DEFAULT_LIVING_SKIN_CONTROLS.patchCount;
  const sequenceModes: readonly LivingSkinSequenceMode[] = ["random", "cascade", "face-scan", "eruption", "breathing"];
  return {
    enabled: controls.enabled ?? DEFAULT_LIVING_SKIN_CONTROLS.enabled,
    patchCount: Math.min(12, Math.max(3, rawCount)),
    variety: unit(controls.variety, DEFAULT_LIVING_SKIN_CONTROLS.variety),
    glitch: unit(controls.glitch, DEFAULT_LIVING_SKIN_CONTROLS.glitch),
    flashRate: unit(controls.flashRate, DEFAULT_LIVING_SKIN_CONTROLS.flashRate),
    sequenceMode: sequenceModes.includes(controls.sequenceMode as LivingSkinSequenceMode)
      ? controls.sequenceMode as LivingSkinSequenceMode
      : DEFAULT_LIVING_SKIN_CONTROLS.sequenceMode,
    eventHold: unit(controls.eventHold, DEFAULT_LIVING_SKIN_CONTROLS.eventHold),
    attackSharpness: unit(controls.attackSharpness, DEFAULT_LIVING_SKIN_CONTROLS.attackSharpness),
    breath: unit(controls.breath, DEFAULT_LIVING_SKIN_CONTROLS.breath),
    edgeSoftness: unit(
      controls.edgeSoftness,
      DEFAULT_LIVING_SKIN_CONTROLS.edgeSoftness,
    ),
    beautyLighting: unit(
      controls.beautyLighting,
      DEFAULT_LIVING_SKIN_CONTROLS.beautyLighting,
    ),
    glow: unit(controls.glow, DEFAULT_LIVING_SKIN_CONTROLS.glow),
    bpm: typeof controls.bpm === "number" && Number.isFinite(controls.bpm)
      ? Math.min(180, Math.max(54, controls.bpm))
      : DEFAULT_LIVING_SKIN_CONTROLS.bpm,
    phraseEvolution: unit(
      controls.phraseEvolution,
      DEFAULT_LIVING_SKIN_CONTROLS.phraseEvolution,
    ),
  };
}

export function livingSkinSequenceModeIndex(mode: LivingSkinSequenceMode): number {
  return ["random", "cascade", "face-scan", "eruption", "breathing"].indexOf(mode);
}
