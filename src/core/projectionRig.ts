import type {
  AudiovisualParameters,
  Vec3,
  WorldState,
} from "./contracts";
import { clamp } from "./math";

export const PROJECTION_RIG_SCHEMA_VERSION = "orbital.projection-rig/1.0" as const;
export const PROJECTOR_COUNT = 5 as const;
export const PROJECTOR_RASTER_WIDTH = 300;
export const PROJECTOR_RASTER_HEIGHT = 480;
export const PROJECTOR_RASTER_ASPECT =
  PROJECTOR_RASTER_WIDTH / PROJECTOR_RASTER_HEIGHT;

export type ProjectionPattern = "authored" | "coverage" | "grid" | "seam" | "black";
export type ProjectorLevels = [number, number, number, number, number];

export interface ProjectionBlendEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ProjectionWarpPoint {
  x: number;
  y: number;
}

export interface ProjectorDefinition {
  id: string;
  label: string;
  index: number;
  positionM: Vec3;
  targetM: Vec3;
  colorHex: string;
  orientation: "portrait" | "landscape";
  rotationDeg: 0 | 90;
  raster: {
    widthPx: number;
    heightPx: number;
  };
  fovDeg: number;
  enabled: boolean;
  brightness: number;
  gamma: number;
  blackLevel: number;
  lensShift: {
    x: number;
    y: number;
  };
  warpCorners: [
    ProjectionWarpPoint,
    ProjectionWarpPoint,
    ProjectionWarpPoint,
    ProjectionWarpPoint,
  ];
  blend: ProjectionBlendEdges;
}

export interface ProjectionCalibrationState {
  calibratedProjectorIds?: string[];
  projectorErrorsPx?: Record<string, number>;
  state: "uncalibrated" | "simulated" | "calibrated";
  pattern: ProjectionPattern;
  reprojectionErrorPx: number | null;
  lastCalibratedAt: string | null;
}

export interface ProjectionRigConfig {
  schemaVersion: typeof PROJECTION_RIG_SCHEMA_VERSION;
  name: string;
  mappingMode: "shape-locked-world";
  materialRotationIndependent: true;
  sphereDiameterM: number;
  projectorCount: typeof PROJECTOR_COUNT;
  projectors: [
    ProjectorDefinition,
    ProjectorDefinition,
    ProjectorDefinition,
    ProjectorDefinition,
    ProjectorDefinition,
  ];
  calibration: ProjectionCalibrationState;
}

export interface ProjectorShaderInput {
  position: Vec3;
  direction: Vec3;
  right: Vec3;
  up: Vec3;
  rasterAspect: number;
  lensShift: { x: number; y: number };
  cosHalfFov: number;
  tanHalfFov: number;
  level: number;
  colorHex: string;
  blend: ProjectionBlendEdges;
  blendGamma: number;
  blackLevel: number;
  enabled: boolean;
}

const DEFAULT_CENTER_M: Vec3 = { x: 0, y: 3.35, z: 0 };

/**
 * Fixed aim point for the rehearsal projectors. The synthetic airflow model
 * moves the balloon centre from roughly 4.0 m to 5.9 m as fan speed changes,
 * so the optical rig must be centred on that full hover envelope rather than
 * the pre-lift tracking origin above.
 */
export const DEFAULT_HOVER_ENVELOPE_CENTER_M: Readonly<Vec3> = Object.freeze({
  x: 0,
  y: 4.95,
  z: 0,
});

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normaliseDirection(source: Vec3, target: Vec3): Vec3 {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dz = target.z - source.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / length, y: dy / length, z: dz / length };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalise(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function projector(
  index: number,
  label: string,
  positionM: Vec3,
  colorHex: string,
  fovDeg = 38,
): ProjectorDefinition {
  return {
    id: `projector-${index + 1}`,
    label,
    index,
    positionM: cloneVec3(positionM),
    targetM: cloneVec3(DEFAULT_HOVER_ENVELOPE_CENTER_M),
    colorHex,
    orientation: "portrait",
    rotationDeg: 90,
    raster: {
      widthPx: 1200,
      heightPx: 1920,
    },
    fovDeg,
    enabled: true,
    brightness: 1,
    gamma: 2.2,
    blackLevel: 0.02,
    lensShift: { x: 0, y: 0 },
    warpCorners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    blend: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 },
  };
}

/**
 * Five-projector rehearsal layout. The fifth head is overhead and slightly
 * rear-biased so the digital twin can exercise a non-coplanar calibration
 * path. Exact positions remain editable calibration data, not physical proof.
 */
