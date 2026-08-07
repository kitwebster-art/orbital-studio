import {
  SHADER_FAMILIES,
  type ShaderFamily,
} from "./shaderRegistry";

export const MAPPING_LAB_SCHEMA_VERSION = "orbital.mapping-lab/1.0" as const;

export const MAPPING_VIEW_MODES = [
  "sphere",
  "uv",
  "projector-1",
  "projector-2",
  "projector-3",
  "projector-4",
  "projector-5",
] as const;
export type MappingViewMode = (typeof MAPPING_VIEW_MODES)[number];

export interface SurfaceRegionDefinition {
  id: string;
  label: string;
  shortLabel: string;
  latitudeCenter: number;
  latitudeWidth: number;
  description: string;
}

export const SURFACE_REGION_DEFINITIONS: readonly SurfaceRegionDefinition[] = Object.freeze([
  {
    id: "north-cap",
    label: "North cap",
    shortLabel: "NORTH",
    latitudeCenter: 0.83,
    latitudeWidth: 0.28,
    description: "Upper cap, useful for clean grid lock and silhouette checks.",
  },
  {
    id: "equator",
    label: "Equator band",
    shortLabel: "EQUATOR",
    latitudeCenter: 0.5,
    latitudeWidth: 0.26,
    description: "Primary wrap zone for continuous fluid and grid fields.",
  },
  {
    id: "south-band",
    label: "South band",
    shortLabel: "SOUTH",
    latitudeCenter: 0.22,
    latitudeWidth: 0.28,
    description: "Lower band for a second material and overlap inspection.",
  },
  {
    id: "residual-rim",
    label: "Residual rim",
    shortLabel: "RIM",
    latitudeCenter: 0.08,
    latitudeWidth: 0.18,
    description: "Low rim reserved for tracking residual or fracture states.",
  },
] as const);

export interface SurfaceRegionAssignment {
  schemaVersion: typeof MAPPING_LAB_SCHEMA_VERSION;
  regionId: string;
  shaderId: string;
  shaderFamily: ShaderFamily;
  shaderPresetId: string;
  intensity: number;
}

const SHADER_FAMILY_INDEX: Readonly<Record<ShaderFamily, number>> =
  Object.freeze(
    Object.fromEntries(
      SHADER_FAMILIES.map((family, index) => [family, index]),
    ) as Record<ShaderFamily, number>,
  );

export function shaderFamilyIndex(family: ShaderFamily): number {
  return SHADER_FAMILY_INDEX[family] ?? 0;
}

/**
 * Stable renderer slots for the original procedural surface programs. Families
 * remain useful browse categories, but a renderer slot identifies the actual
 * algorithm. This prevents two looks in the same family from collapsing to the
 * same sphere output.
 */
export const SHADER_RENDER_MODE_IDS = [
  "neutral",
  "contour-field",
  "fluid-membrane",
  "water-caustics",
  "turbulence-smoke",
  "fire-ember",
  "matrix-rain",
  "fracture-residual",
  "particle-interference",
  "geometric-grid",
  "planetary-atmosphere",
  "prediction-ghost",
  "geodesic-wireframe",
  "hex-lattice",
  "liquid-metal",
  "molten-lava",
  "reaction-diffusion",
  "cellular-voronoi",
  "marble-veins",
  "crystal-facets",
  "aurora-ribbons",
  "iridescent-film",
  "electric-filaments",
  "cloud-vortex",
  "mycelium-network",
  "ocean-swell",
  "ink-bloom",
  "magnetic-field",
  "moire-interference",
  "bioluminescent-plankton",
  "foam-bubbles",
  "frost-crystals",
  "woven-fibres",
  "topographic-erosion",
  "cosmic-nebula",
  "holographic-scan",
  "coral-growth",
  "space-tunnel",
  "kaleidoscopic-warp",
  "fractal-circuits",
  "black-hole-lensing",
  "concentric-rings",
  "truchet-tiles",
] as const;

