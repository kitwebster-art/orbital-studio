import { parseMonocularCalibration, reconstructMonocularSphere, type MonocularCalibration } from "../core/monocularCalibration";
import {
  WORLD_STATE_SCHEMA_VERSION,
  type ShapeState,
  type TrackingAdapter,
  type TrackingStatus,
  type Vec3,
  type WorldState,
} from "../core/contracts";
import { clamp } from "../core/math";
import {
  parseTrackerFrame,
  type TrackerReplayFrame,
} from "./ReplayTrackingAdapter";

interface WebSocketMessageEventLike { data: unknown }
interface WebSocketCloseEventLike { code?: number }

export interface WebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: WebSocketMessageEventLike) => void) | null;
  onclose: ((event: WebSocketCloseEventLike) => void) | null;
  onerror: (() => void) | null;
  close(code?: number, reason?: string): void;
  send?(data: string): void;
}

export interface LiveBridgeStatus {
  connection: "disconnected" | "connecting" | "connected" | "reconnecting";
  url: string;
  receivedFrames: number;
  droppedFrames: number;
  invalidFrames: number;
  reconnectAttempts: number;
  lastSourceSequence: number | null;
  source: "unknown" | "simulated" | "physical-huateng";
  activeCameraCount: number;
  processingMs: number | null;
}

export interface WebSocketTrackingOptions {
  url?: string;
  nominalRadiusM?: number;
  horizontalPreviewSpanM?: number;
  verticalPreviewSpanM?: number;
  previewCenterM?: Vec3;
  staleAfterMs?: number;
  unavailableAfterMs?: number;
  reconnectInitialMs?: number;
  reconnectMaximumMs?: number;
  nowMs?: () => number;
  createSocket?: (url: string) => WebSocketLike;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
}

const DEFAULT_CENTER: Vec3 = { x: 0, y: 3.35, z: 0 };

function uniqueFlags(flags: readonly string[]): string[] {
  return [...new Set(flags)];
}

export class WebSocketTrackingAdapter implements TrackingAdapter {
  readonly mode = "live" as const;
  readonly label = "Local fused tracking WebSocket";

  private url: string;
  private nominalRadiusM: number;
  private horizontalPreviewSpanM: number;
  private verticalPreviewSpanM: number;
  private previewCenterM: Vec3;
  private readonly staleAfterMs: number;
  private readonly unavailableAfterMs: number;
  private readonly reconnectInitialMs: number;
  private readonly reconnectMaximumMs: number;
  private readonly nowMs: () => number;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelScheduled: (handle: unknown) => void;
  private clockRequest: { id: string; sentAtMs: number } | null = null;
  private clockSync: { offsetMs: number; uncertaintyMs: number; syncedAtMs: number } | null = null;
  private clockSequence = 0;

  private requestClock(): void {
    if (!this.socket?.send || this.socket.readyState !== 1) return;
    const now = this.nowMs();
    if (this.clockRequest && now - this.clockRequest.sentAtMs < 2000) return;
    const id = `orbital-clock-${++this.clockSequence}`;
    this.clockRequest = { id, sentAtMs: now };
    try { this.socket.send(JSON.stringify({ schema_version: "orbital.camera-control/1.0", request_id: id, action: "clock" })); }
    catch { this.clockRequest = null; }
  }

  private monocularCalibration: MonocularCalibration | null = null;
  private lastMetric: { sequence: number; timeS: number; center: Vec3; velocity: Vec3 } | null = null;

  setPreviewGeometry(radiusM: number, centerM: Vec3): void {
    if (!Number.isFinite(radiusM) || radiusM < 0.025 || radiusM > 2.5 || !centerM || ![centerM.x, centerM.y, centerM.z].every(Number.isFinite)) throw new Error("Invalid preview ball geometry");
    this.nominalRadiusM = radiusM;
    this.previewCenterM = { ...centerM };
    this.horizontalPreviewSpanM = radiusM * 4;
    this.verticalPreviewSpanM = radiusM * 3;
    this.latest = null;
    this.lastMetric = null;
  }

