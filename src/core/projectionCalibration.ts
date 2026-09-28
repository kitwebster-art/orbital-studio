import { clamp } from "./math";
import type {
  ProjectionBlendEdges,
  ProjectorDefinition,
  ProjectionRigConfig,
} from "./projectionRig";
import type { Vec3 } from "./contracts";

export const PROJECTION_CALIBRATION_SCHEMA_VERSION =
  "orbital.projection-calibration/1.0" as const;

export type CalibrationStageId =
  | "hardware-check"
  | "camera-reference"
  | "structured-light"
  | "solve-warp"
  | "solve-blend"
  | "validate";

export interface ProjectionCalibrationSettings {
  overlap: number;
  featherGamma: number;
  blackLevel: number;
}

export interface WarpPoint {
  x: number;
  y: number;
}

export interface ProjectorCalibrationOutput {
  projectorId: string;
  label: string;
  warpCorners: [WarpPoint, WarpPoint, WarpPoint, WarpPoint];
  blend: ProjectionBlendEdges;
  meanErrorPx: number;
  maxErrorPx: number;
  coveragePercent: number;
  cameraSolve: {
    positionM: Vec3;
    targetM: Vec3;
    fovDeg: number;
    lensShift: { x: number; y: number };
  };
}

export interface ProjectionCalibrationResult {
  schemaVersion: typeof PROJECTION_CALIBRATION_SCHEMA_VERSION;
  mode: "simulated" | "measured";
  stages: Array<{ id: CalibrationStageId; label: string; complete: boolean }>;
  projectors: ProjectorCalibrationOutput[];
  globalErrorPx: number;
  overlapCoveragePercent: number;
  generatedAt: string;
}

export const DEFAULT_PROJECTION_CALIBRATION_SETTINGS: ProjectionCalibrationSettings = {
  overlap: 0.14,
  featherGamma: 2.2,
  blackLevel: 0.02,
};

const STAGES: ProjectionCalibrationResult["stages"] = [
  { id: "hardware-check", label: "Check cameras and outputs", complete: true },
  { id: "camera-reference", label: "Locate the sphere", complete: true },
  { id: "structured-light", label: "Scan projected patterns", complete: true },
  { id: "solve-warp", label: "Solve five warp meshes", complete: true },
  { id: "solve-blend", label: "Build overlap masks", complete: true },
  { id: "validate", label: "Validate with seam grid", complete: true },
];

function boundedPoint(x: number, y: number): WarpPoint {
  return { x: clamp(x, 0.025, 0.975), y: clamp(y, 0.025, 0.975) };
}

/**
 * Produces deterministic rehearsal data for the browser visualiser. It follows
 * the same data contract as a measured structured-light solve, but never
 * claims physical calibration without camera observations.
 */
