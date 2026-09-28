export const SOCIAL_ASPECT_PRESETS = {
  portrait: { label: "Portrait 9:16", width: 1080, height: 1920 },
  square: { label: "Square 1:1", width: 1080, height: 1080 },
  landscape: { label: "Landscape 16:9", width: 1920, height: 1080 },
} as const;

export type SocialAspectPreset = keyof typeof SOCIAL_ASPECT_PRESETS;

export const SOCIAL_CAMERA_PRESETS = {
  hero: { label: "Hero three-quarter", direction: [1.0, 0.24, 1.18], distance: 14.8 },
  front: { label: "Front elevation", direction: [0, 0.12, 1], distance: 15.4 },
  profile: { label: "Side profile", direction: [1, 0.16, 0], distance: 15.2 },
  low: { label: "Low monumental", direction: [0.72, -0.18, 1], distance: 14.2 },
  overhead: { label: "High orbital", direction: [0.52, 0.86, 0.72], distance: 16.8 },
} as const;

export type SocialCameraPreset = keyof typeof SOCIAL_CAMERA_PRESETS;

export function socialCaptureFilename(
  kind: "still" | "clip",
  aspect: SocialAspectPreset,
  camera: SocialCameraPreset,
): string {
  return `orbital-${kind}-${aspect}-${camera}.${kind === "still" ? "png" : "webm"}`;
}

