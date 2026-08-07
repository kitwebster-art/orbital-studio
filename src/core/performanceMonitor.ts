export interface PerformanceSnapshot {
  fps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  targetFrameTimeMs: number;
  droppedFrames: number;
  stable: boolean;
}

export interface PerformanceMonitorOptions {
  windowSize?: number;
  targetFps?: number;
}

export class PerformanceMonitor {
  private readonly windowSize: number;
  private readonly targetFrameTimeMs: number;
  private readonly frameTimesMs: number[] = [];
  private droppedFrames = 0;

  constructor(options: PerformanceMonitorOptions = {}) {
    this.windowSize = options.windowSize ?? 60;
    const targetFps = options.targetFps ?? 60;
    if (!Number.isInteger(this.windowSize) || this.windowSize < 5) {
      throw new Error("windowSize must be an integer of at least 5");
    }
    if (!Number.isFinite(targetFps) || targetFps <= 0) {
      throw new Error("targetFps must be a finite positive number");
    }
    this.targetFrameTimeMs = 1_000 / targetFps;
  }

  sample(deltaS: number): PerformanceSnapshot {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("deltaS must be a finite non-negative number");
    }
    const frameTimeMs = deltaS * 1_000;
    this.frameTimesMs.push(frameTimeMs);
    if (this.frameTimesMs.length > this.windowSize) {
      this.frameTimesMs.shift();
    }
    if (frameTimeMs > this.targetFrameTimeMs * 2) {
      this.droppedFrames += 1;
    }
    return this.snapshot();
  }

  reset(): void {
    this.frameTimesMs.length = 0;
    this.droppedFrames = 0;
  }

  snapshot(): PerformanceSnapshot {
    if (this.frameTimesMs.length === 0) {
      return {
        fps: 0,
        frameTimeMs: 0,
        p95FrameTimeMs: 0,
        targetFrameTimeMs: this.targetFrameTimeMs,
        droppedFrames: this.droppedFrames,
        stable: false,
      };
    }
    const sorted = [...this.frameTimesMs].sort((left, right) => left - right);
    const average =
      this.frameTimesMs.reduce((total, value) => total + value, 0) /
      this.frameTimesMs.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
    const safeAverage = Math.max(0.001, average);
    return {
      fps: 1_000 / safeAverage,
      frameTimeMs: average,
      p95FrameTimeMs: p95,
      targetFrameTimeMs: this.targetFrameTimeMs,
      droppedFrames: this.droppedFrames,
      stable: this.frameTimesMs.length >= 5 && p95 <= this.targetFrameTimeMs * 2,
    };
  }
}
