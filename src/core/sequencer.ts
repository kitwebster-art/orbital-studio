import { loadShowScore } from "./showScore";
import type {
  AudiovisualParameters,
  ShowMovement,
  ShowScore,
} from "./contracts";
import { clamp } from "./math";

/** Versioned, host-neutral timeline contract used by the rehearsal sequencer. */
export const TIMELINE_SCHEMA_VERSION = "orbital.timeline/1.0" as const;
/** Alias retained for callers that refer to the runtime as a sequencer. */
export const SEQUENCER_SCHEMA_VERSION = TIMELINE_SCHEMA_VERSION;

export type InterpolationMode =
  | "step"
  | "linear"
  | "smoothstep"
  | "ease-in"
  | "ease-out";

/** JSON-safe values are deliberately used so a timeline can cross runtimes. */
export type CueValue =
  | number
  | string
  | boolean
  | null
  | readonly CueValue[]
  | { readonly [key: string]: CueValue };

export type TimelineTrackKind = "value" | "event";

export interface SequencerCue<T extends CueValue = CueValue> {
  id: string;
  /** Absolute musical position, in quarter-note beats. */
  beat: number;
  value: T;
  interpolation?: InterpolationMode;
  /** Event cues may carry a duration, while value cues normally do not. */
  durationBeats?: number;
  payload?: Readonly<Record<string, CueValue>>;
}

export interface SequencerTrack<T extends CueValue = CueValue> {
  id: string;
  label?: string;
  kind?: TimelineTrackKind;
  cues: readonly SequencerCue<T>[];
}

/**
 * Timeline input accepts either `tempoBpm` or the shorter `bpm` spelling.
 * `normaliseTimeline` writes both so integrations can use one stable output.
 */
export interface TimelineDefinition {
  schemaVersion?: typeof TIMELINE_SCHEMA_VERSION;
  title: string;
  tempoBpm?: number;
  bpm?: number;
  beatsPerBar: number;
  barsPerPhrase: number;
  durationBeats: number;
  loop: boolean;
  tracks: readonly SequencerTrack[];
}

export interface NormalisedTimeline extends TimelineDefinition {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  tempoBpm: number;
  bpm: number;
  tracks: readonly SequencerTrack[];
}

export interface BeatPosition {
  /** Current continuous beat, normalised to the timeline duration. */
  beat: number;
  /** One-based bar and phrase numbers are convenient for operator displays. */
  bar: number;
  phrase: number;
  /** Zero-based values retain the unambiguous machine representation. */
  barIndex: number;
  phraseIndex: number;
  beatInBar: number;
  beatInPhrase: number;
  phase: number;
}

export interface TimelineTrackSample {
  trackId: string;
  kind: TimelineTrackKind;
  value: CueValue | undefined;
  cueId: string | null;
  nextCueId: string | null;
  interpolation: InterpolationMode;
}

export interface SequencerEvent {
  trackId: string;
  cueId: string;
  beat: number;
  value: CueValue;
  durationBeats?: number;
  payload?: Readonly<Record<string, CueValue>>;
}

export interface TimelineFrame {
  timeS: number;
  position: BeatPosition;
  /** Flattened aliases keep UI adapters small while `position` stays canonical. */
  beat: number;
  bar: number;
  phrase: number;
  beatInBar: number;
  beatInPhrase: number;
  tracks: readonly TimelineTrackSample[];
  values: Readonly<Record<string, CueValue | undefined>>;
  events: readonly SequencerEvent[];
}

export interface TimelineSequencerOptions {
  autoplay?: boolean;
  startBeat?: number;
}

export type Cue<T extends CueValue = CueValue> = SequencerCue<T>;
export type Track<T extends CueValue = CueValue> = SequencerTrack<T>;
export type Timeline = TimelineDefinition;

const DEFAULT_BPM = 120;
const EPSILON = 1e-9;