export function createDefaultProjectionRig(): ProjectionRigConfig {
  return {
    schemaVersion: PROJECTION_RIG_SCHEMA_VERSION,
    name: "Orbital five-head rehearsal rig",
    mappingMode: "shape-locked-world",
    materialRotationIndependent: true,
    sphereDiameterM: 5,
    projectorCount: PROJECTOR_COUNT,
    projectors: [
      projector(0, "Front left", { x: -10.8, y: 8.5, z: 10.8 }, "#92cfff"),
      projector(1, "Front right", { x: 10.8, y: 8.5, z: 10.8 }, "#e6b0ff"),
      projector(2, "Rear left", { x: -10.8, y: 8.5, z: -10.2 }, "#9fffe0"),
      projector(3, "Rear right", { x: 10.8, y: 8.5, z: -10.2 }, "#ffd1a0"),
      // The rotated overhead output needs a wider vertical FOV so the sphere
      // also fits across the portrait raster's shorter horizontal axis.
      projector(4, "Overhead", { x: 0, y: 12.4, z: -1.4 }, "#fff3b0", 82),
    ],
    calibration: {
      state: "simulated",
      pattern: "authored",
      reprojectionErrorPx: null,
      lastCalibratedAt: null,
    },
  };
}

export function validateProjectionRig(value: unknown): ProjectionRigConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Projection rig must be an object");
  }
  const rig = value as Partial<ProjectionRigConfig>;
  if (rig.schemaVersion !== PROJECTION_RIG_SCHEMA_VERSION) {
    throw new Error("Projection rig schemaVersion is unsupported");
  }
  if (rig.mappingMode !== "shape-locked-world") {
    throw new Error("Projection rig mappingMode is unsupported");
  }
  if (rig.materialRotationIndependent !== true) {
    throw new Error("Projection rig must keep material rotation independent");
  }
  if (rig.projectorCount !== PROJECTOR_COUNT) {
    throw new Error(`Projection rig must contain ${PROJECTOR_COUNT} projectors`);
  }
  if (!Array.isArray(rig.projectors) || rig.projectors.length !== PROJECTOR_COUNT) {
    throw new Error(`Projection rig must contain ${PROJECTOR_COUNT} projector definitions`);
  }
  if (
    typeof rig.sphereDiameterM !== "number" ||
    !Number.isFinite(rig.sphereDiameterM) ||
    rig.sphereDiameterM <= 0
  ) {
    throw new Error("Projection rig sphereDiameterM must be positive");
  }
  if (typeof rig.name !== "string" || !rig.calibration || !["uncalibrated", "simulated", "calibrated"].includes(rig.calibration.state) || !["authored", "coverage", "grid", "seam", "black"].includes(rig.calibration.pattern)) throw new Error("Invalid projection rig calibration metadata");
  if (rig.calibration.reprojectionErrorPx !== null && (!Number.isFinite(rig.calibration.reprojectionErrorPx) || rig.calibration.reprojectionErrorPx < 0)) throw new Error("Invalid reprojection error");
  if (rig.calibration.state === "calibrated" && (rig.calibration.reprojectionErrorPx === null || !rig.calibration.lastCalibratedAt || !Number.isFinite(Date.parse(rig.calibration.lastCalibratedAt)))) throw new Error("Measured rig requires calibration date and error");
  const ids = new Set<string>();
  rig.projectors.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`projectors[${index}] must be an object`);
    }
    const definition = candidate as ProjectorDefinition;
    if (definition.index !== index || typeof definition.id !== "string") {
      throw new Error(`projectors[${index}] index and id must match`);
    }
    if (!definition.id || ids.has(definition.id) || typeof definition.enabled !== "boolean") throw new Error("Projector identities must be unique and enabled must be boolean");
    ids.add(definition.id);
    if (!definition.lensShift || ![definition.lensShift.x, definition.lensShift.y].every(value => Number.isFinite(value) && Math.abs(value) <= 2)) throw new Error("Invalid projector lens shift");
    [definition.positionM, definition.targetM].forEach((point, pointIndex) => {
      if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        throw new Error(`projectors[${index}] point ${pointIndex} is invalid`);
      }
    });
    if (distance(definition.positionM, definition.targetM) < 1e-6) throw new Error("Projector requires a nonzero aim direction");
    if (
      !Number.isFinite(definition.fovDeg) ||
      definition.fovDeg <= 1 ||
      definition.fovDeg >= 170
    ) {
      throw new Error(`projectors[${index}].fovDeg must be between 1 and 170`);
    }
    if (
      !["portrait", "landscape"].includes(definition.orientation) ||
      definition.rotationDeg !== (definition.orientation === "portrait" ? 90 : 0) ||
      !definition.raster ||
      !Number.isInteger(definition.raster.widthPx) ||
      !Number.isInteger(definition.raster.heightPx) ||
      definition.raster.widthPx <= 0 ||
      definition.raster.heightPx <= 0 ||
      (definition.orientation === "portrait" ? definition.raster.heightPx <= definition.raster.widthPx : definition.raster.widthPx < definition.raster.heightPx)
    ) {
      throw new Error(`projectors[${index}] raster must match landscape 0 degrees or portrait 90 degrees`);
    }
    for (const key of ["brightness", "blackLevel"] as const) {
      if (!Number.isFinite(definition[key]) || definition[key] < 0 || definition[key] > 1) {
        throw new Error(`projectors[${index}].${key} must be between 0 and 1`);
      }
    }
    if (!Number.isFinite(definition.gamma) || definition.gamma <= 0) {
      throw new Error(`projectors[${index}].gamma must be positive`);
    }
    if (!Array.isArray(definition.warpCorners) || definition.warpCorners.length !== 4) {
      throw new Error(`projectors[${index}].warpCorners must contain four points`);
    }
    definition.warpCorners.forEach((point, pointIndex) => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        throw new Error(`projectors[${index}].warpCorners[${pointIndex}] must be normalised`);
      }
    });
    for (let corner = 0; corner < 4; corner++) {
      const a = definition.warpCorners[corner], b = definition.warpCorners[(corner + 1) % 4], c = definition.warpCorners[(corner + 2) % 4];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 1e-8) throw new Error("Projector warp corners must form a convex polygon");
    }
    for (const key of ["left", "right", "top", "bottom"] as const) {
      if (
        !definition.blend ||
        !Number.isFinite(definition.blend[key]) ||
        definition.blend[key] < 0 ||
        definition.blend[key] > 1
      ) {
        throw new Error(`projectors[${index}].blend.${key} must be between 0 and 1`);
      }
    }
  });
  if (rig.calibration.calibratedProjectorIds && (!Array.isArray(rig.calibration.calibratedProjectorIds) || rig.calibration.calibratedProjectorIds.some(id => !ids.has(id)) || new Set(rig.calibration.calibratedProjectorIds).size !== rig.calibration.calibratedProjectorIds.length)) throw new Error("Invalid calibrated projector identities");
  if (rig.calibration.projectorErrorsPx && (typeof rig.calibration.projectorErrorsPx !== "object" || Object.entries(rig.calibration.projectorErrorsPx).some(([id, error]) => !ids.has(id) || !Number.isFinite(error) || error < 0))) throw new Error("Invalid per-projector calibration errors");
  return value as ProjectionRigConfig;
}

