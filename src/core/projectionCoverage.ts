import type { Vec3 } from "./contracts";
import {
  PROJECTOR_RASTER_ASPECT,
  toProjectorShaderInputs,
  type ProjectionRigConfig,
  type ProjectorLevels,
} from "./projectionRig";

export interface ProjectorCoverageSummary {
  projectorId: string;
  coveragePercent: number;
  status: "clear" | "warning" | "outside";
  clippedEdge: "none" | "top" | "bottom" | "left" | "right";
}

export interface ProjectionCoverageAnalysis {
  overallPercent: number;
  overlapPercent: number;
  uncoveredPercent: number;
  status: "clear" | "warning" | "outside";
  projectors: ProjectorCoverageSummary[];
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalise(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

export function analyseProjectionCoverage(
  rig: ProjectionRigConfig,
  center: Vec3,
  radii: Vec3,
  sampleCount = 512,
): ProjectionCoverageAnalysis {
  const levels = [1, 1, 1, 1, 1] as ProjectorLevels;
  const projectors = toProjectorShaderInputs(rig, levels);
  const hits = new Array(projectors.length).fill(0) as number[];
  const edgeMisses = projectors.map(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
  let covered = 0;
  let overlapped = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const y = 1 - (2 * (index + 0.5)) / sampleCount;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = index * Math.PI * (3 - Math.sqrt(5));
    const normal = { x: Math.cos(phi) * radial, y, z: Math.sin(phi) * radial };
    const point = {
      x: center.x + normal.x * radii.x,
      y: center.y + normal.y * radii.y,
      z: center.z + normal.z * radii.z,
    };
    let sampleHits = 0;
    projectors.forEach((projector, projectorIndex) => {
      if (!projector.enabled) return;
      const ray = normalise(subtract(point, projector.position));
      const forward = dot(ray, projector.direction);
      const planeX = dot(ray, projector.right) / Math.max(forward * projector.tanHalfFov, 0.0001);
      const planeY = dot(ray, projector.up) / Math.max(forward * projector.tanHalfFov, 0.0001);
      // Match Three.js PerspectiveCamera coordinates for the rotated 10:16
      // portrait output. Its long axis is vertical to preserve coverage as the
      // balloon rises and falls with fan speed.
      const uvX = (planeX / PROJECTOR_RASTER_ASPECT) * 0.5 + 0.5;
      const uvY = planeY * 0.5 + 0.5;
      const facing = dot(normal, { x: -ray.x, y: -ray.y, z: -ray.z }) > 0;
      const inside = forward >= projector.cosHalfFov && uvX >= 0 && uvX <= 1 && uvY >= 0 && uvY <= 1;
      if (inside && facing) {
        hits[projectorIndex] += 1;
        sampleHits += 1;
      } else if (facing) {
        if (uvY > 1) edgeMisses[projectorIndex].top += 1;
        else if (uvY < 0) edgeMisses[projectorIndex].bottom += 1;
        else if (uvX < 0) edgeMisses[projectorIndex].left += 1;
        else if (uvX > 1) edgeMisses[projectorIndex].right += 1;
      }
    });
    if (sampleHits > 0) covered += 1;
    if (sampleHits > 1) overlapped += 1;
  }

  const overallPercent = (covered / sampleCount) * 100;
  const uncoveredPercent = 100 - overallPercent;
  const status = uncoveredPercent > 18 ? "outside" : uncoveredPercent > 6 ? "warning" : "clear";
  return {
    overallPercent,
    overlapPercent: (overlapped / sampleCount) * 100,
    uncoveredPercent,
    status,
    projectors: rig.projectors.map((definition, index) => {
      const misses = edgeMisses[index];
      const edge = (Object.entries(misses) as Array<["top" | "bottom" | "left" | "right", number]>).sort((a, b) => b[1] - a[1])[0];
      const coveragePercent = (hits[index] / sampleCount) * 100;
      return {
        projectorId: definition.id,
        coveragePercent,
        status: coveragePercent < 4 ? "outside" : coveragePercent < 11 ? "warning" : "clear",
        clippedEdge: edge && edge[1] > 0 ? edge[0] : "none",
      };
    }),
  };
}
