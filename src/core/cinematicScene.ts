import { clamp } from "./math";
import type { SocialCameraPreset } from "./socialCapture";

export interface CinematicSceneControls {
  cameraTourEnabled: boolean;
  cameraA: SocialCameraPreset;
  cameraB: SocialCameraPreset;
  cameraC: SocialCameraPreset;
  transitionSeconds: number;
  holdSeconds: number;
  projectorBodies: boolean;
  projectorThrows: boolean;
  technicalGuides: boolean;
  fanRig: boolean;
  speakerRig: boolean;
  roomArchitecture: boolean;
}

export const DEFAULT_CINEMATIC_SCENE_CONTROLS: Readonly<CinematicSceneControls> =
  Object.freeze({
    cameraTourEnabled: false,
    cameraA: "hero",
    cameraB: "low",
    cameraC: "overhead",
    transitionSeconds: 7,
    holdSeconds: 3,
    projectorBodies: true,
    projectorThrows: true,
    technicalGuides: false,
    fanRig: true,
    speakerRig: false,
    roomArchitecture: true,
  });

const CAMERA_IDS: readonly SocialCameraPreset[] = [
  "hero", "front", "profile", "low", "overhead",
];

export function normaliseCinematicSceneControls(
  controls: Partial<CinematicSceneControls>,
): CinematicSceneControls {
  const camera = (value: unknown, fallback: SocialCameraPreset): SocialCameraPreset =>
    CAMERA_IDS.includes(value as SocialCameraPreset)
      ? value as SocialCameraPreset
      : fallback;
  const seconds = typeof controls.transitionSeconds === "number" && Number.isFinite(controls.transitionSeconds)
    ? controls.transitionSeconds
    : DEFAULT_CINEMATIC_SCENE_CONTROLS.transitionSeconds;
  const holdSeconds = typeof controls.holdSeconds === "number" && Number.isFinite(controls.holdSeconds)
    ? controls.holdSeconds
    : DEFAULT_CINEMATIC_SCENE_CONTROLS.holdSeconds;
  return {
    cameraTourEnabled: controls.cameraTourEnabled ?? false,
    cameraA: camera(controls.cameraA, "hero"),
    cameraB: camera(controls.cameraB, "low"),
    cameraC: camera(controls.cameraC, "overhead"),
    transitionSeconds: 2 + clamp((seconds - 2) / 16) * 16,
    holdSeconds: clamp(holdSeconds / 12) * 12,
    projectorBodies: controls.projectorBodies ?? false,
    projectorThrows: controls.projectorThrows ?? false,
    technicalGuides: controls.technicalGuides ?? false,
    fanRig: controls.fanRig ?? true,
    speakerRig: controls.speakerRig ?? false,
    roomArchitecture: controls.roomArchitecture ?? true,
  };
}

export function smoothCameraTourPhase(elapsedS: number, transitionSeconds: number): {
  fromIndex: number;
  toIndex: number;
  mix: number;
} {
  const segment = Math.max(2, transitionSeconds);
  const absolute = Math.max(0, elapsedS) / segment;
  const fromIndex = Math.floor(absolute) % 3;
  const local = absolute - Math.floor(absolute);
  return {
    fromIndex,
    toIndex: (fromIndex + 1) % 3,
    mix: local * local * (3 - 2 * local),
  };
}

export function heldCameraTourPhase(
  elapsedS: number,
  transitionSeconds: number,
  holdSeconds: number,
): { fromIndex: number; toIndex: number; mix: number } {
  const transition = Math.max(2, transitionSeconds);
  const hold = Math.max(0, holdSeconds);
  const segment = transition + hold;
  const absolute = Math.max(0, elapsedS) / segment;
  const fromIndex = Math.floor(absolute) % 3;
  const localSeconds = (absolute - Math.floor(absolute)) * segment;
  if (localSeconds <= hold) {
    return { fromIndex, toIndex: (fromIndex + 1) % 3, mix: 0 };
  }
  const local = Math.min(1, (localSeconds - hold) / transition);
  return {
    fromIndex,
    toIndex: (fromIndex + 1) % 3,
    mix: local * local * (3 - 2 * local),
  };
}
