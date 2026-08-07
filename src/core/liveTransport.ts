import {
  createDefaultTimeline,
  createGeneratedFallbackTimeline,
  type CueValue,
  type TimelineDefinition,
  TimelineSequencer,
  type TimelineFrame,
} from "./sequencer";

export const TRANSPORT_COMMAND_SCHEMA_VERSION = "orbital.transport-command/1.0" as const;
export const LIVE_TRANSPORT_SCHEMA_VERSION = "orbital.live-transport/1.0" as const;

export type TransportProtocol = "midi" | "osc" | "link" | "mtc";
export type TransportCommandKind =
  | "start"
  | "stop"
  | "continue"
  | "seek"
  | "tempo"
  | "clock"
  | "heartbeat"
  | "cue"
  | "ping"
  | "pong";

export interface MtcTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  fps: number;
}

/**
 * One envelope works for MIDI, OSC, Ableton Link and MTC bridges. The
 * protocol-specific fields are optional so a runtime can forward the same
 * semantic command without choosing a production platform.
 */
export interface TransportCommand {
  schemaVersion: typeof TRANSPORT_COMMAND_SCHEMA_VERSION;
  id: string;
  protocol: TransportProtocol;
  kind: TransportCommandKind;
  issuedAtMonotonicS: number;
  beat?: number;
  timeS?: number;
  tempoBpm?: number;
  channel?: number;
  address?: string;
  args?: readonly CueValue[];
  timecode?: MtcTimecode;
  payload?: Readonly<Record<string, CueValue>>;
}

export type TransportCommandInput = Omit<TransportCommand, "schemaVersion"> & {
  schemaVersion?: typeof TRANSPORT_COMMAND_SCHEMA_VERSION;
};

export interface TransportClockSample {
  protocol: TransportProtocol;
  beat: number;
  receivedAtMonotonicS: number;
  /** Source timestamp, when the bridge provides one, for latency diagnostics. */
  sourceAtMonotonicS?: number;
  tempoBpm?: number;
  sequence?: number;
}

export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "clock-lost";

export type LiveTransportState = TransportState;

export interface LatencyDiagnostics {
  sourceToRuntimeMs: number | null;
  averageSourceToRuntimeMs: number | null;
  jitterMs: number | null;
  clockOffsetMs: number | null;
  sourceAgeMs: number | null;
  clockSamples: number;
  droppedClockSamples: number;
  reconnects: number;
  clockLosses: number;
}

export interface LiveTransportSnapshot {
  schemaVersion: typeof LIVE_TRANSPORT_SCHEMA_VERSION;
  state: TransportState;
  protocol: TransportProtocol | null;
  playing: boolean;
  fallbackActive: boolean;
  clockLocked: boolean;
  beat: number;
  timeS: number;
  frame: TimelineFrame;
  lastClockAtS: number | null;
  diagnostics: LatencyDiagnostics;
}

export interface LiveTransportOptions {
  timeline?: TimelineDefinition | TimelineSequencer;
  fallbackTimeline?: TimelineDefinition | TimelineSequencer;
  autoplay?: boolean;
  startBeat?: number;
  clockLossTimeoutS?: number;
  autoFallback?: boolean;
}

const DEFAULT_CLOCK_LOSS_TIMEOUT_S = 0.5;

function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function nonNegative(value: unknown, label: string): asserts value is number {
  finite(value, label);
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}

