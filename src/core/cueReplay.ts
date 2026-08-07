import {
  CUE_STATE_SCHEMA_VERSION,
  type CueState,
} from "./cueBridge";
import {
  WORLD_STATE_SCHEMA_VERSION,
  type AudiovisualParameters,
  type FanTelemetry,
  type RuntimeSnapshot,
  type ShowScore,
  type Vec3,
  type WorldState,
} from "./contracts";
import { clamp } from "./math";
import { sampleShowScore } from "./showScore";
import { calculateProjectorLevels } from "./projectionRig";

const MAX_REPLAY_FRAMES = 120_000;
const TIME_EPSILON_S = 1e-9;

const PARAMETER_KEYS = [
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

type CueRecord = Record<string, unknown>;

function isRecord(value: unknown): value is CueRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
}

function nonNegative(value: unknown, path: string): asserts value is number {
  finite(value, path);
  if (value < 0) {
    throw new Error(`${path} must be non-negative`);
  }
}

function unit(value: unknown, path: string): asserts value is number {
  finite(value, path);
  if (value < 0 || value > 1) {
    throw new Error(`${path} must be between 0 and 1`);
  }
}

function boolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
}

function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function vec3(value: unknown, path: string): asserts value is Vec3 {
  if (!isRecord(value)) {
    throw new Error(`${path} must be a vector`);
  }
  finite(value.x, `${path}.x`);
  finite(value.y, `${path}.y`);
  finite(value.z, `${path}.z`);
}

function nullableVec3(value: unknown, path: string): void {
  if (value !== null) {
    vec3(value, path);
  }
}

function validateWorldState(value: unknown, path: string): asserts value is WorldState {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (value.schemaVersion !== WORLD_STATE_SCHEMA_VERSION) {
    throw new Error(`${path}.schemaVersion is unsupported`);
  }
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 0) {
    throw new Error(`${path}.sequence must be a non-negative integer`);
  }
  if (![
    "simulation",
    "replay",
    "live",
  ].includes(value.mode as string)) {
    throw new Error(`${path}.mode is unsupported`);
  }
  nonNegative(value.monotonicTimeS, `${path}.monotonicTimeS`);
  if (!["acquiring", "tracking", "degraded", "lost", "unavailable"].includes(value.status as string)) {
    throw new Error(`${path}.status is unsupported`);
  }
  boolean(value.stateValid, `${path}.stateValid`);
  boolean(value.measurementValid, `${path}.measurementValid`);
  unit(value.confidence, `${path}.confidence`);
  if (value.materialRotationTracked !== false) {
    throw new Error(`${path}.materialRotationTracked must be false`);
  }
  nullableVec3(value.centerM, `${path}.centerM`);
  nullableVec3(value.velocityMps, `${path}.velocityMps`);

  if (value.shape !== null) {
    if (!isRecord(value.shape)) {
      throw new Error(`${path}.shape must be an object or null`);
    }
    if (!isRecord(value.shape.radiiM)) {
      throw new Error(`${path}.shape.radiiM must be an object`);
    }
    for (const axis of ["x", "y", "z"] as const) {
      finite(value.shape.radiiM[axis], `${path}.shape.radiiM.${axis}`);
      if ((value.shape.radiiM[axis] as number) <= 0) {
        throw new Error(`${path}.shape.radiiM.${axis} must be positive`);
      }
    }
    finite(value.shape.principalAxisDeg, `${path}.shape.principalAxisDeg`);
    unit(value.shape.wobble, `${path}.shape.wobble`);
    nonNegative(value.shape.deformationRate, `${path}.shape.deformationRate`);
    finite(value.shape.volumeProxy, `${path}.shape.volumeProxy`);
    if ((value.shape.volumeProxy as number) <= 0) {
      throw new Error(`${path}.shape.volumeProxy must be positive`);
    }
  }

  if (value.prediction !== null) {
    if (!isRecord(value.prediction)) {
      throw new Error(`${path}.prediction must be an object or null`);
    }
    vec3(value.prediction.predictedCenterM, `${path}.prediction.predictedCenterM`);
    vec3(value.prediction.residualM, `${path}.prediction.residualM`);
    nonNegative(value.prediction.horizonMs, `${path}.prediction.horizonMs`);
    unit(value.prediction.confidence, `${path}.prediction.confidence`);
    if (!["constant-velocity", "authored", "disabled"].includes(value.prediction.model as string)) {
      throw new Error(`${path}.prediction.model is unsupported`);
    }
  }

  if (!isRecord(value.diagnostics)) {
    throw new Error(`${path}.diagnostics must be an object`);
  }
  nonNegative(value.diagnostics.sourceAgeMs, `${path}.diagnostics.sourceAgeMs`);
  nonNegative(value.diagnostics.processingMs, `${path}.diagnostics.processingMs`);
  if (
    !Number.isInteger(value.diagnostics.droppedFrames) ||
    (value.diagnostics.droppedFrames as number) < 0
  ) {
    throw new Error(`${path}.diagnostics.droppedFrames must be a non-negative integer`);
  }
  if (
    !Number.isInteger(value.diagnostics.activeCameraCount) ||
    (value.diagnostics.activeCameraCount as number) < 0
  ) {
    throw new Error(`${path}.diagnostics.activeCameraCount must be a non-negative integer`);
  }
  if (
    !Array.isArray(value.diagnostics.flags) ||
    !value.diagnostics.flags.every((flag) => typeof flag === "string")
  ) {
    throw new Error(`${path}.diagnostics.flags must be an array of strings`);
  }
}

