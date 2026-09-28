import { describe, expect, it } from "vitest";
import {
  WebSocketTrackingAdapter,
  type WebSocketLike,
} from "./WebSocketTrackingAdapter";

class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function liveFrame(sequence: number, status = "tracking") {
  const valid = status === "tracking" || status === "degraded";
  return {
    schema_version: "orbital.tracking-state/1.0",
    sequence,
    source_mode: "live",
    source_uri: "fusion://test/three-camera",
    clock_domain: "monotonic",
    capture_timestamp_ns: sequence * 8_333_333,
    source_time_s: sequence / 120,
    valid_until_timestamp_ns: sequence * 8_333_333 + 100_000_000,
    frame: { width_px: 1920, height_px: 1080 },
    status,
    measurement_valid: valid,
    state_valid: valid,
    confidence: valid ? 0.96 : 0,
    geometry: valid
      ? {
          center_px: [1056, 486],
          center_norm: [0.55, 0.45],
          ellipse: {
            major_diameter_px: 400,
            minor_diameter_px: 360,
            angle_deg: 12,
          },
          gross_deformation: {
            axis_ratio: 400 / 360,
            squash_stretch: 0.11,
            area_fraction: 0.06,
          },
          diagnostics: { threshold: 135, component_area_px: 90_000 },
        }
      : null,
    velocity: valid
      ? { px_per_s: [10, -4], norm_per_s: [0.01, -0.004] }
      : null,
    material_rotation_tracked: false,
    flags: [
      "THREE_CAMERA_FUSED_STATE",
      valid ? "ACTIVE_CAMERAS_3" : "ACTIVE_CAMERAS_0",
      "NO_RAW_CAMERA_FEEDS_IN_BROWSER",
    ],
  };
}

describe("WebSocketTrackingAdapter", () => {
  it("maps fused live state and counts source sequence gaps", () => {
    let nowMs = 1_000;
    const socket = new FakeSocket();
    const adapter = new WebSocketTrackingAdapter({
      nowMs: () => nowMs,
      createSocket: () => socket,
    });
    adapter.connect();
    socket.open();
    socket.message(liveFrame(10));
    socket.message(liveFrame(13));

    const state = adapter.sample(1, 1 / 60);
    expect(state.status).toBe("tracking");
    expect(state.centerM?.x).toBeCloseTo(0.2);
    expect(state.centerM?.y).toBeCloseTo(3.5);
    expect(state.shape?.volumeProxy).toBeCloseTo(1);
    expect(state.diagnostics.activeCameraCount).toBe(3);
    expect(state.diagnostics.droppedFrames).toBe(2);
    expect(state.diagnostics.flags).toContain("LOCAL_WEBSOCKET_BRIDGE");
    expect(state.diagnostics.flags).toContain("NO_RAW_CAMERA_FEEDS_IN_BROWSER");
    expect(adapter.status.source).toBe("unknown");
    expect(adapter.status.activeCameraCount).toBe(3);
  });

  it("identifies a physical HuaTeng one-camera source", () => {
    const socket = new FakeSocket();
    const adapter = new WebSocketTrackingAdapter({ createSocket: () => socket });
    adapter.connect();
    socket.open();
    socket.message({
      ...liveFrame(1),
      source_uri: "huateng://HT-GE134GM-T1P-C/test",
      frame: { width_px: 1024, height_px: 768 },
      flags: [
        "PHYSICAL_CAMERA_CAPTURE",
        "HUATENG_HT_GE134GM_T1P_C",
        "ACTIVE_CAMERAS_1",
        "NO_RAW_CAMERA_FEEDS_IN_BROWSER",
      ],
      timing: {
        received_timestamp_ns: 10_000_000,
        processing_completed_timestamp_ns: 12_750_000,
        processing_latency_ms: 2.75,
      },
    });

    expect(adapter.status.source).toBe("physical-huateng");
    expect(adapter.status.activeCameraCount).toBe(1);
    expect(adapter.status.processingMs).toBe(2.75);
    const state = adapter.sample(0, 0);
    expect(state.diagnostics.activeCameraCount).toBe(1);
    expect(state.diagnostics.processingMs).toBe(2.75);
  });

  it("degrades stale state, then suppresses expired output", () => {
    let nowMs = 50;
    const socket = new FakeSocket();
    const adapter = new WebSocketTrackingAdapter({
      nowMs: () => nowMs,
      createSocket: () => socket,
      staleAfterMs: 100,
      unavailableAfterMs: 400,
    });
    adapter.connect();
    socket.open();
    socket.message({ ...liveFrame(1), valid_until_timestamp_ns: 8_333_333 + 400_000_000 });

    nowMs = 180;
    const stale = adapter.sample(1, 0.016);
    expect(stale.status).toBe("degraded");
    expect(stale.stateValid).toBe(true);
    expect(stale.measurementValid).toBe(false);
    expect(stale.diagnostics.flags).toContain("STALE_LIVE_STATE");

    nowMs = 500;
    const expired = adapter.sample(1.3, 0.016);
    expect(expired.status).toBe("unavailable");
    expect(expired.stateValid).toBe(false);
    expect(expired.centerM).toBeNull();
    expect(expired.diagnostics.flags).toContain("LIVE_STATE_EXPIRED");
  });

  it("reflects source unavailability and reconnects after closure", () => {
    const sockets: FakeSocket[] = [];
    const scheduled: Array<() => void> = [];
    const adapter = new WebSocketTrackingAdapter({
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelScheduled: () => undefined,
    });
    adapter.connect();
    sockets[0].open();
    sockets[0].message(liveFrame(1, "unavailable"));
    expect(adapter.sample(0, 0).status).toBe("unavailable");

    sockets[0].close(1006);
    expect(adapter.status.connection).toBe("reconnecting");
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].message(liveFrame(0));
    expect(adapter.sample(0.1, 0.016).status).toBe("tracking");
  });

  it("rejects malformed, non-live and out-of-order frames", () => {
    const socket = new FakeSocket();
    const adapter = new WebSocketTrackingAdapter({ createSocket: () => socket });
    adapter.connect();
    socket.open();
    socket.onmessage?.({ data: "not-json" });
    socket.message({ ...liveFrame(2), source_mode: "simulate" });
    socket.message(liveFrame(2));
    socket.message(liveFrame(1));

    expect(adapter.status.receivedFrames).toBe(1);
    expect(adapter.status.invalidFrames).toBe(3);
  });
});