function positive(value: unknown, label: string): asserts value is number {
  finite(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be positive`);
  }
}

function cloneDiagnostics(diagnostics: LatencyDiagnostics): LatencyDiagnostics {
  return { ...diagnostics };
}

function isProtocol(value: unknown): value is TransportProtocol {
  return value === "midi" || value === "osc" || value === "link" || value === "mtc";
}

function isCommandKind(value: unknown): value is TransportCommandKind {
  return value === "start" || value === "stop" || value === "continue" ||
    value === "seek" || value === "tempo" || value === "clock" ||
    value === "heartbeat" || value === "cue" || value === "ping" || value === "pong";
}

function assertCueValue(value: unknown, path: string): asserts value is CueValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    finite(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCueValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertCueValue(item, `${path}.${key}`));
    return;
  }
  throw new Error(`${path} must be JSON-safe`);
}

/** Validate an incoming bridge command before it can affect the sequencer. */
export function validateTransportCommand(value: unknown): asserts value is TransportCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Transport command must be an object");
  }
  const command = value as Record<string, unknown>;
  if (command.schemaVersion !== TRANSPORT_COMMAND_SCHEMA_VERSION) {
    throw new Error("Unsupported transport command schema");
  }
  if (typeof command.id !== "string" || command.id.length === 0) {
    throw new Error("Transport command id must be a non-empty string");
  }
  if (!isProtocol(command.protocol)) {
    throw new Error("Transport command protocol is unsupported");
  }
  if (!isCommandKind(command.kind)) {
    throw new Error("Transport command kind is unsupported");
  }
  nonNegative(command.issuedAtMonotonicS, "issuedAtMonotonicS");
  const beat = command.beat;
  if (beat !== undefined) {
    finite(beat, "beat");
    if (beat < 0) throw new Error("beat must be non-negative");
  }
  const timeS = command.timeS;
  if (timeS !== undefined) {
    finite(timeS, "timeS");
    if (timeS < 0) throw new Error("timeS must be non-negative");
  }
  const tempoBpm = command.tempoBpm;
  if (tempoBpm !== undefined) positive(tempoBpm, "tempoBpm");
  const channel = command.channel;
  if (channel !== undefined) {
    if (typeof channel !== "number" || !Number.isInteger(channel) || channel < 0 || channel > 15) {
      throw new Error("channel must be an integer between 0 and 15");
    }
  }
  if (command.address !== undefined && (typeof command.address !== "string" || command.address.length === 0)) {
    throw new Error("address must be a non-empty string");
  }
  if (command.args !== undefined) {
    if (!Array.isArray(command.args)) throw new Error("args must be an array");
    command.args.forEach((arg, index) => assertCueValue(arg, `args[${index}]`));
  }
  if (command.payload !== undefined) assertCueValue(command.payload, "payload");
  if (command.timecode !== undefined) {
    const timecode = command.timecode;
    if (!timecode || typeof timecode !== "object" || Array.isArray(timecode)) {
      throw new Error("timecode must be an object");
    }
    const timecodeRecord = timecode as Record<string, unknown>;
    for (const key of ["hours", "minutes", "seconds", "frames", "fps"] as const) {
      finite(timecodeRecord[key], `timecode.${key}`);
    }
  }
}

export function makeTransportCommand(input: TransportCommandInput): TransportCommand {
  const command: TransportCommand = {
    ...input,
    schemaVersion: TRANSPORT_COMMAND_SCHEMA_VERSION,
  };
  validateTransportCommand(command);
  return command;
}

export function parseTransportCommand(source: string | unknown): TransportCommand {
  const value = typeof source === "string" ? JSON.parse(source) as unknown : source;
  validateTransportCommand(value);
  return value;
}

export function serialiseTransportCommand(command: TransportCommand): string {
  validateTransportCommand(command);
  return JSON.stringify(command);
}

type TransportFactoryOptions = Partial<Omit<TransportCommandInput, "protocol" | "kind" | "issuedAtMonotonicS">>;

function generatedCommandId(
  options: TransportFactoryOptions,
  protocol: TransportProtocol,
  kind: TransportCommandKind,
  issuedAtMonotonicS: number,
): string {
  return options.id ?? `${protocol}-${kind}-${issuedAtMonotonicS.toFixed(6)}`;
}

export function createMidiTransportCommand(
  kind: TransportCommandKind,
  issuedAtMonotonicS: number,
  options: TransportFactoryOptions = {},
): TransportCommand {
  return makeTransportCommand({
    ...options,
    id: generatedCommandId(options, "midi", kind, issuedAtMonotonicS),
    protocol: "midi",
    kind,
    issuedAtMonotonicS,
  });
}

export function createOscTransportCommand(
  address: string,
  kind: TransportCommandKind,
  issuedAtMonotonicS: number,
  options: Partial<Omit<TransportCommandInput, "protocol" | "kind" | "issuedAtMonotonicS" | "address">> = {},
): TransportCommand {
  return makeTransportCommand({
    ...options,
    id: generatedCommandId(options, "osc", kind, issuedAtMonotonicS),
    address,
    protocol: "osc",
    kind,
    issuedAtMonotonicS,
  });
}

export function createLinkTransportCommand(
  kind: TransportCommandKind,
  issuedAtMonotonicS: number,
  options: TransportFactoryOptions = {},
): TransportCommand {
  return makeTransportCommand({
    ...options,
    id: generatedCommandId(options, "link", kind, issuedAtMonotonicS),
    protocol: "link",
    kind,
    issuedAtMonotonicS,
  });
}

export function createMtcTransportCommand(
  timecode: MtcTimecode,
  issuedAtMonotonicS: number,
  options: Partial<Omit<TransportCommandInput, "protocol" | "kind" | "issuedAtMonotonicS" | "timecode">> & {
    kind?: TransportCommandKind;
  } = {},
): TransportCommand {
  const kind = options.kind ?? "clock";
  return makeTransportCommand({
    ...options,
    id: generatedCommandId(options, "mtc", kind, issuedAtMonotonicS),
    protocol: "mtc",
    kind,
    issuedAtMonotonicS,
    timecode,
  });
}

/**
 * Platform-neutral live transport state machine. It intentionally owns no
 * MIDI, OSC, Link or MTC socket. Native bridges call `ingestClock` and
 * `receiveCommand`, then drain semantic commands through `drainOutgoing`.
 */
export class LiveTransport {
  readonly sequencer: TimelineSequencer;
  readonly fallbackSequencer: TimelineSequencer;
  private readonly clockLossTimeoutS: number;
  private readonly autoFallback: boolean;
  private transportState: TransportState = "disconnected";
  private activeProtocol: TransportProtocol | null = null;
  private nowS = 0;
  private lastClockAtS: number | null = null;
  private clockLocked = false;
  private fallbackActive = false;
  private readonly outgoing: TransportCommand[] = [];
  private lastClockSequence: number | null = null;
  private diagnosticsState: LatencyDiagnostics = {
    sourceToRuntimeMs: null,
    averageSourceToRuntimeMs: null,
    jitterMs: null,
    clockOffsetMs: null,
    sourceAgeMs: null,
    clockSamples: 0,
    droppedClockSamples: 0,
    reconnects: 0,
    clockLosses: 0,
  };

  constructor(options: LiveTransportOptions = {}) {
    this.sequencer = this.asSequencer(
      options.timeline ?? createDefaultTimeline(),
      options.autoplay ?? false,
      options.startBeat ?? 0,
    );
    this.fallbackSequencer = this.asSequencer(
      options.fallbackTimeline ?? createGeneratedFallbackTimeline({
        tempoBpm: this.sequencer.bpm,
      }),
      false,
      options.startBeat ?? 0,
    );
    this.clockLossTimeoutS = options.clockLossTimeoutS ?? DEFAULT_CLOCK_LOSS_TIMEOUT_S;
    positive(this.clockLossTimeoutS, "clockLossTimeoutS");
    this.autoFallback = options.autoFallback ?? true;
  }

  get state(): TransportState {
    return this.transportState;
  }

  get status(): TransportState {
    return this.transportState;
  }

  get protocol(): TransportProtocol | null {
    return this.activeProtocol;
  }

  get playing(): boolean {
    return this.activeSequencer.playing;
  }

  get currentBeat(): number {
    return this.activeSequencer.currentBeat;
  }

  get currentTimeS(): number {
    return this.activeSequencer.currentTimeS;
  }

  get clockLost(): boolean {
    return this.transportState === "clock-lost";
  }

  get usingFallback(): boolean {
    return this.fallbackActive;
  }

  get diagnostics(): LatencyDiagnostics {
    return cloneDiagnostics(this.diagnosticsState);
  }

  get clockLossTimeout(): number {
    return this.clockLossTimeoutS;
  }

  get current(): LiveTransportSnapshot {
    return this.snapshot();
  }

  snapshot(): LiveTransportSnapshot {
    return this.buildSnapshot();
  }

  setPlaying(playing: boolean): LiveTransportSnapshot {
    this.sequencer.setPlaying(playing && !this.fallbackActive);
    this.fallbackSequencer.setPlaying(playing && this.fallbackActive);
    return this.snapshot();
  }

  seekBeat(beat: number): LiveTransportSnapshot {
    this.sequencer.seekBeat(beat);
    this.fallbackSequencer.seekBeat(beat);
    return this.snapshot();
  }

  setTempoBpm(tempoBpm: number): LiveTransportSnapshot {
    this.sequencer.setTempoBpm(tempoBpm);
    this.fallbackSequencer.setTempoBpm(tempoBpm);
    return this.snapshot();
  }

  connect(atMonotonicS = this.nowS): LiveTransportSnapshot {
    nonNegative(atMonotonicS, "atMonotonicS");
    if (this.transportState === "reconnecting") {
      this.diagnosticsState.reconnects += 1;
    }
    this.nowS = Math.max(this.nowS, atMonotonicS);
    this.transportState = "connected";
    this.fallbackActive = false;
    this.clockLocked = false;
    this.sequencer.setPlaying(false);
    this.fallbackSequencer.setPlaying(false);
    return this.snapshot();
  }

  reconnect(atMonotonicS = this.nowS): LiveTransportSnapshot {
    nonNegative(atMonotonicS, "atMonotonicS");
    this.nowS = Math.max(this.nowS, atMonotonicS);
    this.transportState = "reconnecting";
    this.clockLocked = false;
    return this.snapshot();
  }

  disconnect(atMonotonicS = this.nowS): LiveTransportSnapshot {
    nonNegative(atMonotonicS, "atMonotonicS");
    this.nowS = Math.max(this.nowS, atMonotonicS);
    this.transportState = "disconnected";
    this.clockLocked = false;
    this.fallbackActive = false;
    this.sequencer.setPlaying(false);
    this.fallbackSequencer.setPlaying(false);
    return this.snapshot();
  }

  startFallback(atMonotonicS = this.nowS): LiveTransportSnapshot {
    nonNegative(atMonotonicS, "atMonotonicS");
    this.nowS = Math.max(this.nowS, atMonotonicS);
    this.transportState = "clock-lost";
    this.clockLocked = false;
    this.fallbackActive = true;
    this.sequencer.setPlaying(false);
    this.fallbackSequencer.seekBeat(this.sequencer.currentBeat);
    this.fallbackSequencer.setPlaying(true);
    return this.snapshot();
  }

  recoverFromClockLoss(): LiveTransportSnapshot {
    if (this.transportState === "clock-lost") {
      this.transportState = "connected";
    }
    return this.snapshot();
  }

  /** Ingest a source clock tick from any supported native protocol. */
  ingestClock(sample: TransportClockSample): LiveTransportSnapshot {
    if (!isProtocol(sample.protocol)) throw new Error("clock protocol is unsupported");
    finite(sample.beat, "clock.beat");
    nonNegative(sample.receivedAtMonotonicS, "clock.receivedAtMonotonicS");
    if (sample.sourceAtMonotonicS !== undefined) nonNegative(sample.sourceAtMonotonicS, "clock.sourceAtMonotonicS");
    if (sample.tempoBpm !== undefined) positive(sample.tempoBpm, "clock.tempoBpm");
    if (sample.sequence !== undefined && (!Number.isInteger(sample.sequence) || sample.sequence < 0)) {
      throw new Error("clock.sequence must be a non-negative integer");
    }
    this.nowS = Math.max(this.nowS, sample.receivedAtMonotonicS);
    this.activeProtocol = sample.protocol;
    this.lastClockAtS = sample.receivedAtMonotonicS;
    this.clockLocked = true;
    this.fallbackActive = false;
    this.transportState = "connected";
    if (sample.tempoBpm !== undefined) {
      this.sequencer.setTempoBpm(sample.tempoBpm);
      this.fallbackSequencer.setTempoBpm(sample.tempoBpm);
    }
    this.sequencer.seekBeat(sample.beat);
    this.fallbackSequencer.seekBeat(sample.beat);
    const wasPlaying = this.sequencer.playing || this.fallbackSequencer.playing;
    this.sequencer.setPlaying(wasPlaying);
    this.fallbackSequencer.setPlaying(false);

    if (sample.sequence !== undefined) {
      if (this.lastClockSequence !== null && sample.sequence > this.lastClockSequence + 1) {
        this.diagnosticsState.droppedClockSamples += sample.sequence - this.lastClockSequence - 1;
      }
      this.lastClockSequence = sample.sequence;
    }
    this.recordLatency(sample);
    return this.snapshot();
  }

  receiveCommand(command: TransportCommand): LiveTransportSnapshot {
    validateTransportCommand(command);
    this.nowS = Math.max(this.nowS, command.issuedAtMonotonicS);
    this.activeProtocol = command.protocol;
    switch (command.kind) {
      case "start":
      case "continue":
        this.sequencer.setPlaying(true);
        this.fallbackSequencer.setPlaying(this.fallbackActive);
        break;
      case "stop":
        this.sequencer.setPlaying(false);
        this.fallbackSequencer.setPlaying(false);
        break;
      case "seek":
        if (command.beat !== undefined) {
          this.sequencer.seekBeat(command.beat);
          this.fallbackSequencer.seekBeat(command.beat);
        } else if (command.timeS !== undefined) {
          this.sequencer.seek(command.timeS);
          this.fallbackSequencer.seek(command.timeS);
        } else {
          throw new Error("seek command requires beat or timeS");
        }
        break;
      case "tempo":
        if (command.tempoBpm === undefined) throw new Error("tempo command requires tempoBpm");
        this.sequencer.setTempoBpm(command.tempoBpm);
        this.fallbackSequencer.setTempoBpm(command.tempoBpm);
        break;
      case "clock":
        if (command.beat === undefined) throw new Error("clock command requires beat");
        return this.ingestClock({
          protocol: command.protocol,
          beat: command.beat,
          receivedAtMonotonicS: command.issuedAtMonotonicS,
          tempoBpm: command.tempoBpm,
        });
      case "heartbeat":
        this.lastClockAtS = command.issuedAtMonotonicS;
        this.clockLocked = true;
        if (this.transportState === "clock-lost") this.transportState = "connected";
        break;
      case "cue":
      case "ping":
      case "pong":
        break;
    }
    return this.snapshot();
  }

  send(command: TransportCommand): void {
    validateTransportCommand(command);
    this.outgoing.push(command);
  }

  drainOutgoing(): readonly TransportCommand[] {
    const commands = this.outgoing.splice(0, this.outgoing.length);
    return commands;
  }

  tick(deltaS: number): LiveTransportSnapshot {
    nonNegative(deltaS, "deltaS");
    this.nowS += deltaS;
    if (
      this.transportState === "connected" &&
      this.lastClockAtS !== null &&
      this.nowS - this.lastClockAtS > this.clockLossTimeoutS
    ) {
      this.diagnosticsState.clockLosses += 1;
      this.clockLocked = false;
      this.transportState = "clock-lost";
      if (this.autoFallback) {
        this.fallbackActive = true;
        this.fallbackSequencer.seekBeat(this.sequencer.currentBeat);
        this.fallbackSequencer.setPlaying(this.sequencer.playing);
        this.sequencer.setPlaying(false);
      }
    }
    this.activeSequencer.advance(deltaS);
    this.diagnosticsState.sourceAgeMs = this.lastClockAtS === null
      ? null
      : Math.max(0, this.nowS - this.lastClockAtS) * 1000;
    return this.snapshot();
  }

  private get activeSequencer(): TimelineSequencer {
    return this.fallbackActive ? this.fallbackSequencer : this.sequencer;
  }

  private asSequencer(
    source: TimelineDefinition | TimelineSequencer,
    autoplay: boolean,
    startBeat: number,
  ): TimelineSequencer {
    if (source instanceof TimelineSequencer) {
      source.setPlaying(autoplay);
      source.seekBeat(startBeat);
      return source;
    }
    return new TimelineSequencer(source, { autoplay, startBeat });
  }

  private recordLatency(sample: TransportClockSample): void {
    this.diagnosticsState.clockSamples += 1;
    if (sample.sourceAtMonotonicS === undefined) return;
    const latencyMs = Math.max(0, sample.receivedAtMonotonicS - sample.sourceAtMonotonicS) * 1000;
    const previousAverage = this.diagnosticsState.averageSourceToRuntimeMs;
    this.diagnosticsState.sourceToRuntimeMs = latencyMs;
    this.diagnosticsState.clockOffsetMs = (sample.receivedAtMonotonicS - sample.sourceAtMonotonicS) * 1000;
    this.diagnosticsState.averageSourceToRuntimeMs = previousAverage === null
      ? latencyMs
      : previousAverage + (latencyMs - previousAverage) / this.diagnosticsState.clockSamples;
    this.diagnosticsState.jitterMs = previousAverage === null
      ? 0
      : (this.diagnosticsState.jitterMs ?? 0) + (Math.abs(latencyMs - previousAverage) - (this.diagnosticsState.jitterMs ?? 0)) / this.diagnosticsState.clockSamples;
  }

  private buildSnapshot(): LiveTransportSnapshot {
    const frame = this.activeSequencer.sample();
    return {
      schemaVersion: LIVE_TRANSPORT_SCHEMA_VERSION,
      state: this.transportState,
      protocol: this.activeProtocol,
      playing: this.activeSequencer.playing,
      fallbackActive: this.fallbackActive,
      clockLocked: this.clockLocked,
      beat: this.activeSequencer.currentBeat,
      timeS: this.activeSequencer.currentTimeS,
      frame,
      lastClockAtS: this.lastClockAtS,
      diagnostics: cloneDiagnostics(this.diagnosticsState),
    };
  }
}

/** Alias for integrations that prefer an explicit Ableton-neutral name. */
export class AbletonNeutralTransport extends LiveTransport {}
