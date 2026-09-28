import { installUpdateNotice } from "./ui/updateNotice";
import { installViewportChrome } from "./ui/viewportChrome";
import { CameraHud } from "./ui/CameraHud";
import { ledCentre, PROJECTION_PIPELINE_LEAD_S } from "./core/leadPrediction";
import { calibrationAt, neutralCalibration, type LiveCalibration } from "./core/autoCentre";
import { DEFAULT_TEST_RIG, parseTestRigSetup, type TestRigSetup } from './core/testRig';
import { TestRigPreviewAdapter } from './adapters/TestRigPreviewAdapter';
import { parseMonocularCalibration } from './core/monocularCalibration';
import { scanQualifiesForLive, type StructuredLightResult } from './core/structuredLight';
import { lensShiftForScan, mapEllipseThroughHomography, projectorPixelToTwin, scanAnchoredAffine, type ImageEllipse } from './core/scanMapping';
import "./style.css";

import { FanSafetySimulator } from "./adapters/FanSafetySimulator";
import { NullProjectionOutput } from "./adapters/NullProjectionOutput";
import { ReplayTrackingAdapter } from "./adapters/ReplayTrackingAdapter";
import { RecordedVideoTrackingAdapter } from "./adapters/RecordedVideoTrackingAdapter";
import { SyntheticTrackingAdapter } from "./adapters/SyntheticTrackingAdapter";
import { WebSocketTrackingAdapter } from "./adapters/WebSocketTrackingAdapter";
import { PreviewAudioEngine } from "./audio/PreviewAudioEngine";
import { CueStreamRecorder } from "./core/cueBridge";
import {
  DEFAULT_FAN_PREVIEW_SPEED,
  type EnvironmentPreviewControls,
} from "./core/environmentPreview";
import {
  SyntheticCameraControlAdapter,
} from "./core/cameraControl";
import {
  CueStreamPlayer,
  cueStateToRuntimeSnapshot,
  parseCueStreamJsonl,
} from "./core/cueReplay";
import { PerformanceMonitor } from "./core/performanceMonitor";
import { prefersReducedMotion } from "./core/motionPreference";
import { detectBrightSphereFromImageData } from "./core/recordedVideoTracking";
import { createDefaultSurfaceRegionAssignments } from "./core/mappingLab";
import {
  DEFAULT_BALLOON_PHYSICS_CONTROLS,
  DEFAULT_PROJECTION_MATERIAL_CONTROLS,
  type BalloonPhysicsControls,
  type ProjectionMaterialControls,
} from "./core/balloonSurfaceControls";
import {
  applyProjectionCalibrationToRig,
  runSimulatedAutomaticCalibration,
  parseProjectionCalibrationResult,
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
} from "./core/projectionCalibration";
import {
  RenderQualityGovernor,
  type RenderQualityMode,
} from "./core/renderQuality";
import {
  LiveTransport,
  makeTransportCommand,
  type TransportProtocol,
} from "./core/liveTransport";
import {
  createDefaultTimeline,
  timelineFromShowScore,
  TimelineSequencer,
} from "./core/sequencer";
import {
  createShaderPreset,
  getShaderDefinition,
  type ShaderPreset,
} from "./core/shaderRegistry";
import { RuntimeEngine } from "./core/RuntimeEngine";
import {
  parseContentPreset,
  readStoredContentPreset,
  serialiseContentPreset,
  writeStoredContentPreset,
} from "./core/contentPresets";
import type {
  RuntimeMode,
  RuntimeSnapshot,
  ShowScore,
} from "./core/contracts";
import { loadShowScore } from "./core/showScore";
import { OrbitalScene } from "./scene";
import { StudioUI, type DebugOptions } from "./ui/StudioUI";
import { TestConsole } from "./ui/TestConsole";
import {
  createRenderProject,
  serialiseRenderProject,
} from "./core/renderProject";
import { DEFAULT_LIVING_SKIN_CONTROLS } from "./core/livingSkin";
import {
  DEFAULT_SHADER_EVENT_SOUND_CONTROLS,
  type ShaderEventSoundControls,
} from "./core/shaderEventSound";
import {
  DEFAULT_CINEMATIC_SCENE_CONTROLS,
  type CinematicSceneControls,
} from "./core/cinematicScene";
import {
  SOCIAL_ASPECT_PRESETS,
  socialCaptureFilename,
} from "./core/socialCapture";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Orbital Studio requires an #app root");
}

const bundledScore = loadShowScore();
const contentStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
let score =
  (contentStorage ? readStoredContentPreset(contentStorage) : null) ??
  bundledScore;
const fan = new FanSafetySimulator();
const syntheticTracking = new SyntheticTrackingAdapter();
const cameraRig = new SyntheticCameraControlAdapter(1, "huateng-ge134");
const recordedVideoTracking = new RecordedVideoTrackingAdapter();
const liveTracking = new WebSocketTrackingAdapter();
const cueRecorder = new CueStreamRecorder();
const performanceMonitor = new PerformanceMonitor();
const renderQualityGovernor = new RenderQualityGovernor();
const liveTransport = new LiveTransport({
  timeline: createDefaultTimeline(),
});
let shaderPreset: ShaderPreset = createShaderPreset("geometric-grid");
const surfaceRegions = [...createDefaultSurfaceRegionAssignments()];
let cuePlayer: CueStreamPlayer | null = null;
const engine = new RuntimeEngine({
  score,
  trackingAdapter: syntheticTracking,
  fanAdapter: fan,
  projectionOutput: new NullProjectionOutput(),
  autoplay: false,
  predictionHorizonMs: 0,
});
const audio = new PreviewAudioEngine();
let showSequencer = new TimelineSequencer(createDefaultTimeline());

let scene: OrbitalScene | null = null;
let cinematicSceneControls: CinematicSceneControls = {
  ...DEFAULT_CINEMATIC_SCENE_CONTROLS,
};
let livingSkinControls = { ...DEFAULT_LIVING_SKIN_CONTROLS };
let shaderEventSoundControls: ShaderEventSoundControls = {
  ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS,
};
let ui: StudioUI;
let testConsole: TestConsole | null = null;
let cameraGeometryRecord: unknown = null;
let projectorCalibrationRecord: unknown = null;
let activeTestRig: TestRigSetup = structuredClone(DEFAULT_TEST_RIG);
let structuredLightScan: StructuredLightResult | null = null;
/** P1 window layout the active scan was taken with; output is blocked if the window no longer matches. */
let structuredLightSignature: string | null = null;
let structuredLightLayoutCheck = { atMs: -Infinity, reason: null as string | null };

