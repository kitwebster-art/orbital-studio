import { FanSafetySimulator } from "../adapters/FanSafetySimulator";
import { SyntheticTrackingAdapter } from "../adapters/SyntheticTrackingAdapter";
import type {
  AudiovisualParameters,
  FanTelemetryAdapter,
  PredictionState,
  ProjectionOutputAdapter,
  RuntimeMode,
  RuntimeSnapshot,
  ShowScore,
  TrackingAdapter,
  Vec3,
  WorldState,
} from "./contracts";
import {
  addVec3,
  clamp,
  lerp,
  scaleVec3,
  subtractVec3,
} from "./math";
import {
  loadShowScore,
  normaliseShowTime,
  sampleShowScore,
} from "./showScore";
import { calculateProjectorLevels } from "./projectionRig";

export const QUAD_LEVEL_ORDER = [
  "front-left",
  "front-right",
  "rear-left",
  "rear-right",
] as const;

export interface RuntimeEngineOptions {
  score?: ShowScore;
  trackingAdapter?: TrackingAdapter;
  fanAdapter?: FanTelemetryAdapter;
  projectionOutput?: ProjectionOutputAdapter;
  autoplay?: boolean;
  predictionHorizonMs?: number;
}

interface Forecast {
  targetTimeS: number;
  centerM: Vec3;
  confidence: number;
}

const ZERO_VEC3: Vec3 = {
  x: 0,
  y: 0,
  z: 0,
};

function uniqueFlags(flags: readonly string[]): string[] {
  return [...new Set(flags)];
}

function trackingFallback(
  parameters: AudiovisualParameters,
): AudiovisualParameters {
  return {
    energy: Math.min(parameters.energy, 0.16),
    brightness: Math.min(parameters.brightness, 0.055),
    visualDensity: Math.min(parameters.visualDensity, 0.07),
    fluidity: 0.32,
    fracture: 0,
    glitch: 0,
    organic: Math.min(parameters.organic, 0.22),
    melody: 0,
    sub: Math.min(parameters.sub, 0.28),
    spatialMotion: 0,
    residualGain: 0,
    predictionVisibility: 0,
    // The authored cue remains telemetry only. A future independent safety
    // controller, never this runtime, owns any physical fan response.
    fanCue: parameters.fanCue,
  };
}

export class RuntimeEngine {
  showScore: ShowScore;

  private readonly fanAdapter: FanTelemetryAdapter;
  private readonly projectionOutput: ProjectionOutputAdapter | null;
  private readonly predictionHorizonMs: number;
  private trackingAdapter: TrackingAdapter;
  private forecasts: Forecast[] = [];
  private timeS = 0;
  private isPlaying: boolean;
  private rate = 1;
  private injectedTrackingLoss = false;
  private predictionEnabled = true;
  private fanCueOverride: number | null = null;

  constructor(options: RuntimeEngineOptions = {}) {
    this.showScore = loadShowScore(options.score);
    this.trackingAdapter =
      options.trackingAdapter ?? new SyntheticTrackingAdapter();
    this.fanAdapter = options.fanAdapter ?? new FanSafetySimulator();
    this.projectionOutput = options.projectionOutput ?? null;
    this.isPlaying = options.autoplay ?? true;
    this.predictionHorizonMs = options.predictionHorizonMs ?? 120;

    if (
      !Number.isFinite(this.predictionHorizonMs) ||
      this.predictionHorizonMs < 0 ||
      this.predictionHorizonMs > 1000
    ) {
      throw new Error("predictionHorizonMs must be between 0 and 1000");
    }
  }

  get currentTimeS(): number {
    return this.timeS;
  }

