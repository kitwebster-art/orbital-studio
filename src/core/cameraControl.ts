export const CAMERA_RIG_SCHEMA_VERSION = "orbital.camera-rig/1.0" as const;
export const CAMERA_COMMAND_SCHEMA_VERSION = "orbital.camera-command/1.0" as const;
export const DEFAULT_CAMERA_COUNT = 5 as const;
const NO_FRAME_AGE_MS = 999_999;

export type CameraTransport = "genicam-gigevision" | "gmsl2" | "vendor-sdk" | "synthetic";
export type CameraSpectrum = "nir" | "visible" | "vis-nir";
export type CameraConnectionState =
  | "offline"
  | "discovered"
  | "configured"
  | "armed"
  | "streaming"
  | "fault";

export type CameraControlAction =
  | "discover"
  | "configure"
  | "set-exposure"
  | "set-gain"
  | "set-trigger-mode"
  | "arm"
  | "start-stream"
  | "stop-stream";

export interface CameraControlCommand {
  schemaVersion: typeof CAMERA_COMMAND_SCHEMA_VERSION;
  commandId: string;
  issuedAtMonotonicS: number;
  action: CameraControlAction;
  cameraId: string | null;
  parameters: Record<string, string | number | boolean>;
}

export function createCameraControlCommand(
  action: CameraControlAction,
  parameters: Record<string, string | number | boolean> = {},
  cameraId: string | null = null,
  issuedAtMonotonicS = 0,
): CameraControlCommand {
  if (!Number.isFinite(issuedAtMonotonicS) || issuedAtMonotonicS < 0) {
    throw new Error("issuedAtMonotonicS must be a finite non-negative number");
  }
  return {
    schemaVersion: CAMERA_COMMAND_SCHEMA_VERSION,
    commandId: `camera-command-${Math.round(issuedAtMonotonicS * 1_000_000)}`,
    issuedAtMonotonicS,
    action,
    cameraId,
    parameters: { ...parameters },
  };
}

export function validateCameraControlCommand(
  value: unknown,
): CameraControlCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Camera control command must be an object");
  }
  const command = value as Partial<CameraControlCommand>;
  if (command.schemaVersion !== CAMERA_COMMAND_SCHEMA_VERSION) {
    throw new Error("Camera control command schemaVersion is unsupported");
  }
  if (typeof command.commandId !== "string" || command.commandId.length === 0) {
    throw new Error("Camera control command commandId is required");
  }
  if (
    typeof command.issuedAtMonotonicS !== "number" ||
    !Number.isFinite(command.issuedAtMonotonicS) ||
    command.issuedAtMonotonicS < 0
  ) {
    throw new Error("Camera control command timestamp is invalid");
  }
  if (
    ![
      "discover",
      "configure",
      "set-exposure",
      "set-gain",
      "set-trigger-mode",
      "arm",
      "start-stream",
      "stop-stream",
    ].includes(command.action as string)
  ) {
    throw new Error("Camera control command action is unsupported");
  }
  if (command.cameraId !== null && typeof command.cameraId !== "string") {
    throw new Error("Camera control command cameraId must be a string or null");
  }
  if (!command.parameters || typeof command.parameters !== "object") {
    throw new Error("Camera control command parameters are required");
  }
  return value as CameraControlCommand;
}

export interface CameraProfile {
  id: string;
  vendor: string;
  model: string;
  transport: CameraTransport;
  spectrum: CameraSpectrum;
  resolutionPx: {
    width: number;
    height: number;
  };
  maxFps: number;
  pixelFormat: "mono8" | "mono12" | "rgb8";
  globalShutter: true;
  hardwareTrigger: true;
  lensMount: "C-mount";
  recommendation: "primary" | "fallback" | "compute-optimised";
  note: string;
}

export interface CameraDeviceState {
  id: string;
  index: number;
  label: string;
  profileId: string;
  state: CameraConnectionState;
  frameCount: number;
  droppedFrames: number;
  fps: number;
  latencyMs: number;
  lastFrameAgeMs: number;
  exposureUs: number;
  gainDb: number;
  triggerMode: "hardware" | "free-run";
  flags: string[];
}

export interface CameraRigState {
  schemaVersion: typeof CAMERA_RIG_SCHEMA_VERSION;
  transport: CameraTransport;
  hardwareWriteEnabled: false;
  physicalMeasurement: false;
  profileId: string;
  state: CameraConnectionState;
  discoveredCount: number;
  activeCount: number;
  targetCount: number;
  devices: CameraDeviceState[];
  flags: string[];
}

