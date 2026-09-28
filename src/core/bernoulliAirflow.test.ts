import { describe, expect, it } from "vitest";
import { BernoulliAirJetModel } from "./bernoulliAirflow";
import {
  REAL_BALLOON_REFERENCE,
  sampleVideoDerivedBalloonMotion,
} from "./realBalloonReference";

function run(model: BernoulliAirJetModel, fan: number, seconds: number) {
  let state = model.step(fan, 0, 0);
  const dt = 1 / 60;
  for (let index = 1; index <= seconds / dt; index += 1) {
    state = model.step(fan, dt, index * dt);
  }
  return state;
}

describe("Bernoulli air-jet balloon model", () => {
  it("uses a seamless volume-preserving motion loop derived from IMG_6021", () => {
    const start = sampleVideoDerivedBalloonMotion(0);
    const mirroredEnd = sampleVideoDerivedBalloonMotion(34);
    const volume = start.radiiScale.x * start.radiiScale.y * start.radiiScale.z;

    expect(start.centerOffsetM.x).toBeCloseTo(0.0372, 3);
    expect(volume).toBeCloseTo(1, 5);
    expect(mirroredEnd.centerOffsetM.x).toBeCloseTo(start.centerOffsetM.x, 6);
    expect(mirroredEnd.radiiScale.x).toBeCloseTo(start.radiiScale.x, 6);
  });

  it("settles higher when fan speed rises", () => {
    const low = run(new BernoulliAirJetModel(), 0.25, 35);
    const high = run(new BernoulliAirJetModel(), 0.9, 35);
    expect(high.offsetM.y).toBeGreaterThan(low.offsetM.y + 0.75);
  });

  it("remains captured inside the jet instead of wandering away", () => {
    const state = run(new BernoulliAirJetModel(), 0.82, 90);
    expect(Math.hypot(state.offsetM.x, state.offsetM.z)).toBeLessThan(0.52);
    expect(state.flowAttachment).toBeGreaterThan(0.4);
    expect(Math.hypot(state.velocityMps.x, state.velocityMps.z)).toBeLessThan(0.2);
  });

  it("keeps slow deformation approximately volume preserving", () => {
    const state = run(new BernoulliAirJetModel(), 0.82, 24);
    const volume = state.radiiScale.x * state.radiiScale.y * state.radiiScale.z;
    expect(volume).toBeCloseTo(1, 5);
    expect(state.wobble).toBeLessThan(0.3);
    expect(state.deformationRate).toBeLessThan(0.2);
  });

  it("reproduces the broad silhouette-change band measured in the hall clip", () => {
    const model = new BernoulliAirJetModel();
    const dt = 1 / 60;
    const aspects: number[] = [];
    for (let index = 0; index <= 36 / dt; index += 1) {
      const state = model.step(0.82, index === 0 ? 0 : dt, index * dt);
      if (index * dt >= 18) {
        aspects.push(state.radiiScale.x / state.radiiScale.y);
      }
    }
    const aspectSpan = Math.max(...aspects) - Math.min(...aspects);
    const measuredAspectSpan =
      REAL_BALLOON_REFERENCE.measured.aspectRatioP95 -
      REAL_BALLOON_REFERENCE.measured.aspectRatioP05;

    // The monocular reference measured a 0.122 p05-p95 aspect span. The
    // low-order model intentionally stays in a conservative neighbourhood of
    // that result instead of copying every uncalibrated silhouette error.
    expect(aspectSpan).toBeGreaterThan(measuredAspectSpan * 0.44);
    expect(aspectSpan).toBeLessThan(measuredAspectSpan * 1.35);
  });
});
