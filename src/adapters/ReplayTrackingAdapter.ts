import {
  WORLD_STATE_SCHEMA_VERSION,
  type ShapeState,
  type TrackingAdapter,
  type TrackingStatus,
  type Vec3,
  type WorldState,
} from "../core/contracts";
import { clamp, lerp, lerpVec3 } from "../core/math";

type Pair = [number, number];

export interface TrackerReplayFrame {
  schema_version: "orbital.tracking-state/1.0";
  sequence: number;
  source_mode: "simulate" | "replay" | "live";
  source_uri: string;
  clock_domain?: "source-relative" | "monotonic";
  capture_timestamp_ns?: number;
  source_time_s: number;
  valid_until_timestamp_ns?: number;
  status: TrackingStatus;
  measurement_valid: boolean;
  state_valid: boolean;
  confidence: number;
  frame: {
    width_px: number;
    height_px: number;
  };
  geometry: {
    center_norm: Pair;
    ellipse: {
      major_diameter_px: number;
      minor_diameter_px: number;
      angle_deg: number;
    };
    gross_deformation: {
      squash_stretch: number;
    };
  } | null;
  velocity: {
    norm_per_s: Pair;
  } | null;
  material_rotation_tracked: false;
  flags: string[];
  timing?: {
    received_timestamp_ns: number;
    processing_completed_timestamp_ns: number;
    processing_latency_ms: number;
  };
}

export interface ReplayTrackingOptions {
  loop?: boolean;
  nominalRadiusM?: number;
  horizontalPreviewSpanM?: number;
  verticalPreviewSpanM?: number;
  previewCenterM?: Vec3;
}

interface MappedReplayState {
  centerM: Vec3;
  velocityMps: Vec3;
  shape: ShapeState;
}

const DEFAULT_PREVIEW_CENTER: Vec3 = {
  x: 0,
  y: 3.35,
  z: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
}

