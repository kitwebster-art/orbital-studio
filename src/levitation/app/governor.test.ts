import { describe, expect, it } from "vitest";
import { QualityGovernor } from "./governor";
import { DEFAULT_UI, sanitiseUi } from "./store";

function feed(governor: QualityGovernor, frameMs: number, seconds: number): number {
  let tier = governor.tier;
  for (let t = 0; t < seconds * 1000; t += frameMs) tier = governor.sample(frameMs);
  return tier;
}

describe("quality governor", () => {
  it("holds the top tier at a steady 60 fps", () => {
    const governor = new QualityGovernor({ tiers: 4 });
    expect(feed(governor, 16.7, 10)).toBe(0);
  });

  it("steps down when frames stay slower than 22 ms", () => {
    const governor = new QualityGovernor({ tiers: 4 });
    expect(feed(governor, 30, 3)).toBeGreaterThanOrEqual(1);
    expect(feed(governor, 30, 20)).toBe(3);
  });

  it("ignores single stalls such as shader compiles", () => {
    const governor = new QualityGovernor({ tiers: 4 });
    feed(governor, 16.7, 2);
    governor.sample(400);
    expect(feed(governor, 16.7, 2)).toBe(0);
  });

  it("recovers after a long quiet spell, a bounded number of times", () => {
    const governor = new QualityGovernor({ tiers: 4, maxRecoveries: 1 });
    feed(governor, 30, 3);
    const lowered = governor.tier;
    expect(lowered).toBeGreaterThan(0);
    expect(feed(governor, 8, 20)).toBe(lowered - 1);
    expect(feed(governor, 8, 20)).toBe(lowered - 1);
  });
});

describe("stored interface state", () => {
  it("clamps and validates persisted values", () => {
    const ui = sanitiseUi({
      view: "pressure",
      projectorCount: 9,
      latencyMs: -5,
      lookId: "not-a-look",
      prediction: false,
    });
    expect(ui.view).toBe("pressure");
    expect(ui.projectorCount).toBe(5);
    expect(ui.latencyMs).toBe(0);
    expect(ui.lookId).toBe(DEFAULT_UI.lookId);
    expect(ui.prediction).toBe(false);
    expect(ui.paused).toBe(false);
  });
});