export function shaderRenderModeIndex(shaderId: string): number {
  const index = (SHADER_RENDER_MODE_IDS as readonly string[]).indexOf(shaderId);
  return index >= 0 ? index : 0;
}

export function mappingViewLabel(view: MappingViewMode): string {
  if (view === "sphere") {
    return "Sphere preview";
  }
  if (view === "uv") {
    return "UV coverage proxy";
  }
  return `Projector ${view.slice(-1)} post-warp output`;
}

function assignment(
  regionId: string,
  shaderId: string,
  shaderFamily: ShaderFamily,
  shaderPresetId: string,
  intensity: number,
): SurfaceRegionAssignment {
  return {
    schemaVersion: MAPPING_LAB_SCHEMA_VERSION,
    regionId,
    shaderId,
    shaderFamily,
    shaderPresetId,
    intensity,
  };
}

export function createDefaultSurfaceRegionAssignments(): readonly SurfaceRegionAssignment[] {
  return Object.freeze([
    assignment("north-cap", "geometric-grid", "geometric", "geometric-grid-01", 0.92),
    assignment("equator", "fluid-membrane", "fluid", "fluid-membrane-03", 0.78),
    assignment("south-band", "contour-field", "contour", "contour-field-07", 0.64),
    assignment("residual-rim", "fracture-residual", "fracture", "fracture-residual-12", 0.56),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSurfaceRegionAssignments(
  value: unknown,
): readonly SurfaceRegionAssignment[] {
  if (!Array.isArray(value) || value.length !== SURFACE_REGION_DEFINITIONS.length) {
    throw new Error(
      `Surface regions must contain ${SURFACE_REGION_DEFINITIONS.length} assignments`,
    );
  }
  const regionIds = new Set(SURFACE_REGION_DEFINITIONS.map((region) => region.id));
  const seen = new Set<string>();
  const assignments = value.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new Error(`surfaceRegions[${index}] must be an object`);
    }
    if (candidate.schemaVersion !== MAPPING_LAB_SCHEMA_VERSION) {
      throw new Error(`surfaceRegions[${index}].schemaVersion is unsupported`);
    }
    if (typeof candidate.regionId !== "string" || !regionIds.has(candidate.regionId)) {
      throw new Error(`surfaceRegions[${index}].regionId is unsupported`);
    }
    if (seen.has(candidate.regionId)) {
      throw new Error(`surfaceRegions contains duplicate region ${candidate.regionId}`);
    }
    seen.add(candidate.regionId);
    if (typeof candidate.shaderId !== "string" || candidate.shaderId.length === 0) {
      throw new Error(`surfaceRegions[${index}].shaderId is required`);
    }
    if (
      typeof candidate.shaderFamily !== "string" ||
      !(SHADER_FAMILIES as readonly string[]).includes(candidate.shaderFamily)
    ) {
      throw new Error(`surfaceRegions[${index}].shaderFamily is unsupported`);
    }
    if (
      typeof candidate.shaderPresetId !== "string" ||
      candidate.shaderPresetId.length === 0
    ) {
      throw new Error(`surfaceRegions[${index}].shaderPresetId is required`);
    }
    if (
      typeof candidate.intensity !== "number" ||
      !Number.isFinite(candidate.intensity) ||
      candidate.intensity < 0 ||
      candidate.intensity > 1
    ) {
      throw new Error(`surfaceRegions[${index}].intensity must be between 0 and 1`);
    }
    return {
      schemaVersion: MAPPING_LAB_SCHEMA_VERSION,
      regionId: candidate.regionId,
      shaderId: candidate.shaderId,
      shaderFamily: candidate.shaderFamily as ShaderFamily,
      shaderPresetId: candidate.shaderPresetId,
      intensity: candidate.intensity,
    };
  });
  if (seen.size !== regionIds.size) {
    throw new Error("surfaceRegions must cover every defined region");
  }
  return Object.freeze(assignments);
}
