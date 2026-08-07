export const WORLD_STATE_SCHEMA_VERSION = "orbital.world-state/1.0" as const;
export const SHOW_SCORE_SCHEMA_VERSION = "orbital.show-score/1.0" as const;

export type RuntimeMode = "simulation" | "replay" | "live";
export type TrackingStatus =
  | "acquiring"
  | "tracking"
  | "degraded"
  | "lost"
  | "unavailable";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ShapeState {
  radiiM: Vec3;
  principalAxisDeg: number;
  wobble: number;
  deformationRate: number;
  volumeProxy: number;
}

export interface PredictionState {
  predictedCenterM: Vec3;
  residualM: Vec3;
  horizonMs: number;
  confidence: number;
  model: "constant-velocity" | "authored" | "disabled";
}

export interface TrackingDiagnostics {
  sourceAgeMs: number;
  processingMs: number;
  droppedFrames: number;
  activeCameraCount: number;
  flags: string[];
}

export interface WorldState {
  schemaVersion: typeof WORLD_STATE_SCHEMA_VERSION;
  sequence: number;
  mode: RuntimeMode;
  monotonicTimeS: number;
  status: TrackingStatus;
  stateValid: boolean;
  measurementValid: boolean;
  confidence: number;
  centerM: Vec3 | null;
  velocityMps: Vec3 | null;
  shape: ShapeState | null;
  prediction: PredictionState | null;
  diagnostics: TrackingDiagnostics;
  materialRotationTracked: false;
}

export interface AudiovisualParameters {
  energy: number;
  brightness: number;
  visualDensity: number;
  fluidity: number;
  fracture: number;
  glitch: number;
  organic: number;
  melody: number;
  sub: number;
  spatialMotion: number;
  residualGain: number;
  predictionVisibility: number;
  fanCue: number;
}

export interface ShowMovement {
  id: string;
  name: string;
  startS: number;
  durationS: number;
  majorPeak: boolean;
  description: string;
  start: AudiovisualParameters;
  end: AudiovisualParameters;
  localPeak?: Partial<AudiovisualParameters> & {
    at: number;
  };
}

export interface ShowScore {
  schemaVersion: typeof SHOW_SCORE_SCHEMA_VERSION;
  title: string;
  durationS: number;
  loop: boolean;
  movements: ShowMovement[];
}

export interface RuntimeSnapshot {
  world: WorldState;
  showTimeS: number;
  movement: ShowMovement;
  movementProgress: number;
  audiovisual: AudiovisualParameters;
  quadLevels: [number, number, number, number];
  projectorLevels: [number, number, number, number, number];
  fan: FanTelemetry;
}

export interface FanTelemetry {
  simulated: true;
  hardwareWriteEnabled: false;
  requestedCue: number;
  acceptedCue: number;
  actualNormalized: number;
  controllerHealthy: boolean;
  fault: string | null;
}

export interface TrackingAdapter {
  readonly mode: RuntimeMode;
  readonly label: string;
  sample(timeS: number, deltaS: number): WorldState;
  reset(): void;
}

export interface AudioPreviewAdapter {
  readonly enabled: boolean;
  enable(): Promise<void>;
  disable(): void;
  update(snapshot: RuntimeSnapshot): void;
}

export interface FanTelemetryAdapter {
  update(requestedCue: number, deltaS: number): FanTelemetry;
  setFault(fault: string | null): void;
  reset(): void;
}

export interface ProjectionOutputAdapter {
  readonly label: string;
  readonly available: boolean;
  publish(snapshot: RuntimeSnapshot): void;
}
