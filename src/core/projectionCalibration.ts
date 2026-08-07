import { clamp } from "./math";
import type {
  ProjectionBlendEdges,
  ProjectionRigConfig,
} from "./projectionRig";

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
}

export interface ProjectionCalibrationResult {
  schemaVersion: typeof PROJECTION_CALIBRATION_SCHEMA_VERSION;
  mode: "simulated" | "measured";
  stages: Array<{ id: CalibrationStageId; label: string; complete: boolean }>;
  projectors: [
    ProjectorCalibrationOutput,
    ProjectorCalibrationOutput,
    ProjectorCalibrationOutput,
    ProjectorCalibrationOutput,
    ProjectorCalibrationOutput,
  ];
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

export function applyProjectionCalibrationToRig(
  rig: ProjectionRigConfig,
  result: ProjectionCalibrationResult,
  settings: ProjectionCalibrationSettings,
): ProjectionRigConfig {
  return {
    ...rig,
    projectors: rig.projectors.map((projector, index) => ({
      ...projector,
      blend: { ...result.projectors[index].blend },
      gamma: clamp(settings.featherGamma, 0.5, 4),
      blackLevel: clamp(settings.blackLevel, 0, 0.12),
    })) as ProjectionRigConfig["projectors"],
    calibration: {
      state: result.mode === "measured" ? "calibrated" : "simulated",
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
