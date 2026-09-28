import type { Vec3 } from "./contracts";
import type { ProjectionRigConfig } from "./projectionRig";

export type InstallationRigMode = "prototype-1" | "production-5";

export interface OpticalPreset {
  id: string;
  label: string;
  throwRatio: number;
  status: "planning-only";
}

export interface CameraLensPreset {
  id: string;
  label: string;
  focalLengthMm: number;
  sensorWidthMm: number;
  horizontalFovDeg: number;
  status: "planning-only";
}

export interface NirIlluminatorPreset {
  id: string;
  label: string;
  wavelengthNm: 850 | 940;
  beamAngleDeg: number;
  status: "planning-only";
}

export interface InstallationHeadPlan {
  projectorIndex: number;
  active: boolean;
  cameraActive: boolean;
  nirActive: boolean;
  trussBaseM: Vec3;
  cameraPositionM: Vec3;
  nirPositionM: Vec3;
  projectorDistanceM: number;
  projectedWidthM: number;
  projectedHeightM: number;
}

export interface InstallationRigControls {
  mode: InstallationRigMode;
  prototypeProjectorIndex: number;
  projectorOpticId: string;
  cameraLensId: string;
  nirIlluminatorId: string;
  cameraSeparationM: number;
  hazeDensity: number;
  showTruss: boolean;
  showCameras: boolean;
  showNir: boolean;
}

export const PROJECTOR_OPTICAL_PRESETS: readonly OpticalPreset[] = Object.freeze([
  { id: "short-080", label: "Generic short throw · 0.80:1", throwRatio: 0.8, status: "planning-only" },
  { id: "standard-120", label: "Generic standard · 1.20:1", throwRatio: 1.2, status: "planning-only" },
  { id: "standard-180", label: "Generic standard-long · 1.80:1", throwRatio: 1.8, status: "planning-only" },
  { id: "long-215", label: "Generic long throw · 2.15:1", throwRatio: 2.15, status: "planning-only" },
]);

export const CAMERA_LENS_PRESETS: readonly CameraLensPreset[] = Object.freeze(
  [3.5, 4, 6, 8, 12].map((focalLengthMm) => {
    const sensorWidthMm = 7.2;
    return {
      id: `generic-${String(focalLengthMm).replace(".", "-")}mm`,
      label: `Generic ${focalLengthMm} mm · 1/1.8 in planning sensor`,
      focalLengthMm,
      sensorWidthMm,
      horizontalFovDeg: 2 * Math.atan(sensorWidthMm / (2 * focalLengthMm)) * 180 / Math.PI,
      status: "planning-only" as const,
    };
  }),
);

export const NIR_ILLUMINATOR_PRESETS: readonly NirIlluminatorPreset[] = Object.freeze([
  { id: "nir-850-30", label: "Generic 850 nm spot · 30°", wavelengthNm: 850, beamAngleDeg: 30, status: "planning-only" },
  { id: "nir-850-60", label: "Generic 850 nm flood · 60°", wavelengthNm: 850, beamAngleDeg: 60, status: "planning-only" },
  { id: "nir-850-90", label: "Generic 850 nm wide flood · 90°", wavelengthNm: 850, beamAngleDeg: 90, status: "planning-only" },
  { id: "nir-940-60", label: "Generic 940 nm flood · 60°", wavelengthNm: 940, beamAngleDeg: 60, status: "planning-only" },
]);

export const DEFAULT_INSTALLATION_RIG_CONTROLS: Readonly<InstallationRigControls> = Object.freeze({
  mode: "prototype-1",
  prototypeProjectorIndex: 0,
  projectorOpticId: "long-215",
  cameraLensId: "generic-6mm",
  nirIlluminatorId: "nir-850-60",
  cameraSeparationM: 0.65,
  hazeDensity: 0.28,
  showTruss: true,
  showCameras: true,
  showNir: true,
});

const findById = <T extends { id: string }>(items: readonly T[], id: string, fallback: T): T =>
  items.find((item) => item.id === id) ?? fallback;