  /**
   * Latest tracked ball outline in camera pixels, for the structured-light 2D
   * mapping. Null when disconnected or the latest frame has no valid geometry.
   * Freshness is enforced separately by the output gate.
   */
  imageEllipse(): { centerPx: [number, number]; majorPx: number; minorPx: number; angleDeg: number; frameWidthPx: number; frameHeightPx: number; velocityPxPerS: [number, number]; ageMs: number; confidence: number } | null {
    const frame = this.latest;
    if (this.connection !== "connected" || !frame?.geometry || !frame.state_valid) return null;
    const { center_norm, ellipse } = frame.geometry;
    const velocity = frame.velocity?.norm_per_s ?? [0, 0];
    return {
      centerPx: [center_norm[0] * frame.frame.width_px, center_norm[1] * frame.frame.height_px],
      majorPx: ellipse.major_diameter_px, minorPx: ellipse.minor_diameter_px, angleDeg: ellipse.angle_deg,
      frameWidthPx: frame.frame.width_px, frameHeightPx: frame.frame.height_px,
      velocityPxPerS: [velocity[0] * frame.frame.width_px, velocity[1] * frame.frame.height_px],
      // Time since this frame arrived, plus the bridge's own processing time.
      ageMs: Math.max(0, this.nowMs() - this.latestReceivedAtMs) + (frame.timing?.processing_latency_ms ?? 0),
      confidence: frame.confidence,
    };
  }

  setMonocularCalibration(value: unknown | null): void {
    this.monocularCalibration = value === null ? null : parseMonocularCalibration(value);
    this.lastMetric = null;
    this.latest = null;
  }

