export const BEAT_FRAGMENTATION_BPM_MIN = 54;
export const BEAT_FRAGMENTATION_BPM_MAX = 180;

/** Stable rhythmic subdivisions, expressed as events per quarter-note beat. */
export const BEAT_FRAGMENTATION_SUBDIVISIONS = [0.25, 0.5, 1, 2, 3, 4] as const;

/** Region holds in quarter-note beats. The shortest value is an eighth of one beat. */
export const BEAT_FRAGMENTATION_HOLD_BEATS = [0.125, 0.25, 0.5, 1, 2, 4] as const;

export interface BeatFragmentationPosition {
  beat: number;
  step: number;
  phase: number;
}

export interface BeatFragmentationRegionState {
  bar: number;
  durationBeats: number;
  step: number;
  phase: number;
  offsetBeats: number;
}

function stableRhythmHash(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Gives each region an independent but deterministic duration inside a 4/4 bar.
 * Durations remain musically exact while short regions may enter on 1/8-beat offsets.
 */
export function beatFragmentationRegionState(
  timeS: number,
  bpm: number,
  regionId: number,
  scatter: number,
  seed = 0,
): BeatFragmentationRegionState {
  const beat = Math.max(0, Number.isFinite(timeS) ? timeS : 0) * normaliseFragmentationBpm(bpm) / 60;
  const safeRegion = Math.max(0, Math.floor(Number.isFinite(regionId) ? regionId : 0));
  const safeScatter = Number.isFinite(scatter) ? Math.min(1, Math.max(0, scatter)) : 0.5;
  const bar = Math.floor(beat / 4);
  const barBeat = beat - bar * 4;
  const phraseSeed = safeRegion * 17.17 + bar * 41.73 + seed * 7.91;
  const durationHash = stableRhythmHash(phraseSeed);
  const variedDuration = durationHash < 0.12 ? 0.125
    : durationHash < 0.27 ? 0.25
      : durationHash < 0.48 ? 0.5
        : durationHash < 0.7 ? 1
          : durationHash < 0.86 ? 2
            : 4;
  const durationBeats = stableRhythmHash(phraseSeed + 19.4) <= safeScatter
    ? variedDuration
    : 0.5;
  const offsetBeats = durationBeats <= 1 && safeScatter > 0
    ? Math.floor(stableRhythmHash(phraseSeed + 61.2) * 8) * 0.125 * safeScatter
    : 0;
  const clock = (barBeat + offsetBeats) / durationBeats;
  return {
    bar,
    durationBeats,
    step: bar * 32 + Math.floor(clock),
    phase: clock - Math.floor(clock),
    offsetBeats,
  };
}

export function normaliseFragmentationBpm(value: unknown, fallback = 112): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(BEAT_FRAGMENTATION_BPM_MAX, Math.max(BEAT_FRAGMENTATION_BPM_MIN, value));
}

export function beatFragmentationPosition(
  timeS: number,
  bpm: number,
  density: number,
): BeatFragmentationPosition {
  const safeTime = Number.isFinite(timeS) ? Math.max(0, timeS) : 0;
  const safeBpm = normaliseFragmentationBpm(bpm);
  const safeDensity = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0.5;
  const subdivisionIndex = Math.min(
    BEAT_FRAGMENTATION_SUBDIVISIONS.length - 1,
    Math.floor(safeDensity * BEAT_FRAGMENTATION_SUBDIVISIONS.length),
  );
  const subdivision = BEAT_FRAGMENTATION_SUBDIVISIONS[subdivisionIndex]!;
  const beat = safeTime * safeBpm / 60;
  const event = beat * subdivision;
  return { beat, step: Math.floor(event), phase: event - Math.floor(event) };
}

/** Deterministic syncopation pattern. Visual and audio systems share this gate. */
export function beatFragmentationGate(step: number, density: number): boolean {
  const safeStep = Math.max(0, Math.floor(Number.isFinite(step) ? step : 0));
  const safeDensity = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0.5;
  const euclidean = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0] as const;
  const gate = euclidean[safeStep % euclidean.length] === 1;
  if (safeDensity >= 0.82) return gate || safeStep % 4 === 3;
  if (safeDensity <= 0.22) return safeStep % 8 === 0;
  if (safeDensity <= 0.48) return gate && safeStep % 2 === 0;
  return gate;
}
