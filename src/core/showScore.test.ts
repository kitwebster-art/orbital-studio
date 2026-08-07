import { describe, expect, it } from "vitest";
import {
  loadShowScore,
  normaliseShowTime,
  sampleShowScore,
} from "./showScore";

describe("Orbital show score", () => {
  it("loads a contiguous 48-minute, eight-movement supercycle", () => {
    const score = loadShowScore();

    expect(score.durationS).toBe(48 * 60);
    expect(score.movements).toHaveLength(8);
    expect(score.movements.filter((movement) => movement.majorPeak)).toHaveLength(
      3,
    );
    expect(score.movements.map((movement) => movement.name)).toEqual([
      "Dormancy",
      "Observation",
      "Prediction",
      "Recession",
      "Human archive",
      "Contradiction",
      "Bloom",
      "Convergence and loss",
    ]);

    score.movements.forEach((movement, index) => {
      expect(movement.startS).toBe(index * 360);
      expect(movement.durationS).toBe(360);
      const next = score.movements[index + 1];
      if (next) {
        expect(movement.end).toEqual(next.start);
      }
    });
    expect(score.movements.at(-1)?.end).toEqual(score.movements[0].start);
  });

  it("samples shared audiovisual parameters deterministically", () => {
    const score = loadShowScore();
    const movement = score.movements[2];
    const peakTimeS =
      movement.startS +
      movement.durationS * (movement.localPeak?.at ?? 0);
    const first = sampleShowScore(score, peakTimeS);
    const second = sampleShowScore(score, peakTimeS);

    expect(first).toEqual(second);
    expect(first.movement.id).toBe("prediction");
    expect(first.audiovisual.energy).toBeCloseTo(0.76);
    expect(first.audiovisual.residualGain).toBeCloseTo(0.94);
    expect(first.audiovisual.predictionVisibility).toBeCloseTo(0.9);
  });

  it("loops safely and returns an independent score copy", () => {
    const first = loadShowScore();
    const second = loadShowScore();
    first.movements[0].name = "Changed locally";

    expect(second.movements[0].name).toBe("Dormancy");
    expect(normaliseShowTime(second, second.durationS + 12)).toBe(12);
    expect(normaliseShowTime(second, -12)).toBe(second.durationS - 12);
  });

  it("rejects a malformed or discontinuous score", () => {
    const invalid = loadShowScore() as unknown as {
      movements: Array<{ startS: number }>;
    };
    invalid.movements[1].startS = 361;

    expect(() => loadShowScore(invalid)).toThrow(/must start/u);
  });
});
