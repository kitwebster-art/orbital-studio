import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECTOR_TEST_PRESET_ID,
  PROJECTOR_TEST_PRESETS,
  PROJECTOR_TEST_PATTERNS,
  buildProjectorTestFilename,
  buildProjectorTestRecord,
  getProjectorTestPreset,
  parseProjectorTestRecord,
  patternLabel,
  projectorTestPhysicalVerdictLabel,
  projectorTestThrowRatio,
} from "./projectorTest";

describe("projector test protocol", () => {
  it("includes every physical-test pattern", () => {
    expect(PROJECTOR_TEST_PATTERNS.map((pattern) => pattern.id)).toEqual([
      "latency",
      "grid",
      "focus",
      "circles",
      "white",
      "gray",
      "black",
      "red",
      "green",
      "blue",
    ]);
    expect(patternLabel("latency")).toBe("Latency flash");
  });

  it("records requested and observed modes without overstating hardware proof", () => {
    const record = buildProjectorTestRecord(
      {
        projectorModel: "BenQ TK710",
        serialNumber: "",
        firmware: "",
        lens: "standard throw",
        signalMode: "1920 x 1080 at 120 Hz",
        imageMode: "Game",
        throwDistanceM: 3.2,
        imageWidthM: 2.1,
        requestedResolution: "1920x1080",
        requestedRefreshHz: 120,
        projectorConfirmedMode: false,
        observedBrowserHz: 119.8,
        notes: "Prototype rehearsal",
      },
      "2026-08-17T00:00:00.000Z",
    );

    expect(record.schema).toBe("orbital-projector-test-v1");
    expect(record.recordedAt).toBe("2026-08-17T00:00:00.000Z");
    expect(record.evidenceBoundary).toContain("projector information screen");
    expect(record.evidenceBoundary).toContain("physical high-speed-camera measurement");
  });

  it("provides Sharp and BenQ physical-test presets with evidence-safe defaults", () => {
    expect(DEFAULT_PROJECTOR_TEST_PRESET_ID).toBe("sharp-p601q");
    expect(PROJECTOR_TEST_PRESETS.map((preset) => preset.id)).toEqual([
      "sharp-p601q",
      "benq-lk830st",
    ]);

    const sharp = getProjectorTestPreset("sharp-p601q");
    expect(sharp?.projectorModel).toContain("XP-P601Q");
    expect(sharp?.requestedRefreshHz).toBe(120);
    expect(sharp?.notes).toContain("not an input-lag measurement");

    const benq = getProjectorTestPreset("benq-lk830st");
    expect(benq?.projectorModel).toBe("BenQ LK830ST");
    expect(benq?.notes).toContain("1080p240");
    expect(getProjectorTestPreset("custom")).toBeUndefined();
  });

  it("builds sortable unique filenames from model, signal and record time", () => {
    const record = buildProjectorTestRecord(
      {
        projectorModel: "Sharp XP-P601Q-W / XP-P60Q-W",
        serialNumber: "",
        firmware: "",
        lens: "Integrated zoom",
        signalMode: "1920 x 1080 at 120 Hz",
        imageMode: "Fast",
        throwDistanceM: null,
        imageWidthM: null,
        requestedResolution: "1920x1080",
        requestedRefreshHz: 120,
        projectorConfirmedMode: true,
        observedBrowserHz: 119.9,
        notes: "Physical session",
      },
      "2026-08-19T03:31:42.123Z",
    );

    expect(buildProjectorTestFilename(record)).toBe(
      "orbital-projector-test_20260819T033142Z_sharp-xp-p601q-w-xp-p60q-w_1920x1080_120hz.json",
    );
  });

  it("parses measured records and preserves unresolved evidence", () => {
    const parsed = parseProjectorTestRecord({
      schema: "orbital-projector-test-v1",
      recordedAt: "2026-08-19T03:31:42.123Z",
      projectorModel: "Sharp XP-P601Q-W",
      serialNumber: "SHARP-01",
      firmware: "1.0",
      lens: "Integrated zoom",
      signalMode: "1920 x 1080 at 120 Hz",
      imageMode: "Fast",
      throwDistanceM: 3,
      imageWidthM: 2,
      requestedResolution: "1920x1080",
      requestedRefreshHz: 120,
      projectorConfirmedMode: true,
      observedBrowserHz: 119.8,
      recordingFps: 240,
      latencyBestMs: 8.3,
      latencyMedianMs: 12.5,
      latencyWorstMs: 16.7,
      focusVerdict: "conditional",
      materialVerdict: "pass",
      physicalTestVerdict: "stage-a-candidate",
      notes: "Measured physical session",
    });

    expect(parsed.latencyMedianMs).toBe(12.5);
    expect(projectorTestThrowRatio(parsed)).toBe(1.5);
    expect(projectorTestPhysicalVerdictLabel(parsed.physicalTestVerdict ?? "unmeasured"))
      .toBe("Stage A candidate");

    const unresolved = parseProjectorTestRecord({
      ...parsed,
      latencyMedianMs: undefined,
      focusVerdict: "unknown",
      physicalTestVerdict: "unknown",
    });
    expect(unresolved.latencyMedianMs).toBeNull();
    expect(unresolved.focusVerdict).toBe("not-tested");
    expect(unresolved.physicalTestVerdict).toBe("unmeasured");
  });

  it("rejects files that are not valid projector test records", () => {
    expect(() => parseProjectorTestRecord({ schema: "other" })).toThrow(
      "orbital-projector-test-v1",
    );
    expect(() => parseProjectorTestRecord({
      schema: "orbital-projector-test-v1",
      recordedAt: "not-a-date",
    })).toThrow("valid date");
  });
});