export function runSimulatedAutomaticCalibration(
  rig: ProjectionRigConfig,
  settings: ProjectionCalibrationSettings = DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  now = new Date(),
): ProjectionCalibrationResult {
  const overlap = clamp(settings.overlap, 0.04, 0.34);
  const projectors = rig.projectors.map((projector, index) => {
    const horizontal = ((index % 2 === 0 ? -1 : 1) * (index + 1)) / 520;
    const vertical = (index - 2) / 680;
    const topInset = index === 4 ? 0.075 : 0.045;
    return {
      projectorId: projector.id,
      label: projector.label,
      warpCorners: [
        boundedPoint(0.04 + horizontal, topInset + vertical),
        boundedPoint(0.96 + horizontal * 0.4, 0.04 - vertical),
        boundedPoint(0.94 - horizontal, 0.96 - vertical * 0.4),
        boundedPoint(0.055 - horizontal * 0.4, 0.945 + vertical),
      ],
      blend: {
        left: overlap * (index === 0 || index === 2 ? 0.72 : 1),
        right: overlap * (index === 1 || index === 3 ? 0.72 : 1),
        top: overlap * (index === 4 ? 0.55 : 0.82),
        bottom: overlap * (index === 4 ? 1 : 0.8),
      },
      meanErrorPx: Number((0.68 + index * 0.11).toFixed(2)),
      maxErrorPx: Number((1.46 + index * 0.17).toFixed(2)),
      coveragePercent: Number((43.5 + index * 2.4).toFixed(1)),
      cameraSolve: {
        positionM: {
          x: projector.positionM.x + horizontal * 0.18,
          y: projector.positionM.y + vertical * 0.12,
          z: projector.positionM.z - horizontal * 0.1,
        },
        targetM: {
          x: projector.targetM.x + horizontal * 0.14,
          y: projector.targetM.y - vertical * 0.1,
          z: projector.targetM.z,
        },
        fovDeg: projector.fovDeg + 1.5 + horizontal * 0.9,
        lensShift: { x: horizontal * 0.8, y: vertical * 0.8 },
      },
    } satisfies ProjectorCalibrationOutput;
  }) as ProjectionCalibrationResult["projectors"];

  return {
    schemaVersion: PROJECTION_CALIBRATION_SCHEMA_VERSION,
    mode: "simulated",
    stages: STAGES.map((stage) => ({ ...stage })),
    projectors,
    globalErrorPx: Number(
      (projectors.reduce((sum, projector) => sum + projector.meanErrorPx, 0) /
        projectors.length).toFixed(2),
    ),
    overlapCoveragePercent: Number((overlap * 100).toFixed(1)),
    generatedAt: now.toISOString(),
  };
}