function assertPair(value: unknown, path: string): asserts value is Pair {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${path} must be a two-number array`);
  }
  assertFiniteNumber(value[0], `${path}[0]`);
  assertFiniteNumber(value[1], `${path}[1]`);
}

export function parseTrackerFrame(value: unknown, path = "frame"): TrackerReplayFrame {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (value.schema_version !== "orbital.tracking-state/1.0") {
    throw new Error(`${path}.schema_version is unsupported`);
  }
  assertFiniteNumber(value.sequence, `${path}.sequence`);
  if (!Number.isInteger(value.sequence) || value.sequence < 0) {
    throw new Error(`${path}.sequence must be a non-negative integer`);
  }
  if (
    value.source_mode !== "simulate" &&
    value.source_mode !== "replay" &&
    value.source_mode !== "live"
  ) {
    throw new Error(`${path}.source_mode is unsupported`);
  }
  if (typeof value.source_uri !== "string") {
    throw new Error(`${path}.source_uri must be a string`);
  }
  assertFiniteNumber(value.source_time_s, `${path}.source_time_s`);
  if (value.source_time_s < 0) {
    throw new Error(`${path}.source_time_s must be non-negative`);
  }
  if (
    value.status !== "acquiring" &&
    value.status !== "tracking" &&
    value.status !== "degraded" &&
    value.status !== "lost" &&
    value.status !== "unavailable"
  ) {
    throw new Error(`${path}.status is unsupported`);
  }
  if (
    typeof value.measurement_valid !== "boolean" ||
    typeof value.state_valid !== "boolean"
  ) {
    throw new Error(`${path} validity fields must be booleans`);
  }
  assertFiniteNumber(value.confidence, `${path}.confidence`);
  if (value.confidence < 0 || value.confidence > 1) {
    throw new Error(`${path}.confidence must be between 0 and 1`);
  }
  if (!isRecord(value.frame)) {
    throw new Error(`${path}.frame must be an object`);
  }
  assertFiniteNumber(value.frame.width_px, `${path}.frame.width_px`);
  assertFiniteNumber(value.frame.height_px, `${path}.frame.height_px`);
  if (value.frame.width_px <= 0 || value.frame.height_px <= 0) {
    throw new Error(`${path}.frame dimensions must be positive`);
  }

  if (value.geometry !== null) {
    if (!isRecord(value.geometry)) {
      throw new Error(`${path}.geometry must be an object or null`);
    }
    assertPair(value.geometry.center_norm, `${path}.geometry.center_norm`);
    if (
      !isRecord(value.geometry.ellipse) ||
      !isRecord(value.geometry.gross_deformation)
    ) {
      throw new Error(`${path}.geometry ellipse and deformation are required`);
    }
    assertFiniteNumber(
      value.geometry.ellipse.major_diameter_px,
      `${path}.geometry.ellipse.major_diameter_px`,
    );
    assertFiniteNumber(
      value.geometry.ellipse.minor_diameter_px,
      `${path}.geometry.ellipse.minor_diameter_px`,
    );
    assertFiniteNumber(
      value.geometry.ellipse.angle_deg,
      `${path}.geometry.ellipse.angle_deg`,
    );
    assertFiniteNumber(
      value.geometry.gross_deformation.squash_stretch,
      `${path}.geometry.gross_deformation.squash_stretch`,
    );
    if (
      value.geometry.ellipse.major_diameter_px <= 0 ||
      value.geometry.ellipse.minor_diameter_px <= 0
    ) {
      throw new Error(`${path}.geometry ellipse diameters must be positive`);
    }
  }

  if (value.velocity !== null) {
    if (!isRecord(value.velocity)) {
      throw new Error(`${path}.velocity must be an object or null`);
    }
    assertPair(value.velocity.norm_per_s, `${path}.velocity.norm_per_s`);
  }
  if (value.material_rotation_tracked !== false) {
    throw new Error(`${path}.material_rotation_tracked must be false`);
  }
  if (
    !Array.isArray(value.flags) ||
    !value.flags.every((flag) => typeof flag === "string")
  ) {
    throw new Error(`${path}.flags must be an array of strings`);
  }
  if (value.timing !== undefined) {
    if (!isRecord(value.timing)) {
      throw new Error(`${path}.timing must be an object`);
    }
    assertFiniteNumber(
      value.timing.received_timestamp_ns,
      `${path}.timing.received_timestamp_ns`,
    );
    assertFiniteNumber(
      value.timing.processing_completed_timestamp_ns,
      `${path}.timing.processing_completed_timestamp_ns`,
    );
    assertFiniteNumber(
      value.timing.processing_latency_ms,
      `${path}.timing.processing_latency_ms`,
    );
    if (
      value.timing.received_timestamp_ns < 0 ||
      value.timing.processing_completed_timestamp_ns < 0 ||
      value.timing.processing_latency_ms < 0
    ) {
      throw new Error(`${path}.timing values must be non-negative`);
    }
  }

  return value as unknown as TrackerReplayFrame;
}

export function parseTrackerJsonl(jsonl: string): TrackerReplayFrame[] {
  if (typeof jsonl !== "string") {
    throw new Error("Tracker JSONL input must be a string");
  }
  const frames: TrackerReplayFrame[] = [];
  for (const [index, line] of jsonl.split(/\r?\n/u).entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Tracker JSONL line ${index + 1} is not valid JSON`);
    }
    frames.push(parseTrackerFrame(value, `line ${index + 1}`));
  }
  if (frames.length === 0) {
    throw new Error("Tracker JSONL contains no frames");
  }
  return frames;
}

function prepareFrames(
  source: string | readonly unknown[],
): TrackerReplayFrame[] {
  const frames =
    typeof source === "string"
      ? parseTrackerJsonl(source)
      : source.map((frame, index) =>
          parseTrackerFrame(frame, `frames[${index}]`),
        );
  if (frames.length === 0) {
    throw new Error("Replay source contains no frames");
  }
  const sorted = [...frames].sort(
    (left, right) => left.source_time_s - right.source_time_s,
  );
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].source_time_s <= sorted[index - 1].source_time_s) {
      throw new Error("Replay frame source_time_s values must be unique");
    }
  }
  return sorted;
}

function uniqueFlags(flags: readonly string[]): string[] {
  return [...new Set(flags)];
}

export class ReplayTrackingAdapter implements TrackingAdapter {
  readonly mode = "replay" as const;
  readonly label = "Recorded 2D tracker replay";

  readonly durationS: number;

  private readonly frames: TrackerReplayFrame[];
  private readonly loop: boolean;
  private readonly nominalRadiusM: number;
  private readonly horizontalPreviewSpanM: number;
  private readonly verticalPreviewSpanM: number;
  private readonly previewCenterM: Vec3;
  private readonly firstSourceTimeS: number;
  private readonly lastSourceTimeS: number;
  private sequence = 0;
  private injectedLoss = false;

