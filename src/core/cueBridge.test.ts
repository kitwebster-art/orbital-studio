import { describe, expect, it } from "vitest";
import { RuntimeEngine } from "./RuntimeEngine";
import {
  CUE_STATE_SCHEMA_VERSION,
  CueStreamRecorder,
  toCueState,
} from "./cueBridge";

describe("Orbital cue bridge", () => {
  it("projects a runtime snapshot into a versioned, no-write cue state", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    const snapshot = engine.tick(0);
    const cue = toCueState(snapshot, 12.5);

    expect(cue.schemaVersion).toBe(CUE_STATE_SCHEMA_VERSION);
    expect(cue.emittedAtMonotonicS).toBe(12.5);
    expect(cue.showTimeS).toBe(0);
    expect(cue.movement).toEqual({ id: "dormancy", progress: 0 });
    expect(cue.audiovisual).toEqual(snapshot.audiovisual);
    expect(cue.quadLevels).toEqual(snapshot.quadLevels);
    expect(cue.projectorLevels).toEqual(snapshot.projectorLevels);
    expect(cue.fanCue).toBe(snapshot.audiovisual.fanCue);
    expect(cue.fanTelemetry.hardwareWriteEnabled).toBe(false);
    expect(cue.world).not.toBe(snapshot.world);

    cue.world.diagnostics.flags.push("TEST_ONLY");
    expect(snapshot.world.diagnostics.flags).not.toContain("TEST_ONLY");
  });

  it("samples at a bounded interval and serialises JSONL", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    const snapshot = engine.tick(0);
    const recorder = new CueStreamRecorder({
      sampleIntervalS: 0.1,
      maxFrames: 3,
    });

    expect(recorder.capture(snapshot, 10)).toBe(false);
    recorder.start();
    expect(recorder.capture(snapshot, 10)).toBe(true);
    expect(recorder.capture(snapshot, 10.05)).toBe(false);
    expect(recorder.capture(snapshot, 10.1)).toBe(true);
    expect(recorder.frameCount).toBe(2);
    expect(recorder.elapsedS).toBeCloseTo(0.1, 8);

    expect(recorder.capture(snapshot, 9)).toBe(true);
    expect(recorder.recording).toBe(false);
    expect(recorder.frameCount).toBe(3);

    const lines = recorder
      .serialise()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { schemaVersion: string });
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.schemaVersion === CUE_STATE_SCHEMA_VERSION)).toBe(
      true,
    );
  });

  it("clears a recording without leaving stale frames or duration", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    const snapshot = engine.tick(0);
    const recorder = new CueStreamRecorder({ sampleIntervalS: 0.05 });

    recorder.start();
    recorder.capture(snapshot, 1);
    recorder.capture(snapshot, 1.05);
    recorder.stop();
    recorder.clear();

    expect(recorder.frameCount).toBe(0);
    expect(recorder.elapsedS).toBe(0);
    expect(recorder.serialise()).toBe("");
    expect(recorder.recording).toBe(false);
  });

  it("rejects invalid recorder settings and timestamps", () => {
    expect(() => new CueStreamRecorder({ sampleIntervalS: 0 })).toThrow(
      /sampleIntervalS/u,
    );
    expect(() => new CueStreamRecorder({ maxFrames: 1.5 })).toThrow(
      /maxFrames/u,
    );

    const engine = new RuntimeEngine({ autoplay: false });
    const snapshot = engine.tick(0);
    expect(() => toCueState(snapshot, -1)).toThrow(/emittedAtMonotonicS/u);
  });
});
