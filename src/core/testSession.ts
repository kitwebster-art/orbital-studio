import { DEFAULT_TEST_RIG, parseTestRigSetup, type TestRigSetup } from './testRig';
export type InfraredProfile = 'visible' | '850nm' | '940nm';
export interface TestProfile {
  schemaVersion: 'orbital.test-profile/1.0';
  name: string;
  bridgeUrl: string;
  infrared: InfraredProfile;
  exposureUs: number;
  analogGain: number | null;
  fps: number;
  width: number;
  height: number;
  predictionMs: number;
  notes: string;
  rig: TestRigSetup;
}
export const DEFAULT_TEST_PROFILE: TestProfile = {
  schemaVersion: 'orbital.test-profile/1.0', name: 'Stage A / one camera',
  bridgeUrl: 'ws://127.0.0.1:8765', infrared: 'visible', exposureUs: 3000,
  analogGain: null, fps: 91, width: 1024, height: 768, predictionMs: 0, notes: '', rig: structuredClone(DEFAULT_TEST_RIG),
};
export function parseTestProfile(value: unknown): TestProfile {
  if (!value || typeof value !== 'object') throw new Error('Invalid test profile');
  const p = value as Record<string, unknown>;
  if (p.schemaVersion !== DEFAULT_TEST_PROFILE.schemaVersion) throw new Error('Unsupported test profile version');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) throw new Error('Profile needs a name (up to 120 characters)');
  if (typeof p.bridgeUrl !== 'string') throw new Error('Bridge URL required');
  const url = new URL(p.bridgeUrl);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Use a WebSocket URL without credentials');
  if (!['visible', '850nm', '940nm'].includes(String(p.infrared))) throw new Error('Unknown infrared profile');
  for (const [key, low, high] of [['exposureUs', 1, 100000], ['fps', 1, 1000], ['width', 16, 8192], ['height', 16, 8192], ['predictionMs', 0, 100]] as const) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < low || p[key] > high) throw new Error(`${key} must be between ${low} and ${high}`);
  }
  if (p.analogGain !== null && (typeof p.analogGain !== 'number' || !Number.isInteger(p.analogGain) || p.analogGain < 0 || p.analogGain > 10000)) throw new Error('Gain must be blank or an integer SDK gain');
  if (!Number.isInteger(p.fps)) throw new Error('Frame rate must be an integer');
  if (!Number.isInteger(p.width) || !Number.isInteger(p.height)) throw new Error('Raster dimensions must be integers');
  if (typeof p.notes !== 'string' || p.notes.length > 4000) throw new Error('Notes must be under 4000 characters');
  return { schemaVersion: DEFAULT_TEST_PROFILE.schemaVersion, name: p.name, bridgeUrl: p.bridgeUrl,
    infrared: p.infrared as InfraredProfile, exposureUs: p.exposureUs as number, analogGain: p.analogGain as number | null,
    fps: p.fps as number, width: p.width as number, height: p.height as number, predictionMs: p.predictionMs as number, notes: p.notes, rig: p.rig === undefined ? structuredClone(DEFAULT_TEST_RIG) : parseTestRigSetup(p.rig) };
}
export interface Distribution { count: number; p50: number; p95: number; p99: number; max: number; jitter: number }
export function distribution(samples: readonly number[]): Distribution | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { count: samples.length, p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1)!,
    jitter: Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length) };
}
/** Bounded recording. Each source sample is counted once, independently of UI refresh. */
export class TestSessionMetrics {
  private cadence: number[] = [];
  private processing: number[] = [];
  private age: number[] = [];
  private lastSequence: number | null = null;
  private sourceEpoch = '';
  private frameCount = 0;
  private sourceCount = 0;
  private readonly cap = 36000;
  startTime = new Date().toISOString();
  acceptsSource(sourceKey: string): boolean { return !this.sourceEpoch || sourceKey === this.sourceEpoch; }
  record(deltaMs: number, sourceKey: string, sequence: number, processingMs: number | null, receiptAgeMs: number): void {
    if (!this.acceptsSource(sourceKey)) throw new Error('Source changed; start a new measurement session');
    if (Number.isFinite(deltaMs) && deltaMs > 0) { this.push(this.cadence, deltaMs); this.frameCount++; }
    if (sourceKey !== this.sourceEpoch) { this.sourceEpoch = sourceKey; this.lastSequence = null; }
    if (sequence === this.lastSequence) return;
    this.lastSequence = sequence;
    this.sourceCount++;
    if (processingMs !== null && Number.isFinite(processingMs) && processingMs >= 0) this.push(this.processing, processingMs);
    if (Number.isFinite(receiptAgeMs) && receiptAgeMs >= 0) this.push(this.age, receiptAgeMs);
  }
  private push(values: number[], value: number): void { values.push(value); if (values.length > this.cap) values.shift(); }
  snapshot() {
    return { startedAt: this.startTime, sourceKey: this.sourceEpoch, frameCount: this.frameCount, sourceSamples: this.sourceCount, windowCap: this.cap,
      cadenceMs: distribution(this.cadence), processingMs: distribution(this.processing), receiptAgeMs: distribution(this.age),
      physicalMotionToPhotonMs: null, physicalMappingErrorMm: null,
      evidence: 'Software observations only. Receipt age excludes transport and camera exposure. Cadence includes browser scheduling.' };
  }
}
