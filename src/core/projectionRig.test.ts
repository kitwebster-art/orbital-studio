import { describe, expect, it } from "vitest";
import { RuntimeEngine } from "./RuntimeEngine";
import {
  calculateProjectorLevels,
  createDefaultProjectionRig,
  DEFAULT_HOVER_ENVELOPE_CENTER_M,
  PROJECTOR_COUNT,
  toProjectorShaderInputs,
  validateProjectionRig,
} from "./projectionRig";

describe("five-projector rig contract", () => {
  it("creates and validates a five-head shape-locked rig", () => {
    const rig = createDefaultProjectionRig();
    expect(rig.projectorCount).toBe(PROJECTOR_COUNT);
    expect(rig.projectors).toHaveLength(5);
    expect(rig.projectors.every((projector) =>
      projector.orientation === "portrait" &&
      projector.rotationDeg === 90 &&
      projector.raster.heightPx > projector.raster.widthPx,
    )).toBe(true);
    expect(rig.mappingMode).toBe("shape-locked-world");
    expect(rig.materialRotationIndependent).toBe(true);
    expect(validateProjectionRig(JSON.parse(JSON.stringify(rig)))).toEqual(rig);

    const landscapeRig = JSON.parse(JSON.stringify(rig));
    landscapeRig.projectors[0].orientation = "landscape";
    expect(() => validateProjectionRig(landscapeRig)).toThrow(/raster must match/);

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

  it("aims the fixed projector rig through the complete fan-speed hover envelope", () => {
    const rig = createDefaultProjectionRig();
    expect(rig.projectors.every((projector) =>
      projector.targetM.y === DEFAULT_HOVER_ENVELOPE_CENTER_M.y,
    )).toBe(true);
    expect(rig.projectors.slice(0, 4).every((projector) => projector.fovDeg >= 38)).toBe(true);
    expect(rig.projectors[4].fovDeg).toBeGreaterThanOrEqual(82);
  });
});

it("shader raster coordinates match calibrated portrait camera including overhead basis and lens shift", async () => {
  const THREE = await import("three");
  const rig = createDefaultProjectionRig();
  rig.projectors[4].lensShift = { x: 0.21, y: -0.17 };
  const input = toProjectorShaderInputs(rig, [1,1,1,1,1])[4];
  const definition = rig.projectors[4];
  const camera = new THREE.PerspectiveCamera(definition.fovDeg,input.rasterAspect,0.08,100);
  camera.position.set(input.position.x,input.position.y,input.position.z);
  camera.up.set(0,0,1);
  camera.lookAt(definition.targetM.x,definition.targetM.y,definition.targetM.z);
  camera.setViewOffset(300,480,-input.lensShift.x*150,input.lensShift.y*240,300,480);
  camera.updateMatrixWorld(true);
  const point=new THREE.Vector3(0.5,5,0.3), from=point.clone().sub(camera.position).normalize();
  const forward=from.dot(new THREE.Vector3(input.direction.x,input.direction.y,input.direction.z));
  const x=from.dot(new THREE.Vector3(input.right.x,input.right.y,input.right.z))/(forward*input.tanHalfFov);
  const y=from.dot(new THREE.Vector3(input.up.x,input.up.y,input.up.z))/(forward*input.tanHalfFov);
  const clip=point.project(camera);
  expect(x*0.5/input.rasterAspect+0.5+input.lensShift.x*0.5).toBeCloseTo(clip.x*0.5+0.5,8);
  expect(y*0.5+0.5+input.lensShift.y*0.5).toBeCloseTo(clip.y*0.5+0.5,8);
});
