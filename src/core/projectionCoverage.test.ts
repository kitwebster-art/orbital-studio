import { describe, expect, it } from "vitest";
import { createDefaultProjectionRig } from "./projectionRig";
import { analyseProjectionCoverage } from "./projectionCoverage";

describe("projection coverage analysis", () => {
  it("reports five projector channels and bounded envelope metrics", () => {
    const result = analyseProjectionCoverage(
      createDefaultProjectionRig(),
      { x: 0, y: 3.35, z: 0 },
      { x: 2.5, y: 2.5, z: 2.5 },
      256,
    );
    expect(result.projectors).toHaveLength(5);
    expect(result.overallPercent).toBeGreaterThanOrEqual(0);
    expect(result.overallPercent).toBeLessThanOrEqual(100);
    expect(result.uncoveredPercent).toBeCloseTo(100 - result.overallPercent);
  });

  it("detects a sphere moved far outside the calibrated rig", () => {
    const result = analyseProjectionCoverage(
      createDefaultProjectionRig(),
      { x: 0, y: 18, z: 0 },
      { x: 2.5, y: 2.5, z: 2.5 },
      256,
    );
    expect(result.status).toBe("outside");
  });

  it("keeps the lifted default balloon inside all five projector rasters", () => {
    const result = analyseProjectionCoverage(
      createDefaultProjectionRig(),
      { x: 0.12, y: 5.51, z: -0.07 },
      { x: 2.65, y: 2.65, z: 2.65 },
      1024,
    );
    expect(result.projectors.every((projector) => projector.clippedEdge === "none")).toBe(true);
    expect(result.uncoveredPercent).toBeLessThan(6);
  });

  it("keeps the full portrait hover range in frame at the lateral limit", () => {
    const rig = createDefaultProjectionRig();
    for (const y of [4, 5.9]) {
      const result = analyseProjectionCoverage(
        rig,
        { x: 0.37, y, z: 0.37 },
        { x: 2.65, y: 2.75, z: 2.65 },
        2048,
      );
      expect(result.projectors.every((projector) => projector.clippedEdge === "none")).toBe(true);
    }
  });
});
