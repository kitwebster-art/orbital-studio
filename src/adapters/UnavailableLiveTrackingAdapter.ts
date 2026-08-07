import {
  WORLD_STATE_SCHEMA_VERSION,
  type TrackingAdapter,
  type WorldState,
} from "../core/contracts";

export class UnavailableLiveTrackingAdapter implements TrackingAdapter {
  readonly mode = "live" as const;
  readonly label = "Live machine vision unavailable";
  private sequence = 0;

  sample(timeS: number, _deltaS: number): WorldState {
    const state: WorldState = {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence: this.sequence,
      mode: "live",
      monotonicTimeS: timeS,
      status: "unavailable",
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
        droppedFrames: 0,
        activeCameraCount: 0,
        flags: [
          "LIVE_CAPTURE_NOT_IMPLEMENTED",
          "OUTPUT_SUPPRESSED",
          "NO_HARDWARE_CLAIM",
        ],
      },
      materialRotationTracked: false,
    };
    this.sequence += 1;
    return state;
  }

  reset(): void {
    this.sequence = 0;
  }
}
