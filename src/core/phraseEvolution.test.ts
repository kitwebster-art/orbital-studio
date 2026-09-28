import { describe, expect, it } from "vitest";
import { phraseAudioEventGate, phraseEvolutionState } from "./phraseEvolution";

const secondsAtBar = (bar: number, bpm = 120): number => bar * 4 * 60 / bpm;

describe("phrase evolution", () => {
  it("authors two eight-bar arcs inside a sixteen-bar phrase", () => {
    expect(phraseEvolutionState(secondsAtBar(0), 120, 1).stage).toBe("emergence");
    expect(phraseEvolutionState(secondsAtBar(4), 120, 1).stage).toBe("breakdown");
    expect(phraseEvolutionState(secondsAtBar(7), 120, 1).stage).toBe("accumulation");
    expect(phraseEvolutionState(secondsAtBar(8), 120, 1).stage).toBe("suspension");
    expect(phraseEvolutionState(secondsAtBar(12), 120, 1).stage).toBe("crescendo");
    expect(phraseEvolutionState(secondsAtBar(15), 120, 1).stage).toBe("void");
    expect(phraseEvolutionState(secondsAtBar(16), 120, 1).phrase).toBe(1);
  });

  it("creates meaningful dynamic contrast", () => {
    const peak = phraseEvolutionState(secondsAtBar(12), 120, 1).energy;
    const voidEnergy = phraseEvolutionState(secondsAtBar(15), 120, 1).energy;
    expect(peak).toBeGreaterThan(1);
    expect(voidEnergy).toBeLessThan(0.2);
    expect(peak - voidEnergy).toBeGreaterThan(0.85);
  });

  it("can be disabled without changing the base performance", () => {
    for (const bar of [0, 4, 8, 12, 15]) {
      expect(phraseEvolutionState(secondsAtBar(bar), 120, 0).energy).toBe(1);
    }
  });

  it("thins generated sound through breakdowns and the final void", () => {
    expect(Array.from({ length: 16 }, (_, step) => phraseAudioEventGate(step, 0.2)).filter(Boolean)).toHaveLength(1);
    expect(Array.from({ length: 16 }, (_, step) => phraseAudioEventGate(step, 0.42)).filter(Boolean)).toHaveLength(2);
    expect(Array.from({ length: 16 }, (_, step) => phraseAudioEventGate(step, 1.08)).every(Boolean)).toBe(true);
  });
});
