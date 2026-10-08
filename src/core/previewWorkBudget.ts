import type { Vec3 } from './contracts';

/** Diagnostic previews share a small budget; physical output never uses this clock. */
export class PreviewWorkBudget {
  private lastCoverageMs = Number.NEGATIVE_INFINITY;
  private lastReadbackMs = Number.NEGATIVE_INFINITY;
  private coverageGeometry: number[] | null = null;

  constructor(private readonly intervalMs = 100) {}

  coverageDue(nowMs: number, center: Vec3, radii: Vec3, dirty = false): boolean {
    const geometry = [center.x, center.y, center.z, radii.x, radii.y, radii.z];
    const changed = !this.coverageGeometry || geometry.some((value, index) => value !== this.coverageGeometry![index]);
    if (!dirty && (!changed || nowMs - this.lastCoverageMs < this.intervalMs)) return false;
    this.coverageGeometry = geometry;
    this.lastCoverageMs = nowMs;
    return true;
  }

  readbackDue(nowMs: number): boolean {
    if (nowMs - this.lastReadbackMs < this.intervalMs) return false;
    this.lastReadbackMs = nowMs;
    return true;
  }
}

/** A small LRU keeps rendered thumbnail pixels without retaining the entire catalogue. */
export class BoundedPreviewCache<T> {
  private readonly entries = new Map<string, T>();
  constructor(private readonly capacity: number) {}

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void { this.entries.clear(); }
}
