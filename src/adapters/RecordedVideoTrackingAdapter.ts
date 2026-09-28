import {
  WORLD_STATE_SCHEMA_VERSION,
  type TrackingAdapter,
  type Vec3,
  type WorldState,
} from "../core/contracts";
import type { RecordedVideoDetection } from "../core/recordedVideoTracking";

interface IngestedDetection {
  detection: RecordedVideoDetection;
  capturedAtMs: number;
  processingMs: number;
  centerM: Vec3;
  velocityMps: Vec3;
  radiiM: Vec3;
  deformationRate: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class RecordedVideoTrackingAdapter implements TrackingAdapter {
  readonly mode = "replay" as const;
  readonly label = "Recorded video silhouette tracker";

  private sequence = 0;
  private baselineDiameterPx: number | null = null;
  private latest: IngestedDetection | null = null;
  private previous: IngestedDetection | null = null;
  private misses = 0;

  ingest(
    detection: RecordedVideoDetection | null,
    capturedAtMs: number,
    processingMs: number,
  ): void {
    if (!detection) {
      this.misses += 1;
      return;
    }
    const meanDiameter = (detection.majorDiameterPx + detection.minorDiameterPx) * 0.5;
    if (this.baselineDiameterPx === null) this.baselineDiameterPx = meanDiameter;
    const baseline = Math.max(1, this.baselineDiameterPx);
    const majorScale = clamp(detection.majorDiameterPx / baseline, 0.72, 1.32);
    const minorScale = clamp(detection.minorDiameterPx / baseline, 0.72, 1.32);
    const angle = detection.angleDeg * Math.PI / 180;
    const cos2 = Math.cos(angle) ** 2;
    const sin2 = Math.sin(angle) ** 2;
    const radiusX = 2.5 * (majorScale * cos2 + minorScale * sin2);
    const radiusY = 2.5 * (majorScale * sin2 + minorScale * cos2);
    const radiusZ = 2.5 ** 3 / Math.max(0.1, radiusX * radiusY);
    const centerM: Vec3 = {
      x: (detection.centerNorm[0] - 0.5) * 4,
      y: 3.35 + (0.5 - detection.centerNorm[1]) * 3,
      z: 0,
    };
    const prior = this.latest;
    const elapsedS = prior ? Math.max(0.001, (capturedAtMs - prior.capturedAtMs) / 1_000) : 1;
    const velocityMps: Vec3 = prior
      ? {
          x: (centerM.x - prior.centerM.x) / elapsedS,
          y: (centerM.y - prior.centerM.y) / elapsedS,
          z: 0,
        }
      : { x: 0, y: 0, z: 0 };
    const deformationRate = prior
      ? Math.hypot(
          radiusX - prior.radiiM.x,
          radiusY - prior.radiiM.y,
          radiusZ - prior.radiiM.z,
        ) / elapsedS
      : 0;
    this.previous = prior;
    this.latest = {
      detection,
      capturedAtMs,
      processingMs,
      centerM,
      velocityMps,
      radiiM: { x: radiusX, y: radiusY, z: radiusZ },
      deformationRate,
    };
    this.misses = 0;
  }

  sample(timeS: number, _deltaS: number): WorldState {
    const sequence = this.sequence++;
    const latest = this.latest;
    const sourceAgeMs = latest ? Math.max(0, performance.now() - latest.capturedAtMs) : Infinity;
    if (!latest || sourceAgeMs > 750 || this.misses > 10) {
      return {
        schemaVersion: WORLD_STATE_SCHEMA_VERSION,
        sequence,
        mode: this.mode,
        monotonicTimeS: timeS,
        status: latest ? "lost" : "acquiring",
        stateValid: false,
        measurementValid: false,
        confidence: 0,
        centerM: null,
        velocityMps: null,
        shape: null,
        prediction: null,
        diagnostics: {
          sourceAgeMs: Number.isFinite(sourceAgeMs) ? sourceAgeMs : 0,
          processingMs: latest?.processingMs ?? 0,
          droppedFrames: this.misses,
          activeCameraCount: 0,
          flags: ["RECORDED_VIDEO_INPUT", "SILHOUETTE_MISSING", "NO_3D_CALIBRATION"],
        },
        materialRotationTracked: false,
      };
    }
    const confidence = clamp(latest.detection.confidence);
    const status = confidence >= 0.58 ? "tracking" : "degraded";
    const speed = Math.hypot(latest.velocityMps.x, latest.velocityMps.y);
    return {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence,
      mode: this.mode,
      monotonicTimeS: timeS,
      status,
      stateValid: true,
      measurementValid: true,
      confidence,
      centerM: { ...latest.centerM },
      velocityMps: { ...latest.velocityMps },
      shape: {
        radiiM: { ...latest.radiiM },
        principalAxisDeg: latest.detection.angleDeg,
        wobble: clamp(Math.abs(latest.detection.axisRatio - 1) * 0.9 + speed * 0.08),
        deformationRate: clamp(latest.deformationRate, 0, 1),
        volumeProxy: latest.radiiM.x * latest.radiiM.y * latest.radiiM.z / 2.5 ** 3,
      },
      prediction: null,
      diagnostics: {
        sourceAgeMs,
        processingMs: latest.processingMs,
        droppedFrames: this.misses,
        activeCameraCount: 0,
        flags: [
          "RECORDED_VIDEO_INPUT",
          "BROWSER_SILHOUETTE_TRACKER",
          "RECORDED_2D_TO_SYNTHETIC_3D",
          "NO_3D_CALIBRATION",
          "NO_MATERIAL_ROTATION",
          ...(this.previous ? [] : ["BASELINE_DIAMETER_ACQUIRING"]),
        ],
      },
      materialRotationTracked: false,
    };
  }

  reset(): void {
    this.sequence = 0;
    this.baselineDiameterPx = null;
    this.latest = null;
    this.previous = null;
    this.misses = 0;
  }
}
