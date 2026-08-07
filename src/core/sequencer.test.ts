import { describe, expect, it } from "vitest";
import {
  calculateBeatPosition,
  createDefaultTimeline,
  createGeneratedFallbackTimeline,
  interpolateCueValue,
  Sequencer,
  TIMELINE_SCHEMA_VERSION,
  type TimelineDefinition,
} from "./sequencer";

const TEST_TIMELINE: TimelineDefinition = {
  schemaVersion: TIMELINE_SCHEMA_VERSION,
  title: "Deterministic test timeline",
  bpm: 120,
  beatsPerBar: 4,
  barsPerPhrase: 2,
  durationBeats: 16,
  loop: true,
  tracks: [
    {
      id: "energy",
      cues: [
        { id: "energy-start", beat: 0, value: 0, interpolation: "linear" },
        { id: "energy-mid", beat: 4, value: 1, interpolation: "smoothstep" },
        { id: "energy-end", beat: 8, value: 0, interpolation: "linear" },
      ],
    },
    {
      id: "events",
      kind: "event",
      cues: [
        { id: "bar-one", beat: 4, value: "hit" },
        { id: "phrase-two", beat: 8, value: "phrase" },
      ],
    },
  ],
};

describe("TimelineSequencer", () => {
  it("interpolates scalar and nested values deterministically", () => {
    expect(interpolateCueValue(0, 10, 0.5, "linear")).toBe(5);
    expect(interpolateCueValue(0, 10, 0.5, "smoothstep")).toBe(5);
    expect(interpolateCueValue({ x: 0, y: 1 }, { x: 1, y: 3 }, 0.5)).toEqual({
      x: 0.5,
      y: 2,
    });
    expect(interpolateCueValue("cold", "warm", 0.4)).toBe("cold");
    expect(interpolateCueValue("cold", "warm", 1)).toBe("warm");
  });

  it("reports beat, bar and phrase positions without wall-clock state", () => {
    expect(calculateBeatPosition(6.5, 4, 2)).toMatchObject({
      bar: 2,
      phrase: 1,
      barIndex: 1,
      phraseIndex: 0,
      beatInBar: 2.5,
      beatInPhrase: 6.5,
      phase: 0.5,
    });
  });

  it("samples, advances and emits event cues across a loop", () => {
    const sequencer = new Sequencer(TEST_TIMELINE, { autoplay: true });
    expect(sequencer.currentState.values.energy).toBe(0);

    const middle = sequencer.tick(1); // 2 beats at 120 BPM
    expect(middle.position.beat).toBe(2);
    expect(middle.values.energy).toBeCloseTo(0.5, 8);
    expect(middle.events).toEqual([]);

    const bar = sequencer.tick(1); // reaches beat four
    expect(bar.position.bar).toBe(2);
    expect(bar.events.map((event) => event.cueId)).toEqual(["bar-one"]);
    expect(bar.values.energy).toBeCloseTo(1, 8);

    sequencer.seekBeat(15);
    const wrapped = sequencer.tick(1); // 17 beats total, one beat into next cycle
    expect(wrapped.position.beat).toBeCloseTo(1, 8);
    expect(wrapped.events).toEqual([]);
  });

  it("stops at the end of a non-looping timeline", () => {
    const sequencer = new Sequencer({ ...TEST_TIMELINE, loop: false }, { autoplay: true });
    const frame = sequencer.tick(20);
    expect(frame.position.beat).toBe(16);
    expect(frame.timeS).toBe(8);
    expect(sequencer.playing).toBe(false);
  });

  it("converts the authored score and provides a stable generated fallback", () => {
    const authored = createDefaultTimeline({ tempoBpm: 60 });
    expect(authored.schemaVersion).toBe(TIMELINE_SCHEMA_VERSION);
    expect(authored.durationBeats).toBe(2880);
    expect(authored.tracks.map((track) => track.id)).toContain("audiovisual.energy");

    const first = createGeneratedFallbackTimeline({ phrases: 2 });
    const second = createGeneratedFallbackTimeline({ phrases: 2 });
    expect(first).toEqual(second);
    expect(first.tracks.find((track) => track.kind === "event")?.cues).toHaveLength(2);
  });
});

