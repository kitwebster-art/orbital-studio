import { describe, expect, it } from "vitest";
import {
  beatFragmentationGate,
  beatFragmentationPosition,
  beatFragmentationRegionState,
  normaliseFragmentationBpm,
} from "./beatFragmentation";

describe("beat fragmentation clock", () => {
  it("quantises visual events to musical subdivisions", () => {
    expect(beatFragmentationPosition(1, 120, 0.6)).toEqual({ beat: 2, step: 4, phase: 0 });
    expect(beatFragmentationPosition(0.375, 120, 1)).toEqual({ beat: 0.75, step: 3, phase: 0 });
  });

  it("keeps syncopation deterministic and BPM bounded", () => {
    expect(beatFragmentationGate(0, 0.6)).toBe(true);
    expect(beatFragmentationGate(1, 0.6)).toBe(false);
    expect(normaliseFragmentationBpm(999)).toBe(180);
    expect(normaliseFragmentationBpm(Number.NaN)).toBe(112);
  });

  it("gives regions independent musical holds inside a 4/4 phrase", () => {
    const states = Array.from({ length: 24 }, (_, region) =>
      beatFragmentationRegionState(1.375, 120, region, 1, 11));
    const durations = new Set(states.map((state) => state.durationBeats));
    expect(durations.size).toBeGreaterThan(3);
    expect([...durations].every((duration) => [0.125, 0.25, 0.5, 1, 2, 4].includes(duration))).toBe(true);
    expect(states.every((state) => state.offsetBeats * 8 === Math.round(state.offsetBeats * 8))).toBe(true);
  });

  it("keeps a full-bar region stable while short regions advance", () => {
    const region = Array.from({ length: 128 }, (_, candidate) => candidate)
      .find((candidate) => beatFragmentationRegionState(0, 112, candidate, 1, 7).durationBeats === 4);
    expect(region).toBeDefined();
    const start = beatFragmentationRegionState(0.02, 112, region!, 1, 7);
    const late = beatFragmentationRegionState((3.8 * 60) / 112, 112, region!, 1, 7);
    expect(late.step).toBe(start.step);
    expect(late.phase).toBeGreaterThan(start.phase);
  });

  it("falls back to an even half-beat pulse when scatter is zero", () => {
    const states = Array.from({ length: 12 }, (_, region) =>
      beatFragmentationRegionState(0.7, 126, region, 0));
    expect(new Set(states.map((state) => state.durationBeats))).toEqual(new Set([0.5]));
    expect(new Set(states.map((state) => state.offsetBeats))).toEqual(new Set([0]));
  });
});
