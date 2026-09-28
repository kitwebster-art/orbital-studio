import { describe, expect, it } from "vitest";
import {
  materialControlsForProfile,
  normaliseBalloonPhysicsControls,
  normaliseProjectionMaterialControls,
} from "./balloonSurfaceControls";

describe("balloon surface controls", () => {
  it("clamps physical rehearsal controls", () => {
    expect(normaliseBalloonPhysicsControls({ mass: 3, damping: -1 })).toMatchObject({
      mass: 1,
      damping: 0,
    });
  });

  it("switches between visibly distinct material profiles", () => {
    const latex = materialControlsForProfile("latex");
    const parachute = materialControlsForProfile("parachute");
    expect(parachute.translucency).toBeGreaterThan(latex.translucency);
    expect(normaliseProjectionMaterialControls({ profile: "parachute" }).profile).toBe("parachute");
  });
});
