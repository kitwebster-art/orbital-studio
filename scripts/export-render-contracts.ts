import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createDefaultSurfaceRegionAssignments,
  type SurfaceRegionAssignment,
} from "../src/core/mappingLab";
import { createDefaultProjectionRig } from "../src/core/projectionRig";
import {
  createRenderProject,
  createShaderManifest,
  serialiseRenderProject,
} from "../src/core/renderProject";
import { createShaderPreset } from "../src/core/shaderRegistry";
import { DEFAULT_SHADER_LOOK_CONTROLS } from "../src/core/shaderLookControls";
import { DEFAULT_LIVING_SKIN_CONTROLS } from "../src/core/livingSkin";
import { DEFAULT_INSTALLATION_RIG_CONTROLS } from "../src/core/installationRig";
import { DEFAULT_SHADER_EVENT_SOUND_CONTROLS } from "../src/core/shaderEventSound";
import {
  applyProjectionCalibrationToRig,
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  runSimulatedAutomaticCalibration,
} from "../src/core/projectionCalibration";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "content", "render-contracts");
await mkdir(output, { recursive: true });

const manifest = createShaderManifest();
const project = createRenderProject({
  shaderPreset: createShaderPreset("geometric-grid"),
  shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS },
  surfaceRegionsEnabled: false,
  surfaceRegions: createDefaultSurfaceRegionAssignments(),
  previewExposure: 0.68,
  livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS },
  installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS },
  shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS },
}, createDefaultProjectionRig(), "2026-08-12T00:00:00.000Z");
const productionProject = createRenderProject({
  shaderPreset: createShaderPreset("geometric-grid"),
  shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS },
  surfaceRegionsEnabled: false,
  surfaceRegions: createDefaultSurfaceRegionAssignments(),
  previewExposure: 0.68,
  livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS },
  installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "production-5" },
  shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS },
}, createDefaultProjectionRig(), "2026-08-12T00:00:00.000Z");
const creativeProject = createRenderProject({
  shaderPreset: createShaderPreset("geometric-grid"),
  shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS, motion: 2.15, level: 1.12 },
  surfaceRegionsEnabled: true,
  surfaceRegions: createDefaultSurfaceRegionAssignments(),
  previewExposure: 0.72,
  livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS, enabled: true, sequenceMode: "eruption" },
  installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "production-5" },
  shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS, enabled: true, palette: "mixed" },
}, createDefaultProjectionRig(), "2026-08-12T00:00:00.000Z");
const calibrationSourceRig = createDefaultProjectionRig();
const simulatedCalibration = runSimulatedAutomaticCalibration(
  calibrationSourceRig,
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  new Date("2026-08-12T00:00:00.000Z"),
);
const calibratedCreativeProject = createRenderProject({
  shaderPreset: createShaderPreset("geometric-grid"),
  shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS, motion: 2.15, level: 1.12 },
  surfaceRegionsEnabled: true,
  surfaceRegions: createDefaultSurfaceRegionAssignments(),
  previewExposure: 0.72,
  livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS, enabled: true, sequenceMode: "cascade" },
  installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "production-5" },
  shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS, enabled: true, palette: "mixed" },
}, applyProjectionCalibrationToRig(
  calibrationSourceRig,
  simulatedCalibration,
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
), "2026-08-12T00:00:00.000Z");
const tierTwoRegions: SurfaceRegionAssignment[] = [
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "north-cap", shaderId: "liquid-metal", shaderFamily: "fluid", shaderPresetId: "liquid-metal-native", intensity: 1 },
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "equator", shaderId: "molten-lava", shaderFamily: "fire", shaderPresetId: "molten-lava-native", intensity: 1 },
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "south-band", shaderId: "aurora-ribbons", shaderFamily: "planetary", shaderPresetId: "aurora-ribbons-native", intensity: 1 },
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "residual-rim", shaderId: "electric-filaments", shaderFamily: "particle", shaderPresetId: "electric-filaments-native", intensity: 1 },
];
const tierTwoShowcaseProject = createRenderProject({
  shaderPreset: createShaderPreset("reaction-diffusion"),
  shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS, motion: 2.05, level: 1.14 },
  surfaceRegionsEnabled: true,
  surfaceRegions: tierTwoRegions,
  previewExposure: 0.76,
  livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS, enabled: false },
  installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "production-5" },
  shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS, enabled: true, palette: "attack" },
}, applyProjectionCalibrationToRig(
  calibrationSourceRig,
  simulatedCalibration,
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
), "2026-08-12T00:00:00.000Z");
const tierThreeRegions: SurfaceRegionAssignment[] = [
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "north-cap", shaderId: "geodesic-wireframe", shaderFamily: "geometric", shaderPresetId: "geodesic-wireframe-native", intensity: 1 },
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "equator", shaderId: "iridescent-film", shaderFamily: "fluid", shaderPresetId: "iridescent-film-native", intensity: 1 },
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "south-band", shaderId: "black-hole-lensing", shaderFamily: "planetary", shaderPresetId: "black-hole-lensing-native", intensity: 1 },
  { schemaVersion: "orbital.mapping-lab/1.0", regionId: "residual-rim", shaderId: "truchet-tiles", shaderFamily: "geometric", shaderPresetId: "truchet-tiles-native", intensity: 1 },
];
const tierThreeShowcaseProject = createRenderProject({
  shaderPreset: createShaderPreset("kaleidoscopic-warp"),
  shaderLook: { ...DEFAULT_SHADER_LOOK_CONTROLS, motion: 2.2, level: 1.14 },
  surfaceRegionsEnabled: true,
  surfaceRegions: tierThreeRegions,
  previewExposure: 0.78,
  livingSkins: { ...DEFAULT_LIVING_SKIN_CONTROLS, enabled: false },
  installationRig: { ...DEFAULT_INSTALLATION_RIG_CONTROLS, mode: "production-5" },
  shaderEventSound: { ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS, enabled: true, palette: "space" },
}, applyProjectionCalibrationToRig(
  calibrationSourceRig,
  simulatedCalibration,
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
), "2026-08-12T00:00:00.000Z");

