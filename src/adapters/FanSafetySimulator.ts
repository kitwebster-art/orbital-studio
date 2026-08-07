import type {
  FanTelemetry,
  FanTelemetryAdapter,
} from "../core/contracts";
import { clamp } from "../core/math";

export interface FanSafetySimulatorOptions {
  maximumAcceptedCue?: number;
  riseRatePerS?: number;
  fallRatePerS?: number;
}

/**
 * A telemetry-only digital twin. This class intentionally has no transport,
 * DMX, network or device handle, so it cannot write to physical fan hardware.
 */
export class FanSafetySimulator implements FanTelemetryAdapter {
  readonly simulated = true as const;
  readonly hardwareWriteEnabled = false as const;

  private readonly maximumAcceptedCue: number;
  private readonly riseRatePerS: number;
  private readonly fallRatePerS: number;
  private actualNormalized = 0;
  private fault: string | null = null;

  constructor(options: FanSafetySimulatorOptions = {}) {
    this.maximumAcceptedCue = options.maximumAcceptedCue ?? 0.85;
    this.riseRatePerS = options.riseRatePerS ?? 0.2;
    this.fallRatePerS = options.fallRatePerS ?? 0.32;

    if (
      !Number.isFinite(this.maximumAcceptedCue) ||
      this.maximumAcceptedCue < 0 ||
      this.maximumAcceptedCue > 1
    ) {
      throw new Error("maximumAcceptedCue must be between 0 and 1");
    }
    if (!Number.isFinite(this.riseRatePerS) || this.riseRatePerS <= 0) {
      throw new Error("riseRatePerS must be a finite positive number");
    }
    if (!Number.isFinite(this.fallRatePerS) || this.fallRatePerS <= 0) {
      throw new Error("fallRatePerS must be a finite positive number");
    }
  }

  update(requestedCue: number, deltaS: number): FanTelemetry {
    if (!Number.isFinite(requestedCue)) {
      throw new Error("requestedCue must be finite");
    }
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("deltaS must be a finite non-negative number");
    }

    const boundedRequest = clamp(requestedCue);
    const acceptedCue = this.fault
      ? 0
      : Math.min(boundedRequest, this.maximumAcceptedCue);
    const difference = acceptedCue - this.actualNormalized;
    const maximumStep =
      (difference >= 0 ? this.riseRatePerS : this.fallRatePerS) * deltaS;
    this.actualNormalized +=
      Math.sign(difference) * Math.min(Math.abs(difference), maximumStep);
    this.actualNormalized = clamp(this.actualNormalized);

    return {
      simulated: true,
      hardwareWriteEnabled: false,
      requestedCue: boundedRequest,
      acceptedCue,
      actualNormalized: this.actualNormalized,
      controllerHealthy: this.fault === null,
      fault: this.fault,
    };
  }

  setFault(fault: string | null): void {
    this.fault = fault;
  }

  reset(): void {
    this.actualNormalized = 0;
    this.fault = null;
  }
}

