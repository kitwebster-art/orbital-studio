import { describe, expect, it } from "vitest";
import {
  formatLength,
  formatMass,
  formatPower,
  formatRpm,
  fromLogPosition,
  humanScale,
  pipCount,
  scoreTone,
  snapNice,
  toLogPosition,
} from "./format";

describe("levitation format helpers", () => {
  it("switches length units for small values", () => {
    expect(formatLength(2.514)).toEqual({ value: "2.51", unit: "m" });
    expect(formatLength(0.15)).toEqual({ value: "15", unit: "cm" });
    expect(formatLength(0.042)).toEqual({ value: "4.2", unit: "cm" });
    expect(formatLength(0.0072)).toEqual({ value: "7", unit: "mm" });
    expect(formatLength(Number.NaN).value).toBe("–");
  });

  it("formats mass in grams below a kilogram", () => {
    expect(formatMass(0.107)).toEqual({ value: "107", unit: "g" });
    expect(formatMass(8.12)).toEqual({ value: "8.12", unit: "kg" });
    expect(formatMass(0.0042)).toEqual({ value: "4.2", unit: "g" });
  });

  it("formats power and rotor speed readably", () => {
    expect(formatPower(640)).toEqual({ value: "640", unit: "W" });
    expect(formatPower(2050)).toEqual({ value: "2.05", unit: "kW" });
    expect(formatRpm(1123).value).toBe("≈1,120");
  });

  it("gives human-scale comparisons that grow with size", () => {
    expect(humanScale(0.1)).toBe("about a grapefruit");
    expect(humanScale(0.4)).toBe("about a beach ball");
    expect(humanScale(1.8)).toBe("about a person's height");
    expect(humanScale(3)).toBe("Orbital's 3 m sphere scale");
    expect(humanScale(5)).toContain("bus");
  });

  it("maps log sliders both ways", () => {
    const range = { min: 0.1, max: 5 };
    expect(fromLogPosition(0, range)).toBeCloseTo(0.1);
    expect(fromLogPosition(1, range)).toBeCloseTo(5);
    for (const value of [0.1, 0.37, 1, 2.8, 5]) {
      expect(fromLogPosition(toLogPosition(value, range), range)).toBeCloseTo(value, 6);
    }
  });

  it("snaps to steps that grow with magnitude", () => {
    expect(snapNice(0.123)).toBeCloseTo(0.12);
    expect(snapNice(1.237)).toBeCloseTo(1.24);
    expect(snapNice(12.34)).toBeCloseTo(12.3);
  });

  it("maps scores and qualities to tones and pips", () => {
    expect(scoreTone(90)).toBe("good");
    expect(scoreTone(50)).toBe("ok");
    expect(scoreTone(10)).toBe("poor");
    expect(pipCount(1)).toBe(3);
    expect(pipCount(0.4)).toBe(1);
    expect(pipCount(Number.NaN)).toBe(0);
  });
});
