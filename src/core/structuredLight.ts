/**
 * Studio side of the structured-light calibration contract (v1).
 * See orbital-tracker/docs/STRUCTURED_LIGHT_CALIBRATION_CONTRACT.md.
 * Everything here is pure so it can be unit-tested without a browser.
 */
export const PATTERN_SCHEMA = 'orbital.calibration-pattern/1.0';
export const PATTERN_ACK_SCHEMA = 'orbital.calibration-pattern-ack/1.0';
export const PROGRESS_SCHEMA = 'orbital.calibration-progress/1.0';
export const RESULT_SCHEMA = 'orbital.calibration-result/1.0';
export const CONTROL_SCHEMA = 'orbital.camera-control/1.0';

export type CalibrationPattern =
  | { kind: 'black' }
  | { kind: 'white' }
  | { kind: 'spot'; x: number; y: number; radius: number }
  | { kind: 'gray'; axis: 'x' | 'y'; bit: number; inverted: boolean };

export interface CalibrationSettings {
  projector_width: number;
  projector_height: number;
  settle_ms?: number;
  frames_per_pattern?: number;
  skip_low_bits?: number;
  measured_baseline_m?: number | null;
  measured_ball_diameter_m?: number | null;
  camera_focal_mm?: number;
  camera_pixel_pitch_um?: number;
  projector_vertical_fov_deg?: number;
  projector_principal_point_norm?: [number, number];
}

export type Verdict = 'GOOD' | 'USABLE' | 'POOR';
export interface StructuredLightResult {
  method: string;
  created_at: string;
  source_uri: string;
  camera: { width: number; height: number };
  projector: { width: number; height: number };
  decoded_fraction: number;
  ball_camera: { center_px: [number, number]; radius_px: number; fit_rms_px: number } | null;
  ball_projector: { center_px: [number, number]; major_px: number; minor_px: number; angle_deg: number } | null;
  mapping: { kind: 'homography'; camera_to_projector: number[]; rms_px: number; points: number; region: string } | null;
  estimate3d: {
    available: boolean;
    scale_source: string;
    frame: string;
    ball_center_m: [number, number, number] | null;
    ball_diameter_m: number | null;
    camera_position_m: [number, number, number] | null;
    projector_position_m: [number, number, number] | null;
    projector_rotation: number[] | null;
    reprojection_rms_px: number | null;
    confidence: string;
    notes: string[];
    /** Projector lens used for the 3D solve; `source: "scan"` means the bridge found it. */
    projector_intrinsics?: { vertical_fov_deg: number; principal_point_norm: [number, number]; source: string } | null;
    /** Camera lens used; `scan-and-measured-diameter` means refined from both tape measurements. */
    camera_intrinsics?: { focal_scale: number; source: string } | null;
  } | null;
  quality: { verdict: Verdict; reasons: string[] };
}

/** Number of Gray-code bits for one projector axis: ceil(log2(size)). */
export function grayBitCount(size: number): number {
  if (!Number.isInteger(size) || size < 1) throw new Error('Axis size must be a positive integer');
  return size <= 1 ? 0 : Math.ceil(Math.log2(size));
}

/** True when projector pixel (column c, row r) is white for this pattern. Bit 0 is the most significant bit. */
export function isPatternWhite(pattern: CalibrationPattern, c: number, r: number, width: number, height: number): boolean {
  if (pattern.kind === 'spot') {const d=(c-pattern.x)**2+(r-pattern.y)**2;return d<=pattern.radius**2 && d>=(pattern.radius*.65)**2;}
  if (pattern.kind === 'black') return false;
  if (pattern.kind === 'white') return true;
  const n = pattern.axis === 'x' ? c : r;
  const bits = grayBitCount(pattern.axis === 'x' ? width : height);
  const g = n ^ (n >> 1);
  const shift = bits - 1 - pattern.bit;
  const on = shift >= 0 && ((g >> shift) & 1) === 1;
  return pattern.inverted ? !on : on;
}

