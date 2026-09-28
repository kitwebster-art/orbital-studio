import {
  CURATED_SHADER_REGISTRY,
  SHADER_REGISTRY_SCHEMA_VERSION,
  resolveShaderPreset,
  validateShaderRegistry,
  type ShaderDefinition,
  type ShaderPreset,
  type ShaderRegistry,
} from "./shaderRegistry";
import {
  normaliseShaderLookControls,
  type ShaderLookControls,
} from "./shaderLookControls";
import {
  validateSurfaceRegionAssignments,
  type SurfaceRegionAssignment,
} from "./mappingLab";
import {
  validateProjectionRig,
  type ProjectionRigConfig,
} from "./projectionRig";
import {
  normaliseLivingSkinControls,
  type LivingSkinControls,
} from "./livingSkin";
import {
  CAMERA_LENS_PRESETS,
  NIR_ILLUMINATOR_PRESETS,
  PROJECTOR_OPTICAL_PRESETS,
  createInstallationHeadPlans,
  normaliseInstallationRigControls,
  type CameraLensPreset,
  type InstallationHeadPlan,
  type InstallationRigControls,
  type NirIlluminatorPreset,
  type OpticalPreset,
} from "./installationRig";
import {
  normaliseShaderEventSoundControls,
  type ShaderEventSoundControls,
} from "./shaderEventSound";

export const SHADER_MANIFEST_SCHEMA_VERSION =
  "orbital.shader-manifest/1.0" as const;
export const RENDER_PROJECT_SCHEMA_VERSION =
  "orbital.render-project/1.2" as const;

export interface ShaderManifestEntry {
  id: string;
  name: string;
  family: string;
  version: string;
  nativeImplementation: string;
  parameters: ShaderDefinition["parameterDefinitions"];
  gpuCost: ShaderDefinition["gpuCost"];
  safeLuminanceCeiling: number;
}

export interface ShaderManifest {
  schemaVersion: typeof SHADER_MANIFEST_SCHEMA_VERSION;
  sourceRegistrySchemaVersion: typeof SHADER_REGISTRY_SCHEMA_VERSION;
  checksum: string;
  fallbackShaderId: string;
  shaders: ShaderManifestEntry[];
}

export interface RenderProjectAuthoringState {
  shaderPreset: ShaderPreset;
  shaderLook: ShaderLookControls;
  surfaceRegionsEnabled: boolean;
  surfaceRegions: readonly SurfaceRegionAssignment[];
  previewExposure: number;
  livingSkins: LivingSkinControls;
  installationRig: InstallationRigControls;
  shaderEventSound: ShaderEventSoundControls;
}

