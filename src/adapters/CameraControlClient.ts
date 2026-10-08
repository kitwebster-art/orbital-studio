export interface CameraControlReply {
  schema_version: 'orbital.camera-control-result/1.0';
  request_id: string;
  ok: boolean;
  error?: string;
  status: { source: string; running: boolean; settings: Record<string, unknown>; device: unknown; capabilities: Record<string, unknown> };
  devices?: unknown[];
  registration?: import("../core/sphereRegistration").SphereRegistration;
  marker?: {camera_px?: [number,number];peak_contrast?:number;area_px?:number;ball_center_px?:[number,number];radius_px?:number};
  /** Bridge monotonic clock at reply time (clock and brightness-trace actions). */
  server_monotonic_ns?: number;
  /** Ball centre brightness per frame: [host receive time ns, level] (brightness-trace action). */
  trace?: Array<[number, number]>;
  /** Setup-only camera aim picture (validated by parseCameraPreview). */
  preview?: unknown;
}
/** Separate control socket keeps replies out of the high-frequency tracking consumer. */
export class CameraControlClient {
  private socket: WebSocket | null = null;
  private serial = 0;
  private connectedUrl: string | null = null;
  /** Receives structured-light calibration messages (pattern, progress, result, bridge cancel) on this socket. */
  onCalibrationMessage: ((message: Record<string, unknown>) => void) | null = null;
  constructor(private readonly onDisconnect: () => void = () => {}) {}
  get connected(): boolean { return !!this.socket && this.socket.readyState === WebSocket.OPEN; }
  get endpoint(): string | null { return this.connectedUrl; }
  assertEndpoint(url: string): void {
    if (this.connectedUrl !== new URL(url).href) throw new Error('Bridge URL changed. Connect controls to this endpoint before sending commands.');
  }
  private pending = new Map<string, { resolve: (reply: CameraControlReply) => void; reject: (e: Error) => void; timer: number }>();
  async connect(url: string): Promise<void> {
    this.disconnect();
    const socket = new WebSocket(url);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { socket.close(); reject(new Error('Bridge connection timed out. Start the local tracker service.')); }, 5000);
      socket.onopen = () => { if (this.socket !== socket) return; clearTimeout(timer); this.connectedUrl = new URL(url).href; resolve(); };
      socket.onerror = () => { if (this.socket !== socket) return; clearTimeout(timer); reject(new Error('Bridge unavailable. Start the local tracker service.')); };
      socket.onclose = () => { clearTimeout(timer); reject(new Error('Bridge disconnected')); if (this.socket !== socket) return; this.socket = null; this.connectedUrl = null; this.rejectPending(); this.onDisconnect(); };
      socket.onmessage = event => {
        if (this.socket !== socket) return;
        try {
          const parsed = JSON.parse(event.data) as Record<string, unknown>;
          if (typeof parsed.schema_version === 'string' && (parsed.schema_version.startsWith('orbital.calibration-')
            || (parsed.schema_version === 'orbital.camera-control/1.0' && parsed.action === 'calibrate-cancel'))) {
            this.onCalibrationMessage?.(parsed);
            return;
          }
          const reply = parsed as unknown as CameraControlReply;
          if (reply.schema_version !== 'orbital.camera-control-result/1.0') return;
          const waiting = this.pending.get(reply.request_id);
          if (!waiting) return;
          clearTimeout(waiting.timer); this.pending.delete(reply.request_id);
          if (reply.ok) waiting.resolve(reply); else waiting.reject(new Error(reply.error || 'Camera command rejected'));
        } catch { /* Tracking frames and malformed unsolicited messages are not replies. */ }
      };
    });
  }
  request(action: string, extra: Record<string, unknown> = {}, requestId?: string): Promise<CameraControlReply> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Connect to the bridge first'));
    const request_id = requestId ?? `studio-${++this.serial}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.pending.delete(request_id); reject(new Error('Camera command timed out; refresh status before retrying')); }, 12000);
      this.pending.set(request_id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify({ schema_version: 'orbital.camera-control/1.0', request_id, action, ...extra }));
    });
  }
  /** Unique id for a calibration session; the bridge uses the request id as session_id. */
  nextSessionId(): string { return `cal-${Date.now().toString(36)}-${++this.serial}`; }
  /** Fire-and-forget message (pattern acks, cancel). Returns false when the socket is not open. */
  send(message: Record<string, unknown>): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }
  disconnect(): void { const socket = this.socket; this.socket = null; this.connectedUrl = null; socket?.close(); this.rejectPending(); this.onDisconnect(); }
  private rejectPending(): void {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Control connection closed')); }
    this.pending.clear();
  }
}
