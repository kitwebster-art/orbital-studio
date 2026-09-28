import { describe, expect, it } from "vitest";
import { FanSafetySimulator } from "./FanSafetySimulator";
import {
  parseTrackerJsonl,
  ReplayTrackingAdapter,
} from "./ReplayTrackingAdapter";
import {
  LATEX_BALLOON_MOTION_PROFILE,
  SyntheticTrackingAdapter,
} from "./SyntheticTrackingAdapter";
import { RecordedVideoTrackingAdapter } from "./RecordedVideoTrackingAdapter";

function replayFrame(
  sequence: number,
  sourceTimeS: number,
  center: [number, number],
) {
  return {
    schema_version: "orbital.tracking-state/1.0",
    sequence,
    source_mode: "replay",
    source_uri: "test://recording",
    source_time_s: sourceTimeS,
    status: "tracking",
    measurement_valid: true,
    state_valid: true,
    confidence: 0.9,
    frame: {
      width_px: 1920,
      height_px: 1080,
    },
    geometry: {
      center_norm: center,
      ellipse: {
        major_diameter_px: 400,
        minor_diameter_px: 320,
        angle_deg: 30,
      },
      gross_deformation: {
        squash_stretch: 0.25,
      },
    },
    velocity: {
      norm_per_s: [0.2, -0.1],
    },
    material_rotation_tracked: false,
    flags: ["RECORDED_TEST"],
  };
}

describe("SyntheticTrackingAdapter", () => {
  it("is deterministic and exposes gross deformation without material rotation", () => {
    const adapter = new SyntheticTrackingAdapter();
    const first = adapter.sample(12.5, 1 / 90);
    adapter.reset();
    const repeated = adapter.sample(12.5, 1 / 90);

    expect(repeated).toEqual(first);
    expect(first.stateValid).toBe(true);
    expect(first.shape?.radiiM.x).toBeGreaterThan(0);
    expect(first.shape?.volumeProxy).toBeCloseTo(1);
    expect(first.materialRotationTracked).toBe(false);
    expect(first.diagnostics.flags).toContain("NO_HARDWARE_MEASUREMENT");
  });

  it("keeps synthetic latex motion in slow, broad reference bands", () => {
    const centerPeriods = Object.values(
      LATEX_BALLOON_MOTION_PROFILE.centerDriftPeriodS,
    );
    const bulgePeriods = Object.values(
      LATEX_BALLOON_MOTION_PROFILE.grossBulgePeriodS,
    );

    expect(Math.min(...centerPeriods)).toBeGreaterThanOrEqual(5.8);
    expect(Math.min(...bulgePeriods)).toBeGreaterThanOrEqual(2.9);
    expect(
      LATEX_BALLOON_MOTION_PROFILE.principalAxisDriftDegPerS,
    ).toBeLessThanOrEqual(1);

    const adapter = new SyntheticTrackingAdapter();
    const a = adapter.sample(20, 1 / 60);
    const b = adapter.sample(20 + 1 / 60, 1 / 60);
    expect(
      Math.abs((b.shape?.radiiM.x ?? 0) - (a.shape?.radiiM.x ?? 0)),
    ).toBeLessThan(0.005);
  });

  it("supports deterministic fault windows and explicit tracking loss", () => {
    const adapter = new SyntheticTrackingAdapter({
      faultWindows: [
        {
          startS: 2,
          endS: 3,
          status: "degraded",
          flag: "TEST_DEGRADATION",
        },
      ],
    });

    expect(adapter.sample(2.5, 0.01).status).toBe("degraded");
    adapter.setInjectedLoss(true);
    const lost = adapter.sample(4, 0.01);
    expect(lost.status).toBe("lost");
    expect(lost.centerM).toBeNull();
    expect(lost.diagnostics.flags).toContain("INJECTED_TRACKING_LOSS");
  });
});