/** Throttled layout guard for the structured-light mapping (a layout read every 250 ms, not every frame). */
function structuredLightBlockReason(): string | null {
  if (!structuredLightSignature) return null;
  const now = performance.now();
  if (now - structuredLightLayoutCheck.atMs >= 250) {
    const current = ui.projectorOneSurfaceSignature();
    structuredLightLayoutCheck = { atMs: now, reason: current !== null && current !== structuredLightSignature ? 'PROJECTOR_WINDOW_CHANGED_SINCE_SCAN' : null };
  }
  return structuredLightLayoutCheck.reason;
}

/**
 * Projector-space ball outline for the structured-light 2D mapping. Live mode
 * maps the tracked camera ellipse through the scan homography (centre) and its
 * Jacobian (axes). Simulation and replay rehearse with the scanned outline.
 */
/** Auto-centring shift in camera pixels, measured by the Test bench from the camera picture. */
let liveCalibration: LiveCalibration = neutralCalibration();
let liveSizeAtBall = 1;
/** Delay from drawing a picture to its light reaching the ball; measured by the Test bench's probe. */
let projectionLeadS = PROJECTION_PIPELINE_LEAD_S;

/** The scan's mapping anchored at the scanned ball (see scanAnchoredAffine), cached per scan. */
let liveMappingCache: { scan: StructuredLightResult; mapping: readonly number[] } | null = null;
function liveMappingFor(scan: StructuredLightResult): readonly number[] {
  if (liveMappingCache?.scan !== scan) {
    const h = scan.mapping!.camera_to_projector;
    const anchor = scan.ball_camera?.center_px;
    const bp = scan.ball_projector, bc = scan.ball_camera;
    const measuredScale = bp && bc && bc.radius_px > 0 ? Math.sqrt(bp.major_px * bp.minor_px) / (2 * bc.radius_px) : undefined;
    liveMappingCache = { scan, mapping: anchor ? scanAnchoredAffine(h, anchor[0], anchor[1], measuredScale) : h };
  }
  return liveMappingCache.mapping;
}

/**
 * Tie the 3D twin to the scan: P1's picture gets the real projector's offset (lens
 * shift) and field of view, and the live ball is placed along the projector ray
 * through where it lands in the real picture. Without a scan the twin keeps its
 * rough image-space preview.
 */
function applyScanToTwin(scan: StructuredLightResult | null): void {
  const bp = scan?.ball_projector, bc = scan?.ball_camera;
  if (!scan || !bp || !bc || !scan.mapping) {
    scene?.setScanProjectorOverride(null);
    liveTracking.setPlacement(null);
    return;
  }
  const { width, height } = scan.projector;
  const fovDeg = scan.estimate3d?.projector_intrinsics?.vertical_fov_deg ?? null;
  scene?.setScanProjectorOverride({ lensShift: lensShiftForScan(bp.center_px, width, height), fovDeg });
  const scanDiameterPx = Math.sqrt(bp.major_px * bp.minor_px);
  liveTracking.setPlacement((frame) => {
    if (!frame.geometry) return null;
    const kx = scan.camera.width / frame.frame.width_px, ky = scan.camera.height / frame.frame.height_px, k = Math.sqrt(kx * ky);
    const e = frame.geometry.ellipse;
    const rawX = frame.geometry.center_norm[0] * frame.frame.width_px, rawY = frame.geometry.center_norm[1] * frame.frame.height_px;
    const { correctionPx } = calibrationAt(liveCalibration, [rawX, rawY]);
    const cx = rawX + correctionPx[0], cy = rawY + correctionPx[1];
    let projected: ImageEllipse;
    try {
      projected = mapEllipseThroughHomography(liveMappingFor(scan), { centerPx: [cx * kx, cy * ky], majorPx: e.major_diameter_px * k, minorPx: e.minor_diameter_px * k, angleDeg: e.angle_deg });
    } catch { return null; }
    const rig = activeTestRig;
    return projectorPixelToTwin(rig.projectorPositionM, rig.ballCenterM, fovDeg ?? rig.projectorFovDeg, height,
      bp.center_px, scanDiameterPx, projected.centerPx, Math.sqrt(projected.majorPx * projected.minorPx));
  });
}

function structuredLightEllipse(): ImageEllipse | null {
  const scan = structuredLightScan;
  if (!scan) return null;
  const raster = ui.getOutputRaster();
  const sx = raster.width / scan.projector.width, sy = raster.height / scan.projector.height;
  let projected: ImageEllipse | null = null;
  try {
    if (engine.mode === "live") {
      const tracked = liveTracking.imageEllipse();
      if (!tracked || !scan.mapping) return null;
      const kx = scan.camera.width / tracked.frameWidthPx, ky = scan.camera.height / tracked.frameHeightPx;
      const k = Math.sqrt(kx * ky);
      // Project where the ball will be when the light lands, not where the camera last saw it.
      const led = ledCentre(tracked.centerPx, tracked.velocityPxPerS, tracked.majorPx, tracked.ageMs, projectionLeadS);
      // Live calibration at where the ball is: position correction and size factor.
      const fit = calibrationAt(liveCalibration, tracked.centerPx);
      liveSizeAtBall = fit.sizeScale;
      projected = mapEllipseThroughHomography(liveMappingFor(scan), {
        centerPx: [(led[0] + fit.correctionPx[0]) * kx, (led[1] + fit.correctionPx[1]) * ky],
        majorPx: tracked.majorPx * k, minorPx: tracked.minorPx * k, angleDeg: tracked.angleDeg,
      });
    } else if (scan.ball_projector) {
      const b = scan.ball_projector;
      projected = { centerPx: [...b.center_px] as [number, number], majorPx: b.major_px, minorPx: b.minor_px, angleDeg: b.angle_deg };
    }
  } catch {
    return null;
  }
  if (!projected || !(projected.majorPx > 0) || !(projected.minorPx > 0)) return null;
  // Self-sizing from the camera (Test bench): grow or shrink until the light reaches the ball's rim.
  if (engine.mode === "live") projected = { ...projected, majorPx: projected.majorPx * liveSizeAtBall, minorPx: projected.minorPx * liveSizeAtBall };
  const k = Math.sqrt(sx * sy);
  return { centerPx: [projected.centerPx[0] * sx, projected.centerPx[1] * sy], majorPx: projected.majorPx * k, minorPx: projected.minorPx * k, angleDeg: projected.angleDeg };
}
let recordedTrackingObjectUrl: string | null = null;
let recordedTrackingActive = false;
let lastRecordedTrackingProcessMs = 0;
let recordedTrackingElements: {
  video: HTMLVideoElement;
  raw: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  fit: HTMLCanvasElement;
  threshold: HTMLInputElement;
  status: HTMLElement;
  confidence: HTMLElement;
  fitValue: HTMLElement;
  processing: HTMLElement;
} | null = null;
const reducedMotionQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function syncReducedMotion(matches = prefersReducedMotion(reducedMotionQuery)): void {
  root!.dataset.reducedMotion = matches ? "true" : "false";
  scene?.setReducedMotion(matches);
}

