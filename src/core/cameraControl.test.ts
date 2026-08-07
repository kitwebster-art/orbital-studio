import { describe, expect, it } from "vitest";
import {
  CAMERA_RIG_SCHEMA_VERSION,
  createCameraControlCommand,
  DEFAULT_CAMERA_PROFILE_ID,
  SyntheticCameraControlAdapter,
  validateCameraControlCommand,
  validateCameraRigState,
} from "./cameraControl";

describe("camera control contract", () => {
  it("runs a deterministic discover, configure, arm and stream lifecycle", () => {
    const adapter = new SyntheticCameraControlAdapter();
    expect(adapter.getState().schemaVersion).toBe(CAMERA_RIG_SCHEMA_VERSION);
    expect(adapter.getState().hardwareWriteEnabled).toBe(false);
    expect(adapter.getState().physicalMeasurement).toBe(false);

    const discovered = adapter.discover();
    expect(discovered.discoveredCount).toBe(5);
    expect(discovered.state).toBe("discovered");

    const configured = adapter.configure(DEFAULT_CAMERA_PROFILE_ID);
    expect(configured.state).toBe("configured");
    const settings = adapter.setGain(3.5);
    expect(settings.devices.every((device) => device.gainDb === 3.5)).toBe(true);
    expect(adapter.setExposure(1800).devices[0].exposureUs).toBe(1800);
    expect(adapter.setTriggerMode("hardware").devices[0].triggerMode).toBe("hardware");
    const armed = adapter.arm();
    expect(armed.state).toBe("armed");
    const streaming = adapter.setStreaming(true);
    expect(streaming.state).toBe("streaming");
    const next = adapter.tick(0.25);
    expect(next.activeCount).toBe(5);
    expect(next.devices.every((device) => device.frameCount > 0)).toBe(true);
    expect(validateCameraRigState(next)).toEqual(next);

    const stopped = adapter.setStreaming(false);
    expect(stopped.state).toBe("armed");
    expect(stopped.activeCount).toBe(0);
  });

  it("keeps unsafe lifecycle transitions explicit", () => {
    const adapter = new SyntheticCameraControlAdapter();
    expect(() => adapter.arm()).toThrow(/Discover/u);
    expect(() => adapter.setStreaming(true)).toThrow(/Arm/u);
    expect(() => adapter.configure("missing-profile")).toThrow(/Unknown camera profile/u);
  });

  it("serialises native bridge intents without opening a transport", () => {
    const command = createCameraControlCommand(
      "set-exposure",
      { exposureUs: 1800 },
      "camera-1",
      12.5,
    );
    expect(validateCameraControlCommand(JSON.parse(JSON.stringify(command)))).toEqual(
      command,
    );
    expect(() => createCameraControlCommand("arm", {}, null, -1)).toThrow(
      /issuedAtMonotonicS/u,
    );
  });
});