function validateAudiovisual(
  value: unknown,
  path: string,
): asserts value is AudiovisualParameters {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  for (const key of PARAMETER_KEYS) {
    unit(value[key], `${path}.${key}`);
  }
}

function validateFanTelemetry(
  value: unknown,
  path: string,
): asserts value is FanTelemetry {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (value.simulated !== true) {
    throw new Error(`${path}.simulated must be true`);
  }
  if (value.hardwareWriteEnabled !== false) {
    throw new Error(`${path}.hardwareWriteEnabled must be false`);
  }
  unit(value.requestedCue, `${path}.requestedCue`);
  unit(value.acceptedCue, `${path}.acceptedCue`);
  unit(value.actualNormalized, `${path}.actualNormalized`);
  boolean(value.controllerHealthy, `${path}.controllerHealthy`);
  if (value.fault !== null && typeof value.fault !== "string") {
    throw new Error(`${path}.fault must be a string or null`);
  }
}

function validateCueState(value: unknown, path: string): asserts value is CueState {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (value.schemaVersion !== CUE_STATE_SCHEMA_VERSION) {
    throw new Error(`${path}.schemaVersion is unsupported`);
  }
  nonNegative(value.emittedAtMonotonicS, `${path}.emittedAtMonotonicS`);
  nonNegative(value.showTimeS, `${path}.showTimeS`);
  if (!isRecord(value.movement)) {
    throw new Error(`${path}.movement must be an object`);
  }
  string(value.movement.id, `${path}.movement.id`);
  unit(value.movement.progress, `${path}.movement.progress`);
  validateAudiovisual(value.audiovisual, `${path}.audiovisual`);
  if (
    !Array.isArray(value.quadLevels) ||
    value.quadLevels.length !== 4
  ) {
    throw new Error(`${path}.quadLevels must contain four levels`);
  }
  value.quadLevels.forEach((level, index) => unit(level, `${path}.quadLevels[${index}]`));
  if (value.projectorLevels !== undefined) {
    if (!Array.isArray(value.projectorLevels) || value.projectorLevels.length !== 5) {
      throw new Error(`${path}.projectorLevels must contain five levels`);
    }
    value.projectorLevels.forEach((level, index) =>
      unit(level, `${path}.projectorLevels[${index}]`),
    );
  }
  unit(value.fanCue, `${path}.fanCue`);
  validateFanTelemetry(value.fanTelemetry, `${path}.fanTelemetry`);
  validateWorldState(value.world, `${path}.world`);
}

function cloneState(state: CueState): CueState {
  return JSON.parse(JSON.stringify(state)) as CueState;
}