describe("ReplayTrackingAdapter", () => {
  it("parses tracker JSONL and labels its 2D-to-synthetic-3D mapping honestly", () => {
    const jsonl = [
      JSON.stringify(replayFrame(0, 0, [0.4, 0.6])),
      JSON.stringify(replayFrame(1, 1, [0.6, 0.4])),
    ].join("\n");
    const frames = parseTrackerJsonl(jsonl);
    const adapter = new ReplayTrackingAdapter(frames, { loop: false });
    const world = adapter.sample(0.5, 1 / 60);

    expect(frames).toHaveLength(2);
    expect(world.mode).toBe("replay");
    expect(world.centerM?.x).toBeCloseTo(0);
    expect(world.centerM?.y).toBeCloseTo(3.35);
    expect(world.centerM?.z).toBe(0);
    expect(world.materialRotationTracked).toBe(false);
    expect(world.diagnostics.flags).toContain(
      "REPLAY_2D_TO_SYNTHETIC_3D",
    );
    expect(world.diagnostics.flags).toContain("NO_3D_CALIBRATION");
    expect(world.diagnostics.flags).toContain("SYNTHETIC_Z_ZERO");
  });

  it("rejects invalid JSONL and supports replay loss injection", () => {
    expect(() => parseTrackerJsonl("{not-json}")).toThrow(/line 1/u);
    const adapter = new ReplayTrackingAdapter([
      replayFrame(0, 0, [0.5, 0.5]),
    ]);
    adapter.setInjectedLoss(true);

    expect(adapter.sample(0, 0).stateValid).toBe(false);
  });
});

describe("RecordedVideoTrackingAdapter", () => {
  it("maps a recorded 2D fit into a volume-preserving rehearsal envelope", () => {
    const adapter = new RecordedVideoTrackingAdapter();
    const capturedAtMs = performance.now();
    adapter.ingest(
      {
        frameWidth: 320,
        frameHeight: 180,
        centerPx: [192, 72],
        centerNorm: [0.6, 0.4],
        majorDiameterPx: 92,
        minorDiameterPx: 78,
        angleDeg: 24,
        axisRatio: 92 / 78,
        areaFraction: 0.1,
        confidence: 0.91,
        threshold: 160,
        boundsPx: [146, 33, 238, 111],
      },
      capturedAtMs,
      2.4,
    );

    const world = adapter.sample(0, 1 / 60);
    expect(world.mode).toBe("replay");
    expect(world.status).toBe("tracking");
    expect(world.centerM?.x).toBeCloseTo(0.4);
    expect(world.centerM?.y).toBeCloseTo(3.65);
    expect(world.shape?.volumeProxy).toBeCloseTo(1);
    expect(world.diagnostics.flags).toContain("RECORDED_VIDEO_INPUT");
    expect(world.diagnostics.flags).toContain("NO_3D_CALIBRATION");
    expect(world.materialRotationTracked).toBe(false);
  });

  it("reports an acquiring state until the detector has a valid fit", () => {
    const adapter = new RecordedVideoTrackingAdapter();
    adapter.ingest(null, performance.now(), 1.2);

    const world = adapter.sample(0, 1 / 60);
    expect(world.status).toBe("acquiring");
    expect(world.stateValid).toBe(false);
    expect(world.diagnostics.flags).toContain("SILHOUETTE_MISSING");
  });
});

describe("FanSafetySimulator", () => {
  it("clamps and slew-limits telemetry with hardware writes impossible", () => {
    const fan = new FanSafetySimulator({
      maximumAcceptedCue: 0.8,
      riseRatePerS: 0.2,
      fallRatePerS: 0.4,
    });
    const first = fan.update(2, 1);

    expect(first.simulated).toBe(true);
    expect(first.hardwareWriteEnabled).toBe(false);
    expect(first.requestedCue).toBe(1);
    expect(first.acceptedCue).toBe(0.8);
    expect(first.actualNormalized).toBeCloseTo(0.2);

    fan.setFault("SIMULATED_INTERLOCK");
    const faulted = fan.update(0.8, 1);
    expect(faulted.acceptedCue).toBe(0);
    expect(faulted.actualNormalized).toBe(0);
    expect(faulted.controllerHealthy).toBe(false);
    expect(faulted.fault).toBe("SIMULATED_INTERLOCK");
  });
});
