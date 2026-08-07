import {
  WORLD_STATE_SCHEMA_VERSION,
  type TrackingAdapter,
  type TrackingStatus,
  type Vec3,
  type WorldState,
} from "../core/contracts";
import { clamp } from "../core/math";

export interface SyntheticTrackingFaultWindow {
  startS: number;
  endS: number;
  status: Extract<TrackingStatus, "degraded" | "lost" | "unavailable">;
  flag?: string;
}

export interface SyntheticTrackingOptions {
  baseCenterM?: Vec3;
  nominalRadiusM?: number;
  faultWindows?: readonly SyntheticTrackingFaultWindow[];
}

const DEFAULT_CENTER: Vec3 = {
  x: 0,
  y: 3.35,
  z: 0,
};

const TAU = Math.PI * 2;

/**
 * A deliberately slow synthetic profile derived from IMG_6021.MOV. The
 * reference is only 17.67 seconds long, so these are perceptual target bands,
 * not claimed material constants. Keeping the periods named makes it harder
 * for future tuning to accidentally reintroduce rapid, noise-like shaking.
 */
export const LATEX_BALLOON_MOTION_PROFILE = Object.freeze({
  centerDriftPeriodS: Object.freeze({
    xPrimary: 14.8,
    xSecondary: 9.6,
    yPrimary: 18.4,
    ySecondary: 10.7,
    zPrimary: 16.2,
    zSecondary: 11.8,
  }),
  grossBulgePeriodS: Object.freeze({
    primary: 10.6,
    secondary: 7.4,
    vertical: 12.8,
  }),
  grossBulgeAmplitude: Object.freeze({
    primary: 0.064,
    secondary: 0.021,
    vertical: 0.014,
  }),
  principalAxisDriftDegPerS: 0.9,
});