it("invalidates geometry when calibration changes and distinguishes calibrated source coordinates", () => {
  const socket = new FakeSocket();
  const adapter = new WebSocketTrackingAdapter({ createSocket: () => socket });
  adapter.connect(); socket.open(); socket.message(liveFrame(1));
  const calibration = {
    schemaVersion: "orbital.monocular-calibration/1.0", imageWidthPx: 1920, imageHeightPx: 1080,
    fx: 1500, fy: 1500, cx: 960, cy: 540, distortion: [0,0,0,0,0],
    rotation: [1,0,0,0,1,0,0,0,1], translationM: {x:0,y:0,z:0}, sphereRadiusM:0.1,
    maxAxisRatio:1.15, maxReprojectionErrorPx:0.1,
  };
  adapter.setMonocularCalibration(calibration);
  expect(adapter.sample(999,0).stateValid).toBe(false);
  const f=liveFrame(2); f.geometry!.gross_deformation.squash_stretch=0;
  socket.message(f);
  const state=adapter.sample(999,0);
  expect(state.stateValid).toBe(true);
  expect(state.monotonicTimeS).toBe(f.source_time_s);
  expect(state.diagnostics.flags).toContain("CALIBRATED_MONOCULAR_SPHERE_APPROXIMATION");
  expect(state.centerM!.z).toBeGreaterThan(0);
  socket.message({schema_version:"orbital.camera-control-result/1.0"});
  expect(adapter.status.invalidFrames).toBe(0);
  expect(()=>adapter.setUrl("ws://user:secret@localhost:8765")).toThrow();
  adapter.setUrl("ws://127.0.0.1:9876");
  expect(adapter.status.connection).toBe("disconnected");
  expect(adapter.status.url).toBe("ws://127.0.0.1:9876/");
});

it("honours native capture age and source validity even immediately after receipt", () => {
 const socket=new FakeSocket();const adapter=new WebSocketTrackingAdapter({createSocket:()=>socket,nowMs:()=>1000});
 adapter.connect();socket.open();
 socket.message({...liveFrame(1),timing:{received_timestamp_ns:208_333_333,processing_completed_timestamp_ns:210_333_333,processing_latency_ms:2}});
 expect(adapter.sample(0,0).stateValid).toBe(false);
});

it("clock handshake detects a delayed native frame despite fresh websocket receipt", () => {
 let now = 1000;
 const socket = new FakeSocket() as FakeSocket & {send: (data: string) => void};
 const requests: Array<{request_id: string}> = [];
 socket.send = data => requests.push(JSON.parse(data));
 const adapter = new WebSocketTrackingAdapter({createSocket:()=>socket,nowMs:()=>now});
 adapter.connect();socket.open();expect(requests.length).toBe(1);
 now = 1010;
 socket.message({schema_version:"orbital.camera-control-result/1.0",request_id:requests[0].request_id,ok:true,server_monotonic_ns:5_000_000_000});
 const delayed = {...liveFrame(1),capture_timestamp_ns:4_800_000_000,valid_until_timestamp_ns:4_900_000_000,source_time_s:4.8};
 socket.message(delayed);
 expect(adapter.sample(0,0).stateValid).toBe(false);
 socket.message({...delayed,sequence:2,capture_timestamp_ns:5_000_000_000,valid_until_timestamp_ns:5_100_000_000,source_time_s:5});
 const fresh=adapter.sample(0,0);
 expect(fresh.stateValid).toBe(true);expect(fresh.diagnostics.sourceAgeMs).toBeCloseTo(10);
 expect(fresh.diagnostics.flags).toContain("SYNCHRONISED_SOURCE_CLOCK");
});

it("scales uncalibrated live preview to the test ball without claiming metric calibration", () => {
 const socket=new FakeSocket(),adapter=new WebSocketTrackingAdapter({createSocket:()=>socket});
 adapter.connect();socket.open();socket.message(liveFrame(1));
 adapter.setPreviewGeometry(.25,{x:0,y:1,z:0});
 expect(adapter.sample(0,0).stateValid).toBe(false);
 const frame=liveFrame(2);frame.geometry!.ellipse.minor_diameter_px=400;
 socket.message(frame);
 const state=adapter.sample(0,0);
 expect(state.shape!.radiiM.x).toBeCloseTo(.25);expect(state.centerM!.x).toBeCloseTo(.05);
 expect(state.centerM!.y).toBeCloseTo(1.0375);
 expect(state.diagnostics.flags).toContain('UNCALIBRATED_IMAGE_SPACE_PREVIEW');
 expect(()=>adapter.setPreviewGeometry(-1,{x:0,y:1,z:0})).toThrow();
});
