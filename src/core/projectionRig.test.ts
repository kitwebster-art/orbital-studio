import { describe, expect, it } from "vitest";
import { RuntimeEngine } from "./RuntimeEngine";
import {
  calculateProjectorLevels,
  createDefaultProjectionRig,
  PROJECTOR_COUNT,
  toProjectorShaderInputs,
  validateProjectionRig,
} from "./projectionRig";

describe("five-projector rig contract", () => {
  it("creates and validates a five-head shape-locked rig", () => {
    const rig = createDefaultProjectionRig();
    expect(rig.projectorCount).toBe(PROJECTOR_COUNT);
    expect(rig.projectors).toHaveLength(5);
    expect(rig.mappingMode).toBe("shape-locked-world");
    expect(rig.materialRotationIndependent).toBe(true);
    expect(validateProjectionRig(JSON.parse(JSON.stringify(rig)))).toEqual(rig);

    const levels = [0.1, 0.2, 0.3, 0.4, 0.5] as [number, number, number, number, number];
    const uniforms = toProjectorShaderInputs(rig, levels);
    expect(uniforms).toHaveLength(5);
    expect(uniforms[4].direction.y).toBeLessThan(0);
    expect(uniforms[0].blend.left).toBeCloseTo(0.1);
    expect(uniforms[0].tanHalfFov).toBeGreaterThan(0);
    expect(Math.hypot(
      uniforms[0].right.x,
      uniforms[0].right.y,
      uniforms[0].right.z,
    )).toBeCloseTo(1);
  });

  it("keeps projector channels bounded and neutral on tracking loss", () => {
    const engine = new RuntimeEngine({ autoplay: false });
    const normal = engine.tick(0);
    expect(normal.projectorLevels).toHaveLength(5);
    expect(normal.projectorLevels.every((level) => level >= 0 && level <= 1)).toBe(true);

    engine.setInjectedTrackingLoss(true);
    const lost = engine.tick(0);
    expect(lost.projectorLevels).toHaveLength(5);
    expect(lost.projectorLevels.every((level) => level >= 0 && level <= 1)).toBe(true);
    expect(calculateProjectorLevels(lost.world, lost.audiovisual)).toEqual(
      lost.projectorLevels,
    );
  });

  it("keeps the nominal sphere inside every rehearsal field of view", () => {
    const rig = createDefaultProjectionRig();
    const radiusM = rig.sphereDiameterM * 0.5;
    rig.projectors.forEach((projector) => {
      const distanceM = Math.hypot(
        projector.positionM.x - projector.targetM.x,
        projector.positionM.y - projector.targetM.y,
        projector.positionM.z - projector.targetM.z,
      );
      const requiredFovDeg =
        2 * Math.asin(radiusM / distanceM) * (180 / Math.PI);
      expect(projector.fovDeg).toBeGreaterThan(requiredFovDeg + 2);
    });
  });
});