export function calculateProjectorLevels(
  world: WorldState,
  audiovisual: AudiovisualParameters,
): ProjectorLevels {
  const amplitude = clamp(0.18 + audiovisual.energy * 0.82);
  if (!world.stateValid || !world.centerM) {
    const neutral = clamp(audiovisual.energy * 0.32);
    return [neutral, neutral, neutral, neutral, neutral];
  }

  const x = clamp(world.centerM.x / 0.72, -1, 1);
  const z = clamp(world.centerM.z / 0.72, -1, 1);
  const y = clamp((world.centerM.y - DEFAULT_CENTER_M.y) / 0.45, -1, 1);
  const left = (1 - x) / 2;
  const right = (1 + x) / 2;
  const front = (1 - z) / 2;
  const rear = (1 + z) / 2;
  const diagonal = [
    Math.sqrt(left * front),
    Math.sqrt(right * front),
    Math.sqrt(left * rear),
    Math.sqrt(right * rear),
  ];
  const overhead = clamp(0.34 + y * 0.22 + audiovisual.fluidity * 0.08);
  const spatialAmount = clamp(audiovisual.spatialMotion);
  const levels = diagonal.map((level) =>
    clamp((0.38 + level * 0.62 * spatialAmount) * amplitude),
  );
  levels.push(clamp(overhead * amplitude));
  return levels as ProjectorLevels;
}

/** Convert rig geometry into stable uniforms for a renderer or native bridge. */
export function toProjectorShaderInputs(
  rig: ProjectionRigConfig,
  levels: ProjectorLevels,
): ProjectorShaderInput[] {
  return rig.projectors.map((definition, index) => {
    const direction = normaliseDirection(definition.positionM, definition.targetM);
    const worldUp = Math.abs(direction.y) > 0.94
      ? { x: 0, y: 0, z: 1 }
      : { x: 0, y: 1, z: 0 };
    const right = normalise(cross(direction, worldUp));
    const up = normalise(cross(right, direction));
    return {
      position: cloneVec3(definition.positionM),
      direction,
      right,
      up,
      rasterAspect: definition.raster.widthPx / definition.raster.heightPx,
      lensShift: { ...definition.lensShift },
      cosHalfFov: Math.cos((definition.fovDeg * Math.PI) / 360),
      tanHalfFov: Math.tan((definition.fovDeg * Math.PI) / 360),
      level: clamp(levels[index] * definition.brightness),
      colorHex: definition.colorHex,
      blend: { ...definition.blend },
      blendGamma: definition.gamma,
      blackLevel: definition.blackLevel,
      enabled: definition.enabled,
    };
  });
}

// Kept as a named helper so future score authors can set a projector wobble
// modulation without changing the public AV parameter contract.
export function projectionRigDistance(
  definition: ProjectorDefinition,
): number {
  return distance(definition.positionM, definition.targetM);
}