/** Imported solves are untrusted data. Reject malformed or ambiguous geometry. */
export function parseProjectionCalibrationResult(value: unknown): ProjectionCalibrationResult {
  const result = value as ProjectionCalibrationResult;
  if (!result || typeof result !== "object" || result.schemaVersion !== PROJECTION_CALIBRATION_SCHEMA_VERSION ||
      !["simulated", "measured"].includes(result.mode)) throw new Error("Unsupported projection calibration");
  if (!Array.isArray(result.projectors) || (result.projectors.length < 1 || result.projectors.length > 5 || (result.mode === "simulated" && result.projectors.length !== 5))) throw new Error("Calibration requires one to five measured projector records, or five simulated records");
  const finite = (v: unknown, min: number, max: number, name: string) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid calibration ${name}`);
  };
  const ids = new Set<string>();
  for (const p of result.projectors) {
    if (!p || typeof p.projectorId !== "string" || !p.projectorId || ids.has(p.projectorId)) throw new Error("Calibration projector identities must be unique");
    ids.add(p.projectorId);
    if (!p.cameraSolve) throw new Error("Calibration camera solve missing");
    for (const point of [p.cameraSolve.positionM, p.cameraSolve.targetM]) {
      if (!point) throw new Error("Calibration position missing");
      for (const axis of ["x", "y", "z"] as const) finite(point[axis], -1e6, 1e6, axis);
    }
    if (Math.hypot(p.cameraSolve.positionM.x - p.cameraSolve.targetM.x, p.cameraSolve.positionM.y - p.cameraSolve.targetM.y, p.cameraSolve.positionM.z - p.cameraSolve.targetM.z) < 1e-6) throw new Error("Calibration projector must have an aim direction");
    finite(p.cameraSolve.fovDeg, 1.001, 169.999, "fovDeg");
    if (!p.cameraSolve.lensShift) throw new Error("Calibration lensShift missing");
    finite(p.cameraSolve.lensShift.x, -2, 2, "lensShift.x");
    finite(p.cameraSolve.lensShift.y, -2, 2, "lensShift.y");
    if (!Array.isArray(p.warpCorners) || p.warpCorners.length !== 4) throw new Error("Calibration requires four warp corners");
    for (const point of p.warpCorners) {
      if (!point) throw new Error("Calibration warp corner missing");
      finite(point.x, 0, 1, "warp.x"); finite(point.y, 0, 1, "warp.y");
    }
    // Top-left, top-right, bottom-right, bottom-left must form a convex polygon.
    const turns = p.warpCorners.map((a, i, points) => {
      const b = points[(i + 1) % 4]; const c = points[(i + 2) % 4];
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    });
    if (turns.some(turn => turn <= 1e-8)) throw new Error("Calibration warp corners must form a convex clockwise raster polygon");
    for (const edge of ["left", "right", "top", "bottom"] as const) finite(p.blend?.[edge], 0, 1, `blend.${edge}`);
    finite(p.meanErrorPx, 0, 1e6, "meanErrorPx"); finite(p.maxErrorPx, p.meanErrorPx, 1e6, "maxErrorPx");
    finite(p.coveragePercent, 0, 100, "coveragePercent");
  }
  finite(result.globalErrorPx, 0, 1e6, "globalErrorPx"); finite(result.overlapCoveragePercent, 0, 100, "overlapCoveragePercent");
  if (typeof result.generatedAt !== "string" || !Number.isFinite(Date.parse(result.generatedAt))) throw new Error("Calibration date invalid");
  const required = STAGES.map(stage => stage.id);
  if (!Array.isArray(result.stages) || result.stages.length !== required.length || required.some(id => result.stages.filter(stage => stage?.id === id && typeof stage.complete === "boolean").length !== 1)) throw new Error("Calibration stages invalid");
  if (result.mode === "measured" && result.stages.some(stage => !stage.complete)) throw new Error("Measured calibration requires every validation stage complete");
  return structuredClone(result);
}

export function applyProjectionCalibrationToRig(
  rig: ProjectionRigConfig,
  result: ProjectionCalibrationResult,
  settings: ProjectionCalibrationSettings,
): ProjectionRigConfig {
  result = parseProjectionCalibrationResult(result);
  const byId = new Map(result.projectors.map(projector => [projector.projectorId, projector]));
  if (result.projectors.some(projector => !rig.projectors.some(head => head.id === projector.projectorId))) throw new Error("Calibration projector identities do not match this rig");
  return {
    ...rig,
    projectors: rig.projectors.map((projector) => byId.has(projector.id) ? ({
      ...projector,
      positionM: { ...byId.get(projector.id)!.cameraSolve.positionM },
      targetM: { ...byId.get(projector.id)!.cameraSolve.targetM },
      fovDeg: byId.get(projector.id)!.cameraSolve.fovDeg,
      lensShift: { ...byId.get(projector.id)!.cameraSolve.lensShift },
      warpCorners: byId.get(projector.id)!.warpCorners.map((point) => ({ ...point })) as ProjectorDefinition["warpCorners"],
      blend: { ...byId.get(projector.id)!.blend },
      gamma: clamp(settings.featherGamma, 0.5, 4),
      blackLevel: clamp(settings.blackLevel, 0, 0.12),
    }) : structuredClone(projector)) as ProjectionRigConfig["projectors"],
    calibration: {
      state: result.mode === "measured" ? "calibrated" : "simulated",
      projectorErrorsPx: result.mode === "measured" ? { ...(rig.calibration.projectorErrorsPx ?? {}), ...Object.fromEntries(result.projectors.map(projector => [projector.projectorId, projector.maxErrorPx])) } : {},
      calibratedProjectorIds: result.mode === "measured" ? [...new Set([...(rig.calibration.state === "calibrated" ? rig.calibration.calibratedProjectorIds ?? [] : []), ...result.projectors.map(projector => projector.projectorId)])] : [],
      pattern: "seam",
      reprojectionErrorPx: result.globalErrorPx,
      lastCalibratedAt: result.generatedAt,
    },
  };
}

export function warpCornersToCss(
  corners: ProjectorCalibrationOutput["warpCorners"],
): string {
  return corners
    .map((point) => `${(point.x * 100).toFixed(2)}% ${(point.y * 100).toFixed(2)}%`)
    .join(", ");
}
