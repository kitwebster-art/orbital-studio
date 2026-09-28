import { describe, expect, it } from "vitest";
import {
  heldCameraTourPhase,
  normaliseCinematicSceneControls,
  smoothCameraTourPhase,
} from "./cinematicScene";

describe("cinematic scene controls", () => {
  it("bounds transition speed and validates camera presets", () => {
    expect(normaliseCinematicSceneControls({ transitionSeconds: 99, cameraB: "bad" as never }))
      .toMatchObject({ transitionSeconds: 18, cameraB: "low" });
  });

  it("uses eased, looping three-shot transitions", () => {
    expect(smoothCameraTourPhase(0, 5)).toEqual({ fromIndex: 0, toIndex: 1, mix: 0 });
    expect(smoothCameraTourPhase(7.5, 5)).toEqual({ fromIndex: 1, toIndex: 2, mix: 0.5 });
    expect(smoothCameraTourPhase(15, 5)).toEqual({ fromIndex: 0, toIndex: 1, mix: 0 });
  });

  it("can hold on each composed shot before moving", () => {
    expect(heldCameraTourPhase(2, 5, 3)).toEqual({ fromIndex: 0, toIndex: 1, mix: 0 });
    expect(heldCameraTourPhase(5.5, 5, 3)).toEqual({ fromIndex: 0, toIndex: 1, mix: 0.5 });
    expect(heldCameraTourPhase(8, 5, 3)).toEqual({ fromIndex: 1, toIndex: 2, mix: 0 });
  });
});
