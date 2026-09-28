import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVING_SKIN_CONTROLS,
  livingSkinSequenceModeIndex,
  normaliseLivingSkinControls,
} from "./livingSkin";

describe("living skin controls", () => {
  it("keeps the cinematic mosaic separate from individual shader testing", () => {
    expect(DEFAULT_LIVING_SKIN_CONTROLS.enabled).toBe(false);
    expect(DEFAULT_LIVING_SKIN_CONTROLS.patchCount).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_LIVING_SKIN_CONTROLS.variety).toBeGreaterThan(0.7);
    expect(DEFAULT_LIVING_SKIN_CONTROLS.sequenceMode).toBe("eruption");
    expect(DEFAULT_LIVING_SKIN_CONTROLS.bpm).toBe(112);
  });

  it("bounds expensive and unstable values", () => {
    expect(normaliseLivingSkinControls({ patchCount: 99, glitch: 4, flashRate: 8, eventHold: -3, sequenceMode: "bad" as never, breath: -2 }))
      .toMatchObject({ patchCount: 12, glitch: 1, flashRate: 1, eventHold: 0, sequenceMode: "eruption", breath: 0 });
    expect(normaliseLivingSkinControls({ bpm: 999 }).bpm).toBe(180);
  });

  it("keeps sequence modes on stable renderer slots", () => {
    expect(livingSkinSequenceModeIndex("random")).toBe(0);
    expect(livingSkinSequenceModeIndex("eruption")).toBe(3);
  });
});
