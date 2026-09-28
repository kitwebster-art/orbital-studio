import { describe, expect, it } from "vitest";
import {
  getRenderQualityProfile,
  normaliseRenderQualityMode,
  RenderQualityGovernor,
} from "./renderQuality";
import type { PerformanceSnapshot } from "./performanceMonitor";

function performance(
  p95FrameTimeMs: number,
  frameTimeMs = p95FrameTimeMs,
): PerformanceSnapshot {
  return {
    fps: 1_000 / Math.max(0.001, frameTimeMs),
    frameTimeMs,
    p95FrameTimeMs,
    targetFrameTimeMs: 1_000 / 60,
    droppedFrames: p95FrameTimeMs > 33.333 ? 1 : 0,
    stable: p95FrameTimeMs <= 33.333,
  };
}

describe("render quality policy", () => {
  it("normalises modes and exposes bounded renderer profiles", () => {
    expect(normaliseRenderQualityMode("not-a-mode")).toBe("adaptive");
    expect(getRenderQualityProfile("high").maxPixelRatio).toBe(2);
    expect(getRenderQualityProfile("balanced").maxPixelRatio).toBe(1.25);
    expect(getRenderQualityProfile("low").shadows).toBe(false);
  });

  it("downgrades only after sustained over-budget frames", () => {
    const governor = new RenderQualityGovernor();
    expect(governor.snapshot().effective).toBe("balanced");
    governor.update(performance(48), 0.5);
    expect(governor.snapshot().effective).toBe("balanced");
    const downgraded = governor.update(performance(48), 1.1);
    expect(downgraded.effective).toBe("low");
    expect(downgraded.transitions).toBe(1);
  });

  it("raises quality only after a long stable window and does not oscillate", () => {
    const governor = new RenderQualityGovernor();
    governor.update(performance(48), 1.5);
    expect(governor.snapshot().effective).toBe("low");
    governor.update(performance(16), 7.5);
    expect(governor.snapshot().effective).toBe("low");
    const raised = governor.update(performance(16), 0.5);
    expect(raised.effective).toBe("balanced");
    expect(raised.transitions).toBe(2);
    const held = governor.update(performance(48), 0.5);
    expect(held.effective).toBe("balanced");
  });

  it("honours an explicit tier without adaptive transitions", () => {
    const governor = new RenderQualityGovernor();
    const selected = governor.setMode("high");
    expect(selected.requested).toBe("high");
    expect(selected.effective).toBe("high");
    const held = governor.update(performance(100), 12);
    expect(held.effective).toBe("high");
    expect(held.status).toBe("over-budget");
  });

  it("pins the effective tier while an override is active and restores the governed tier afterwards", () => {
    const governor = new RenderQualityGovernor();
    governor.setMode("high");
    expect(governor.snapshot().effective).toBe("high");
    expect(governor.setOverride("low").effective).toBe("low");
    expect(governor.update(performance(5), 0.5).effective).toBe("low");
    expect(governor.snapshot().requested).toBe("high");
    expect(governor.getOverride()).toBe("low");
    expect(governor.setOverride(null).effective).toBe("high");
    expect(() => governor.setOverride("ultra" as never)).toThrow();
  });
});