function angularSpeed(periodS: number): number {
  return TAU / periodS;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function normaliseAngle(angleDeg: number): number {
  return ((angleDeg % 180) + 180) % 180;
}

export class SyntheticTrackingAdapter implements TrackingAdapter {
  readonly mode = "simulation" as const;
  readonly label = "Synthetic five-metre sphere";

  private readonly baseCenterM: Vec3;
  private readonly nominalRadiusM: number;
  private faultWindows: SyntheticTrackingFaultWindow[];
  private sequence = 0;
  private injectedLoss = false;
  private forcedStatus: SyntheticTrackingFaultWindow["status"] | null = null;

  constructor(options: SyntheticTrackingOptions = {}) {
    this.baseCenterM = {
      ...(options.baseCenterM ?? DEFAULT_CENTER),
    };
    this.nominalRadiusM = options.nominalRadiusM ?? 2.5;
    if (!Number.isFinite(this.nominalRadiusM) || this.nominalRadiusM <= 0) {
      throw new Error("nominalRadiusM must be a finite positive number");
    }
    this.faultWindows = [...(options.faultWindows ?? [])];
    this.validateFaultWindows(this.faultWindows);
  }

  setInjectedLoss(injected: boolean): void {
    this.injectedLoss = injected;
  }

  setFault(
    status: SyntheticTrackingFaultWindow["status"] | null,
  ): void {
    this.forcedStatus = status;
  }

  setFaultWindows(windows: readonly SyntheticTrackingFaultWindow[]): void {
    const next = [...windows];
    this.validateFaultWindows(next);
    this.faultWindows = next;
  }

  sample(timeS: number, deltaS: number): WorldState {
    assertFiniteNonNegative(timeS, "timeS");
    assertFiniteNonNegative(deltaS, "deltaS");

    const status = this.resolveStatus(timeS);
    const sequence = this.sequence;
    this.sequence += 1;
    const baseFlags = [
      "SYNTHETIC_INPUT",
      "SOFTWARE_INTERFACE_PROOF",
      "NO_HARDWARE_MEASUREMENT",
      "NO_MATERIAL_ROTATION",
    ];
    const window = this.faultWindows.find(
      (candidate) => timeS >= candidate.startS && timeS < candidate.endS,
    );

    if (status === "lost" || status === "unavailable") {
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
          processingMs: 0,
          droppedFrames: status === "lost" ? 1 : 0,
          activeCameraCount: 0,
          flags: [
            ...baseFlags,
            this.injectedLoss ? "INJECTED_TRACKING_LOSS" : "INJECTED_FAULT",
            ...(window?.flag ? [window.flag] : []),
          ],
        },
        materialRotationTracked: false,
      };
    }

    const centerPeriod = LATEX_BALLOON_MOTION_PROFILE.centerDriftPeriodS;
    const xPrimarySpeed = angularSpeed(centerPeriod.xPrimary);
    const xSecondarySpeed = angularSpeed(centerPeriod.xSecondary);
    const yPrimarySpeed = angularSpeed(centerPeriod.yPrimary);
    const ySecondarySpeed = angularSpeed(centerPeriod.ySecondary);
    const zPrimarySpeed = angularSpeed(centerPeriod.zPrimary);
    const zSecondarySpeed = angularSpeed(centerPeriod.zSecondary);
    const x =
      this.baseCenterM.x +
      0.25 * Math.sin(timeS * xPrimarySpeed) +
      0.035 * Math.sin(timeS * xSecondarySpeed + 0.4);
    const y =
      this.baseCenterM.y +
      0.16 * Math.sin(timeS * yPrimarySpeed + 0.8) +
      0.024 * Math.sin(timeS * ySecondarySpeed);
    const z =
      this.baseCenterM.z +
      0.2 * Math.cos(timeS * zPrimarySpeed - 0.2) +
      0.028 * Math.sin(timeS * zSecondarySpeed);
    const velocityMps = {
      x:
        0.25 * xPrimarySpeed * Math.cos(timeS * xPrimarySpeed) +
        0.035 * xSecondarySpeed * Math.cos(timeS * xSecondarySpeed + 0.4),
      y:
        0.16 * yPrimarySpeed * Math.cos(timeS * yPrimarySpeed + 0.8) +
        0.024 * ySecondarySpeed * Math.cos(timeS * ySecondarySpeed),
      z:
        -0.2 * zPrimarySpeed * Math.sin(timeS * zPrimarySpeed - 0.2) +
        0.028 * zSecondarySpeed * Math.cos(timeS * zSecondarySpeed),
    };

    const bulgePeriod = LATEX_BALLOON_MOTION_PROFILE.grossBulgePeriodS;
    const bulgeAmplitude = LATEX_BALLOON_MOTION_PROFILE.grossBulgeAmplitude;
    const primaryBulgeSpeed = angularSpeed(bulgePeriod.primary);
    const secondaryBulgeSpeed = angularSpeed(bulgePeriod.secondary);
    const verticalBulgeSpeed = angularSpeed(bulgePeriod.vertical);
    const xDeformation =
      bulgeAmplitude.primary * Math.sin(timeS * primaryBulgeSpeed) +
      bulgeAmplitude.secondary * Math.sin(timeS * secondaryBulgeSpeed + 0.6);
    const yDeformation =
      -0.58 * xDeformation +
      bulgeAmplitude.vertical * Math.sin(timeS * verticalBulgeSpeed - 0.3);
    const radiusX = this.nominalRadiusM * (1 + xDeformation);
    const radiusY = this.nominalRadiusM * (1 + yDeformation);
    const radiusZ =
      (this.nominalRadiusM ** 3) / (radiusX * radiusY);
    const xDeformationRate =
      bulgeAmplitude.primary * primaryBulgeSpeed * Math.cos(timeS * primaryBulgeSpeed) +
      bulgeAmplitude.secondary * secondaryBulgeSpeed * Math.cos(timeS * secondaryBulgeSpeed + 0.6);
    const yDeformationRate =
      -0.58 * xDeformationRate +
      bulgeAmplitude.vertical * verticalBulgeSpeed * Math.cos(timeS * verticalBulgeSpeed - 0.3);

    return {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence,
      mode: this.mode,
      monotonicTimeS: timeS,
      status,
      stateValid: true,
      measurementValid: true,
      confidence: status === "degraded" ? 0.44 : 0.98,
      centerM: { x, y, z },
      velocityMps,
      shape: {
        radiiM: {
          x: radiusX,
          y: radiusY,
          z: radiusZ,
        },
        principalAxisDeg: normaliseAngle(
          timeS * LATEX_BALLOON_MOTION_PROFILE.principalAxisDriftDegPerS +
            7 * Math.sin(timeS * 0.14),
        ),
        wobble: clamp(
          0.08 +
            Math.abs(Math.sin(timeS * primaryBulgeSpeed)) * 0.21 +
            Math.abs(Math.sin(timeS * secondaryBulgeSpeed + 0.2)) * 0.07,
        ),
        deformationRate:
          Math.hypot(xDeformationRate, yDeformationRate) *
          this.nominalRadiusM,
        volumeProxy:
          (radiusX * radiusY * radiusZ) / this.nominalRadiusM ** 3,
      },
      prediction: null,
      diagnostics: {
        sourceAgeMs: 1.2 + 0.35 * (0.5 + 0.5 * Math.sin(timeS * 0.63)),
        processingMs:
          1.8 + 0.5 * (0.5 + 0.5 * Math.sin(timeS * 0.91 + 0.3)),
        droppedFrames: status === "degraded" ? 1 : 0,
        activeCameraCount: 0,
        flags: [
          ...baseFlags,
          ...(status === "degraded" ? ["SYNTHETIC_DEGRADED"] : []),
          ...(window?.flag ? [window.flag] : []),
        ],
      },
      materialRotationTracked: false,
    };
  }

  reset(): void {
    this.sequence = 0;
    this.injectedLoss = false;
    this.forcedStatus = null;
  }

  private resolveStatus(timeS: number): TrackingStatus {
    if (this.injectedLoss) {
      return "lost";
    }
    if (this.forcedStatus) {
      return this.forcedStatus;
    }
    return (
      this.faultWindows.find(
        (candidate) =>
          timeS >= candidate.startS && timeS < candidate.endS,
      )?.status ?? "tracking"
    );
  }

  private validateFaultWindows(
    windows: readonly SyntheticTrackingFaultWindow[],
  ): void {
    for (const [index, window] of windows.entries()) {
      assertFiniteNonNegative(window.startS, `faultWindows[${index}].startS`);
      assertFiniteNonNegative(window.endS, `faultWindows[${index}].endS`);
      if (window.endS <= window.startS) {
        throw new Error(
          `faultWindows[${index}].endS must be after its start`,
        );
      }
    }
  }
}
