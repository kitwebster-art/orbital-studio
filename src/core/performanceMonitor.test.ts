import { describe, expect, it } from "vitest";
import { PerformanceMonitor } from "./performanceMonitor";

describe("performance monitor", () => {
  it("reports a stable 60 fps window", () => {
    const monitor = new PerformanceMonitor({ windowSize: 5 });
    let snapshot = monitor.snapshot();
    expect(snapshot.stable).toBe(false);
    for (let index = 0; index < 5; index += 1) {
      snapshot = monitor.sample(1 / 60);
    }
    expect(snapshot.fps).toBeCloseTo(60, 4);
    expect(snapshot.p95FrameTimeMs).toBeCloseTo(16.666, 2);
    expect(snapshot.targetFrameTimeMs).toBeCloseTo(16.666, 2);
    expect(snapshot.stable).toBe(true);
  });

  it("counts long frames and rejects invalid samples", () => {
    const monitor = new PerformanceMonitor({ windowSize: 5 });
    monitor.sample(0.04);
    expect(monitor.snapshot().droppedFrames).toBe(1);
    expect(() => monitor.sample(-1)).toThrow(/deltaS/u);
  });
});