/** White runs along the pattern axis as [start, endExclusive] pairs, for fast fillRect drawing. */
export function patternRuns(pattern: CalibrationPattern, width: number, height: number): Array<[number, number]> {
  if (pattern.kind === 'spot') return [];
  if (pattern.kind === 'black') return [];
  const size = pattern.kind === 'white' || pattern.axis === 'x' ? width : height;
  if (pattern.kind === 'white') return [[0, size]];
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let n = 0; n <= size; n += 1) {
    const white = n < size && isPatternWhite(pattern, pattern.axis === 'x' ? n : 0, pattern.axis === 'y' ? n : 0, width, height);
    if (white && start < 0) start = n;
    if (!white && start >= 0) { runs.push([start, n]); start = -1; }
  }
  return runs;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parsePattern(value: unknown): CalibrationPattern {
  if (!isRecord(value)) throw new Error('pattern must be an object');
  if (value.kind === 'black' || value.kind === 'white') return { kind: value.kind };
  if (value.kind !== 'gray') throw new Error('pattern.kind must be black, white or gray');
  if (value.axis !== 'x' && value.axis !== 'y') throw new Error('pattern.axis must be x or y');
  if (typeof value.bit !== 'number' || !Number.isInteger(value.bit) || value.bit < 0 || value.bit > 15) throw new Error('pattern.bit must be an integer 0-15');
  return { kind: 'gray', axis: value.axis, bit: value.bit, inverted: value.inverted === true };
}