const onReducedMotionChange = (event: MediaQueryListEvent): void => {
  syncReducedMotion(event.matches);
};

function applyScore(nextScore: ShowScore, status = "Unsaved score edits"): void {
  score = loadShowScore(nextScore);
  engine.setShowScore(score);
  showSequencer = new TimelineSequencer(timelineFromShowScore(score));
  ui.setScore(score);
  ui.setAuthoringStatus(status);
}

function downloadShowPreset(nextScore: ShowScore): void {
  const blob = new Blob([serialiseContentPreset(nextScore)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "orbital-show-preset-v1.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function downloadCueStream(): void {
  if (cueRecorder.frameCount === 0) {
    ui.setCueStatus(
      cueRecorder.recording,
      cueRecorder.frameCount,
      cueRecorder.elapsedS,
      "Record at least one cue frame before exporting",
      true,
    );
    return;
  }
  const blob = new Blob([cueRecorder.serialise()], {
    type: "application/x-ndjson",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "orbital-cue-stream-v1.jsonl";
  anchor.click();
  URL.revokeObjectURL(url);
  ui.setCueStatus(
    cueRecorder.recording,
    cueRecorder.frameCount,
    cueRecorder.elapsedS,
    "Exported platform-neutral JSONL",
  );
}

function updateCueReplayUI(message?: string, error = false): void {
  const player = cuePlayer;
  ui.setCueReplayActive(player !== null);
  ui.setCueReplayState(
    player !== null,
    player?.playing ?? false,
    player?.frameCount ?? 0,
    player?.durationS ?? 0,
    player?.positionS ?? 0,
    message,
    error,
  );
}

/**
 * Automatic source (27 September): the mode switcher is hidden outside the Tracking
 * tab. Studio follows the real camera whenever its bridge answers, and shows the
 * pretend ball only when no camera is running and no projector window is open, so a
 * bridge restart during a show can never put the pretend ball on the real one.
 */
let bridgeMissingSinceMs: number | null = null;
let lastAutoSourceMs = Number.NEGATIVE_INFINITY;
function autoSelectSource(nowMs: number): void {
  if (nowMs - lastAutoSourceMs < 1000 || !testConsole) return;
  lastAutoSourceMs = nowMs;
  if (ui.getActiveWorkspace() === "tracking" || engine.mode === "replay" || cuePlayer) return;
  if (testConsole.bridgeConnected) {
    bridgeMissingSinceMs = null;
    if (engine.mode !== "live") selectMode("live");
    return;
  }
  bridgeMissingSinceMs ??= nowMs;
  if (engine.mode === "live" && nowMs - bridgeMissingSinceMs > 4000 && !ui.hasOpenOutputWindow()) selectMode("simulation");
}

function selectMode(mode: RuntimeMode): void {
  if (cuePlayer) {
    cuePlayer = null;
    updateCueReplayUI("Cue replay cleared by runtime mode change");
  }
  if (mode === "simulation") {
    liveTracking.disconnect();
    recordedTrackingActive = false;
    recordedTrackingElements?.video.pause();
    engine.setTrackingAdapter(new TestRigPreviewAdapter(activeTestRig));
  } else if (mode === "live") {
    recordedTrackingActive = false;
    recordedTrackingElements?.video.pause();
    engine.setTrackingAdapter(liveTracking);
    liveTracking.connect();
  }
  engine.setInjectedTrackingLoss(false);
  ui.setMode(mode);
}

function requireTrackingElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Orbital tracking lab requires #${id}`);
  return element as T;
}

function setupRecordedTrackingLab(): void {
  const file = requireTrackingElement<HTMLInputElement>("recorded-tracking-file");
  const play = requireTrackingElement<HTMLButtonElement>("recorded-tracking-play");
  const stop = requireTrackingElement<HTMLButtonElement>("recorded-tracking-stop");
  const threshold = requireTrackingElement<HTMLInputElement>("recorded-tracking-threshold");
  recordedTrackingElements = {
    video: requireTrackingElement<HTMLVideoElement>("recorded-tracking-video"),
    raw: requireTrackingElement<HTMLCanvasElement>("tracking-raw-canvas"),
    mask: requireTrackingElement<HTMLCanvasElement>("tracking-mask-canvas"),
    fit: requireTrackingElement<HTMLCanvasElement>("tracking-fit-canvas"),
    threshold,
    status: requireTrackingElement("recorded-tracking-status"),
    confidence: requireTrackingElement("recorded-tracking-confidence"),
    fitValue: requireTrackingElement("recorded-tracking-fit"),
    processing: requireTrackingElement("recorded-tracking-processing"),
  };
  const thresholdValue = requireTrackingElement("recorded-tracking-threshold-value");
  threshold.addEventListener("input", () => {
    thresholdValue.textContent = threshold.value;
  });
  file.addEventListener("change", () => {
    const selected = file.files?.[0];
    if (!selected || !recordedTrackingElements) return;
    if (recordedTrackingObjectUrl) URL.revokeObjectURL(recordedTrackingObjectUrl);
    recordedTrackingObjectUrl = URL.createObjectURL(selected);
    recordedTrackingElements.video.src = recordedTrackingObjectUrl;
    recordedTrackingElements.video.load();
    recordedTrackingElements.status.textContent = "VIDEO READY";
    play.disabled = false;
    stop.disabled = false;
    ui.setAuthoringStatus(`${selected.name} loaded · press Play tracking`, false);
  });
  play.addEventListener("click", () => {
    if (!recordedTrackingElements?.video.src) return;
    liveTracking.disconnect();
    recordedVideoTracking.reset();
    engine.setTrackingAdapter(recordedVideoTracking);
    recordedTrackingActive = true;
    lastRecordedTrackingProcessMs = 0;
    void recordedTrackingElements.video.play();
    ui.setMode("replay");
    ui.setAuthoringStatus("Recorded silhouette tracking active · 2D rehearsal", false);
  });
  stop.addEventListener("click", () => {
    recordedTrackingActive = false;
    recordedTrackingElements?.video.pause();
    selectMode("simulation");
    ui.setAuthoringStatus("Synthetic tracking restored", false);
  });
}

function processRecordedTrackingFrame(nowMs: number): void {
  const elements = recordedTrackingElements;
  if (
    !recordedTrackingActive ||
    !elements ||
    elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    nowMs - lastRecordedTrackingProcessMs < 66
  ) return;
  lastRecordedTrackingProcessMs = nowMs;
  const startedAtMs = performance.now();
  const width = elements.raw.width;
  const height = elements.raw.height;
  const rawContext = elements.raw.getContext("2d", { willReadFrequently: true });
  const maskContext = elements.mask.getContext("2d");
  const fitContext = elements.fit.getContext("2d");
  if (!rawContext || !maskContext || !fitContext) return;
  rawContext.drawImage(elements.video, 0, 0, width, height);
  const source = rawContext.getImageData(0, 0, width, height);
  const tracked = detectBrightSphereFromImageData(source, {
    minimumWhite: Number(elements.threshold.value),
  });
  const maskImage = maskContext.createImageData(width, height);
  for (let index = 0; index < tracked.mask.length; index += 1) {
    const value = tracked.mask[index] ? 255 : 0;
    const offset = index * 4;
    maskImage.data[offset] = value;
    maskImage.data[offset + 1] = value;
    maskImage.data[offset + 2] = value;
    maskImage.data[offset + 3] = 255;
  }
  maskContext.putImageData(maskImage, 0, 0);
  fitContext.drawImage(elements.raw, 0, 0);
  const detection = tracked.detection;
  if (detection) {
    fitContext.save();
    fitContext.strokeStyle = detection.confidence >= 0.58 ? "#7df4d4" : "#f1bc6a";
    fitContext.lineWidth = 2;
    fitContext.beginPath();
    fitContext.ellipse(
      detection.centerPx[0],
      detection.centerPx[1],
      detection.majorDiameterPx * 0.5,
      detection.minorDiameterPx * 0.5,
      detection.angleDeg * Math.PI / 180,
      0,
      Math.PI * 2,
    );
    fitContext.stroke();
    fitContext.restore();
  }
  const processingMs = performance.now() - startedAtMs;
  recordedVideoTracking.ingest(detection, nowMs, processingMs);
  elements.status.textContent = detection ? (detection.confidence >= 0.58 ? "TRACKING" : "DEGRADED") : "NO SILHOUETTE";
  elements.confidence.textContent = `${Math.round((detection?.confidence ?? 0) * 100)}%`;
  elements.fitValue.textContent = detection ? `${Math.round(detection.axisRatio * 100) / 100}:1` : "OPEN";
  elements.processing.textContent = `${processingMs.toFixed(1)} ms`;
  root!.dataset.recordedTrackingStatus = detection ? "tracking" : "missing";
  if (detection) {
    root!.dataset.recordedTrackingCenterX = detection.centerNorm[0].toFixed(6);
    root!.dataset.recordedTrackingCenterY = detection.centerNorm[1].toFixed(6);
    root!.dataset.recordedTrackingMajorPx = detection.majorDiameterPx.toFixed(4);
    root!.dataset.recordedTrackingMinorPx = detection.minorDiameterPx.toFixed(4);
    root!.dataset.recordedTrackingAngleDeg = detection.angleDeg.toFixed(4);
    root!.dataset.recordedTrackingConfidence = detection.confidence.toFixed(4);
  }
}

ui = new StudioUI(root, score, {
  onPlayToggle: () => {
    if (cuePlayer) {
      cuePlayer.setPlaying(!cuePlayer.playing);
      updateCueReplayUI();
      return;
    }
    engine.setPlaying(!engine.playing);
    ui.setPlaying(engine.playing);
  },
  onAudiovisualShow: () => {
    void (async () => {
      cuePlayer?.reset();
      engine.reset();
      engine.setPlaying(true);
      ui.setPlaying(true);
      if (!audio.enabled) await audio.enable();
      ui.setAudioEnabled(audio.enabled);
    })();
  },
  onReset: () => {
    if (cuePlayer) {
      cuePlayer.reset();
      updateCueReplayUI();
      return;
    }
    engine.reset();
    ui.setPlaying(engine.playing);
  },
  onSeek: (timeS) => {
    if (cuePlayer) {
      cuePlayer.seek(timeS);
      updateCueReplayUI();
      return;
    }
    engine.seek(timeS);
  },
  onRate: (rate) => {
    if (cuePlayer) {
      cuePlayer.setPlaybackRate(rate);
      updateCueReplayUI();
      return;
    }
    engine.setPlaybackRate(rate);
  },
  onMode: (mode) => {
    selectMode(mode);
  },
  onAudioToggle: () => {
    void (async () => {
      if (audio.enabled) {
        audio.disable();
      } else {
        await audio.enable();
      }
      ui.setAudioEnabled(audio.enabled);
    })();
  },
  onReplayFile: (file) => {
    void (async () => {
      try {
        liveTracking.disconnect();
        recordedTrackingActive = false;
        recordedTrackingElements?.video.pause();
        recordedVideoTracking.reset();
        const text = await file.text();
        const replay = new ReplayTrackingAdapter(text, {
          loop: true,
        });
        engine.setTrackingAdapter(replay);
        engine.setInjectedTrackingLoss(false);
        ui.setMode("replay");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown replay error";
        window.alert(`Replay could not be loaded: ${message}`);
      }
    })();
  },
  onScoreChange: (nextScore) => {
    applyScore(nextScore);
  },
  onSavePreset: (nextScore) => {
    if (!contentStorage) {
      ui.setAuthoringStatus("Browser storage unavailable", true);
      return;
    }
    writeStoredContentPreset(contentStorage, nextScore);
    ui.setAuthoringStatus("Saved to this browser");
  },
  onExportPreset: (nextScore) => {
    downloadShowPreset(nextScore);
    ui.setAuthoringStatus("Exported versioned show preset");
  },
  onImportPreset: (file) => {
    void (async () => {
      try {
        const text = await file.text();
        const imported = parseContentPreset(JSON.parse(text));
        applyScore(imported, "Loaded preset · press Save to keep it here");
      } catch (error) {
        ui.setAuthoringStatus(
          error instanceof Error ? error.message : "Preset could not be loaded",
          true,
        );
      }
    })();
  },
  onResetScore: () => {
    applyScore(bundledScore, "Bundled score restored · edits are unsaved");
  },
  onCueRecordToggle: () => {
    if (cueRecorder.recording) {
      cueRecorder.stop();
    } else {
      cueRecorder.start();
    }
    ui.setCueStatus(
      cueRecorder.recording,
      cueRecorder.frameCount,
      cueRecorder.elapsedS,
    );
  },
  onCueExport: () => {
    downloadCueStream();
  },
  onCueClear: () => {
    cueRecorder.stop();
    cueRecorder.clear();
    cuePlayer = null;
    updateCueReplayUI("No rehearsal stream loaded");
    ui.setCueReplayActive(false);
    ui.setCueStatus(false, 0, 0, "No cue frames recorded");
  },
  onCueLoad: (file) => {
    void (async () => {
      try {
        const text = await file.text();
        const states = parseCueStreamJsonl(text);
        cueRecorder.stop();
        cuePlayer = new CueStreamPlayer(states);
        engine.setPlaying(false);
        updateCueReplayUI(`Loaded ${states.length} cue frames`);
      } catch (error) {
        updateCueReplayUI(
          error instanceof Error
            ? error.message
            : "Cue stream could not be loaded",
          true,
        );
      }
    })();
  },
  onCuePlayToggle: () => {
    if (!cuePlayer) {
      return;
    }
    cuePlayer.setPlaying(!cuePlayer.playing);
    updateCueReplayUI();
  },
  onCueReset: () => {
    if (!cuePlayer) {
      return;
    }
    cuePlayer.reset();
    updateCueReplayUI();
  },
  onCueSeek: (positionS) => {
    if (!cuePlayer) {
      return;
    }
    cuePlayer.seek(positionS);
    updateCueReplayUI();
  },
  onInjectedLoss: (enabled) => {
    engine.setInjectedTrackingLoss(enabled);
  },
  onFanFault: (enabled) => {
    engine.setFanFault(enabled ? "INJECTED_CONTROLLER_FAULT" : null);
  },
  onFanCueOverride: (cue) => {
    try {
      engine.setFanCueOverride(cue);
      ui.setAuthoringStatus(
        cue === null
          ? "Score fan cue restored · simulator only"
          : `Virtual fan test cue ${Math.round(cue * 100)}% · no hardware write`,
        false,
      );
    } catch (error) {
      ui.setAuthoringStatus(
        error instanceof Error ? error.message : "Fan cue rejected",
        true,
      );
    }
  },
  onEnvironmentControls: (controls: EnvironmentPreviewControls) => {
    scene?.setEnvironmentControls(controls);
  },
  onBalloonPhysicsControls: (controls: BalloonPhysicsControls) => {
    scene?.setBalloonPhysicsControls(controls);
  },
  onProjectionMaterialControls: (controls: ProjectionMaterialControls) => {
    scene?.setProjectionMaterialControls(controls);
  },
  onProjectionPattern: (pattern) => {
    scene?.setProjectionPattern(pattern);
  },
  onInstallationRigControls: (controls) => {
    scene?.setInstallationRigControls(controls);
  },
  onRenderProjectorOutput: (index, canvas, width, height, mode, isDriver) => {
    driveRuntimeFromProjector(performance.now(), isDriver);
    scene?.renderProjectorOutputWindow(index, canvas, width, height, mode);
  },
  onDisposeProjectorOutput: (canvas) => {
    scene?.disposeProjectorOutputWindow(canvas);
  },
  onProjectionCalibration: (settings) => {
    if (!scene) {
      ui.setAuthoringStatus("Projection scene is not ready", true);
      return;
    }
    const currentRig = scene.getProjectionRig();
    const result = runSimulatedAutomaticCalibration(currentRig, settings);
    scene.setProjectionRig(
      applyProjectionCalibrationToRig(currentRig, result, settings),
    );
    scene.setProjectionPattern("seam");
    ui.updateProjectionCalibration(result);
  },
  onMappingView: (view) => {
    scene?.setMappingView(view);
  },
  onShaderPreviewExposure: (exposure) => {
    scene?.setPreviewExposure(exposure);
  },
  onShaderLookControls: (controls) => {
    scene?.setShaderLookControls(controls);
  },
  onCameraDiscover: () => {
    try {
      ui.updateCameraRig(cameraRig.discover());
    } catch (error) {
      ui.setCameraMessage(
        error instanceof Error ? error.message : "CAMERA_DISCOVERY_FAILED",
        true,
      );
    }
  },
  onCameraArm: () => {
    try {
      ui.updateCameraRig(cameraRig.arm());
    } catch (error) {
      ui.setCameraMessage(
        error instanceof Error ? error.message : "CAMERA_ARM_FAILED",
        true,
      );
    }
  },
  onCameraStreamToggle: () => {
    try {
      const state = cameraRig.getState();
      ui.updateCameraRig(cameraRig.setStreaming(state.state !== "streaming"));
    } catch (error) {
      ui.setCameraMessage(
        error instanceof Error ? error.message : "CAMERA_STREAM_FAILED",
        true,
      );
    }
  },
  onCameraProfile: (profileId) => {
    try {
      ui.updateCameraRig(cameraRig.configure(profileId));
    } catch (error) {
      ui.setCameraMessage(
        error instanceof Error ? error.message : "CAMERA_PROFILE_FAILED",
        true,
      );
    }
  },
  onCameraSettings: (exposureUs, gainDb) => {
    try {
      ui.updateCameraRig(cameraRig.setExposure(exposureUs));
      ui.updateCameraRig(cameraRig.setGain(gainDb));
    } catch (error) {
      ui.setCameraMessage(
        error instanceof Error ? error.message : "CAMERA_SETTINGS_FAILED",
        true,
      );
    }
  },
  onShaderSelect: (shaderId) => {
    const shader = getShaderDefinition(shaderId);
    if (!shader) {
      ui.setAuthoringStatus(`Unknown shader module: ${shaderId}`, true);
      return;
    }
    shaderPreset = createShaderPreset(shader.id);
    ui.setShaderDefinition(shader, shaderPreset);
    scene?.setShaderPreset(shaderPreset);
    ui.setAuthoringStatus(`${shader.name} selected · parameters are local`, false);
  },
  onShaderPreset: (preset) => {
    shaderPreset = preset;
    scene?.setShaderPreset(shaderPreset);
  },
  onExportRenderProject: (authoring) => {
    if (!scene) {
      ui.setAuthoringStatus("Projection scene is not ready", true);
      return;
    }
    try {
      const project = createRenderProject(
        authoring,
        scene.getProjectionRig() as ReturnType<typeof scene.getProjectionRig>,
      );
      const blob = new Blob([serialiseRenderProject(project)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.projectId}-render-project-v1.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      ui.setAuthoringStatus(
        `${project.shader.preset.shaderId} exported for Orbital Engine · ${project.shaderManifest.checksum}`,
        false,
      );
    } catch (error) {
      ui.setAuthoringStatus(
        error instanceof Error ? error.message : "Render project export failed",
        true,
      );
    }
  },
  onSurfaceRegions: (assignments) => {
    surfaceRegions.splice(0, surfaceRegions.length, ...assignments);
    scene?.setSurfaceRegions(surfaceRegions);
  },
  onSurfaceRegionsEnabled: (enabled) => {
    scene?.setSurfaceRegionsEnabled(enabled);
  },
  onLivingSkinControls: (controls) => {
    livingSkinControls = controls;
    scene?.setLivingSkinControls(controls);
  },
  onCinematicSceneControls: (controls: CinematicSceneControls) => {
    cinematicSceneControls = controls;
    scene?.setCinematicSceneControls(controls);
  },
  onCinematicCameraFocus: (camera) => {
    scene?.focusCameraPreset(camera);
  },
  onShaderEventSoundControls: (controls) => {
    shaderEventSoundControls = controls;
    audio.setShaderEventSoundControls(controls);
  },
  onAuditionShaderEvent: () => {
    void (async () => {
      if (!audio.enabled) await audio.enable();
      audio.setShaderEventSoundControls(shaderEventSoundControls);
      audio.triggerShaderEvent();
      ui.setAudioEnabled(audio.enabled);
      ui.setAuthoringStatus("Shader-event ping auditioned through the browser preview", false);
    })();
  },
  onCaptureSocialStill: async (aspect, camera) => {
    if (!scene) return;
    const preset = SOCIAL_ASPECT_PRESETS[aspect];
    ui.setAuthoringStatus(`Rendering ${preset.label} · ${camera} camera`, false);
    try {
      const blob = await scene.captureSocialStill(preset.width, preset.height, camera);
      downloadBlob(blob, socialCaptureFilename("still", aspect, camera));
      ui.setAuthoringStatus(
        `${preset.width}×${preset.height} PNG exported · ${camera} camera`,
        false,
      );
    } catch (error) {
      ui.setAuthoringStatus(
        error instanceof Error ? error.message : "Social still export failed",
        true,
      );
    }
  },
  onRecordSocialClip: async (aspect, camera) => {
    if (!scene) return;
    const preset = SOCIAL_ASPECT_PRESETS[aspect];
    ui.setAuthoringStatus(
      `Recording 6 sec ${preset.label}${cinematicSceneControls.cameraTourEnabled ? " · smooth A/B/C camera route" : ` · ${camera} camera`} · keep this tab active`,
      false,
    );
    try {
      const blob = await scene.recordSocialClip(preset.width, preset.height, camera);
      downloadBlob(blob, socialCaptureFilename("clip", aspect, camera));
      ui.setAuthoringStatus(
        `6 sec ${preset.width}×${preset.height} WebM exported · ${cinematicSceneControls.cameraTourEnabled ? "smooth A/B/C camera route" : `${camera} camera`}`,
        false,
      );
    } catch (error) {
      ui.setAuthoringStatus(
        error instanceof Error ? error.message : "Social clip recording failed",
        true,
      );
    }
  },
  onTransportConnect: (protocol: TransportProtocol) => {
    const nowS = performance.now() / 1_000;
    liveTransport.connect(nowS);
    liveTransport.receiveCommand(
      makeTransportCommand({
        id: `virtual-start-${Math.round(nowS * 1_000)}`,
        protocol,
        kind: "start",
        issuedAtMonotonicS: nowS,
        ...(protocol === "osc" ? { address: "/orbital/transport/start" } : {}),
      }),
    );
    liveTransport.ingestClock({
      protocol,
      beat: showSequencer.currentBeat,
      receivedAtMonotonicS: nowS,
      sourceAtMonotonicS: nowS,
      sequence: 0,
    });
    ui.setAuthoringStatus(`${protocol.toUpperCase()} virtual clock connected · pulse it to hold lock`);
  },
  onTransportPulse: () => {
    const protocol = liveTransport.protocol;
    if (!protocol) {
      ui.setAuthoringStatus("Connect a virtual clock before sending a pulse", true);
      return;
    }
    const nowS = performance.now() / 1_000;
    liveTransport.ingestClock({
      protocol,
      beat: showSequencer.currentBeat,
      receivedAtMonotonicS: nowS,
      sourceAtMonotonicS: nowS,
    });
    ui.setAuthoringStatus(`${protocol.toUpperCase()} clock pulse received · no external device opened`);
  },
  onTransportDisconnect: () => {
    liveTransport.disconnect(performance.now() / 1_000);
    ui.setAuthoringStatus("Live clock bridge disconnected", false);
  },
  onRenderQuality: (mode: RenderQualityMode) => {
    const quality = renderQualityGovernor.setMode(mode);
    scene?.setRenderQuality(quality.effective);
    ui.updateRenderQuality(quality);
    ui.setAuthoringStatus(
      `${mode.toUpperCase()} preview quality selected · renderer only`,
      false,
    );
  },
  onDebug: (options: DebugOptions) => {
    scene?.setDebugOptions(options);
  },
});

setupRecordedTrackingLab();
scene = new OrbitalScene(ui.viewport, {
  projectorOutputCanvases: ui.getProjectorOutputCanvases(),
  onProjectorOutputFrame: (index) => ui.refreshProjectorOutputFrame(index),
});
let liveWorldForHud: { status: string; confidence: number } | null = null;
const cameraHud = new CameraHud(document.querySelector<HTMLElement>('.viewport-shell')!, {
  track: () => liveTracking.imageEllipse(),
  status: () => {
    const status = liveTracking.status, world = liveWorldForHud;
    return { status: world?.status ?? 'unavailable', confidence: world?.confidence ?? 0, connected: status.connection === 'connected', processingMs: status.processingMs, receivedFrames: status.receivedFrames };
  },
  onActiveChange: () => { /* the Test bench feed loop starts on its next status tick */ },
});
installViewportChrome(document.querySelector<HTMLElement>('.viewport-shell')!, document.getElementById('studio-shell')!);
installUpdateNotice(document.querySelector<HTMLElement>('.studio-header'));
let hudFrame: ImageBitmap | null = null;
testConsole = new TestConsole(document.querySelector<HTMLElement>('.control-column')!, {
  cameraFrame: (frame) => {
    const previous = hudFrame;
    hudFrame = frame.image instanceof ImageBitmap ? frame.image : null;
    cameraHud.pushFrame(frame);
    previous?.close();
  },
  wantsCameraFeed: () => cameraHud.isActive,
  trackedSpeedPxPerS: () => { const t = liveTracking.imageEllipse(); return t ? Math.hypot(t.velocityPxPerS[0], t.velocityPxPerS[1]) : null; },
  setLiveCalibration: (model) => { liveCalibration = structuredClone(model); },
  setProbeDark: (on) => scene?.setProbeDark(on),
  probeDarkDrawnAtMs: () => scene?.getProbeDarkRenderedAtMs() ?? null,
  setProjectionLeadS: (seconds) => { projectionLeadS = seconds; },
  blackout: (active) => { scene?.setOutputBlackout(active); ui.setOutputBlackout(active); },
  connectTracking: (url) => { liveTracking.setUrl(url); selectMode('live'); },
  prediction: (ms) => engine.setPredictionHorizonMs(ms),
  importGeometry: (value) => {
    const calibration = parseMonocularCalibration(value);
    calibration.sphereRadiusM = activeTestRig.ballDiameterM / 2;
    liveTracking.setMonocularCalibration(calibration);
    cameraGeometryRecord = structuredClone(calibration);
    return `Camera optics and pose loaded. Using the test ball diameter of ${(activeTestRig.ballDiameterM * 100).toFixed(0)} cm. Verify the pose matches the current camera location.`;
  },
  importProjection: (value) => {
    const result = parseProjectionCalibrationResult(value);
    if (!scene) throw new Error('Scene unavailable');
    scene.setProjectionRig(applyProjectionCalibrationToRig(scene.getProjectionRig(), result, DEFAULT_PROJECTION_CALIBRATION_SETTINGS));
    ui.updateProjectionCalibration(result);
    projectorCalibrationRecord = structuredClone(result);
    return `${result.mode.toUpperCase()} calibration loaded for ${result.projectors.length} projector(s). Validate the physical alignment before motion.`;
  },
  selectLook: (id) => ui.selectTestComposition(id),
  setupRig: (rig) => {
    const next = parseTestRigSetup(rig);
    scene?.setOutputBlackout(true); ui.setOutputBlackout(true);
    scene?.setTestRigSetup(next);
    activeTestRig = next;
    liveTracking.setMonocularCalibration(null);
    liveTracking.setPreviewGeometry(next.ballDiameterM / 2, next.ballCenterM);
    cameraGeometryRecord = null; projectorCalibrationRecord = null;
    ui.setTestOutputSize(next.outputWidthPx, next.outputHeightPx);
    if (engine.mode === 'simulation') engine.setTrackingAdapter(new TestRigPreviewAdapter(next));
  },
  nudgeRig: (rig) => {
    const next = parseTestRigSetup(rig);
    scene?.setTestRigSetup(next, { refocus: false });
    activeTestRig = next;
    liveTracking.setMonocularCalibration(null);
    liveTracking.setPreviewGeometry(next.ballDiameterM / 2, next.ballCenterM);
    cameraGeometryRecord = null; projectorCalibrationRecord = null;
    if (engine.mode === 'simulation') engine.setTrackingAdapter(new TestRigPreviewAdapter(next));
  },
  outputBlockReason: () => (scene ? scene.getOutputBlockReason(0) : 'WAITING_FOR_TRACKING'),
  projectedEdgeNote: () => scene?.getProjectedEdgeNote() ?? null,
  showPattern: (pattern, width, height) => ui.showCalibrationPattern(pattern, width, height),
  clearPattern: () => ui.clearCalibrationPattern(),
  hasProjectorWindow: () => ui.hasProjectorOneWindow(),
  projectorFullscreen: () => ui.requestProjectorFullscreen(),
  projectorWindowFullscreen: () => ui.projectorOneIsFullscreen(),
  projectorSurfaceSignature: () => ui.projectorOneSurfaceSignature(),
  outputRaster: () => ui.getOutputRaster(),
  useScanForLive: (result, surfaceSignature) => {
    applyScanToTwin(result);
    structuredLightScan = result;
    structuredLightSignature = result ? surfaceSignature : null;
    structuredLightLayoutCheck = { atMs: -Infinity, reason: null };
    scene?.setStructuredLightOutput(result ? { active: true, qualifies: scanQualifiesForLive(result), ellipse: structuredLightEllipse, blockReason: structuredLightBlockReason } : null);
  },
  configuration: () => ({ testRig: activeTestRig, cameraGeometry: cameraGeometryRecord, projectorCalibration: projectorCalibrationRecord, structuredLight: structuredLightScan ? { provenance: 'structured-light', result: structuredLightScan } : null, rig: scene?.getProjectionRig(), shaderPreset }),
});
document.querySelector<HTMLButtonElement>('[data-workspace-tab="test"]')?.click();
engine.setFanCueOverride(DEFAULT_FAN_PREVIEW_SPEED);
syncReducedMotion();
if (reducedMotionQuery?.addEventListener) {
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);
} else {
  reducedMotionQuery?.addListener(onReducedMotionChange);
}
scene.setShaderPreset(shaderPreset);
scene.setBalloonPhysicsControls(DEFAULT_BALLOON_PHYSICS_CONTROLS);
scene.setProjectionMaterialControls(DEFAULT_PROJECTION_MATERIAL_CONTROLS);
scene.setLivingSkinControls(DEFAULT_LIVING_SKIN_CONTROLS);
ui.setShaderThumbnailRenderer((preset, canvas) => scene?.renderShaderThumbnail(preset, canvas));
// The shader bench is the primary Phase One view. Calibration remains
// available in Tracking and output tests, but should not mask the selected
// procedural look on first load.
scene.setProjectionPattern("authored");
scene.setSurfaceRegions(surfaceRegions);
ui.restoreSelectedPreset();
ui.setPlaying(engine.playing);
ui.setAudioEnabled(audio.enabled);
ui.setMode(engine.mode);
ui.setCueStatus(false, 0, 0);
updateCueReplayUI();
ui.updateCameraRig(cameraRig.getState());
ui.updateSequencer(showSequencer.current, liveTransport.current);
ui.updateRenderQuality(renderQualityGovernor.snapshot());
if (contentStorage && score !== bundledScore) {
  ui.setAuthoringStatus("Restored saved score from this browser");
}

let previousFrameMs = performance.now();
let lastTwinRenderMs = 0;
let animationFrame = 0;
let testModeActive = false;
// About 24 fps: smooth enough to watch, while leaving the GPU to the projector output.
const TEST_MODE_TWIN_INTERVAL_MS = 42;

/**
 * Test mode is any state where the projector output matters more than the
 * digital twin: the Test bench workspace is open, or a projector window is
 * live. The twin drops to about 5 fps, the mapping-lab tiles stop, and the
 * render quality is pinned to low so the shared GPU stays with the output.
 */
function syncTestMode(): boolean {
  const active = ui.getActiveWorkspace() === "test" || ui.hasOpenOutputWindow();
  if (active !== testModeActive) {
    testModeActive = active;
    renderQualityGovernor.setOverride(active ? "low" : null);
    scene?.setLightweightPreview(active);
    root!.dataset.testMode = String(active);
  }
  return active;
}

let lastProjectorDriveMs = Number.NEGATIVE_INFINITY;
let lastDomUpdateMs = Number.NEGATIVE_INFINITY;
const DOM_UPDATE_INTERVAL_MS = 100;
const PROJECTOR_DRIVER_TIMEOUT_MS = 100;

/**
 * While a projector window is open its own requestAnimationFrame is the single
 * runtime driver. The control page only takes over if the projector stops
 * calling (window minimised or occluded), so the engine never ticks twice.
 */
function driveRuntimeFromProjector(nowMs: number, isDriver: boolean): void {
  if (!isDriver) return;
  lastProjectorDriveMs = nowMs;
  tickRuntime(nowMs, "projector-output");
}

let liveBridgeElements: Record<"connection" | "frames" | "drops" | "source" | "processing" | "endpoint", HTMLElement | null> | null = null;
function liveBridgeDom(): NonNullable<typeof liveBridgeElements> {
  if (!liveBridgeElements || (liveBridgeElements.connection && !liveBridgeElements.connection.isConnected)) {
    const get = (id: string) => document.getElementById(`live-bridge-${id}`);
    liveBridgeElements = { connection: get("connection"), frames: get("frames"), drops: get("drops"), source: get("source"), processing: get("processing"), endpoint: get("endpoint") };
  }
  return liveBridgeElements;
}

function tickRuntime(nowMs: number, driver: "dashboard" | "projector-output"): void {
  if (nowMs - previousFrameMs < 4) return;
  const renderDashboard = driver === "dashboard";
  root!.dataset.runtimeDriver = driver;
  const rawDeltaMs = Math.max(0, nowMs - previousFrameMs);
  const deltaS = Math.min(0.1, rawDeltaMs / 1_000);
  previousFrameMs = nowMs;
  const performanceSnapshot = performanceMonitor.sample(rawDeltaMs / 1_000);
  const renderQuality = renderQualityGovernor.update(
    performanceSnapshot,
    deltaS,
  );
  let snapshot: RuntimeSnapshot;
  const cameraState = cameraRig.tick(deltaS);
  processRecordedTrackingFrame(nowMs);
  if (cuePlayer) {
    cuePlayer.advance(deltaS);
    snapshot = cueStateToRuntimeSnapshot(cuePlayer.currentState, engine.showScore);
  } else {
    snapshot = engine.tick(deltaS);
    cueRecorder.capture(snapshot, nowMs / 1_000);
  }
  const previewSnapshot = ui.applyManualLayer(snapshot);
  showSequencer.setPlaying(cuePlayer ? cuePlayer.playing : engine.playing);
  showSequencer.seek(snapshot.showTimeS);
  const transportSnapshot = liveTransport.tick(deltaS);
  scene?.setRenderQuality(renderQuality.effective);
  const testMode = syncTestMode();
  // The twin redraws every dashboard frame normally, and at about 24 fps in
  // test mode or when the projector window is the driver.
  let renderTwin = renderDashboard && !testMode;
  if (testMode || !renderDashboard) {
    renderTwin = nowMs - lastTwinRenderMs >= TEST_MODE_TWIN_INTERVAL_MS;
  }
  // The Camera HUD covers the twin: skip drawing what nobody can see.
  if (cameraHud.coversTwin) renderTwin = false;
  if (renderTwin) lastTwinRenderMs = nowMs;
  scene?.update(previewSnapshot, deltaS, renderTwin);
  audio.update(previewSnapshot);
  audio.updateShaderEvents(
    previewSnapshot.showTimeS,
    livingSkinControls.enabled,
    livingSkinControls.bpm,
    livingSkinControls.phraseEvolution,
  );
  const liveStatus = liveTracking.status;
  // Metrics sample every tick; the console throttles its own DOM writes.
  autoSelectSource(nowMs);
  liveWorldForHud = snapshot.world.mode === 'live' ? snapshot.world : null;
  testConsole?.update(nowMs, rawDeltaMs, snapshot, liveStatus);
  // Everything below only writes text into the control page. About 10 Hz is
  // plenty for a human and keeps layout work out of the projector frame.
  if (nowMs - lastDomUpdateMs < DOM_UPDATE_INTERVAL_MS) return;
  lastDomUpdateMs = nowMs;
  ui.update(previewSnapshot);
  const { connection: liveConnection, frames: liveFrames, drops: liveDrops, source: liveSource, processing: liveProcessing, endpoint: liveEndpoint } = liveBridgeDom();
  if (liveConnection) liveConnection.textContent = liveStatus.connection.toUpperCase();
  if (liveFrames) liveFrames.textContent = liveStatus.receivedFrames.toString();
  if (liveDrops) liveDrops.textContent = liveStatus.droppedFrames.toString();
  if (liveProcessing) {
    liveProcessing.textContent = liveStatus.processingMs === null
      ? "WAITING"
      : `${liveStatus.processingMs.toFixed(2)} ms`;
  }
  if (liveSource) {
    liveSource.textContent = liveStatus.source === "physical-huateng"
      ? `HUATENG · ${liveStatus.activeCameraCount} CAMERA`
      : liveStatus.source === "simulated"
        ? `SIMULATED · ${liveStatus.activeCameraCount} CAMERAS`
        : "WAITING";
  }
  if (liveEndpoint) liveEndpoint.textContent = liveStatus.url;
  ui.updateAerodynamics(scene?.getAerodynamicState() ?? null);
  ui.updateProjectionCoverage(scene?.getProjectionCoverage() ?? null);
  ui.updatePerformance(performanceSnapshot);
  ui.updateRenderQuality(renderQuality);
  ui.updateSequencer(showSequencer.current, transportSnapshot);
  ui.updateCameraRig(cameraState);
  ui.setPlaying(engine.playing);
  root!.dataset.projectorDriven = String(nowMs - lastProjectorDriveMs < PROJECTOR_DRIVER_TIMEOUT_MS);
  ui.setCueStatus(
    cueRecorder.recording,
    cueRecorder.frameCount,
    cueRecorder.elapsedS,
  );
  updateCueReplayUI();
}

function frame(nowMs: number): void {
  if (nowMs - lastProjectorDriveMs > PROJECTOR_DRIVER_TIMEOUT_MS) tickRuntime(nowMs, "dashboard");
  animationFrame = requestAnimationFrame(frame);
}

animationFrame = requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  if (reducedMotionQuery?.removeEventListener) {
    reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
  } else {
    reducedMotionQuery?.removeListener(onReducedMotionChange);
  }
  testConsole?.dispose();
  audio.dispose();
  if (recordedTrackingObjectUrl) URL.revokeObjectURL(recordedTrackingObjectUrl);
  liveTracking.disconnect();
  scene?.dispose();
});