  constructor(
    source: string | readonly unknown[],
    options: ReplayTrackingOptions = {},
  ) {
    this.frames = prepareFrames(source);
    this.loop = options.loop ?? true;
    this.nominalRadiusM = options.nominalRadiusM ?? 2.5;
    this.horizontalPreviewSpanM = options.horizontalPreviewSpanM ?? 4;
    this.verticalPreviewSpanM = options.verticalPreviewSpanM ?? 3;
    this.previewCenterM = {
      ...(options.previewCenterM ?? DEFAULT_PREVIEW_CENTER),
    };
    this.firstSourceTimeS = this.frames[0].source_time_s;
    this.lastSourceTimeS =
      this.frames[this.frames.length - 1].source_time_s;
    this.durationS = Math.max(
      0,
      this.lastSourceTimeS - this.firstSourceTimeS,
    );

    for (const [label, value] of [
      ["nominalRadiusM", this.nominalRadiusM],
      ["horizontalPreviewSpanM", this.horizontalPreviewSpanM],
      ["verticalPreviewSpanM", this.verticalPreviewSpanM],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be a finite positive number`);
      }
    }
  }

  setInjectedLoss(injected: boolean): void {
    this.injectedLoss = injected;
  }

  sample(timeS: number, deltaS: number): WorldState {
    if (!Number.isFinite(timeS) || timeS < 0) {
      throw new Error("timeS must be a finite non-negative number");
    }
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("deltaS must be a finite non-negative number");
    }
    const sequence = this.sequence;
    this.sequence += 1;
    const sourceTimeS = this.resolveSourceTime(timeS);
    const lowerIndex = this.findLowerFrameIndex(sourceTimeS);
    const lower = this.frames[lowerIndex];
    const upper = this.frames[Math.min(lowerIndex + 1, this.frames.length - 1)];
    const sourceSpanS = upper.source_time_s - lower.source_time_s;
    const amount =
      sourceSpanS > 0
        ? clamp((sourceTimeS - lower.source_time_s) / sourceSpanS)
        : 0;
    const commonFlags = [
      ...lower.flags,
      "TRACKER_JSONL_REPLAY",
      "RECORDED_2D_SOURCE",
      "REPLAY_2D_TO_SYNTHETIC_3D",
      "NO_3D_CALIBRATION",
      "SYNTHETIC_Z_ZERO",
      "NO_MATERIAL_ROTATION",
    ];

    if (this.injectedLoss) {
      return this.invalidState(
        sequence,
        timeS,
        "lost",
        uniqueFlags([...commonFlags, "INJECTED_TRACKING_LOSS"]),
      );
    }
    if (
      !lower.state_valid ||
      !lower.geometry ||
      lower.status === "lost" ||
      lower.status === "unavailable"
    ) {
      return this.invalidState(
        sequence,
        timeS,
        lower.status === "unavailable" ? "unavailable" : "lost",
        uniqueFlags(commonFlags),
      );
    }

    const lowerMapped = this.mapFrame(lower);
    const canInterpolate =
      upper !== lower &&
      upper.state_valid &&
      upper.geometry !== null &&
      upper.status !== "lost" &&
      upper.status !== "unavailable";
    const upperMapped = canInterpolate
      ? this.mapFrame(upper)
      : lowerMapped;
    const mapped = this.interpolateMapped(lowerMapped, upperMapped, amount);
    const status =
      lower.status === "degraded" || upper.status === "degraded"
        ? "degraded"
        : lower.status;

    return {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence,
      mode: this.mode,
      monotonicTimeS: timeS,
      status,
      stateValid: lower.state_valid,
      measurementValid: lower.measurement_valid,
      confidence: clamp(
        canInterpolate
          ? lerp(lower.confidence, upper.confidence, amount)
          : lower.confidence,
      ),
      centerM: mapped.centerM,
      velocityMps: mapped.velocityMps,
      shape: mapped.shape,
      prediction: null,
      diagnostics: {
        sourceAgeMs: Math.max(
          0,
          (sourceTimeS - lower.source_time_s) * 1000,
        ),
        processingMs: 0.2,
        droppedFrames: 0,
        activeCameraCount: 0,
        flags: uniqueFlags([
          ...commonFlags,
          ...(canInterpolate && amount > 0
            ? ["RENDER_TIME_INTERPOLATION"]
            : []),
          "DEFORMATION_RATE_UNAVAILABLE_IN_SOURCE",
        ]),
      },
      materialRotationTracked: false,
    };
  }

  reset(): void {
    this.sequence = 0;
    this.injectedLoss = false;
  }

  private resolveSourceTime(timeS: number): number {
    if (this.durationS === 0) {
      return this.firstSourceTimeS;
    }
    if (!this.loop) {
      return clamp(
        this.firstSourceTimeS + timeS,
        this.firstSourceTimeS,
        this.lastSourceTimeS,
      );
    }
    return (
      this.firstSourceTimeS +
      ((timeS % this.durationS) + this.durationS) % this.durationS
    );
  }

  private findLowerFrameIndex(sourceTimeS: number): number {
    let low = 0;
    let high = this.frames.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (this.frames[middle].source_time_s <= sourceTimeS) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return Math.max(0, Math.min(high, this.frames.length - 1));
  }

  private mapFrame(frame: TrackerReplayFrame): MappedReplayState {
    if (!frame.geometry) {
      throw new Error("Cannot map a replay frame without geometry");
    }
    const [centerX, centerY] = frame.geometry.center_norm;
    const velocityNorm = frame.velocity?.norm_per_s ?? [0, 0];
    const major = frame.geometry.ellipse.major_diameter_px;
    const minor = frame.geometry.ellipse.minor_diameter_px;
    const axisRatio = Math.max(1, major / minor);
    const majorRadius = this.nominalRadiusM * Math.sqrt(axisRatio);
    const minorRadius = this.nominalRadiusM / Math.sqrt(axisRatio);
    const angleRad =
      (frame.geometry.ellipse.angle_deg * Math.PI) / 180;
    const cosAngle = Math.cos(angleRad);
    const sinAngle = Math.sin(angleRad);
    const radiusX = Math.hypot(
      majorRadius * cosAngle,
      minorRadius * sinAngle,
    );
    const radiusY = Math.hypot(
      majorRadius * sinAngle,
      minorRadius * cosAngle,
    );
    const radiusZ =
      (this.nominalRadiusM ** 3) / (radiusX * radiusY);

    return {
      centerM: {
        x:
          this.previewCenterM.x +
          (centerX - 0.5) * this.horizontalPreviewSpanM,
        y:
          this.previewCenterM.y +
          (0.5 - centerY) * this.verticalPreviewSpanM,
        z: this.previewCenterM.z,
      },
      velocityMps: {
        x: velocityNorm[0] * this.horizontalPreviewSpanM,
        y: -velocityNorm[1] * this.verticalPreviewSpanM,
        z: 0,
      },
      shape: {
        radiiM: {
          x: radiusX,
          y: radiusY,
          z: radiusZ,
        },
        principalAxisDeg: frame.geometry.ellipse.angle_deg,
        wobble: clamp(
          frame.geometry.gross_deformation.squash_stretch / 0.35,
        ),
        deformationRate: 0,
        volumeProxy:
          (radiusX * radiusY * radiusZ) / this.nominalRadiusM ** 3,
      },
    };
  }

  private interpolateMapped(
    start: MappedReplayState,
    end: MappedReplayState,
    amount: number,
  ): MappedReplayState {
    return {
      centerM: lerpVec3(start.centerM, end.centerM, amount),
      velocityMps: lerpVec3(
        start.velocityMps,
        end.velocityMps,
        amount,
      ),
      shape: {
        radiiM: lerpVec3(start.shape.radiiM, end.shape.radiiM, amount),
        principalAxisDeg: lerp(
          start.shape.principalAxisDeg,
          end.shape.principalAxisDeg,
          amount,
        ),
        wobble: lerp(start.shape.wobble, end.shape.wobble, amount),
        deformationRate: 0,
        volumeProxy: lerp(
          start.shape.volumeProxy,
          end.shape.volumeProxy,
          amount,
        ),
      },
    };
  }

  private invalidState(
    sequence: number,
    timeS: number,
    status: Extract<TrackingStatus, "lost" | "unavailable">,
    flags: string[],
  ): WorldState {
    return {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence,
      mode: this.mode,
      monotonicTimeS: timeS,
      status,
      stateValid: false,
      measurementValid: false,
      confidence: 0,
      centerM: null,
      velocityMps: null,
      shape: null,
      prediction: null,
      diagnostics: {
        sourceAgeMs: 0,
        processingMs: 0.2,
        droppedFrames: status === "lost" ? 1 : 0,
        activeCameraCount: 0,
        flags,
      },
      materialRotationTracked: false,
    };
  }
}
