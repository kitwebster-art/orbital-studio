import { describe, expect, it } from "vitest";
import { QUAD_LEVEL_ORDER, RuntimeEngine } from "./RuntimeEngine";
import { updateMovementDuration } from "./contentPresets";

describe("RuntimeEngine", () => {
  it("drives transport, the score and bounded shared AV state", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    const initial = engine.tick(0);

    expect(engine.currentTimeS).toBe(0);
    expect(engine.durationS).toBe(2880);
    expect(engine.mode).toBe("simulation");
    expect(initial.movement.id).toBe("dormancy");
    expect(initial.world.prediction?.model).toBe("constant-velocity");
    expect(initial.world.prediction?.horizonMs).toBe(120);
    expect(initial.quadLevels).toHaveLength(4);
    expect(initial.projectorLevels).toHaveLength(5);
    expect(QUAD_LEVEL_ORDER).toEqual([
      "front-left",
      "front-right",
      "rear-left",
      "rear-right",
    ]);

    engine.setPlaybackRate(2);
    engine.setPlaying(true);
    const advanced = engine.tick(1);
    expect(engine.currentTimeS).toBe(2);
    expect(advanced.showTimeS).toBe(2);
    expect(engine.playbackRate).toBe(2);

    engine.setPlaybackRate(60);
    expect(engine.playbackRate).toBe(60);
    expect(() => engine.setPlaybackRate(61)).toThrow(/between 0.05 and 60/u);
  });

  it("produces a matured constant-velocity residual", () => {
    const engine = new RuntimeEngine({
      autoplay: true,
      predictionHorizonMs: 120,
    });

    engine.tick(0.06);
    engine.tick(0.06);
    const matured = engine.tick(0.06);
    const residual = matured.world.prediction?.residualM;

    expect(residual).not.toBeNull();
    expect(
      Math.hypot(residual?.x ?? 0, residual?.y ?? 0, residual?.z ?? 0),
    ).toBeGreaterThan(0);
    expect(matured.world.diagnostics.flags).toContain(
      "MATURED_FORECAST_RESIDUAL",
    );
  });

  it("moves tracking loss into a neutral authored fallback", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    engine.seek(2000);
    const normal = engine.tick(0);
    engine.setInjectedTrackingLoss(true);
    const lost = engine.tick(0);

    expect(lost.world.status).toBe("lost");
    expect(lost.world.stateValid).toBe(false);
    expect(lost.world.prediction).toBeNull();
    expect(lost.audiovisual.brightness).toBeLessThan(
      normal.audiovisual.brightness,
    );
    expect(lost.audiovisual.glitch).toBe(0);
    expect(lost.audiovisual.predictionVisibility).toBe(0);
    expect(lost.world.diagnostics.flags).toContain(
      "AUTHORED_NEUTRAL_FALLBACK",
    );
  });

  it("exposes fan faults only through a simulated no-write boundary", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    engine.setFanFault("SIMULATED_ESTOP");
    const snapshot = engine.tick(0.5);

    expect(snapshot.fan.hardwareWriteEnabled).toBe(false);
    expect(snapshot.fan.controllerHealthy).toBe(false);
    expect(snapshot.fan.acceptedCue).toBe(0);
    expect(snapshot.fan.fault).toBe("SIMULATED_ESTOP");
  });

  it("lets Phase One test cues override score fan motion without enabling hardware writes", () => {
    const engine = new RuntimeEngine({ autoplay: false });

    engine.setFanCueOverride(0.72);
    const testCue = engine.tick(0.1);
    expect(testCue.audiovisual.fanCue).toBe(0.72);
    expect(testCue.fan.requestedCue).toBe(0.72);
    expect(testCue.fan.hardwareWriteEnabled).toBe(false);

    engine.setFanCueOverride(null);
    const scoreCue = engine.tick(0);
    expect(scoreCue.audiovisual.fanCue).not.toBe(0.72);
  });

  it("loops, seeks and resets predictably", () => {
    const engine = new RuntimeEngine({ autoplay: true });
    engine.seek(engine.durationS - 1);
    engine.tick(2);
    expect(engine.currentTimeS).toBe(1);

    engine.reset();
    expect(engine.currentTimeS).toBe(0);
    expect(engine.playing).toBe(false);
    expect(engine.playbackRate).toBe(1);
  });

  it("traverses every movement and cleanly loops one 60x supercycle", () => {
    const engine = new RuntimeEngine({ autoplay: true });
    engine.setPlaybackRate(60);
    const movementIds = [engine.tick(0).movement.id];

    for (let frame = 0; frame < 480; frame += 1) {
      const snapshot = engine.tick(0.1);
      const lastMovementId = movementIds[movementIds.length - 1];
      if (snapshot.movement.id !== lastMovementId) {
        movementIds.push(snapshot.movement.id);
      }

      expect(Object.values(snapshot.audiovisual).every(Number.isFinite)).toBe(
        true,
      );
      expect(snapshot.fan.hardwareWriteEnabled).toBe(false);
    }

    expect(movementIds).toEqual([
      "dormancy",
      "observation",
      "prediction",
      "recession",
      "human-archive",
      "contradiction",
      "bloom",
      "convergence-and-loss",
      "dormancy",
    ]);
    expect(engine.currentTimeS).toBeCloseTo(0, 8);
  });

  it("can disable prediction without interrupting the authored score", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    engine.setPredictionEnabled(false);
    const snapshot = engine.tick(0);

    expect(snapshot.world.stateValid).toBe(true);
    expect(snapshot.world.prediction?.model).toBe("disabled");
    expect(snapshot.world.diagnostics.flags).toContain(
      "AUTHORED_SCORE_ONLY",
    );
  });

  it("accepts an edited score without losing transport position", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    const edited = updateMovementDuration(engine.showScore, "dormancy", 420);

    engine.seek(720);
    engine.setShowScore(edited);

    expect(engine.currentTimeS).toBe(720);
    expect(engine.durationS).toBe(2940);
    expect(engine.tick(0).movement.id).toBe("observation");
  });
});
