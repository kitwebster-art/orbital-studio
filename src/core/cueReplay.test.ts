import { describe, expect, it } from "vitest";
import { RuntimeEngine } from "./RuntimeEngine";
import { toCueState } from "./cueBridge";
import {
  CueStreamPlayer,
  cueStateToRuntimeSnapshot,
  parseCueStreamJsonl,
} from "./cueReplay";

function recordedStates() {
  const engine = new RuntimeEngine({ autoplay: false });
  engine.seek(0);
  const first = toCueState(engine.tick(0), 100);
  engine.seek(2);
  const second = toCueState(engine.tick(0), 101);
  return [first, second];
}

describe("Orbital cue replay", () => {
  it("parses recorded JSONL and rejects non-monotonic timestamps", () => {
    const [first, second] = recordedStates();
    const parsed = parseCueStreamJsonl(
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].schemaVersion).toBe("orbital.cue-state/1.0");
    expect(() =>
      parseCueStreamJsonl(
        `${JSON.stringify(second)}\n${JSON.stringify(first)}\n`,
      ),
    ).toThrow(/must not move backwards/u);
    expect(() => parseCueStreamJsonl("\n")).toThrow(/no frames/u);
    expect(() => parseCueStreamJsonl("{bad-json}")).toThrow(/line 1/u);
  });

  it("replays exact frame states with deterministic transport", () => {
    const [first, second] = recordedStates();
    const player = new CueStreamPlayer([first, second]);

    expect(player.frameCount).toBe(2);
    expect(player.durationS).toBe(1);
    expect(player.positionS).toBe(0);
    expect(player.currentState.showTimeS).toBe(0);

    player.setPlaybackRate(2);
    player.setPlaying(true);
    player.advance(0.25);
    expect(player.positionS).toBeCloseTo(0.5, 8);
    expect(player.currentState.showTimeS).toBe(0);

    player.advance(0.3);
    expect(player.positionS).toBe(1);
    expect(player.playing).toBe(false);
    expect(player.currentState.showTimeS).toBe(2);

    player.seek(0.25);
    expect(player.currentState.showTimeS).toBe(0);
    player.reset();
    expect(player.positionS).toBe(0);
    expect(player.playbackRate).toBe(1);
  });

  it("converts a cue frame back into a runtime snapshot", () => {
    const [first] = recordedStates();
    const engine = new RuntimeEngine({ autoplay: false });
    const snapshot = cueStateToRuntimeSnapshot(first, engine.showScore);

    expect(snapshot.showTimeS).toBe(first.showTimeS);
    expect(snapshot.movement.id).toBe(first.movement.id);
    expect(snapshot.movementProgress).toBe(first.movement.progress);
    expect(snapshot.audiovisual).toEqual(first.audiovisual);
    expect(snapshot.quadLevels).toEqual(first.quadLevels);
    expect(snapshot.projectorLevels).toEqual(first.projectorLevels);
    expect(snapshot.fan.hardwareWriteEnabled).toBe(false);
    expect(snapshot.world).not.toBe(first.world);
  });

  it("supports looping playback and bounded rates", () => {
    const [first, second] = recordedStates();
    const player = new CueStreamPlayer([first, second], { loop: true });

    player.setPlaybackRate(60);
    player.setPlaying(true);
    player.advance(0.1);
    expect(player.playing).toBe(true);
    expect(player.positionS).toBeCloseTo(0, 8);
    expect(() => player.setPlaybackRate(61)).toThrow(/between 0.05 and 60/u);
    expect(() => player.seek(Number.NaN)).toThrow(/finite/u);
  });
});
