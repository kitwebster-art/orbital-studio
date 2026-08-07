import { describe, expect, it } from "vitest";
import {
  createContentPreset,
  parseContentPreset,
  readStoredContentPreset,
  serialiseContentPreset,
  updateMovementCurve,
  updateMovementDuration,
  updateMovementMetadata,
  writeStoredContentPreset,
} from "./contentPresets";
import { loadShowScore } from "./showScore";

describe("Orbital content presets", () => {
  it("round-trips a versioned show score", () => {
    const score = loadShowScore();
    const preset = createContentPreset(score, "2026-08-02T00:00:00.000Z");
    const parsed = parseContentPreset(JSON.parse(serialiseContentPreset(score, preset.savedAt)));

    expect(preset.schemaVersion).toBe("orbital.content-preset/1.0");
    expect(parsed).toEqual(score);
  });

  it("edits curves, peak state, metadata and contiguous duration", () => {
    const score = loadShowScore();
    const curved = updateMovementCurve(score, "observation", "glitch", {
      start: 0.12,
      peak: 0.48,
      end: 0.18,
      peakAt: 0.62,
      usePeak: true,
    });
    const metadata = updateMovementMetadata(curved, "observation", {
      majorPeak: true,
      description: "Edited for the first authoring pass.",
    });
    const resized = updateMovementDuration(metadata, "observation", 420);

    expect(resized.movements[1].startS).toBe(360);
    expect(resized.movements[1].durationS).toBe(420);
    expect(resized.movements[2].startS).toBe(780);
    expect(resized.durationS).toBe(2940);
    expect(resized.movements[1].start.glitch).toBeCloseTo(0.12);
    expect(resized.movements[1].end.glitch).toBeCloseTo(0.18);
    expect(resized.movements[1].localPeak?.glitch).toBeCloseTo(0.48);
    expect(resized.movements[1].localPeak?.at).toBeCloseTo(0.62);
    expect(resized.movements[1].majorPeak).toBe(true);
    expect(resized.movements[1].description).toBe(
      "Edited for the first authoring pass.",
    );
  });

  it("persists only valid presets in the browser storage boundary", () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, nextValue: string) => {
        value = nextValue;
      },
    };
    const score = loadShowScore();

    expect(readStoredContentPreset(storage)).toBeNull();
    writeStoredContentPreset(storage, score, "2026-08-02T00:00:00.000Z");
    expect(readStoredContentPreset(storage)).toEqual(score);

    value = "{\"schemaVersion\":\"unknown\"}";
    expect(readStoredContentPreset(storage)).toBeNull();
  });

  it("rejects unsupported or malformed preset data", () => {
    expect(() => parseContentPreset({ schemaVersion: "unknown" })).toThrow(
      /Unsupported content preset schema/u,
    );
    expect(() => parseContentPreset(createContentPreset(loadShowScore()))).not.toThrow();
  });
});