const num = (v: unknown, name: string): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number`); return v; };
const pair = (v: unknown, name: string): [number, number] => { if (!Array.isArray(v) || v.length !== 2) throw new Error(`${name} must be a pair`); return [num(v[0], name), num(v[1], name)]; };
const triple = (v: unknown, name: string): [number, number, number] | null => { if (v === null || v === undefined) return null; if (!Array.isArray(v) || v.length !== 3) throw new Error(`${name} must be a triple`); return [num(v[0], name), num(v[1], name), num(v[2], name)]; };

/** Validate a calibration result body. Fails closed on anything malformed. */
export function parseStructuredLightResult(value: unknown): StructuredLightResult {
  if (!isRecord(value)) throw new Error('result must be an object');
  const size = (v: unknown, name: string) => { if (!isRecord(v)) throw new Error(`${name} is required`); return { width: num(v.width, `${name}.width`), height: num(v.height, `${name}.height`) }; };
  const quality = value.quality;
  if (!isRecord(quality) || !['GOOD', 'USABLE', 'POOR'].includes(String(quality.verdict))) throw new Error('quality.verdict must be GOOD, USABLE or POOR');
  let mapping: StructuredLightResult['mapping'] = null;
  if (isRecord(value.mapping)) {
    const h = value.mapping.camera_to_projector;
    if (!Array.isArray(h) || h.length !== 9) throw new Error('mapping.camera_to_projector must have 9 numbers');
    mapping = { kind: 'homography', camera_to_projector: h.map((x, i) => num(x, `mapping.camera_to_projector[${i}]`)),
      rms_px: num(value.mapping.rms_px, 'mapping.rms_px'), points: num(value.mapping.points ?? 0, 'mapping.points'), region: String(value.mapping.region ?? 'ball') };
  }
  const bc = value.ball_camera, bp = value.ball_projector, e = value.estimate3d;
  return {
    method: String(value.method ?? 'structured-light-gray-code'),
    created_at: String(value.created_at ?? ''),
    source_uri: String(value.source_uri ?? ''),
    camera: size(value.camera, 'camera'),
    projector: size(value.projector, 'projector'),
    decoded_fraction: num(value.decoded_fraction ?? 0, 'decoded_fraction'),
    ball_camera: isRecord(bc) ? { center_px: pair(bc.center_px, 'ball_camera.center_px'), radius_px: num(bc.radius_px, 'ball_camera.radius_px'), fit_rms_px: num(bc.fit_rms_px ?? 0, 'ball_camera.fit_rms_px') } : null,
    ball_projector: isRecord(bp) ? { center_px: pair(bp.center_px, 'ball_projector.center_px'), major_px: num(bp.major_px, 'ball_projector.major_px'), minor_px: num(bp.minor_px, 'ball_projector.minor_px'), angle_deg: num(bp.angle_deg ?? 0, 'ball_projector.angle_deg') } : null,
    mapping,
    estimate3d: isRecord(e) ? {
      available: e.available === true, scale_source: String(e.scale_source ?? 'none'), frame: String(e.frame ?? 'camera'),
      ball_center_m: triple(e.ball_center_m, 'estimate3d.ball_center_m'),
      ball_diameter_m: e.ball_diameter_m === null || e.ball_diameter_m === undefined ? null : num(e.ball_diameter_m, 'estimate3d.ball_diameter_m'),
      camera_position_m: triple(e.camera_position_m, 'estimate3d.camera_position_m'),
      projector_position_m: triple(e.projector_position_m, 'estimate3d.projector_position_m'),
      projector_rotation: Array.isArray(e.projector_rotation) ? e.projector_rotation.map(Number) : null,
      reprojection_rms_px: e.reprojection_rms_px === null || e.reprojection_rms_px === undefined ? null : num(e.reprojection_rms_px, 'estimate3d.reprojection_rms_px'),
      confidence: String(e.confidence ?? 'low'),
      notes: Array.isArray(e.notes) ? e.notes.map(String) : [],
      projector_intrinsics: isRecord(e.projector_intrinsics) ? {
        vertical_fov_deg: num(e.projector_intrinsics.vertical_fov_deg, 'estimate3d.projector_intrinsics.vertical_fov_deg'),
        principal_point_norm: pair(e.projector_intrinsics.principal_point_norm, 'estimate3d.projector_intrinsics.principal_point_norm'),
        source: String(e.projector_intrinsics.source ?? 'entered'),
      } : null,
      camera_intrinsics: isRecord(e.camera_intrinsics) ? {
        focal_scale: num(e.camera_intrinsics.focal_scale ?? 1, 'estimate3d.camera_intrinsics.focal_scale'),
        source: String(e.camera_intrinsics.source ?? 'nominal'),
      } : null,
    } : null,
    quality: { verdict: quality.verdict as Verdict, reasons: Array.isArray(quality.reasons) ? quality.reasons.map(String) : [] },
  };
}

/**
 * Largest outline-mapping error that still counts as usable, scaled to ball size:
 * max(4 px, 1.2% of the projected ball diameter). Shared with the bridge's verdict.
 */
export function mappingLimitPx(result: StructuredLightResult | null): number {
  const major = result?.ball_projector?.major_px;
  return Math.max(4, typeof major === 'number' && Number.isFinite(major) ? 0.012 * major : 0);
}

/** A scan satisfies the projector-calibration gate with a GOOD/USABLE verdict and mapping error within the size-scaled limit. */
export function scanQualifiesForLive(result: StructuredLightResult | null): boolean {
  return !!result && (result.quality.verdict === 'GOOD' || result.quality.verdict === 'USABLE')
    && !!result.mapping && Number.isFinite(result.mapping.rms_px) && result.mapping.rms_px <= mappingLimitPx(result);
}

/** The 3D numbers can fill the layout only when available and not low confidence. */
export function scanLayoutUsable(result: StructuredLightResult | null): boolean {
  return !!result?.estimate3d?.available && result.estimate3d.confidence !== 'low';
}

export type SessionState = 'idle' | 'running' | 'result' | 'error' | 'cancelled';
export type SessionEvent =
  | { type: 'draw'; index: number; total: number; pattern: CalibrationPattern }
  | { type: 'progress' }
  | { type: 'result'; result: StructuredLightResult }
  | { type: 'error'; error: string }
  | { type: 'cancelled' }
  | { type: 'ignored' };

export const PATTERN_WATCHDOG_MS = 3000;
/** Decoding and solving happen after the last pattern; progress messages reset this longer timer. */
export const SOLVE_WATCHDOG_MS = 60000;

/**
 * Pure calibration session state machine: idle -> running -> result | error | cancelled.
 * The caller supplies time; nothing here touches timers, sockets or the DOM.
 */
export class CalibrationSession {
  state: SessionState = 'idle';
  sessionId: string | null = null;
  index = -1;
  total = 0;
  stage = 'waiting';
  message = '';
  result: StructuredLightResult | null = null;
  error: string | null = null;
  private deadlineMs = 0;

  start(sessionId: string, nowMs: number): void {
    if (this.state === 'running') throw new Error('A calibration scan is already running');
    Object.assign(this, { state: 'running', sessionId, index: -1, total: 0, stage: 'waiting', message: 'Waiting for the first pattern', result: null, error: null });
    this.deadlineMs = nowMs + PATTERN_WATCHDOG_MS;
  }

  get progress(): number {
    if (this.state === 'result') return 1;
    return this.total > 0 ? Math.max(0, Math.min(1, (this.index + 1) / this.total)) : 0;
  }

  handleMessage(msg: unknown, nowMs: number): SessionEvent {
    if (!isRecord(msg) || this.state !== 'running') return { type: 'ignored' };
    if (msg.schema_version === CONTROL_SCHEMA && msg.action === 'calibrate-cancel') {
      if (msg.session_id !== undefined && msg.session_id !== this.sessionId) return { type: 'ignored' };
      this.finish('cancelled', 'Cancelled by the bridge'); return { type: 'cancelled' };
    }
    if (msg.session_id !== this.sessionId) return { type: 'ignored' };
    try {
      if (msg.schema_version === PATTERN_SCHEMA) {
        const index = num(msg.index, 'index'), total = num(msg.total, 'total');
        const pattern = parsePattern(msg.pattern);
        if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || index >= total) throw new Error('pattern index out of range');
        this.index = index; this.total = total; this.stage = 'capturing';
        this.message = `Pattern ${index + 1} of ${total}`;
        this.deadlineMs = nowMs + PATTERN_WATCHDOG_MS;
        return { type: 'draw', index, total, pattern };
      }
      if (msg.schema_version === PROGRESS_SCHEMA) {
        if (typeof msg.stage === 'string') this.stage = msg.stage;
        if (typeof msg.index === 'number' && Number.isFinite(msg.index)) this.index = msg.index;
        if (typeof msg.total === 'number' && msg.total > 0) this.total = msg.total;
        if (typeof msg.message === 'string') this.message = msg.message;
        this.deadlineMs = nowMs + (this.stage === 'capturing' ? PATTERN_WATCHDOG_MS : SOLVE_WATCHDOG_MS);
        return { type: 'progress' };
      }
      if (msg.schema_version === RESULT_SCHEMA) {
        if (msg.ok !== true) { this.finish('error', String(msg.error || 'Calibration failed')); return { type: 'error', error: this.error! }; }
        const result = parseStructuredLightResult(msg.result);
        this.result = result; this.finish('result', 'Scan complete');
        return { type: 'result', result };
      }
    } catch (e) {
      this.finish('error', `Invalid calibration message: ${e instanceof Error ? e.message : String(e)}`);
      return { type: 'error', error: this.error! };
    }
    return { type: 'ignored' };
  }

  /** Build the ack after the pattern is on screen. Returns null if the session moved on. */
  ack(index: number, nowMs: number): { schema_version: string; session_id: string; index: number } | null {
    if (this.state !== 'running' || index !== this.index || !this.sessionId) return null;
    const last = index >= this.total - 1;
    if (last) { this.stage = 'decoding'; this.message = 'All patterns shown. Decoding and solving'; }
    this.deadlineMs = nowMs + (last ? SOLVE_WATCHDOG_MS : PATTERN_WATCHDOG_MS);
    return { schema_version: PATTERN_ACK_SCHEMA, session_id: this.sessionId, index };
  }

  /** Returns true if the watchdog fired and moved the session to error. */
  checkWatchdog(nowMs: number): boolean {
    if (this.state !== 'running' || nowMs <= this.deadlineMs) return false;
    this.finish('error', this.index < 0 ? 'No pattern arrived within 3 s. Is the bridge running a calibration-capable build?' : this.stage === 'capturing' ? `No next pattern within 3 s after pattern ${this.index + 1}` : 'Bridge stopped responding while solving');
    return true;
  }

  cancel(): { schema_version: string; request_id: string; action: string } | null {
    if (this.state !== 'running' || !this.sessionId) return null;
    const id = this.sessionId;
    this.finish('cancelled', 'Cancelled');
    return { schema_version: CONTROL_SCHEMA, request_id: `${id}-cancel`, action: 'calibrate-cancel' };
  }

  fail(reason: string): void { if (this.state === 'running') this.finish('error', reason); }

  private finish(state: Exclude<SessionState, 'idle' | 'running'>, message: string): void {
    this.state = state; this.message = message; this.stage = state;
    if (state === 'error') this.error = message;
  }
}