function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function positive(value: unknown, label: string): asserts value is number {
  finite(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be positive`);
  }
}

function nonNegative(value: unknown, label: string): asserts value is number {
  finite(value, label);
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}

function cloneValue<T extends CueValue>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertCueValue(value: unknown, path: string): asserts value is CueValue {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`${path} must contain only finite numbers`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCueValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      assertCueValue(item, `${path}.${key}`),
    );
    return;
  }
  throw new Error(`${path} must be JSON-safe`);
}

function normaliseTrack(track: SequencerTrack, index: number, durationBeats: number): SequencerTrack {
  if (!track || typeof track !== "object") {
    throw new Error(`tracks[${index}] must be an object`);
  }
  if (typeof track.id !== "string" || track.id.length === 0) {
    throw new Error(`tracks[${index}].id must be a non-empty string`);
  }
  if (track.kind !== undefined && track.kind !== "value" && track.kind !== "event") {
    throw new Error(`tracks[${index}].kind is unsupported`);
  }
  if (!Array.isArray(track.cues)) {
    throw new Error(`tracks[${index}].cues must be an array`);
  }
  const cueIds = new Set<string>();
  const cues = track.cues.map((cue, cueIndex) => {
    if (!cue || typeof cue !== "object") {
      throw new Error(`tracks[${index}].cues[${cueIndex}] must be an object`);
    }
    if (typeof cue.id !== "string" || cue.id.length === 0) {
      throw new Error(`tracks[${index}].cues[${cueIndex}].id must be non-empty`);
    }
    if (cueIds.has(cue.id)) {
      throw new Error(`Duplicate cue id in track ${track.id}: ${cue.id}`);
    }
    cueIds.add(cue.id);
    nonNegative(cue.beat, `tracks[${index}].cues[${cueIndex}].beat`);
    if (cue.beat > durationBeats + EPSILON) {
      throw new Error(`tracks[${index}].cues[${cueIndex}].beat exceeds durationBeats`);
    }
    assertCueValue(cue.value, `tracks[${index}].cues[${cueIndex}].value`);
    if (cue.interpolation !== undefined && ![
      "step",
      "linear",
      "smoothstep",
      "ease-in",
      "ease-out",
    ].includes(cue.interpolation)) {
      throw new Error(`tracks[${index}].cues[${cueIndex}].interpolation is unsupported`);
    }
    if (cue.durationBeats !== undefined) {
      nonNegative(cue.durationBeats, `tracks[${index}].cues[${cueIndex}].durationBeats`);
    }
    if (cue.payload !== undefined) {
      assertCueValue(cue.payload, `tracks[${index}].cues[${cueIndex}].payload`);
    }
    return {
      ...cue,
      value: cloneValue(cue.value),
      payload: cue.payload ? cloneValue(cue.payload) : undefined,
      interpolation: cue.interpolation ?? "step",
    };
  });
  cues.sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
  return {
    id: track.id,
    label: track.label,
    kind: track.kind ?? "value",
    cues,
  };
}

/** Validate and clone a timeline before it enters a running sequencer. */
export function normaliseTimeline(source: TimelineDefinition): NormalisedTimeline {
  if (!source || typeof source !== "object") {
    throw new Error("Timeline must be an object");
  }
  if (source.schemaVersion !== undefined && source.schemaVersion !== TIMELINE_SCHEMA_VERSION) {
    throw new Error(`Unsupported timeline schema: ${String(source.schemaVersion)}`);
  }
  if (typeof source.title !== "string" || source.title.length === 0) {
    throw new Error("Timeline title must be a non-empty string");
  }
  const bpm = source.tempoBpm ?? source.bpm ?? DEFAULT_BPM;
  positive(bpm, "tempoBpm");
  positive(source.beatsPerBar, "beatsPerBar");
  positive(source.barsPerPhrase, "barsPerPhrase");
  if (!Number.isInteger(source.beatsPerBar) || !Number.isInteger(source.barsPerPhrase)) {
    throw new Error("beatsPerBar and barsPerPhrase must be integers");
  }
  positive(source.durationBeats, "durationBeats");
  if (typeof source.loop !== "boolean") {
    throw new Error("loop must be a boolean");
  }
  if (!Array.isArray(source.tracks)) {
    throw new Error("tracks must be an array");
  }
  const trackIds = new Set<string>();
  const tracks = source.tracks.map((track, index) => {
    const normalised = normaliseTrack(track, index, source.durationBeats);
    if (trackIds.has(normalised.id)) {
      throw new Error(`Duplicate track id: ${normalised.id}`);
    }
    trackIds.add(normalised.id);
    return normalised;
  });
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    title: source.title,
    tempoBpm: bpm,
    bpm,
    beatsPerBar: source.beatsPerBar,
    barsPerPhrase: source.barsPerPhrase,
    durationBeats: source.durationBeats,
    loop: source.loop,
    tracks,
  };
}

function easing(amount: number, mode: InterpolationMode): number {
  const t = clamp(amount);
  switch (mode) {
    case "linear":
      return t;
    case "smoothstep":
      return t * t * (3 - 2 * t);
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "step":
    default:
      return t < 1 ? 0 : 1;
  }
}

/** Recursively interpolate numeric JSON values, stepping non-numeric leaves. */
export function interpolateCueValue<T extends CueValue>(
  from: T,
  to: T,
  amount: number,
  mode: InterpolationMode = "linear",
): T {
  const t = easing(amount, mode);
  if (typeof from === "number" && typeof to === "number") {
    return (from + (to - from) * t) as T;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    const length = Math.max(from.length, to.length);
    return Array.from({ length }, (_, index) =>
      interpolateCueValue(
        (from[index] ?? to[index] ?? null) as CueValue,
        (to[index] ?? from[index] ?? null) as CueValue,
        t,
        "linear",
      ),
    ) as unknown as T;
  }
  if (
    typeof from === "object" && from !== null && !Array.isArray(from) &&
    typeof to === "object" && to !== null && !Array.isArray(to)
  ) {
    const leftObject = from as { readonly [key: string]: CueValue };
    const rightObject = to as { readonly [key: string]: CueValue };
    const keys = new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]);
    const result: Record<string, CueValue> = {};
    keys.forEach((key) => {
      const left = leftObject[key] ?? rightObject[key] ?? null;
      const right = rightObject[key] ?? leftObject[key] ?? null;
      result[key] = interpolateCueValue(left, right, t, "linear");
    });
    return result as T;
  }
  return cloneValue(t < 1 ? from : to);
}

export function beatToSeconds(beat: number, tempoBpm: number): number {
  finite(beat, "beat");
  positive(tempoBpm, "tempoBpm");
  return beat * 60 / tempoBpm;
}

export function secondsToBeat(timeS: number, tempoBpm: number): number {
  nonNegative(timeS, "timeS");
  positive(tempoBpm, "tempoBpm");
  return timeS * tempoBpm / 60;
}

export function calculateBeatPosition(
  beat: number,
  beatsPerBar: number,
  barsPerPhrase: number,
): BeatPosition {
  nonNegative(beat, "beat");
  if (!Number.isInteger(beatsPerBar) || beatsPerBar <= 0) {
    throw new Error("beatsPerBar must be a positive integer");
  }
  if (!Number.isInteger(barsPerPhrase) || barsPerPhrase <= 0) {
    throw new Error("barsPerPhrase must be a positive integer");
  }
  const barIndex = Math.floor(beat / beatsPerBar);
  const phraseBeats = beatsPerBar * barsPerPhrase;
  const phraseIndex = Math.floor(beat / phraseBeats);
  return {
    beat,
    bar: barIndex + 1,
    phrase: phraseIndex + 1,
    barIndex,
    phraseIndex,
    beatInBar: beat - barIndex * beatsPerBar,
    beatInPhrase: beat - phraseIndex * phraseBeats,
    phase: beat - Math.floor(beat),
  };
}

function cueEvent(track: SequencerTrack, cue: SequencerCue): SequencerEvent {
  return {
    trackId: track.id,
    cueId: cue.id,
    beat: cue.beat,
    value: cloneValue(cue.value),
    durationBeats: cue.durationBeats,
    payload: cue.payload ? cloneValue(cue.payload) : undefined,
  };
}

/**
 * Deterministic musical timeline sampler. It has no wall-clock dependency,
 * which makes it safe for browser rehearsal, offline rendering and tests.
 */
export class TimelineSequencer {
  readonly timeline: NormalisedTimeline;
  private beat = 0;
  private isPlaying: boolean;
  private tempoBpm: number;

  constructor(source: TimelineDefinition = createDefaultTimeline(), options: TimelineSequencerOptions = {}) {
    this.timeline = normaliseTimeline(source);
    this.tempoBpm = this.timeline.tempoBpm;
    this.isPlaying = options.autoplay ?? false;
    this.seekBeat(options.startBeat ?? 0);
  }

  get currentBeat(): number {
    return this.beat;
  }

  get currentTimeS(): number {
    return beatToSeconds(this.beat, this.tempoBpm);
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get playbackRate(): number {
    return 1;
  }

  get current(): TimelineFrame {
    return this.sample();
  }

  get currentState(): TimelineFrame {
    return this.current;
  }

  get bpm(): number {
    return this.tempoBpm;
  }

  setPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }

  setTempoBpm(tempoBpm: number): void {
    positive(tempoBpm, "tempoBpm");
    this.tempoBpm = tempoBpm;
  }

  seekBeat(beat: number): void {
    finite(beat, "beat");
    this.beat = this.normaliseBeat(beat);
  }

  seek(timeS: number): void {
    nonNegative(timeS, "timeS");
    this.seekBeat(secondsToBeat(timeS, this.tempoBpm));
  }

  reset(): void {
    this.seekBeat(0);
    this.isPlaying = false;
  }

  sample(): TimelineFrame {
    return this.sampleAt(this.beat, []);
  }

  sampleAt(beat: number, events: readonly SequencerEvent[] = []): TimelineFrame {
    const normalisedBeat = this.normaliseBeat(beat);
    const position = calculateBeatPosition(
      normalisedBeat,
      this.timeline.beatsPerBar,
      this.timeline.barsPerPhrase,
    );
    const tracks: TimelineTrackSample[] = [];
    const values: Record<string, CueValue | undefined> = {};

    for (const track of this.timeline.tracks) {
      const previousIndex = this.previousCueIndex(track, normalisedBeat);
      const nextIndex = previousIndex + 1;
      const previous = previousIndex >= 0 ? track.cues[previousIndex] : undefined;
      const next = nextIndex < track.cues.length ? track.cues[nextIndex] : undefined;
      let value: CueValue | undefined;
      let interpolation: InterpolationMode = previous?.interpolation ?? "step";
      if (previous && next && next.beat > previous.beat + EPSILON) {
        interpolation = previous.interpolation ?? "step";
        const amount = (normalisedBeat - previous.beat) / (next.beat - previous.beat);
        value = interpolateCueValue(previous.value, next.value, amount, interpolation);
      } else if (previous) {
        value = cloneValue(previous.value);
      } else if (next) {
        value = cloneValue(next.value);
        interpolation = "step";
      }
      tracks.push({
        trackId: track.id,
        kind: track.kind ?? "value",
        value,
        cueId: previous?.id ?? null,
        nextCueId: next?.id ?? null,
        interpolation,
      });
      values[track.id] = value;
    }

    return {
      timeS: beatToSeconds(normalisedBeat, this.tempoBpm),
      position,
      beat: normalisedBeat,
      bar: position.bar,
      phrase: position.phrase,
      beatInBar: position.beatInBar,
      beatInPhrase: position.beatInPhrase,
      tracks,
      values,
      events,
    };
  }

  /** Advance in seconds using only explicit delta time. */
  tick(deltaS: number): TimelineFrame {
    return this.advance(deltaS);
  }

  advance(deltaS: number): TimelineFrame {
    nonNegative(deltaS, "deltaS");
    if (!this.isPlaying || deltaS === 0) {
      return this.sample();
    }
    const previousBeat = this.beat;
    const rawNextBeat = previousBeat + secondsToBeat(deltaS, this.tempoBpm);
    const events = this.eventsBetween(previousBeat, rawNextBeat);
    if (!this.timeline.loop && rawNextBeat >= this.timeline.durationBeats) {
      this.beat = this.timeline.durationBeats;
      this.isPlaying = false;
    } else {
      this.beat = this.normaliseBeat(rawNextBeat);
    }
    return this.sampleAt(this.beat, events);
  }

  eventsBetween(startBeat: number, endBeat: number): readonly SequencerEvent[] {
    finite(startBeat, "startBeat");
    finite(endBeat, "endBeat");
    if (endBeat <= startBeat + EPSILON) {
      return [];
    }
    const events: SequencerEvent[] = [];
    const duration = this.timeline.durationBeats;
    const collect = (from: number, to: number, includeFrom: boolean): void => {
      for (const track of this.timeline.tracks) {
        if ((track.kind ?? "value") !== "event") {
          continue;
        }
        for (const cue of track.cues) {
          const afterStart = includeFrom ? cue.beat >= from - EPSILON : cue.beat > from + EPSILON;
          if (afterStart && cue.beat <= to + EPSILON) {
            events.push(cueEvent(track, cue));
          }
        }
      }
    };

    if (!this.timeline.loop) {
      collect(Math.max(0, startBeat), Math.min(duration, endBeat), false);
      return events;
    }
    let cursor = startBeat;
    let remaining = endBeat - startBeat;
    while (remaining > EPSILON) {
      const cycle = Math.floor(cursor / duration);
      const cycleStart = cycle * duration;
      const localStart = cursor - cycleStart;
      const segment = Math.min(remaining, duration - localStart);
      collect(localStart, localStart + segment, localStart <= EPSILON);
      remaining -= segment;
      cursor += segment;
      if (segment <= EPSILON) {
        break;
      }
    }
    return events;
  }

  private previousCueIndex(track: SequencerTrack, beat: number): number {
    let low = 0;
    let high = track.cues.length - 1;
    let result = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (track.cues[middle].beat <= beat + EPSILON) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  }

  private normaliseBeat(beat: number): number {
    if (this.timeline.loop) {
      return ((beat % this.timeline.durationBeats) + this.timeline.durationBeats) % this.timeline.durationBeats;
    }
    return clamp(beat, 0, this.timeline.durationBeats);
  }
}

/** Short stable name for UI and production adapters. */
export class Sequencer extends TimelineSequencer {}

function movementAtPeak(movement: ShowMovement, key: keyof AudiovisualParameters): number {
  const start = movement.start[key];
  const end = movement.end[key];
  if (!movement.localPeak) {
    return start + (end - start) * 0.5;
  }
  const override = movement.localPeak[key];
  const baseline = start + (end - start) * movement.localPeak.at;
  return override ?? baseline;
}

const AV_KEYS = [
  "energy",
  "brightness",
  "visualDensity",
  "fluidity",
  "fracture",
  "glitch",
  "organic",
  "melody",
  "sub",
  "spatialMotion",
  "residualGain",
  "predictionVisibility",
  "fanCue",
] as const satisfies readonly (keyof AudiovisualParameters)[];

/** Convert the authored 48-minute score to a neutral musical timeline. */
export function timelineFromShowScore(
  source: ShowScore,
  options: { tempoBpm?: number; beatsPerBar?: number; barsPerPhrase?: number } = {},
): TimelineDefinition {
  const score = loadShowScore(source);
  const tempoBpm = options.tempoBpm ?? 120;
  const beatsPerBar = options.beatsPerBar ?? 4;
  const barsPerPhrase = options.barsPerPhrase ?? 4;
  const cuesByKey = new Map<string, SequencerCue<number>[]>();
  AV_KEYS.forEach((key) => cuesByKey.set(key, []));
  for (const movement of score.movements) {
    const startBeat = beatToSeconds(0, tempoBpm) + movement.startS * tempoBpm / 60;
    const endBeat = (movement.startS + movement.durationS) * tempoBpm / 60;
    for (const key of AV_KEYS) {
      const cues = cuesByKey.get(key);
      if (!cues) continue;
      cues.push({ id: `${movement.id}-${key}-start`, beat: startBeat, value: movement.start[key], interpolation: "linear" });
      if (movement.localPeak) {
        cues.push({ id: `${movement.id}-${key}-peak`, beat: startBeat + movement.localPeak.at * (endBeat - startBeat), value: movementAtPeak(movement, key), interpolation: "linear" });
      }
      cues.push({ id: `${movement.id}-${key}-end`, beat: endBeat, value: movement.end[key], interpolation: "linear" });
    }
  }
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    title: score.title,
    tempoBpm,
    bpm: tempoBpm,
    beatsPerBar,
    barsPerPhrase,
    durationBeats: score.durationS * tempoBpm / 60,
    loop: score.loop,
    tracks: AV_KEYS.map((key) => ({
      id: `audiovisual.${key}`,
      label: key,
      kind: "value" as const,
      cues: cuesByKey.get(key) ?? [],
    })),
  };
}

/** The bundled score is the default UI/runtime musical timeline. */
export function createDefaultTimeline(
  options: { tempoBpm?: number; beatsPerBar?: number; barsPerPhrase?: number } = {},
): TimelineDefinition {
  return timelineFromShowScore(loadShowScore(), options);
}

/**
 * Deterministic fallback timeline for a live clock outage. It is deliberately
 * sparse and low-energy, and uses no random source, network or audio device.
 */
export function createGeneratedFallbackTimeline(
  options: { tempoBpm?: number; beatsPerBar?: number; barsPerPhrase?: number; phrases?: number } = {},
): TimelineDefinition {
  const tempoBpm = options.tempoBpm ?? 120;
  const beatsPerBar = options.beatsPerBar ?? 4;
  const barsPerPhrase = options.barsPerPhrase ?? 4;
  const phrases = options.phrases ?? 16;
  positive(phrases, "phrases");
  if (!Number.isInteger(phrases)) throw new Error("phrases must be an integer");
  const phraseBeats = beatsPerBar * barsPerPhrase;
  const durationBeats = phrases * phraseBeats;
  const makeCues = (fn: (index: number) => number): SequencerCue<number>[] =>
    Array.from({ length: phrases + 1 }, (_, index) => ({
      id: `fallback-${index}`,
      beat: index * phraseBeats,
      value: clamp(fn(index)),
      interpolation: "smoothstep" as const,
    }));
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    title: "Generated live fallback",
    tempoBpm,
    bpm: tempoBpm,
    beatsPerBar,
    barsPerPhrase,
    durationBeats,
    loop: true,
    tracks: [
      { id: "fallback.energy", label: "Energy", cues: makeCues((i) => 0.16 + 0.08 * Math.sin(i * 1.7)) },
      { id: "fallback.brightness", label: "Brightness", cues: makeCues((i) => 0.06 + 0.03 * Math.sin(i * 1.7 + 0.8)) },
      { id: "fallback.spatialMotion", label: "Spatial motion", cues: makeCues((i) => 0.1 + 0.08 * Math.sin(i * 0.9 + 1.2)) },
      {
        id: "fallback.pulse",
        label: "Fallback phrase pulse",
        kind: "event",
        cues: Array.from({ length: phrases }, (_, index) => ({
          id: `fallback-pulse-${index}`,
          beat: index * phraseBeats,
          value: 1,
          durationBeats: 1,
        })),
      },
    ],
  };
}