await writeFile(
  resolve(output, "shader-manifest-v1.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  resolve(output, "default-render-project-v1.json"),
  serialiseRenderProject(project),
);
await writeFile(
  resolve(output, "production-render-project-v1.json"),
  serialiseRenderProject(productionProject),
);
await writeFile(
  resolve(output, "creative-render-project-v1.json"),
  serialiseRenderProject(creativeProject),
);
await writeFile(
  resolve(output, "calibrated-creative-render-project-v1.json"),
  serialiseRenderProject(calibratedCreativeProject),
);
await writeFile(
  resolve(output, "native-tier-two-showcase-render-project-v1.json"),
  serialiseRenderProject(tierTwoShowcaseProject),
);
await writeFile(
  resolve(output, "native-tier-three-showcase-render-project-v1.json"),
  serialiseRenderProject(tierThreeShowcaseProject),
);

console.log(`Exported ${manifest.shaders.length} shaders, ${manifest.checksum}`);
console.log(`Render project ${project.projectId}, ${project.output.spanningRaster.widthPx}x${project.output.spanningRaster.heightPx}`);
console.log(`Production rehearsal ${productionProject.output.activeProjectorCount} active heads`);
console.log(`Creative compositor ${creativeProject.livingSkins.sequenceMode} · ${creativeProject.surfaceRegions.assignments.length} regions`);
console.log(`Calibrated creative fixture ${calibratedCreativeProject.projectionRig.calibration.state} · ${calibratedCreativeProject.projectionRig.calibration.reprojectionErrorPx}px`);
console.log(`Native tier two showcase ${tierTwoShowcaseProject.shader.preset.shaderId} · ${tierTwoShowcaseProject.surfaceRegions.assignments.map((assignment) => assignment.shaderId).join(", ")}`);
console.log(`Native tier three showcase ${tierThreeShowcaseProject.shader.preset.shaderId} · ${tierThreeShowcaseProject.surfaceRegions.assignments.map((assignment) => assignment.shaderId).join(", ")}`);
