import type { Vec3 } from './contracts';
export type ContentMotionMode = 'surface' | 'opposite' | 'world-locked';
export interface ContentMotionSettings { mode: ContentMotionMode; gain: number }
export const DEFAULT_CONTENT_MOTION_SETTINGS: ContentMotionSettings = { mode: 'surface', gain: 1 };
export function normaliseContentMotionSettings(value: Partial<ContentMotionSettings>): ContentMotionSettings {
  return { mode: ['surface', 'opposite', 'world-locked'].includes(value.mode ?? '') ? value.mode! : 'surface',
    gain: Number.isFinite(value.gain) ? Math.min(4, Math.max(0, value.gain!)) : 1 };
}
export interface ContentMotionSample { center: Vec3; radius: number; valid: boolean; source: string; sequence: number; timeS: number }
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
/** Translates only content sampling coordinates. No integration, filtering or geometry mutation. */
export class ContentMotion {
  private settings = { ...DEFAULT_CONTENT_MOTION_SETTINGS };
  private anchor: Vec3 | null = null;
  private base = zero();
  private offset = zero();
  private radius = 1;
  private epoch = '';
  private sequence = -1;
  private timeS = -Infinity;
  private lastCenter: Vec3 | null = null;
  set(settings: Partial<ContentMotionSettings>): void {
    const next = normaliseContentMotionSettings(settings);
    if (next.mode === this.settings.mode && next.gain === this.settings.gain) return;
    this.settings = next; this.anchor = null; this.base = { ...this.offset };
    if (next.mode === 'surface') this.recenter();
  }
  getSettings(): ContentMotionSettings { return { ...this.settings }; }
  recenter(): void { this.anchor = null; this.offset = zero(); this.base = zero(); this.epoch = ''; this.sequence = -1; this.timeS = -Infinity; this.lastCenter = null; }
  invalidate(): void { this.anchor = null; this.base = { ...this.offset }; }
  snapshot() { return { ...this.settings, anchored: this.anchor !== null, offset: { ...this.offset }, referenceRadius: this.radius }; }
  sample(input: ContentMotionSample): ReturnType<ContentMotion['snapshot']> {
    const good = input.valid && Object.values(input.center).every(value => Number.isFinite(value) && Math.abs(value) < 1e9) && Number.isFinite(input.radius) && input.radius >= 0.000001 && Number.isFinite(input.timeS);
    if (!good) { this.invalidate(); return this.snapshot(); }
    if (this.settings.mode === 'surface') return this.snapshot();
    const discontinuity = this.lastCenter && Math.hypot(input.center.x - this.lastCenter.x, input.center.y - this.lastCenter.y, input.center.z - this.lastCenter.z) / this.radius > 8;
    if (input.source !== this.epoch || input.sequence < this.sequence || input.timeS < this.timeS || input.timeS - this.timeS > 0.25 || discontinuity) this.invalidate();
    if (!this.anchor) {
      this.anchor = { ...input.center }; this.base = { ...this.offset };
      // Keep spatial scale across loss/reacquisition so the texture does not jump.
      if (!this.epoch) this.radius = input.radius;
    }
    this.epoch = input.source; this.sequence = input.sequence; this.timeS = input.timeS; this.lastCenter = { ...input.center };
    // q=local+delta cancels centre translation; another gain*delta reverses it.
    const factor = this.settings.mode === 'world-locked' ? 1 : 1 + this.settings.gain;
    const candidate = { ...this.base };
    for (const axis of ['x', 'y', 'z'] as const) candidate[axis] += factor * (input.center[axis] - this.anchor[axis]) / this.radius;
    if (Object.values(candidate).every(value => Number.isFinite(value) && Math.abs(value) <= 10000)) this.offset = candidate;
    else this.invalidate();
    return this.snapshot();
  }
}