export function parseCueStreamJsonl(source: string): CueState[] {
  if (typeof source !== "string") {
    throw new Error("Cue stream must be text");
  }
  const states: CueState[] = [];
  let previousTimestampS: number | null = null;
  for (const [lineIndex, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    if (states.length >= MAX_REPLAY_FRAMES) {
      throw new Error(`Cue stream exceeds ${MAX_REPLAY_FRAMES} frames`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Cue stream line ${lineIndex + 1} is not valid JSON`);
    }
    const path = `cue stream line ${lineIndex + 1}`;
    try {
      validateCueState(parsed, path);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : `${path} is invalid`,
      );
    }
    if (
      previousTimestampS !== null &&
      parsed.emittedAtMonotonicS < previousTimestampS - TIME_EPSILON_S
    ) {
      throw new Error(
        `${path}.emittedAtMonotonicS must not move backwards`,
      );
    }
    previousTimestampS = parsed.emittedAtMonotonicS;
    const normalised = parsed.projectorLevels
      ? parsed
      : {
          ...parsed,
          projectorLevels: calculateProjectorLevels(
            parsed.world,
            parsed.audiovisual,
          ),
        };
    states.push(cloneState(normalised));
  }
  if (states.length === 0) {
    throw new Error("Cue stream contains no frames");
  }
  return states;
}

export function cueStateToRuntimeSnapshot(
  state: CueState,
  score: ShowScore,
): RuntimeSnapshot {
  const fallback = sampleShowScore(score, state.showTimeS);
  const movement =
    score.movements.find((candidate) => candidate.id === state.movement.id) ??
    fallback.movement;
  const projectorLevels =
    state.projectorLevels ??
    calculateProjectorLevels(state.world, state.audiovisual);
  return {
    world: cloneState(state).world,
    showTimeS: state.showTimeS,
    movement,
    movementProgress: clamp(state.movement.progress),
    audiovisual: { ...state.audiovisual },
    quadLevels: [
      state.quadLevels[0],
      state.quadLevels[1],
      state.quadLevels[2],
      state.quadLevels[3],
    ],
    projectorLevels: [
      projectorLevels[0],
      projectorLevels[1],
      projectorLevels[2],
      projectorLevels[3],
      projectorLevels[4],
    ],
    fan: { ...state.fanTelemetry },
  };
}

export interface CueStreamPlayerOptions {
  loop?: boolean;
}

export class CueStreamPlayer {
  private readonly states: CueState[];
  private readonly firstTimestampS: number;
  private readonly duration: number;
  private readonly loop: boolean;
  private position = 0;
  private isPlaying = false;
  private rate = 1;

  constructor(states: readonly CueState[], options: CueStreamPlayerOptions = {}) {
    if (states.length === 0) {
      throw new Error("Cue stream player requires at least one frame");
    }
    this.states = states.map((state, index) => {
      validateCueState(state, `cue stream frame ${index + 1}`);
      return cloneState({
        ...state,
        projectorLevels:
          state.projectorLevels ??
          calculateProjectorLevels(state.world, state.audiovisual),
      });
    });
    this.firstTimestampS = this.states[0].emittedAtMonotonicS;
    for (const [index, state] of this.states.entries()) {
      const previous = this.states[index - 1];
      if (
        previous &&
        state.emittedAtMonotonicS <
          previous.emittedAtMonotonicS - TIME_EPSILON_S
      ) {
        throw new Error("Cue stream timestamps must not move backwards");
      }
    }
    this.duration = Math.max(
      0,
      this.states[this.states.length - 1].emittedAtMonotonicS -
        this.firstTimestampS,
    );
    this.loop = options.loop ?? false;
  }

  get frameCount(): number {
    return this.states.length;
  }

  get durationS(): number {
    return this.duration;
  }

  get positionS(): number {
    return this.position;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get playbackRate(): number {
    return this.rate;
  }

  get currentState(): CueState {
    return this.sampleAt(this.position);
  }

  setPlaying(playing: boolean): void {
    this.isPlaying = playing && (this.duration > 0 || this.states.length > 0);
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0.05 || rate > 60) {
      throw new Error("Cue playback rate must be between 0.05 and 60");
    }
    this.rate = rate;
  }

  seek(positionS: number): void {
    if (!Number.isFinite(positionS)) {
      throw new Error("Cue position must be finite");
    }
    this.position = clamp(positionS, 0, this.duration);
  }

  reset(): void {
    this.position = 0;
    this.isPlaying = false;
    this.rate = 1;
  }

  advance(deltaS: number): void {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("Cue deltaS must be a finite non-negative number");
    }
    if (!this.isPlaying || this.duration <= 0) {
      if (this.duration <= 0) {
        this.isPlaying = false;
      }
      return;
    }
    const next = this.position + deltaS * this.rate;
    if (next < this.duration) {
      this.position = next;
      return;
    }
    if (this.loop) {
      this.position = next % this.duration;
    } else {
      this.position = this.duration;
      this.isPlaying = false;
    }
  }

  private sampleAt(positionS: number): CueState {
    if (positionS <= 0 || this.states.length === 1) {
      return cloneState(this.states[0]);
    }
    const targetTimestampS = this.firstTimestampS + positionS;
    let low = 0;
    let high = this.states.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.states[middle].emittedAtMonotonicS <= targetTimestampS) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return cloneState(this.states[low]);
  }
}