export interface CameraControlAdapter {
  readonly label: string;
  readonly available: boolean;
  readonly hardwareWriteEnabled: false;
  getState(): CameraRigState;
  discover(): CameraRigState;
  configure(profileId: string): CameraRigState;
  setExposure(exposureUs: number, cameraId?: string): CameraRigState;
  setGain(gainDb: number, cameraId?: string): CameraRigState;
  setTriggerMode(
    triggerMode: "hardware" | "free-run",
    cameraId?: string,
  ): CameraRigState;
  arm(): CameraRigState;
  setStreaming(streaming: boolean): CameraRigState;
  setFault(fault: string | null): CameraRigState;
  tick(deltaS: number): CameraRigState;
  reset(): CameraRigState;
}

export const CAMERA_PROFILES: readonly CameraProfile[] = Object.freeze([
  {
    id: "basler-ace2-nir",
    vendor: "Basler",
    model: "ace 2 a2A2048-114g5mBAS",
    transport: "genicam-gigevision",
    spectrum: "vis-nir",
    resolutionPx: { width: 2064, height: 1552 },
    maxFps: 115,
    pixelFormat: "mono8",
    globalShutter: true,
    hardwareTrigger: true,
    lensMount: "C-mount",
    recommendation: "primary",
    note: "NIR-enhanced Sony IMX900 class sensor, GigE Vision and pylon bridge target.",
  },
  {
    id: "flir-blackfly-s-5mp",
    vendor: "Teledyne FLIR",
    model: "Blackfly S BFS-U3-51S5P",
    transport: "vendor-sdk",
    spectrum: "visible",
    resolutionPx: { width: 2448, height: 2048 },
    maxFps: 73,
    pixelFormat: "mono8",
    globalShutter: true,
    hardwareTrigger: true,
    lensMount: "C-mount",
    recommendation: "fallback",
    note: "High-resolution monochrome benchmark when NIR filtering is external.",
  },
  {
    id: "basler-ace2-gmsl2",
    vendor: "Basler",
    model: "ace 2 a2A2448-90mgm",
    transport: "gmsl2",
    spectrum: "visible",
    resolutionPx: { width: 2448, height: 2048 },
    maxFps: 90,
    pixelFormat: "mono8",
    globalShutter: true,
    hardwareTrigger: true,
    lensMount: "C-mount",
    recommendation: "compute-optimised",
    note: "Jetson or IPC path when deterministic GMSL2 cabling is more important than NIR response.",
  },
]);

export const DEFAULT_CAMERA_PROFILE_ID = "basler-ace2-nir" as const;

