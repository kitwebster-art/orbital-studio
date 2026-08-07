import type {
  AudiovisualParameters,
  FanTelemetry,
  RuntimeSnapshot,
  WorldState,
} from "./contracts";
import { clamp } from "./math";
import type { ProjectorLevels } from "./projectionRig";

export const CUE_STATE_SCHEMA_VERSION = "orbital.cue-state/1.0" as const;

export interface CueState {
  schemaVersion: typeof CUE_STATE_SCHEMA_VERSION;
  emittedAtMonotonicS: number;
  showTimeS: number;
  movement: {
    id: string;
    progress: number;
  };
  audiovisual: AudiovisualParameters;
  quadLevels: [number, number, number, number];
  projectorLevels: ProjectorLevels;
  fanCue: number;
  fanTelemetry: FanTelemetry;
  world: WorldState;
}

export interface CueStreamRecorderOptions {
  sampleIntervalS?: number;
  maxFrames?: number;
}

const DEFAULT_SAMPLE_INTERVAL_S = 1 / 20;
const DEFAULT_MAX_FRAMES = 120_000;
const TIME_EPSILON_S = 1e-9;

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function cloneWorld(world: WorldState): WorldState {
  return {
    ...world,
    centerM: world.centerM ? { ...world.centerM } : null,
    velocityMps: world.velocityMps ? { ...world.velocityMps } : null,
    shape: world.shape
      ? {
          ...world.shape,
          radiiM: { ...world.shape.radiiM },
        }
      : null,
    prediction: world.prediction
      ? {
          ...world.prediction,
          predictedCenterM: { ...world.prediction.predictedCenterM },
          residualM: { ...world.prediction.residualM },
        }
      : null,
    diagnostics: {
      ...world.diagnostics,
      flags: [...world.diagnostics.flags],
    },
  };
}

function cloneFanTelemetry(fan: FanTelemetry): FanTelemetry {
  return { ...fan };
}

/**
 * Convert one runtime frame into the platform-neutral line format.
 * The default timestamp is the runtime source clock. The live loop passes its
 * own performance clock so a seek or score loop cannot make bridge time go
 * backwards.
 */
export function toCueState(
  snapshot: RuntimeSnapshot,
  emittedAtMonotonicS = snapshot.world.monotonicTimeS,
): CueState {
  assertFiniteNonNegative(emittedAtMonotonicS, "emittedAtMonotonicS");
  assertFiniteNonNegative(snapshot.showTimeS, "showTimeS");

  return {
    schemaVersion: CUE_STATE_SCHEMA_VERSION,
    emittedAtMonotonicS,
    showTimeS: snapshot.showTimeS,
    movement: {
      id: snapshot.movement.id,
      progress: clamp(snapshot.movementProgress),
    },
    audiovisual: { ...snapshot.audiovisual },
    quadLevels: [
      clamp(snapshot.quadLevels[0]),
      clamp(snapshot.quadLevels[1]),
      clamp(snapshot.quadLevels[2]),
      clamp(snapshot.quadLevels[3]),
    ],
    projectorLevels: [
      clamp(snapshot.projectorLevels[0]),
      clamp(snapshot.projectorLevels[1]),
      clamp(snapshot.projectorLevels[2]),
      clamp(snapshot.projectorLevels[3]),
      clamp(snapshot.projectorLevels[4]),
    ],
    fanCue: clamp(snapshot.audiovisual.fanCue),
    fanTelemetry: cloneFanTelemetry(snapshot.fan),
    world: cloneWorld(snapshot.world),
  };
}

export class CueStreamRecorder {
  private readonly sampleIntervalS: number;
  private readonly maxFrames: number;
  private recordedStates: CueState[] = [];
  private lastEmittedAtMonotonicS: number | null = null;
  private recordedElapsedS = 0;
  private isRecording = false;

  constructor(options: CueStreamRecorderOptions = {}) {
    this.sampleIntervalS = options.sampleIntervalS ?? DEFAULT_SAMPLE_INTERVAL_S;
    this.maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;

    if (!Number.isFinite(this.sampleIntervalS) || this.sampleIntervalS <= 0) {
      throw new Error("sampleIntervalS must be a finite positive number");
    }
    if (
      !Number.isInteger(this.maxFrames) ||
      this.maxFrames <= 0
    ) {
      throw new Error("maxFrames must be a positive integer");
    }
  }

  get recording(): boolean {
    return this.isRecording;
  }

  get frameCount(): number {
    return this.recordedStates.length;
  }

  get elapsedS(): number {
    return this.recordedElapsedS;
  }

  get states(): readonly CueState[] {
    return this.recordedStates;
  }

  start(): void {
    this.clear();
    this.isRecording = true;
  }

  stop(): void {
    this.isRecording = false;
  }

  clear(): void {
    this.recordedStates = [];
    this.lastEmittedAtMonotonicS = null;
    this.recordedElapsedS = 0;
  }

  capture(
    snapshot: RuntimeSnapshot,
    emittedAtMonotonicS = snapshot.world.monotonicTimeS,
  ): boolean {
    if (!this.isRecording || this.frameCount >= this.maxFrames) {
      return false;
    }

    assertFiniteNonNegative(emittedAtMonotonicS, "emittedAtMonotonicS");
    if (this.lastEmittedAtMonotonicS !== null) {
      const deltaS = emittedAtMonotonicS - this.lastEmittedAtMonotonicS;
      if (deltaS < -TIME_EPSILON_S) {
        // Seeking or looping changes the show clock, but must not corrupt the
        // bridge clock. Start a fresh interval from the new timestamp.
        this.lastEmittedAtMonotonicS = null;
      } else if (deltaS + TIME_EPSILON_S < this.sampleIntervalS) {
        return false;
      }
    }

    if (this.lastEmittedAtMonotonicS !== null) {
      this.recordedElapsedS += Math.max(
        0,
        emittedAtMonotonicS - this.lastEmittedAtMonotonicS,
      );
    }
    this.recordedStates.push(toCueState(snapshot, emittedAtMonotonicS));
    this.lastEmittedAtMonotonicS = emittedAtMonotonicS;
    if (this.frameCount >= this.maxFrames) {
      this.isRecording = false;
    }
    return true;
  }

  serialise(): string {
    return this.recordedStates.length > 0
      ? `${this.recordedStates.map((state) => JSON.stringify(state)).join("\n")}\n`
      : "";
  }
}