export function normaliseInstallationRigControls(
  value: Partial<InstallationRigControls>,
): InstallationRigControls {
  const finite = (candidate: unknown, fallback: number, min: number, max: number): number =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : fallback;
  return {
    mode: value.mode === "production-5" ? "production-5" : "prototype-1",
    prototypeProjectorIndex: Math.round(finite(value.prototypeProjectorIndex, 0, 0, 4)),
    projectorOpticId: findById(PROJECTOR_OPTICAL_PRESETS, value.projectorOpticId ?? "", PROJECTOR_OPTICAL_PRESETS[3]!).id,
    cameraLensId: findById(CAMERA_LENS_PRESETS, value.cameraLensId ?? "", CAMERA_LENS_PRESETS[2]!).id,
    nirIlluminatorId: findById(NIR_ILLUMINATOR_PRESETS, value.nirIlluminatorId ?? "", NIR_ILLUMINATOR_PRESETS[1]!).id,
    cameraSeparationM: finite(value.cameraSeparationM, 0.65, 0, 2.5),
    hazeDensity: finite(value.hazeDensity, 0.28, 0, 1),
    showTruss: value.showTruss ?? true,
    showCameras: value.showCameras ?? true,
    showNir: value.showNir ?? true,
  };
}

function offsetTowardCentre(source: Vec3, target: Vec3, distanceM: number): Vec3 {
  const dx = target.x - source.x;
  const dz = target.z - source.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: source.x + dx / length * distanceM, y: source.y - 0.42, z: source.z + dz / length * distanceM };
}

export function createInstallationHeadPlans(
  rig: ProjectionRigConfig,
  controls: InstallationRigControls,
): InstallationHeadPlan[] {
  const optic = findById(PROJECTOR_OPTICAL_PRESETS, controls.projectorOpticId, PROJECTOR_OPTICAL_PRESETS[3]!);
  return rig.projectors.map((projector, index) => {
    const dx = projector.targetM.x - projector.positionM.x;
    const dy = projector.targetM.y - projector.positionM.y;
    const dz = projector.targetM.z - projector.positionM.z;
    const projectorDistanceM = Math.hypot(dx, dy, dz);
    const projectedWidthM = projectorDistanceM / optic.throwRatio;
    const projectedHeightM = projectedWidthM * projector.raster.heightPx / projector.raster.widthPx;
    const cameraPositionM = offsetTowardCentre(projector.positionM, projector.targetM, controls.cameraSeparationM);
    const nirPositionM = offsetTowardCentre(projector.positionM, projector.targetM, controls.cameraSeparationM * 1.75);
    const active = controls.mode === "production-5" || index === controls.prototypeProjectorIndex;
    const sensorHead = index < 3;
    return {
      projectorIndex: index,
      active,
      cameraActive: active && (controls.mode === "prototype-1" || sensorHead),
      nirActive: active && (controls.mode === "prototype-1" || sensorHead),
      trussBaseM: { x: projector.positionM.x, y: 0, z: projector.positionM.z },
      cameraPositionM,
      nirPositionM: { ...nirPositionM, y: nirPositionM.y + 0.7 },
      projectorDistanceM,
      projectedWidthM,
      projectedHeightM,
    };
  });
}

export function installationRigSummary(
  rig: ProjectionRigConfig,
  controls: InstallationRigControls,
): { activeProjectors: number; activeCameras: number; activeNir: number; firstDistanceM: number; cameraCoLocated: false } {
  const plans = createInstallationHeadPlans(rig, controls);
  return {
    activeProjectors: plans.filter((plan) => plan.active).length,
    activeCameras: plans.filter((plan) => plan.cameraActive).length,
    activeNir: plans.filter((plan) => plan.nirActive).length,
    firstDistanceM: plans.find((plan) => plan.active)?.projectorDistanceM ?? 0,
    cameraCoLocated: false,
  };
}