  get durationS(): number {
    return this.showScore.durationS;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get playbackRate(): number {
    return this.rate;
  }

  get mode(): RuntimeMode {
    return this.trackingAdapter.mode;
  }

  tick(deltaS: number): RuntimeSnapshot {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("deltaS must be a finite non-negative number");
    }

    const previousTimeS = this.timeS;
    if (this.isPlaying) {
      const nextTimeS = this.timeS + deltaS * this.rate;
      if (this.showScore.loop) {
        this.timeS = normaliseShowTime(this.showScore, nextTimeS);
        if (nextTimeS >= this.durationS || this.timeS < previousTimeS) {
          this.resetPredictor();
        }
      } else {
        this.timeS = clamp(nextTimeS, 0, this.durationS);
        if (this.timeS >= this.durationS) {
          this.isPlaying = false;
        }
      }
    }

    const scoreSample = sampleShowScore(this.showScore, this.timeS);
    const adapterState = this.trackingAdapter.sample(
      this.timeS,
      this.isPlaying ? deltaS * this.rate : 0,
    );
    const lossAppliedState = this.injectedTrackingLoss
      ? this.applyInjectedTrackingLoss(adapterState)
      : adapterState;
    const world = this.addPrediction(lossAppliedState);
    const baseAudiovisual = world.stateValid
      ? scoreSample.audiovisual
      : trackingFallback(scoreSample.audiovisual);
    const audiovisual = this.fanCueOverride === null
      ? baseAudiovisual
      : { ...baseAudiovisual, fanCue: this.fanCueOverride };
    const fan = this.fanAdapter.update(audiovisual.fanCue, deltaS);
    const snapshot: RuntimeSnapshot = {
      world,
      showTimeS: scoreSample.showTimeS,
      movement: scoreSample.movement,
      movementProgress: scoreSample.movementProgress,
      audiovisual,
      quadLevels: this.calculateQuadLevels(world, audiovisual),
      projectorLevels: calculateProjectorLevels(world, audiovisual),
      fan,
    };

    this.projectionOutput?.publish(snapshot);
    return snapshot;
  }

  seek(timeS: number): void {
    if (!Number.isFinite(timeS)) {
      throw new Error("timeS must be finite");
    }
    const bounded = clamp(timeS, 0, this.durationS);
    this.timeS =
      this.showScore.loop && bounded === this.durationS ? 0 : bounded;
    this.resetPredictor();
  }

  setPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }

  setPlaybackRate(playbackRate: number): void {
    if (
      !Number.isFinite(playbackRate) ||
      playbackRate < 0.05 ||
      playbackRate > 60
    ) {
      throw new Error("playbackRate must be between 0.05 and 60");
    }
    this.rate = playbackRate;
  }

  setTrackingAdapter(adapter: TrackingAdapter): void {
    this.trackingAdapter = adapter;
    this.trackingAdapter.reset();
    this.resetPredictor();
  }

  setShowScore(score: ShowScore): void {
    const previousTimeS = this.timeS;
    this.showScore = loadShowScore(score);
    this.timeS = this.showScore.loop
      ? normaliseShowTime(this.showScore, previousTimeS)
      : clamp(previousTimeS, 0, this.showScore.durationS);
    this.resetPredictor();
  }

  setInjectedTrackingLoss(injected: boolean): void {
    this.injectedTrackingLoss = injected;
    this.resetPredictor();
  }

  setFanFault(fault: string | null): void {
    this.fanAdapter.setFault(fault);
  }

  setFanCueOverride(cue: number | null): void {
    if (cue !== null && (!Number.isFinite(cue) || cue < 0 || cue > 1)) {
      throw new Error("fan cue override must be null or between 0 and 1");
    }
    this.fanCueOverride = cue;
  }

  setPredictionEnabled(enabled: boolean): void {
    this.predictionEnabled = enabled;
    this.resetPredictor();
  }

  reset(): void {
    this.timeS = 0;
    this.isPlaying = false;
    this.rate = 1;
    this.injectedTrackingLoss = false;
    this.predictionEnabled = true;
    this.fanCueOverride = null;
    this.trackingAdapter.reset();
    this.fanAdapter.reset();
    this.resetPredictor();
  }

  private applyInjectedTrackingLoss(world: WorldState): WorldState {
    return {
      ...world,
      status: "lost",
      stateValid: false,
      measurementValid: false,
      confidence: 0,
      centerM: null,
      velocityMps: null,
      shape: null,
      prediction: null,
      diagnostics: {
        ...world.diagnostics,
        flags: uniqueFlags([
          ...world.diagnostics.flags,
          "INJECTED_TRACKING_LOSS",
          "AUTHORED_NEUTRAL_FALLBACK",
        ]),
      },
    };
  }

  private addPrediction(world: WorldState): WorldState {
    if (
      !world.stateValid ||
      !world.centerM ||
      !world.velocityMps
    ) {
      this.resetPredictor();
      return {
        ...world,
        prediction: null,
      };
    }

    if (!this.predictionEnabled) {
      const prediction: PredictionState = {
        predictedCenterM: { ...world.centerM },
        residualM: { ...ZERO_VEC3 },
        horizonMs: 0,
        confidence: 0,
        model: "disabled",
      };
      return {
        ...world,
        prediction,
        diagnostics: {
          ...world.diagnostics,
          flags: uniqueFlags([
            ...world.diagnostics.flags,
            "PREDICTION_DISABLED",
            "AUTHORED_SCORE_ONLY",
          ]),
        },
      };
    }

    const horizonS = this.predictionHorizonMs / 1000;
    const currentTimeS = world.monotonicTimeS;
    let matured: Forecast | null = null;
    while (
      this.forecasts.length > 0 &&
      this.forecasts[0].targetTimeS <= currentTimeS + 1e-9
    ) {
      matured = this.forecasts.shift() ?? null;
    }
    const predictedCenterM = addVec3(
      world.centerM,
      scaleVec3(world.velocityMps, horizonS),
    );
    const lastForecast = this.forecasts[this.forecasts.length - 1];
    const targetTimeS = currentTimeS + horizonS;
    if (
      !lastForecast ||
      Math.abs(lastForecast.targetTimeS - targetTimeS) > 1e-9
    ) {
      this.forecasts.push({
        targetTimeS,
        centerM: predictedCenterM,
        confidence: world.confidence,
      });
    }
    if (this.forecasts.length > 240) {
      this.forecasts.splice(0, this.forecasts.length - 240);
    }

    const residualM = matured
      ? subtractVec3(world.centerM, matured.centerM)
      : { ...ZERO_VEC3 };
    const confidence = clamp(
      matured
        ? Math.sqrt(world.confidence * matured.confidence)
        : world.confidence * 0.55,
    );
    const prediction: PredictionState = {
      predictedCenterM,
      residualM,
      horizonMs: this.predictionHorizonMs,
      confidence,
      model: "constant-velocity",
    };

    return {
      ...world,
      prediction,
      diagnostics: {
        ...world.diagnostics,
        flags: uniqueFlags([
          ...world.diagnostics.flags,
          "CONSTANT_VELOCITY_ARTISTIC_PREDICTION",
          matured
            ? "MATURED_FORECAST_RESIDUAL"
            : "PREDICTION_WARMING_UP",
        ]),
      },
    };
  }

  private calculateQuadLevels(
    world: WorldState,
    audiovisual: AudiovisualParameters,
  ): [number, number, number, number] {
    if (!world.stateValid || !world.centerM) {
      const neutral = clamp(audiovisual.energy * 0.35);
      return [neutral, neutral, neutral, neutral];
    }

    const x = clamp(world.centerM.x / 0.65, -1, 1);
    const z = clamp(world.centerM.z / 0.65, -1, 1);
    const left = (1 - x) / 2;
    const right = (1 + x) / 2;
    const front = (1 - z) / 2;
    const rear = (1 + z) / 2;
    const directional = [
      Math.sqrt(left * front),
      Math.sqrt(right * front),
      Math.sqrt(left * rear),
      Math.sqrt(right * rear),
    ] as const;
    const amplitude = clamp(0.2 + audiovisual.energy * 0.8);
    const spatialAmount = audiovisual.spatialMotion;

    return directional.map((level) =>
      clamp(lerp(0.5, level, spatialAmount) * amplitude),
    ) as [number, number, number, number];
  }

  private resetPredictor(): void {
    this.forecasts = [];
  }
}