  setUrl(url: string): void {
    const parsed = new URL(url);
    if (!["ws:", "wss:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Tracking endpoint must be ws/wss without credentials");
    this.disconnect();
    this.url = parsed.toString();
    this.reset();
  }

  private socket: WebSocketLike | null = null;
  private reconnectHandle: unknown = null;
  private manuallyDisconnected = true;
  private connection: LiveBridgeStatus["connection"] = "disconnected";
  private latest: TrackerReplayFrame | null = null;
  private latestReceivedAtMs = 0;
  private receivedFrames = 0;
  private droppedFrames = 0;
  private invalidFrames = 0;
  private reconnectAttempts = 0;
  private lastSourceSequence: number | null = null;
  private source: LiveBridgeStatus["source"] = "unknown";
  private activeCameras = 0;
  private processingMs: number | null = null;

  constructor(options: WebSocketTrackingOptions = {}) {
    this.url = options.url ?? "ws://127.0.0.1:8765";
    this.nominalRadiusM = options.nominalRadiusM ?? 2.5;
    this.horizontalPreviewSpanM = options.horizontalPreviewSpanM ?? 4;
    this.verticalPreviewSpanM = options.verticalPreviewSpanM ?? 3;
    this.previewCenterM = { ...(options.previewCenterM ?? DEFAULT_CENTER) };
    this.staleAfterMs = options.staleAfterMs ?? 120;
    this.unavailableAfterMs = options.unavailableAfterMs ?? 500;
    this.reconnectInitialMs = options.reconnectInitialMs ?? 250;
    this.reconnectMaximumMs = options.reconnectMaximumMs ?? 2_000;
    this.nowMs = options.nowMs ?? (() => performance.now());
    this.createSocket = options.createSocket ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.schedule = options.schedule ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
    this.cancelScheduled = options.cancelScheduled ?? ((handle) => window.clearTimeout(handle as number));
    if (this.unavailableAfterMs <= this.staleAfterMs) {
      throw new Error("unavailableAfterMs must be greater than staleAfterMs");
    }
  }

  connect(): void {
    this.manuallyDisconnected = false;
    if (this.socket && this.socket.readyState <= 1) return;
    this.openSocket(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    this.connection = "disconnected";
    if (this.reconnectHandle !== null) {
      this.cancelScheduled(this.reconnectHandle);
      this.reconnectHandle = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "runtime mode changed");
  }

  get status(): LiveBridgeStatus {
    return {
      connection: this.connection,
      url: this.url,
      receivedFrames: this.receivedFrames,
      droppedFrames: this.droppedFrames,
      invalidFrames: this.invalidFrames,
      reconnectAttempts: this.reconnectAttempts,
      lastSourceSequence: this.lastSourceSequence,
      source: this.source,
      activeCameraCount: this.activeCameras,
      processingMs: this.processingMs,
    };
  }

  sample(timeS: number, _deltaS: number): WorldState {
    if (this.connection !== "connected") {
      return this.invalidState(timeS, "unavailable", [
        "LIVE_BRIDGE_DISCONNECTED",
        this.connection === "reconnecting" ? "RECONNECT_PENDING" : "CONNECT_REQUIRED",
      ]);
    }
    if (!this.clockSync || this.nowMs() - this.clockSync.syncedAtMs > 10_000) this.requestClock();
    const frame = this.latest;
    if (!frame) {
      return this.invalidState(timeS, "acquiring", ["LIVE_BRIDGE_CONNECTED", "WAITING_FOR_FUSED_STATE"]);
    }
    const synchronised = this.clockSync && this.nowMs() - this.clockSync.syncedAtMs <= 30_000 && frame.clock_domain === "monotonic" && frame.capture_timestamp_ns !== undefined;
    if (synchronised && this.clockSync && frame.capture_timestamp_ns! / 1e6 + this.clockSync.offsetMs - this.nowMs() > this.clockSync.uncertaintyMs + 1) {
      return this.invalidState(timeS, "unavailable", [...frame.flags, "SOURCE_CLOCK_INCONSISTENT", "OUTPUT_SUPPRESSED"], 0, frame.sequence);
    }
    const nativeAgeMs = frame.capture_timestamp_ns !== undefined && frame.timing
      ? Math.max(0, (frame.timing.processing_completed_timestamp_ns - frame.capture_timestamp_ns) / 1e6) : 0;
    const ageMs = synchronised && this.clockSync
      ? Math.max(0, this.nowMs() - (frame.capture_timestamp_ns! / 1e6 + this.clockSync.offsetMs) + this.clockSync.uncertaintyMs)
      : Math.max(0, this.nowMs() - this.latestReceivedAtMs) + nativeAgeMs;
    const validityMs = frame.capture_timestamp_ns !== undefined && frame.valid_until_timestamp_ns !== undefined
      ? (frame.valid_until_timestamp_ns - frame.capture_timestamp_ns) / 1e6 : this.unavailableAfterMs;
    if (ageMs > Math.min(this.unavailableAfterMs, validityMs)) {
      return this.invalidState(timeS, "unavailable", [
        ...frame.flags,
        "LIVE_STATE_EXPIRED",
        "OUTPUT_SUPPRESSED",
      ], ageMs, frame.sequence);
    }
    if (!frame.state_valid || !frame.geometry || frame.status === "lost" || frame.status === "unavailable") {
      return this.invalidState(
        timeS,
        frame.status === "unavailable" ? "unavailable" : "lost",
        frame.flags,
        ageMs,
        frame.sequence,
      );
    }
    let mapped: { centerM: Vec3; velocityMps: Vec3; shape: ShapeState };
    try { mapped = this.mapFrame(frame); }
    catch { return this.invalidState(timeS, "lost", [...frame.flags, "MONOCULAR_GEOMETRY_REJECTED", "OUTPUT_SUPPRESSED"], ageMs, frame.sequence); }
    const stale = ageMs > this.staleAfterMs;
    return {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence: frame.sequence,
      mode: "live",
      monotonicTimeS: frame.source_time_s,
      status: stale ? "degraded" : frame.status,
      stateValid: true,
      measurementValid: stale ? false : frame.measurement_valid,
      confidence: stale
        ? clamp(frame.confidence * (1 - (ageMs - this.staleAfterMs) / this.unavailableAfterMs))
        : frame.confidence,
      centerM: mapped.centerM,
      velocityMps: mapped.velocityMps,
      shape: mapped.shape,
      prediction: null,
      diagnostics: {
        sourceAgeMs: ageMs,
        processingMs: frame.timing?.processing_latency_ms ?? 0,
        droppedFrames: this.droppedFrames,
        activeCameraCount: this.activeCameraCount(frame.flags),
        flags: uniqueFlags([
          ...frame.flags,
          "LOCAL_WEBSOCKET_BRIDGE",
          "RECEIPT_CLOCK_STALENESS",
          synchronised ? "SYNCHRONISED_SOURCE_CLOCK" : "TRANSPORT_AGE_UNMEASURED",
          this.monocularCalibration ? "CALIBRATED_MONOCULAR_SPHERE_APPROXIMATION" : "UNCALIBRATED_IMAGE_SPACE_PREVIEW",
          "NO_RAW_CAMERA_FEEDS_IN_BROWSER",
          ...(stale ? ["STALE_LIVE_STATE", "BOUNDED_HOLD_LAST_STATE"] : []),
        ]),
      },
      materialRotationTracked: false,
    };
  }

  reset(): void {
    this.clockSync = null;
    this.clockRequest = null;
    this.lastMetric = null;
    this.latest = null;
    this.latestReceivedAtMs = 0;
    this.receivedFrames = 0;
    this.droppedFrames = 0;
    this.invalidFrames = 0;
    this.lastSourceSequence = null;
    this.source = "unknown";
    this.activeCameras = 0;
    this.processingMs = null;
  }

  private openSocket(connection: LiveBridgeStatus["connection"]): void {
    this.connection = connection;
    let socket: WebSocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.connection = "connected";
      this.clockSync = null;
      this.clockRequest = null;
      this.requestClock();
      this.reconnectAttempts = 0;
      // A restarted native service begins its source sequence at zero. Treat
      // each WebSocket connection as a new sequence epoch.
      this.lastSourceSequence = null;
      this.latest = null;
      this.lastMetric = null;
      this.latestReceivedAtMs = 0;
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") {
        this.invalidFrames += 1;
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload?.schema_version === "orbital.camera-control-result/1.0") {
          if (this.clockRequest && payload.request_id === this.clockRequest.id) {
            const now = this.nowMs(), rtt = now - this.clockRequest.sentAtMs;
            if (payload.ok === true && typeof payload.server_monotonic_ns === "number" && Number.isFinite(payload.server_monotonic_ns) && payload.server_monotonic_ns > 0 && rtt >= 0 && rtt <= 100) {
              this.clockSync = { offsetMs: (this.clockRequest.sentAtMs + now) / 2 - payload.server_monotonic_ns / 1e6, uncertaintyMs: rtt / 2, syncedAtMs: now };
            }
            this.clockRequest = null;
          }
          return;
        }
        const frame = parseTrackerFrame(payload, "WebSocket frame");
        if (frame.source_mode !== "live") throw new Error("source_mode must be live");
        if (this.lastSourceSequence !== null) {
          if (frame.sequence <= this.lastSourceSequence) {
            this.invalidFrames += 1;
            return;
          }
          this.droppedFrames += Math.max(0, frame.sequence - this.lastSourceSequence - 1);
        }
        this.lastSourceSequence = frame.sequence;
        this.source = frame.flags.includes("HUATENG_HT_GE134GM_T1P_C")
          ? "physical-huateng"
          : frame.flags.includes("SIMULATED_NATIVE_CAPTURE")
            ? "simulated"
            : "unknown";
        this.activeCameras = this.activeCameraCount(frame.flags);
        this.processingMs = frame.timing?.processing_latency_ms ?? null;
        this.latest = frame;
        this.latestReceivedAtMs = this.nowMs();
        this.receivedFrames += 1;
      } catch {
        this.invalidFrames += 1;
      }
    };
    socket.onerror = () => undefined;
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.manuallyDisconnected) {
        this.connection = "disconnected";
      } else {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.manuallyDisconnected || this.reconnectHandle !== null) return;
    this.connection = "reconnecting";
    const delay = Math.min(
      this.reconnectMaximumMs,
      this.reconnectInitialMs * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts += 1;
    this.reconnectHandle = this.schedule(() => {
      this.reconnectHandle = null;
      if (!this.manuallyDisconnected) this.openSocket("reconnecting");
    }, delay);
  }

  /** Optional placement from a structured-light scan (image outline to twin position). */
  private placement: ((frame: TrackerReplayFrame) => Vec3 | null) | null = null;
  private lastPlaced: { sequence: number; timeS: number; center: Vec3; velocity: Vec3 } | null = null;
  setPlacement(placement: ((frame: TrackerReplayFrame) => Vec3 | null) | null): void {
    this.placement = placement;
    this.lastPlaced = null;
  }

  private mapFrame(frame: TrackerReplayFrame): { centerM: Vec3; velocityMps: Vec3; shape: ShapeState } {
    if (!frame.geometry) throw new Error("Cannot map live frame without geometry");
    const placed = !this.monocularCalibration && this.placement ? this.placement(frame) : null;
    if (placed) {
      const previous = this.lastPlaced;
      const dt = previous ? frame.source_time_s - previous.timeS : 0;
      const velocityMps = previous?.sequence === frame.sequence ? previous.velocity : previous && dt >= 0.001 && dt < 0.2
        ? { x: (placed.x - previous.center.x) / dt, y: (placed.y - previous.center.y) / dt, z: (placed.z - previous.center.z) / dt }
        : { x: 0, y: 0, z: 0 };
      this.lastPlaced = { sequence: frame.sequence, timeS: frame.source_time_s, center: placed, velocity: velocityMps };
      const radius = this.nominalRadiusM;
      return { centerM: placed, velocityMps, shape: { radiiM: { x: radius, y: radius, z: radius }, principalAxisDeg: frame.geometry.ellipse.angle_deg, wobble: 0, deformationRate: 0, volumeProxy: 1 } };
    }
    if (this.monocularCalibration) {
      const centerM = reconstructMonocularSphere(frame, this.monocularCalibration);
      const previous = this.lastMetric;
      const dt = previous ? frame.source_time_s - previous.timeS : 0;
      const velocityMps = previous?.sequence === frame.sequence ? previous.velocity : previous && dt >= 0.001 && dt < 0.2
        ? { x: (centerM.x - previous.center.x) / dt, y: (centerM.y - previous.center.y) / dt, z: (centerM.z - previous.center.z) / dt }
        : { x: 0, y: 0, z: 0 };
      if (Math.hypot(velocityMps.x, velocityMps.y, velocityMps.z) > 30) throw new Error("Monocular velocity exceeds 30 m/s test envelope");
      this.lastMetric = { sequence: frame.sequence, timeS: frame.source_time_s, center: centerM, velocity: velocityMps };
      const radius = this.monocularCalibration.sphereRadiusM;
      return { centerM, velocityMps, shape: { radiiM: { x: radius, y: radius, z: radius }, principalAxisDeg: 0, wobble: 0, deformationRate: 0, volumeProxy: 1 } };
    }
    const [centerX, centerY] = frame.geometry.center_norm;
    const velocity = frame.velocity?.norm_per_s ?? [0, 0];
    const major = frame.geometry.ellipse.major_diameter_px;
    const minor = frame.geometry.ellipse.minor_diameter_px;
    const axisRatio = Math.max(1, major / minor);
    const majorRadius = this.nominalRadiusM * Math.sqrt(axisRatio);
    const minorRadius = this.nominalRadiusM / Math.sqrt(axisRatio);
    const angle = frame.geometry.ellipse.angle_deg * Math.PI / 180;
    const radiusX = Math.hypot(majorRadius * Math.cos(angle), minorRadius * Math.sin(angle));
    const radiusY = Math.hypot(majorRadius * Math.sin(angle), minorRadius * Math.cos(angle));
    const radiusZ = this.nominalRadiusM ** 3 / (radiusX * radiusY);
    return {
      centerM: {
        x: this.previewCenterM.x + (centerX - 0.5) * this.horizontalPreviewSpanM,
        y: this.previewCenterM.y + (0.5 - centerY) * this.verticalPreviewSpanM,
        z: this.previewCenterM.z,
      },
      velocityMps: {
        x: velocity[0] * this.horizontalPreviewSpanM,
        y: -velocity[1] * this.verticalPreviewSpanM,
        z: 0,
      },
      shape: {
        radiiM: { x: radiusX, y: radiusY, z: radiusZ },
        principalAxisDeg: frame.geometry.ellipse.angle_deg,
        wobble: clamp(frame.geometry.gross_deformation.squash_stretch / 0.35),
        deformationRate: 0,
        volumeProxy: radiusX * radiusY * radiusZ / this.nominalRadiusM ** 3,
      },
    };
  }

  private activeCameraCount(flags: readonly string[]): number {
    const match = flags.find((flag) => /^ACTIVE_CAMERAS_\d+$/u.test(flag));
    return match ? Number(match.slice("ACTIVE_CAMERAS_".length)) : 0;
  }

  private invalidState(
    timeS: number,
    status: Extract<TrackingStatus, "acquiring" | "lost" | "unavailable">,
    flags: readonly string[],
    ageMs = 0,
    sequence = this.lastSourceSequence ?? 0,
  ): WorldState {
    return {
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      sequence,
      mode: "live",
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
        sourceAgeMs: ageMs,
        processingMs: 0,
        droppedFrames: this.droppedFrames,
        activeCameraCount: 0,
        flags: uniqueFlags([
          ...flags,
          "LOCAL_WEBSOCKET_BRIDGE",
          "NO_RAW_CAMERA_FEEDS_IN_BROWSER",
        ]),
      },
      materialRotationTracked: false,
    };
  }
}