function profileById(profileId: string): CameraProfile {
  const profile = CAMERA_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Unknown camera profile: ${profileId}`);
  }
  return profile;
}

function createDevice(index: number, profile: CameraProfile): CameraDeviceState {
  return {
    id: `camera-${index + 1}`,
    index,
    label: `Camera ${index + 1}`,
    profileId: profile.id,
    state: "offline",
    frameCount: 0,
    droppedFrames: 0,
    fps: 0,
    latencyMs: 0,
    lastFrameAgeMs: NO_FRAME_AGE_MS,
    exposureUs: 2_500,
    gainDb: 0,
    triggerMode: "hardware",
    flags: ["VIRTUAL_DEVICE", "NO_HARDWARE_MEASUREMENT"],
  };
}

function cloneDevice(device: CameraDeviceState): CameraDeviceState {
  return { ...device, flags: [...device.flags] };
}

function cloneState(state: CameraRigState): CameraRigState {
  return {
    ...state,
    devices: state.devices.map(cloneDevice),
    flags: [...state.flags],
  };
}

/**
 * Deterministic camera-control surface for the browser digital twin. It has
 * the same lifecycle as the eventual native GenICam bridge, but every write
 * is explicitly virtual and can never reach a camera.
 */
export class SyntheticCameraControlAdapter implements CameraControlAdapter {
  readonly label = "Synthetic five-camera GenICam rig";
  readonly available = true;
  readonly hardwareWriteEnabled = false as const;

  private state: CameraRigState;
  private fault: string | null = null;

  constructor(cameraCount = DEFAULT_CAMERA_COUNT, profileId = DEFAULT_CAMERA_PROFILE_ID) {
    if (!Number.isInteger(cameraCount) || cameraCount <= 0 || cameraCount > 16) {
      throw new Error("cameraCount must be an integer between 1 and 16");
    }
    const profile = profileById(profileId);
    this.state = {
      schemaVersion: CAMERA_RIG_SCHEMA_VERSION,
      transport: "synthetic",
      hardwareWriteEnabled: false,
      physicalMeasurement: false,
      profileId: profile.id,
      state: "offline",
      discoveredCount: 0,
      activeCount: 0,
      targetCount: cameraCount,
      devices: Array.from({ length: cameraCount }, (_, index) =>
        createDevice(index, profile),
      ),
      flags: ["SYNTHETIC_INPUT", "SOFTWARE_INTERFACE_PROOF", "NO_HARDWARE_MEASUREMENT"],
    };
  }

  getState(): CameraRigState {
    return cloneState(this.state);
  }

  discover(): CameraRigState {
    if (this.fault) {
      return this.getState();
    }
    this.state = {
      ...this.state,
      state: "discovered",
      discoveredCount: this.state.devices.length,
      devices: this.state.devices.map((device) => ({
        ...device,
        state: "discovered",
        lastFrameAgeMs: NO_FRAME_AGE_MS,
      })),
      flags: [
        ...this.state.flags.filter((flag) => flag !== "DISCOVERY_PENDING"),
        "DISCOVERED_VIRTUAL_CAMERAS",
      ],
    };
    return this.getState();
  }

  configure(profileId: string): CameraRigState {
    const profile = profileById(profileId);
    if (this.state.state === "streaming") {
      throw new Error("Stop the camera stream before changing profiles");
    }
    this.state = {
      ...this.state,
      profileId: profile.id,
      state: this.state.discoveredCount > 0 ? "configured" : "offline",
      devices: this.state.devices.map((device) => ({
        ...device,
        profileId: profile.id,
        state: this.state.discoveredCount > 0 ? "configured" : "offline",
        fps: 0,
        lastFrameAgeMs: NO_FRAME_AGE_MS,
      })),
      flags: [...this.state.flags, "PROFILE_CONFIGURED", `PROFILE_${profile.id.toUpperCase()}`],
    };
    return this.getState();
  }

  setExposure(exposureUs: number, cameraId?: string): CameraRigState {
    if (!Number.isFinite(exposureUs) || exposureUs <= 0 || exposureUs > 100_000) {
      throw new Error("Exposure must be between 0 and 100000 microseconds");
    }
    this.state = {
      ...this.state,
      devices: this.state.devices.map((device) =>
        !cameraId || device.id === cameraId
          ? { ...device, exposureUs, flags: [...device.flags, "EXPOSURE_CONFIGURED"] }
          : device,
      ),
      flags: [...this.state.flags, "EXPOSURE_CONFIGURED_VIRTUALLY"],
    };
    return this.getState();
  }

  setGain(gainDb: number, cameraId?: string): CameraRigState {
    if (!Number.isFinite(gainDb) || gainDb < -12 || gainDb > 36) {
      throw new Error("Gain must be between -12 and 36 dB");
    }
    this.state = {
      ...this.state,
      devices: this.state.devices.map((device) =>
        !cameraId || device.id === cameraId
          ? { ...device, gainDb, flags: [...device.flags, "GAIN_CONFIGURED"] }
          : device,
      ),
      flags: [...this.state.flags, "GAIN_CONFIGURED_VIRTUALLY"],
    };
    return this.getState();
  }

  setTriggerMode(
    triggerMode: "hardware" | "free-run",
    cameraId?: string,
  ): CameraRigState {
    if (triggerMode !== "hardware" && triggerMode !== "free-run") {
      throw new Error("Unsupported trigger mode");
    }
    this.state = {
      ...this.state,
      devices: this.state.devices.map((device) =>
        !cameraId || device.id === cameraId
          ? { ...device, triggerMode, flags: [...device.flags, `TRIGGER_${triggerMode.toUpperCase()}`] }
          : device,
      ),
      flags: [...this.state.flags, `TRIGGER_${triggerMode.toUpperCase()}_VIRTUALLY`],
    };
    return this.getState();
  }

  arm(): CameraRigState {
    if (this.fault) {
      return this.getState();
    }
    if (this.state.discoveredCount !== this.state.targetCount) {
      throw new Error("Discover all virtual cameras before arming the rig");
    }
    this.state = {
      ...this.state,
      state: "armed",
      devices: this.state.devices.map((device) => ({ ...device, state: "armed" })),
      flags: [...this.state.flags, "HARDWARE_TRIGGER_ARMED_VIRTUALLY"],
    };
    return this.getState();
  }

  setStreaming(streaming: boolean): CameraRigState {
    if (this.fault) {
      return this.getState();
    }
    if (streaming && this.state.state !== "armed" && this.state.state !== "streaming") {
      throw new Error("Arm the camera rig before starting the stream");
    }
    const nextState: CameraConnectionState = streaming ? "streaming" : "armed";
    this.state = {
      ...this.state,
      state: nextState,
      activeCount: streaming ? this.state.devices.length : 0,
      devices: this.state.devices.map((device) => ({
        ...device,
        state: nextState,
        fps: streaming ? 94.6 : 0,
        lastFrameAgeMs: streaming ? 0 : NO_FRAME_AGE_MS,
      })),
      flags: [...this.state.flags, streaming ? "STREAMING_VIRTUALLY" : "STREAM_STOPPED"],
    };
    return this.getState();
  }

  setFault(fault: string | null): CameraRigState {
    this.fault = fault;
    if (fault) {
      this.state = {
        ...this.state,
        state: "fault",
        activeCount: 0,
        devices: this.state.devices.map((device) => ({
          ...device,
          state: "fault",
          fps: 0,
          flags: [...device.flags, fault],
        })),
        flags: [...this.state.flags, fault, "CAMERA_OUTPUT_BLOCKED"],
      };
    } else {
      this.reset();
    }
    return this.getState();
  }

  tick(deltaS: number): CameraRigState {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("Camera deltaS must be a finite non-negative number");
    }
    if (this.state.state !== "streaming" || this.fault) {
      return this.getState();
    }
    const profile = profileById(this.state.profileId);
    const frameIncrement = Math.max(0, Math.floor(deltaS * profile.maxFps));
    this.state = {
      ...this.state,
      devices: this.state.devices.map((device) => ({
        ...device,
        frameCount: device.frameCount + frameIncrement,
        fps: profile.maxFps,
        latencyMs: 7.5 + (device.index % 3) * 0.8,
        lastFrameAgeMs: Math.min(10, deltaS * 1000),
      })),
    };
    return this.getState();
  }

  reset(): CameraRigState {
    const profile = profileById(this.state.profileId);
    this.fault = null;
    this.state = {
      ...this.state,
      state: "offline",
      discoveredCount: 0,
      activeCount: 0,
      devices: this.state.devices.map((device) => createDevice(device.index, profile)),
      flags: ["SYNTHETIC_INPUT", "SOFTWARE_INTERFACE_PROOF", "NO_HARDWARE_MEASUREMENT"],
    };
    return this.getState();
  }
}

export function validateCameraRigState(value: unknown): CameraRigState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Camera rig state must be an object");
  }
  const state = value as Partial<CameraRigState>;
  if (state.schemaVersion !== CAMERA_RIG_SCHEMA_VERSION) {
    throw new Error("Camera rig schemaVersion is unsupported");
  }
  if (state.hardwareWriteEnabled !== false || state.physicalMeasurement !== false) {
    throw new Error("Camera rig state cannot claim hardware writes or physical measurement");
  }
  if (!Array.isArray(state.devices) || state.devices.length !== state.targetCount) {
    throw new Error("Camera rig devices must match targetCount");
  }
  state.devices.forEach((device, index) => {
    if (!device || device.index !== index || !Array.isArray(device.flags)) {
      throw new Error(`Camera rig device ${index + 1} is invalid`);
    }
    if (!["offline", "discovered", "configured", "armed", "streaming", "fault"].includes(device.state as string)) {
      throw new Error(`Camera rig device ${index + 1} state is invalid`);
    }
    if (!Number.isFinite(device.exposureUs) || device.exposureUs <= 0) {
      throw new Error(`Camera rig device ${index + 1} exposure is invalid`);
    }
    if (
      !Number.isFinite(device.gainDb) ||
      !Number.isFinite(device.fps) ||
      !Number.isFinite(device.latencyMs) ||
      !Number.isFinite(device.lastFrameAgeMs) ||
      !Number.isInteger(device.frameCount) ||
      !Number.isInteger(device.droppedFrames) ||
      device.frameCount < 0 ||
      device.droppedFrames < 0 ||
      device.fps < 0 ||
      device.latencyMs < 0 ||
      device.lastFrameAgeMs < 0
    ) {
      throw new Error(`Camera rig device ${index + 1} telemetry is invalid`);
    }
  });
  return value as CameraRigState;
}
