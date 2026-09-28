import { clamp } from "./math";

export const BALLOON_MATERIAL_PROFILE_IDS = [
  "latex",
  "opaque-latex",
  "parachute",
  "custom",
] as const;
export type BalloonMaterialProfileId = (typeof BALLOON_MATERIAL_PROFILE_IDS)[number];

export interface BalloonPhysicsControls {
  centerDrift: number;
  verticalBreathing: number;
  squashStretch: number;
  lowerBulge: number;
  asymmetry: number;
  damping: number;
  mass: number;
  jetTurbulence: number;
}

export interface ProjectionMaterialControls {
  profile: BalloonMaterialProfileId;
  reflectance: number;
  translucency: number;
  internalBleed: number;
  roughness: number;
}

export const DEFAULT_BALLOON_PHYSICS_CONTROLS: Readonly<BalloonPhysicsControls> =
  Object.freeze({
    centerDrift: 0.72,
    verticalBreathing: 0.92,
    squashStretch: 0.82,
    lowerBulge: 0.68,
    asymmetry: 0.62,
    damping: 0.68,
    mass: 0.72,
    jetTurbulence: 0.42,
  });

export const BALLOON_MATERIAL_PROFILES: Readonly<Record<BalloonMaterialProfileId, ProjectionMaterialControls>> =
  Object.freeze({
    latex: Object.freeze({ profile: "latex", reflectance: 0.82, translucency: 0.34, internalBleed: 0.28, roughness: 0.58 }),
    "opaque-latex": Object.freeze({ profile: "opaque-latex", reflectance: 0.9, translucency: 0.12, internalBleed: 0.08, roughness: 0.64 }),
    parachute: Object.freeze({ profile: "parachute", reflectance: 0.72, translucency: 0.48, internalBleed: 0.42, roughness: 0.76 }),
    custom: Object.freeze({ profile: "custom", reflectance: 0.8, translucency: 0.25, internalBleed: 0.2, roughness: 0.6 }),
  });

export const DEFAULT_PROJECTION_MATERIAL_CONTROLS =
  BALLOON_MATERIAL_PROFILES.latex;

function bounded(value: unknown, fallback: number): number {
  return clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback);
}

export function normaliseBalloonPhysicsControls(
  controls: Partial<BalloonPhysicsControls>,
): BalloonPhysicsControls {
  return {
    centerDrift: bounded(controls.centerDrift, DEFAULT_BALLOON_PHYSICS_CONTROLS.centerDrift),
    verticalBreathing: bounded(controls.verticalBreathing, DEFAULT_BALLOON_PHYSICS_CONTROLS.verticalBreathing),
    squashStretch: bounded(controls.squashStretch, DEFAULT_BALLOON_PHYSICS_CONTROLS.squashStretch),
    lowerBulge: bounded(controls.lowerBulge, DEFAULT_BALLOON_PHYSICS_CONTROLS.lowerBulge),
    asymmetry: bounded(controls.asymmetry, DEFAULT_BALLOON_PHYSICS_CONTROLS.asymmetry),
    damping: bounded(controls.damping, DEFAULT_BALLOON_PHYSICS_CONTROLS.damping),
    mass: bounded(controls.mass, DEFAULT_BALLOON_PHYSICS_CONTROLS.mass),
    jetTurbulence: bounded(controls.jetTurbulence, DEFAULT_BALLOON_PHYSICS_CONTROLS.jetTurbulence),
  };
}

export function materialControlsForProfile(
  profile: BalloonMaterialProfileId,
): ProjectionMaterialControls {
  return { ...BALLOON_MATERIAL_PROFILES[profile] };
}

export function normaliseProjectionMaterialControls(
  controls: Partial<ProjectionMaterialControls>,
): ProjectionMaterialControls {
  const profile = BALLOON_MATERIAL_PROFILE_IDS.includes(
    controls.profile as BalloonMaterialProfileId,
  ) ? controls.profile as BalloonMaterialProfileId : "latex";
  const fallback = BALLOON_MATERIAL_PROFILES[profile];
  return {
    profile,
    reflectance: bounded(controls.reflectance, fallback.reflectance),
    translucency: bounded(controls.translucency, fallback.translucency),
    internalBleed: bounded(controls.internalBleed, fallback.internalBleed),
    roughness: bounded(controls.roughness, fallback.roughness),
  };
}