export interface RenderProject {
  schemaVersion: typeof RENDER_PROJECT_SCHEMA_VERSION;
  projectId: string;
  exportedAt: string;
  shaderManifest: {
    schemaVersion: typeof SHADER_MANIFEST_SCHEMA_VERSION;
    checksum: string;
  };
  shader: {
    preset: ShaderPreset;
    look: ShaderLookControls;
  };
  surfaceRegions: {
    enabled: boolean;
    assignments: readonly SurfaceRegionAssignment[];
  };
  livingSkins: LivingSkinControls;
  installationRig: {
    classification: "planning-only";
    physicalValidation: "not-validated";
    cameraCoLocated: false;
    controls: InstallationRigControls;
    heads: readonly InstallationHeadPlan[];
    projectorOptic: OpticalPreset;
    cameraLens: CameraLensPreset;
    nirIlluminator: NirIlluminatorPreset;
    limitations: readonly string[];
  };
  shaderEventSound: {
    controls: ShaderEventSoundControls;
    nativeAudioIncluded: false;
    audioOwner: "ableton-max";
  };
  projectionRig: ProjectionRigConfig;
  output: {
    projectorCount: 5;
    activeProjectorCount: number;
    activeProjectorIndices: readonly number[];
    orientation: "portrait";
    projectorRaster: { widthPx: number; heightPx: number };
    spanningRaster: { widthPx: number; heightPx: number };
  };
  safety: {
    previewExposure: number;
    shaderLuminanceCeiling: number;
    fanCommandsIncluded: false;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Stable FNV-1a checksum for project/manifest mismatch detection, not security. */
export function contractChecksum(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export function createShaderManifest(
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderManifest {
  const validated = validateShaderRegistry(registry);
  const body = {
    sourceRegistrySchemaVersion: validated.schemaVersion,
    fallbackShaderId: validated.fallbackShaderId,
    shaders: validated.shaders.map((shader) => ({
      id: shader.id,
      name: shader.name,
      family: shader.family,
      version: shader.version,
      nativeImplementation: `wgsl:${shader.id}`,
      parameters: shader.parameterDefinitions.map((parameter) => ({ ...parameter })),
      gpuCost: shader.gpuCost,
      safeLuminanceCeiling: shader.projectorCompatibility.safeLuminanceCeiling,
    })),
  };
  return {
    schemaVersion: SHADER_MANIFEST_SCHEMA_VERSION,
    ...body,
    checksum: contractChecksum(body),
  };
}

export function createRenderProject(
  authoring: RenderProjectAuthoringState,
  projectionRig: ProjectionRigConfig,
  exportedAt = new Date().toISOString(),
): RenderProject {
  const rig = validateProjectionRig(structuredClone(projectionRig));
  const resolution = resolveShaderPreset(authoring.shaderPreset);
  if (resolution.usedFallback || resolution.issues.length > 0) {
    throw new Error(`Shader preset is not exportable: ${resolution.issues.join(", ")}`);
  }
  const assignments = validateSurfaceRegionAssignments(
    structuredClone(authoring.surfaceRegions),
  );
  const manifest = createShaderManifest();
  const installationControls = normaliseInstallationRigControls(authoring.installationRig);
  const heads = createInstallationHeadPlans(rig, installationControls);
  const activeProjectorIndices = heads
    .filter((head) => head.active)
    .map((head) => head.projectorIndex);
  rig.projectors.forEach((projector, index) => {
    projector.enabled = activeProjectorIndices.includes(index);
  });
  const projectorOptic = PROJECTOR_OPTICAL_PRESETS.find(
    (preset) => preset.id === installationControls.projectorOpticId,
  )!;
  const cameraLens = CAMERA_LENS_PRESETS.find(
    (preset) => preset.id === installationControls.cameraLensId,
  )!;
  const nirIlluminator = NIR_ILLUMINATOR_PRESETS.find(
    (preset) => preset.id === installationControls.nirIlluminatorId,
  )!;
  const firstRaster = rig.projectors[0].raster;
  const previewExposure = Number.isFinite(authoring.previewExposure)
    ? Math.min(1.5, Math.max(0, authoring.previewExposure))
    : 0.68;
  return {
    schemaVersion: RENDER_PROJECT_SCHEMA_VERSION,
    projectId: `orbital-${resolution.preset.shaderId}`,
    exportedAt,
    shaderManifest: {
      schemaVersion: manifest.schemaVersion,
      checksum: manifest.checksum,
    },
    shader: {
      preset: resolution.preset,
      look: normaliseShaderLookControls(authoring.shaderLook),
    },
    surfaceRegions: {
      enabled: authoring.surfaceRegionsEnabled,
      assignments,
    },
    livingSkins: normaliseLivingSkinControls(authoring.livingSkins),
    installationRig: {
      classification: "planning-only",
      physicalValidation: "not-validated",
      cameraCoLocated: false,
      controls: installationControls,
      heads,
      projectorOptic: { ...projectorOptic },
      cameraLens: { ...cameraLens },
      nirIlluminator: { ...nirIlluminator },
      limitations: [
        "Optics and placement are planning values until measured on the physical balloon.",
        "Warp, edge blend and black-level calibration remain venue-specific.",
        "Camera capture and fusion run outside browser JavaScript.",
      ],
    },
    shaderEventSound: {
      controls: normaliseShaderEventSoundControls(authoring.shaderEventSound),
      nativeAudioIncluded: false,
      audioOwner: "ableton-max",
    },
    projectionRig: rig,
    output: {
      projectorCount: 5,
      activeProjectorCount: activeProjectorIndices.length,
      activeProjectorIndices,
      orientation: "portrait",
      projectorRaster: { ...firstRaster },
      spanningRaster: {
        widthPx: firstRaster.widthPx * 5,
        heightPx: firstRaster.heightPx,
      },
    },
    safety: {
      previewExposure,
      shaderLuminanceCeiling:
        resolution.shader.projectorCompatibility.safeLuminanceCeiling,
      fanCommandsIncluded: false,
    },
  };
}

export function parseRenderProject(value: unknown): RenderProject {
  if (!isRecord(value) || value.schemaVersion !== RENDER_PROJECT_SCHEMA_VERSION) {
    throw new Error("Unsupported render project schema");
  }
  if (!isRecord(value.shaderManifest) ||
      value.shaderManifest.schemaVersion !== SHADER_MANIFEST_SCHEMA_VERSION) {
    throw new Error("Unsupported shader manifest reference");
  }
  const currentManifest = createShaderManifest();
  if (value.shaderManifest.checksum !== currentManifest.checksum) {
    throw new Error("Shader manifest checksum does not match this Studio build");
  }
  if (!isRecord(value.shader) || !isRecord(value.surfaceRegions) ||
      !isRecord(value.installationRig) || !isRecord(value.shaderEventSound) ||
      !isRecord(value.output) || !isRecord(value.safety)) {
    throw new Error("Render project sections are incomplete");
  }
  return createRenderProject(
    {
      shaderPreset: value.shader.preset as ShaderPreset,
      shaderLook: value.shader.look as ShaderLookControls,
      surfaceRegionsEnabled: value.surfaceRegions.enabled === true,
      surfaceRegions: value.surfaceRegions.assignments as SurfaceRegionAssignment[],
      previewExposure: Number(value.safety.previewExposure),
      livingSkins: value.livingSkins as LivingSkinControls,
      installationRig: value.installationRig.controls as InstallationRigControls,
      shaderEventSound: (value.shaderEventSound as { controls: ShaderEventSoundControls }).controls,
    },
    value.projectionRig as ProjectionRigConfig,
    typeof value.exportedAt === "string" ? value.exportedAt : new Date(0).toISOString(),
  );
}

export function serialiseRenderProject(project: RenderProject): string {
  return `${JSON.stringify(parseRenderProject(project), null, 2)}\n`;
}
