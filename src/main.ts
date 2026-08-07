import "./style.css";

import { FanSafetySimulator } from "./adapters/FanSafetySimulator";
import { NullProjectionOutput } from "./adapters/NullProjectionOutput";
import { ReplayTrackingAdapter } from "./adapters/ReplayTrackingAdapter";
import { SyntheticTrackingAdapter } from "./adapters/SyntheticTrackingAdapter";
import { UnavailableLiveTrackingAdapter } from "./adapters/UnavailableLiveTrackingAdapter";
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
import { createDefaultSurfaceRegionAssignments } from "./core/mappingLab";
import {
  applyProjectionCalibrationToRig,
  runSimulatedAutomaticCalibration,
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
const cameraRig = new SyntheticCameraControlAdapter();
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
  predictionHorizonMs: 120,
});
const audio = new PreviewAudioEngine();
let showSequencer = new TimelineSequencer(createDefaultTimeline());

let scene: OrbitalScene | null = null;
let ui: StudioUI;
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

function selectMode(mode: RuntimeMode): void {
  if (cuePlayer) {
    cuePlayer = null;
    updateCueReplayUI("Cue replay cleared by runtime mode change");
  }
  if (mode === "simulation") {
    engine.setTrackingAdapter(new SyntheticTrackingAdapter());
  } else if (mode === "live") {
    engine.setTrackingAdapter(new UnavailableLiveTrackingAdapter());
  }
  engine.setInjectedTrackingLoss(false);
  ui.setMode(mode);
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
  onProjectionPattern: (pattern) => {
    scene?.setProjectionPattern(pattern);
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
  onSurfaceRegions: (assignments) => {
    surfaceRegions.splice(0, surfaceRegions.length, ...assignments);
    scene?.setSurfaceRegions(surfaceRegions);
  },
  onSurfaceRegionsEnabled: (enabled) => {
    scene?.setSurfaceRegionsEnabled(enabled);
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

scene = new OrbitalScene(ui.viewport);
engine.setFanCueOverride(DEFAULT_FAN_PREVIEW_SPEED);
syncReducedMotion();
if (reducedMotionQuery?.addEventListener) {
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);
} else {
  reducedMotionQuery?.addListener(onReducedMotionChange);
}
scene.setShaderPreset(shaderPreset);
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
let animationFrame = 0;

function frame(nowMs: number): void {
  const deltaS = Math.min(0.1, Math.max(0, (nowMs - previousFrameMs) / 1_000));
  previousFrameMs = nowMs;
  const performanceSnapshot = performanceMonitor.sample(deltaS);
  const renderQuality = renderQualityGovernor.update(
    performanceSnapshot,
    deltaS,
  );
  let snapshot: RuntimeSnapshot;
  const cameraState = cameraRig.tick(deltaS);
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
  scene?.update(previewSnapshot, deltaS);
  audio.update(previewSnapshot);
  ui.update(previewSnapshot);
  ui.updatePerformance(performanceSnapshot);
  ui.updateRenderQuality(renderQuality);
  ui.updateSequencer(showSequencer.current, transportSnapshot);
  ui.updateCameraRig(cameraState);
  ui.setPlaying(engine.playing);
  ui.setCueStatus(
    cueRecorder.recording,
    cueRecorder.frameCount,
    cueRecorder.elapsedS,
  );
  updateCueReplayUI();
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
  audio.dispose();
  scene?.dispose();
});
