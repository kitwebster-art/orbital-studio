import type {
  AudiovisualParameters,
  RuntimeMode,
  RuntimeSnapshot,
  ShowScore,
} from "../core/contracts";
import type { CameraRigState } from "../core/cameraControl";
import {
  CAMERA_PROFILES,
  DEFAULT_CAMERA_PROFILE_ID,
} from "../core/cameraControl";
import type {
  ProjectionPattern,
  ProjectorLevels,
} from "../core/projectionRig";
import {
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  warpCornersToCss,
  type ProjectionCalibrationResult,
  type ProjectionCalibrationSettings,
} from "../core/projectionCalibration";
import {
  MAPPING_VIEW_MODES,
  SURFACE_REGION_DEFINITIONS,
  createDefaultSurfaceRegionAssignments,
  mappingViewLabel,
  type MappingViewMode,
  type SurfaceRegionAssignment,
} from "../core/mappingLab";
import type { PerformanceSnapshot } from "../core/performanceMonitor";
import {
  RENDER_QUALITY_MODES,
  RENDER_QUALITY_PROFILES,
  type RenderQualityMode,
  type RenderQualitySnapshot,
} from "../core/renderQuality";
import type { LiveTransportSnapshot, TransportProtocol } from "../core/liveTransport";
import type { TimelineFrame } from "../core/sequencer";
import {
  CURATED_SHADER_REGISTRY,
  SHADER_PRESET_CATALOG,
  SHADER_PRESET_VARIANTS_PER_SHADER,
  createShaderPreset,
  getShaderDefinition,
  shaderCardMatchesSearch,
  type ShaderPresetCard,
  type ShaderDefinition,
  type ShaderPreset,
} from "../core/shaderRegistry";
import {
  DEFAULT_SHADER_LOOK_CONTROLS,
  SHADER_LOOK_CONTROL_DEFINITIONS,
  normaliseShaderLookControls,
  type ShaderLookControlId,
  type ShaderLookControls,
} from "../core/shaderLookControls";
import {
  updateMovementCurve,
  updateMovementDuration,
  updateMovementMetadata,
  type CurveParameterKey,
} from "../core/contentPresets";
import { clamp, formatTime } from "../core/math";
import {
  DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS,
  DEFAULT_FAN_PREVIEW_SPEED,
  fanSpeedToClearanceM,
  type EnvironmentPreviewControls,
} from "../core/environmentPreview";
import {
  createStudioPresetOverride,
  readStudioPresetOverrides,
  writeStudioPresetOverrides,
  type StudioPresetOverrideMap,
} from "../core/studioPresetOverrides";

export interface DebugOptions {
  projectors: boolean;
  prediction: boolean;
  speakers: boolean;
  room: boolean;
}

export interface StudioCallbacks {
  onPlayToggle(): void;
  onReset(): void;
  onSeek(timeS: number): void;
  onRate(rate: number): void;
  onMode(mode: RuntimeMode): void;
  onAudioToggle(): void;
  onReplayFile(file: File): void;
  onScoreChange(score: ShowScore): void;
  onSavePreset(score: ShowScore): void;
  onExportPreset(score: ShowScore): void;
  onImportPreset(file: File): void;
  onResetScore(): void;
  onCueRecordToggle(): void;
  onCueExport(): void;
  onCueClear(): void;
  onCueLoad(file: File): void;
  onCuePlayToggle(): void;
  onCueReset(): void;
  onCueSeek(positionS: number): void;
  onInjectedLoss(enabled: boolean): void;
  onFanFault(enabled: boolean): void;
  onFanCueOverride(cue: number | null): void;
  onEnvironmentControls(controls: EnvironmentPreviewControls): void;
  onProjectionPattern(pattern: ProjectionPattern): void;
  onProjectionCalibration(settings: ProjectionCalibrationSettings): void;
  onMappingView(view: MappingViewMode): void;
  onShaderPreviewExposure(exposure: number): void;
  onShaderLookControls(controls: ShaderLookControls): void;
  onCameraDiscover(): void;
  onCameraArm(): void;
  onCameraStreamToggle(): void;
  onCameraProfile(profileId: string): void;
  onCameraSettings(exposureUs: number, gainDb: number): void;
  onShaderSelect(shaderId: string): void;
  onShaderPreset(preset: ShaderPreset): void;
  onSurfaceRegions(assignments: readonly SurfaceRegionAssignment[]): void;
  onSurfaceRegionsEnabled(enabled: boolean): void;
  onTransportConnect(protocol: TransportProtocol): void;
  onTransportPulse(): void;
  onTransportDisconnect(): void;
  onRenderQuality(mode: RenderQualityMode): void;
  onDebug(options: DebugOptions): void;
}

const OVERRIDABLE_PARAMETERS: Array<{
  key: keyof AudiovisualParameters;
  label: string;
}> = [
  { key: "brightness", label: "Brightness" },
  { key: "visualDensity", label: "Visual density" },
  { key: "fluidity", label: "Fluidity" },
  { key: "fracture", label: "Fracture" },
  { key: "glitch", label: "Glitch" },
  { key: "organic", label: "Organic" },
  { key: "melody", label: "Melody" },
  { key: "sub", label: "Sub field" },
  { key: "residualGain", label: "Residual response" },
] as const;

const EDITOR_PARAMETERS: Array<{
  key: CurveParameterKey;
  label: string;
}> = [
  { key: "energy", label: "Energy" },
  { key: "brightness", label: "Brightness" },
  { key: "visualDensity", label: "Visual density" },
  { key: "fluidity", label: "Fluidity" },
  { key: "fracture", label: "Fracture" },
  { key: "glitch", label: "Glitch" },
  { key: "organic", label: "Organic" },
  { key: "melody", label: "Melody" },
  { key: "sub", label: "Sub field" },
  { key: "spatialMotion", label: "Spatial motion" },
  { key: "residualGain", label: "Residual response" },
  { key: "predictionVisibility", label: "Prediction visibility" },
  { key: "fanCue", label: "Fan cue" },
];

// Keep the first viewportful of the all-families shelf useful for comparison.
// Filtered views still expose every deterministic look for each algorithm.
const SHADER_SHELF_FAMILY_ORDER = [
  "geometric",
  "water",
  "fire",
  "matrix",
  "turbulence",
  "fluid",
  "contour",
  "planetary",
  "fracture",
  "particle",
  "residual",
  "neutral",
] as const;

const SHADER_PREVIEW_CLASSES = SHADER_SHELF_FAMILY_ORDER.map(
  (family) => `shader-preview-${family}`,
);
const SHADER_ALGORITHM_PREVIEW_CLASSES = CURATED_SHADER_REGISTRY.shaders.map(
  (shader) => `shader-preview-${shader.id}`,
);
const SHADER_CATALOG_PAGE_SIZE = 72;

function formatCueDuration(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const tenths = Math.floor((safe % 1) * 10);
  return `${formatTime(safe)}.${tenths}`;
}

function formatShaderParameter(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : String(value);
}

function formatShaderLookControl(id: ShaderLookControlId, value: number): string {
  return id === "motion" ? `${value.toFixed(2)}×` : value.toFixed(2);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character,
  );
}

export class StudioUI {
  readonly viewport: HTMLElement;
  private readonly callbacks: StudioCallbacks;
  private score: ShowScore;
  private readonly elements: Record<string, HTMLElement>;
  private readonly scrubber: HTMLInputElement;
  private readonly timeline: HTMLElement;
  private readonly movementEditorSelect: HTMLSelectElement;
  private readonly curveParameterSelect: HTMLSelectElement;
  private readonly curveStartInput: HTMLInputElement;
  private readonly curvePeakInput: HTMLInputElement;
  private readonly curveEndInput: HTMLInputElement;
  private readonly curvePeakAtInput: HTMLInputElement;
  private readonly curveUsePeakInput: HTMLInputElement;
  private readonly movementDurationInput: HTMLInputElement;
  private readonly movementMajorPeakInput: HTMLInputElement;
  private readonly cueReplayScrubber: HTMLInputElement;
  private readonly parameterInputs = new Map<
    keyof AudiovisualParameters,
    HTMLInputElement
  >();
  private selectedMovementId: string;
  private manualLayer = false;
  private cueReplayActive = false;
  private cameraSettingsFocused: string | null = null;
  private lastCameraHealthSignature = "";
  private lastRenderQualitySignature = "";
  private selectedShaderId = CURATED_SHADER_REGISTRY.fallbackShaderId;
  private shaderLookControls: ShaderLookControls = {
    ...DEFAULT_SHADER_LOOK_CONTROLS,
  };
  private shaderCatalogSearch = "";
  private shaderCatalogFamily = "all";
  private shaderCatalogTag = "all";
  private shaderCatalogGpu = "all";
  private shaderCatalogLimit = SHADER_CATALOG_PAGE_SIZE;
  private projectionPattern: ProjectionPattern = "authored";
  private readonly projectorOutputModes: Array<"pre" | "post"> = [
    "post", "post", "post", "post", "post",
  ];
  private projectionCalibrationSettings: ProjectionCalibrationSettings = {
    ...DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  };
  private selectedCatalogCardId = "geometric-grid-01";
  private recentShaderCardIds: string[] = ["geometric-grid-01"];
  private activeRegionId = SURFACE_REGION_DEFINITIONS[0]?.id ?? "north-cap";
  private surfaceRegions = [...createDefaultSurfaceRegionAssignments()];
  private surfaceRegionsEnabled = false;
  private currentShaderPreset: ShaderPreset = createShaderPreset("geometric-grid");
  private previewExposure = 0.68;
  private environmentControls: EnvironmentPreviewControls = {
    ...DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS,
  };
  private readonly presetStorage: Storage | null;
  private presetOverrides: StudioPresetOverrideMap;
  private lastSnapshot: RuntimeSnapshot | null = null;
  private debugOptions: DebugOptions = {
    projectors: true,
    prediction: true,
    speakers: true,
    room: true,
  };

  constructor(
    root: HTMLElement,
    score: ShowScore,
    callbacks: StudioCallbacks,
  ) {
    this.score = score;
    this.selectedMovementId = score.movements[0]?.id ?? "";
    this.callbacks = callbacks;
    this.presetStorage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    this.presetOverrides = readStudioPresetOverrides(this.presetStorage);
    root.innerHTML = this.template();
    this.viewport = this.requireElement(root, "orbital-viewport");
    this.scrubber = this.requireInput(root, "show-scrubber");
    this.timeline = this.requireElement(root, "movement-timeline");
    this.movementEditorSelect = this.requireSelect(
      root,
      "movement-editor-select",
    );
    this.curveParameterSelect = this.requireSelect(root, "curve-parameter");
    this.curveStartInput = this.requireInput(root, "curve-start");
    this.curvePeakInput = this.requireInput(root, "curve-peak");
    this.curveEndInput = this.requireInput(root, "curve-end");
    this.curvePeakAtInput = this.requireInput(root, "curve-peak-at");
    this.curveUsePeakInput = this.requireInput(root, "curve-use-peak");
    this.movementDurationInput = this.requireInput(
      root,
      "movement-duration",
    );
    this.movementMajorPeakInput = this.requireInput(
      root,
      "movement-major-peak",
    );
    this.cueReplayScrubber = this.requireInput(root, "cue-replay-scrubber");
    this.elements = {
      playButton: this.requireElement(root, "play-button"),
      audioButton: this.requireElement(root, "audio-button"),
      time: this.requireElement(root, "transport-time"),
      movement: this.requireElement(root, "movement-name"),
      movementIndex: this.requireElement(root, "movement-index"),
      movementDescription: this.requireElement(
        root,
        "movement-description",
      ),
      status: this.requireElement(root, "tracking-status"),
      mode: this.requireElement(root, "mode-readout"),
      confidence: this.requireElement(root, "confidence-value"),
      sourceAge: this.requireElement(root, "source-age-value"),
      cameras: this.requireElement(root, "camera-count-value"),
      residual: this.requireElement(root, "residual-value"),
      position: this.requireElement(root, "position-value"),
      velocity: this.requireElement(root, "velocity-value"),
      fanRequested: this.requireElement(root, "fan-requested-value"),
      fanActual: this.requireElement(root, "fan-actual-value"),
      fanState: this.requireElement(root, "fan-state-value"),
      activeShaderReadout: this.requireElement(root, "active-shader-readout"),
      parameterReadout: this.requireElement(root, "parameter-readout"),
      liveNotice: this.requireElement(root, "live-notice"),
      authoringStatus: this.requireElement(root, "authoring-status"),
      cueRecordButton: this.requireElement(root, "record-cue-stream"),
      cueStatus: this.requireElement(root, "cue-status"),
      cueFrameCount: this.requireElement(root, "cue-frame-count"),
      cueDuration: this.requireElement(root, "cue-duration"),
      cueReplayPlayButton: this.requireElement(root, "cue-replay-play"),
      cueReplayResetButton: this.requireElement(root, "cue-replay-reset"),
      cueReplayStatus: this.requireElement(root, "cue-replay-status"),
      cueReplayFrameCount: this.requireElement(root, "cue-replay-frame-count"),
      cueReplayDuration: this.requireElement(root, "cue-replay-duration"),
      cueReplayPosition: this.requireElement(root, "cue-replay-position"),
      projectionStatus: this.requireElement(root, "projection-rig-status"),
      projectionCalibration: this.requireElement(root, "projection-calibration-status"),
      cameraRigStatus: this.requireElement(root, "camera-rig-status"),
      cameraCount: this.requireElement(root, "camera-rig-count"),
      cameraProfile: this.requireElement(root, "camera-profile-readout"),
      cameraHealth: this.requireElement(root, "camera-health-list"),
      cameraExposure: this.requireInput(root, "camera-exposure"),
      cameraGain: this.requireInput(root, "camera-gain"),
      performanceFps: this.requireElement(root, "performance-fps"),
      performanceFrameTime: this.requireElement(root, "performance-frame-time"),
      performanceP95: this.requireElement(root, "performance-p95"),
      performanceStatus: this.requireElement(root, "performance-status"),
      renderQuality: this.requireElement(root, "render-quality"),
      renderQualityStatus: this.requireElement(root, "render-quality-status"),
      renderQualityBudget: this.requireElement(root, "render-quality-budget"),
      shaderFamily: this.requireElement(root, "shader-family"),
      shaderGpu: this.requireElement(root, "shader-gpu"),
      shaderDescription: this.requireElement(root, "shader-description"),
      shaderParameters: this.requireElement(root, "shader-parameters"),
      shaderLookControls: this.requireElement(root, "shader-look-controls"),
      shaderLookReset: this.requireElement(root, "reset-shader-look-controls"),
      shaderReset: this.requireElement(root, "reset-selected-shader"),
      shaderUpdate: this.requireElement(root, "update-selected-shader"),
      sequencerBeat: this.requireElement(root, "sequencer-beat"),
      sequencerBar: this.requireElement(root, "sequencer-bar"),
      sequencerPhrase: this.requireElement(root, "sequencer-phrase"),
      sequencerTrack: this.requireElement(root, "sequencer-track"),
      transportState: this.requireElement(root, "transport-state"),
      transportProtocol: this.requireElement(root, "transport-protocol-readout"),
      transportAge: this.requireElement(root, "transport-age"),
      curveStartValue: this.requireElement(root, "curve-start-value"),
      curvePeakValue: this.requireElement(root, "curve-peak-value"),
      curveEndValue: this.requireElement(root, "curve-end-value"),
      curvePeakAtValue: this.requireElement(root, "curve-peak-at-value"),
      phaseOneStatus: this.requireElement(root, "phase-one-status"),
      mappingViewReadout: this.requireElement(root, "mapping-view-readout"),
      shaderCatalog: this.requireElement(root, "shader-catalog"),
      shaderCatalogCount: this.requireElement(root, "shader-catalog-count"),
      shaderCatalogMore: this.requireElement(root, "shader-catalog-more"),
      regionAssignments: this.requireElement(root, "region-assignments"),
      regionActive: this.requireElement(root, "region-active"),
      fanTestCue: this.requireInput(root, "fan-test-cue"),
      fanTestCueValue: this.requireElement(root, "fan-test-cue-value"),
      fanTestOverride: this.requireInput(root, "fan-test-override"),
      fanHoverClearance: this.requireElement(root, "fan-hover-clearance"),
      warehouseEnabled: this.requireInput(root, "warehouse-enabled"),
      peopleEnabled: this.requireInput(root, "warehouse-people"),
      environmentLighting: this.requireInput(root, "environment-lighting"),
      environmentLightingValue: this.requireElement(root, "environment-lighting-value"),
    };
    this.bind(root);
    this.buildTimeline();
    this.buildEditorOptions();
    this.buildParameterControls(root);
    this.buildShaderOptions(root);
    this.buildShaderCatalog();
    this.renderRecentShaderCards();
    this.buildRegionControls();
    this.syncEditorControls();
  }

  update(snapshot: RuntimeSnapshot): void {
    this.lastSnapshot = snapshot;
    const world = snapshot.world;
    this.elements.time.textContent = `TEST LOOP · ${formatTime(snapshot.showTimeS)}`;
    this.elements.movement.textContent = snapshot.movement.name;
    this.elements.movementIndex.textContent = `${(
      this.score.movements.findIndex(
        (movement) => movement.id === snapshot.movement.id,
      ) + 1
    )
      .toString()
      .padStart(2, "0")} / ${this.score.movements.length
      .toString()
      .padStart(2, "0")}`;
    this.elements.movementDescription.textContent =
      snapshot.movement.description;
    this.elements.status.textContent = world.status;
    this.elements.status.dataset.status = world.status;
    this.elements.phaseOneStatus.textContent = world.mode === "live"
      ? `${world.status.toUpperCase()} · ${world.diagnostics.activeCameraCount} physical cameras · ${world.diagnostics.sourceAgeMs.toFixed(1)} ms source age`
      : `${world.status.toUpperCase()} · synthetic ${world.diagnostics.activeCameraCount}-view solver · 0 physical cameras`;
    this.elements.mode.textContent = this.cueReplayActive
      ? "cue replay"
      : world.mode;
    this.elements.confidence.textContent = `${Math.round(
      world.confidence * 100,
    )}%`;
    this.elements.sourceAge.textContent = `${world.diagnostics.sourceAgeMs.toFixed(
      1,
    )} ms`;
    this.elements.cameras.textContent = world.mode === "live"
      ? world.diagnostics.activeCameraCount.toString()
      : "0 physical";
    const residual = world.prediction?.residualM;
    this.elements.residual.textContent = residual
      ? `${(Math.hypot(residual.x, residual.y, residual.z) * 1_000).toFixed(
          0,
        )} mm`
      : "suppressed";
    this.elements.position.textContent = world.centerM
      ? `${world.centerM.x.toFixed(2)}, ${world.centerM.y.toFixed(
          2,
        )}, ${world.centerM.z.toFixed(2)} m`
      : "unavailable";
    this.elements.velocity.textContent = world.velocityMps
      ? `${Math.hypot(
          world.velocityMps.x,
          world.velocityMps.y,
          world.velocityMps.z,
        ).toFixed(2)} m/s`
      : "unavailable";
    this.elements.fanRequested.textContent = `${Math.round(
      snapshot.fan.requestedCue * 100,
    )}%`;
    this.elements.fanActual.textContent = `${Math.round(
      snapshot.fan.actualNormalized * 100,
    )}%`;
    this.elements.fanHoverClearance.textContent = `${fanSpeedToClearanceM(
      snapshot.fan.actualNormalized,
    ).toFixed(1)} m`;
    this.elements.fanState.textContent = snapshot.fan.fault
      ? snapshot.fan.fault
      : snapshot.fan.controllerHealthy
        ? "SIMULATED / HEALTHY"
        : "SIMULATED / DEGRADED";
    this.elements.fanState.dataset.fault = snapshot.fan.fault
      ? "true"
      : "false";
    this.elements.liveNotice.hidden = world.mode !== "live";
    this.scrubber.value = snapshot.showTimeS.toString();
    this.updateTimeline(snapshot);
    this.updateParameters(snapshot.audiovisual);
    this.updateQuad(snapshot.quadLevels);
    this.updateProjectors(snapshot.projectorLevels);
  }

  updateCameraRig(state: CameraRigState): void {
    this.elements.cameraRigStatus.textContent = `VIRTUAL ${state.state.toUpperCase()}`;
    this.elements.cameraRigStatus.dataset.state = state.state;
    this.elements.cameraCount.textContent = `VIRTUAL ${state.activeCount}/${state.targetCount}`;
    const profile = CAMERA_PROFILES.find(
      (candidate) => candidate.id === state.profileId,
    );
    this.elements.cameraProfile.textContent = profile
      ? `${profile.vendor} ${profile.model}`
      : state.profileId;
    const firstDevice = state.devices[0];
    if (firstDevice && this.cameraSettingsFocused === null) {
      (this.elements.cameraExposure as HTMLInputElement).value = firstDevice.exposureUs.toString();
      (this.elements.cameraGain as HTMLInputElement).value = firstDevice.gainDb.toString();
    }
    const streamButton = document.querySelector<HTMLButtonElement>(
      "#camera-stream",
    );
    if (streamButton) {
      streamButton.textContent = state.state === "streaming" ? "Stop stream" : "Start stream";
      streamButton.dataset.streaming = String(state.state === "streaming");
    }
    const healthSignature = state.devices
      .map(
        (device) =>
          `${device.id}:${device.state}:${device.fps.toFixed(1)}:${device.latencyMs.toFixed(1)}:${device.droppedFrames}`,
      )
      .join("|");
    if (healthSignature !== this.lastCameraHealthSignature) {
      this.elements.cameraHealth.innerHTML = state.devices
        .map(
          (device) => `
            <div class="camera-health-row" data-camera-state="${device.state}">
              <span>${device.label}</span>
              <strong>${device.state}</strong>
              <small>${device.state === "streaming" ? `${device.fps.toFixed(1)} fps · ${device.latencyMs.toFixed(1)} ms` : "idle · virtual"}</small>
            </div>`,
        )
        .join("");
      this.lastCameraHealthSignature = healthSignature;
    }
  }

  updateProjectionCalibration(result: ProjectionCalibrationResult): void {
    this.elements.projectionCalibration.textContent =
      result.mode === "measured" ? "MEASURED" : "SIMULATED SOLVE";
    this.elements.projectionCalibration.dataset.state = result.mode;
    const summary = document.getElementById("calibration-summary");
    if (summary) {
      summary.innerHTML = `<strong>${result.projectors.length}/5 warp meshes ready</strong><span>${result.globalErrorPx.toFixed(2)} px rehearsal error · ${result.overlapCoveragePercent.toFixed(1)}% overlap</span>`;
    }
    const stageList = document.getElementById("calibration-stages");
    if (stageList) {
      stageList.innerHTML = result.stages.map((stage, index) =>
        `<li data-complete="${stage.complete}"><i>${index + 1}</i><span>${escapeHtml(stage.label)}</span><strong>${stage.complete ? "READY" : "WAIT"}</strong></li>`,
      ).join("");
    }
    result.projectors.forEach((projector, index) => {
      const tile = document.querySelector<HTMLElement>(
        `[data-output-view="projector-${index + 1}"]`,
      );
      const preview = tile?.querySelector<HTMLElement>(".output-tile-preview");
      const canvas = preview?.querySelector<HTMLCanvasElement>("canvas");
      if (canvas) {
        canvas.dataset.warpPolygon = warpCornersToCss(projector.warpCorners);
        canvas.dataset.calibrated = "true";
      }
      const label = tile?.querySelector<HTMLElement>("small");
      if (label) {
        label.textContent = `${projector.meanErrorPx.toFixed(2)} px · post-warp + blend`;
      }
    });
    this.refreshOpenOutputInspector();
    this.setAuthoringStatus(
      "Five simulated warp meshes and overlap masks built · connect cameras for a measured solve",
      false,
    );
  }

  getProjectorOutputCanvases(): HTMLCanvasElement[] {
    return Array.from(
      document.querySelectorAll<HTMLCanvasElement>("canvas[data-projector-output]"),
    );
  }

  refreshProjectorOutputFrame(index: number): void {
    const inspector = document.getElementById("output-inspector");
    if (!inspector || inspector.hidden || inspector.dataset.view !== `projector-${index + 1}`) {
      return;
    }
    const source = document.querySelector<HTMLCanvasElement>(
      `canvas[data-projector-output="${index}"]`,
    );
    const target = document.getElementById("output-inspector-canvas") as HTMLCanvasElement | null;
    if (!source || !target) return;
    if (target.width !== source.width || target.height !== source.height) {
      target.width = source.width;
      target.height = source.height;
    }
    target.getContext("2d")?.drawImage(source, 0, 0);
  }

  setCameraMessage(message: string, error = false): void {
    this.elements.cameraProfile.textContent = message;
    this.elements.cameraProfile.dataset.error = String(error);
  }

  updatePerformance(metrics: PerformanceSnapshot): void {
    this.elements.performanceFps.textContent = `${metrics.fps.toFixed(1)} fps`;
    this.elements.performanceFrameTime.textContent = `${metrics.frameTimeMs.toFixed(1)} ms`;
    this.elements.performanceP95.textContent = `${metrics.p95FrameTimeMs.toFixed(1)} ms`;
    this.elements.performanceStatus.textContent = metrics.frameTimeMs === 0
      ? "WARMING"
      : metrics.p95FrameTimeMs > metrics.targetFrameTimeMs * 2
        ? "OVER BUDGET"
        : "STABLE";
    this.elements.performanceStatus.dataset.stable = String(metrics.stable);
    this.elements.performanceStatus.dataset.status = metrics.frameTimeMs === 0
      ? "warming"
      : metrics.p95FrameTimeMs > metrics.targetFrameTimeMs * 2
        ? "over-budget"
        : "stable";
  }

  updateRenderQuality(snapshot: RenderQualitySnapshot): void {
    const select = this.elements.renderQuality as HTMLSelectElement;
    if (select.value !== snapshot.requested) {
      select.value = snapshot.requested;
    }
    const profile = RENDER_QUALITY_PROFILES[snapshot.effective];
    const status = snapshot.status === "over-budget"
      ? "OVER BUDGET"
      : snapshot.status === "warming"
        ? "WARMING"
        : "STABLE";
    const signature = `${snapshot.requested}:${snapshot.effective}:${snapshot.status}:${snapshot.transitions}`;
    if (signature !== this.lastRenderQualitySignature) {
      this.lastRenderQualitySignature = signature;
      this.elements.renderQualityStatus.textContent = `${snapshot.requested.toUpperCase()} · ${profile.label.toUpperCase()} · ${status}`;
      this.elements.renderQualityStatus.dataset.status = snapshot.status;
    }
    this.elements.renderQualityBudget.textContent = `P95 ${snapshot.p95FrameTimeMs.toFixed(1)} ms / ${(snapshot.targetFrameTimeMs).toFixed(1)} ms target · ${profile.maxPixelRatio}× max DPR`;
  }

  updateSequencer(frame: TimelineFrame, transport: LiveTransportSnapshot): void {
    this.elements.sequencerBeat.textContent = frame.position.beat.toFixed(2);
    this.elements.sequencerBar.textContent = `${frame.position.bar} · ${frame.position.beatInBar.toFixed(2)}`;
    this.elements.sequencerPhrase.textContent = `${frame.position.phrase} · ${frame.position.beatInPhrase.toFixed(2)}`;
    const activeTracks = frame.tracks.filter((track) => track.value !== undefined).length;
    this.elements.sequencerTrack.textContent = `${activeTracks}/${frame.tracks.length} tracks`;
    this.elements.transportState.textContent = transport.fallbackActive
      ? "FALLBACK"
      : transport.state.toUpperCase();
    this.elements.transportState.dataset.state = transport.fallbackActive
      ? "fallback"
      : transport.state;
    this.elements.transportProtocol.textContent = transport.protocol?.toUpperCase() ?? "NONE";
    this.elements.transportAge.textContent = transport.diagnostics.sourceAgeMs === null
      ? "—"
      : `${transport.diagnostics.sourceAgeMs.toFixed(0)} ms`;
  }

  setShaderDefinition(shader: ShaderDefinition, preset?: ShaderPreset): void {
    this.selectedShaderId = shader.id;
    const select = this.requireSelect(document, "shader-select");
    select.value = shader.id;
    this.elements.shaderFamily.textContent = shader.family.toUpperCase();
    this.elements.shaderGpu.textContent = `${shader.gpuCost.toUpperCase()} · ${shader.gpuEstimate.passes} pass`;
    this.elements.shaderDescription.textContent = shader.description;
    const resolvedPreset = preset ?? createShaderPreset(shader.id);
    this.currentShaderPreset = resolvedPreset;
    const selectedCard = SHADER_PRESET_CATALOG.find(
      (card) =>
        card.preset.shaderId === resolvedPreset.shaderId &&
        card.preset.seed === resolvedPreset.seed,
    ) ?? SHADER_PRESET_CATALOG.find(
      (card) =>
        card.id === this.selectedCatalogCardId &&
        card.preset.shaderId === shader.id,
    );
    const selectedLook = selectedCard?.name ?? `${shader.name} / custom`;
    this.elements.activeShaderReadout.textContent = selectedCard
      ? `${selectedLook} · ${shader.family}`
      : `${selectedLook} · custom`;
    this.updateShaderOutputPreview(shader, resolvedPreset);
    if (selectedCard) {
      this.selectedCatalogCardId = selectedCard.id;
      this.rememberShaderCard(selectedCard.id);
    }
    this.renderShaderCatalog();
    this.elements.shaderParameters.innerHTML = shader.parameterDefinitions
      .map((parameter) => {
        const value = resolvedPreset.parameters[parameter.id];
        const numeric = typeof value === "number";
        const min = parameter.min ?? (parameter.type === "unit" ? 0 : 0);
        const max = parameter.max ?? (parameter.type === "unit" ? 1 : 1);
        return `
          <label class="shader-parameter" data-shader-parameter="${parameter.id}">
            <span>${parameter.label}</span><output>${formatShaderParameter(value)}</output>
            ${numeric
              ? `<input type="range" min="${min}" max="${max}" step="${parameter.step ?? 0.01}" value="${value}" data-shader-input="${parameter.id}" aria-label="${parameter.label}">`
              : `<small>${formatShaderParameter(value)}</small>`}
          </label>`;
      })
      .join("");
    this.elements.shaderParameters
      .querySelectorAll<HTMLInputElement>("[data-shader-input]")
      .forEach((input) => {
        input.addEventListener("input", () => {
          const nextParameters = Object.fromEntries(
            shader.parameterDefinitions.map((parameter) => {
              const current = this.elements.shaderParameters.querySelector<HTMLInputElement>(
                `[data-shader-input="${parameter.id}"]`,
              );
              return [
                parameter.id,
                current ? Number(current.value) : resolvedPreset.parameters[parameter.id],
              ];
            }),
          );
          const output = input.parentElement?.querySelector("output");
          if (output) {
            output.textContent = formatShaderParameter(Number(input.value));
          }
          try {
            const nextPreset = createShaderPreset(shader.id, nextParameters, resolvedPreset.seed);
            this.currentShaderPreset = nextPreset;
            this.updateShaderOutputPreview(shader, nextPreset);
            this.callbacks.onShaderPreset(nextPreset);
          } catch (error) {
            this.setAuthoringStatus(
              error instanceof Error ? error.message : "Shader parameter rejected",
              true,
            );
          }
        });
      });
  }

  restoreSelectedPreset(): void {
    const card = SHADER_PRESET_CATALOG.find(
      (candidate) => candidate.id === this.selectedCatalogCardId,
    );
    if (card) {
      this.activateShaderCard(card);
    }
  }

  private updateShaderOutputPreview(shader: ShaderDefinition, resolvedPreset: ShaderPreset): void {
    const selectedCard = SHADER_PRESET_CATALOG.find(
      (card) =>
        card.preset.shaderId === resolvedPreset.shaderId &&
        card.preset.seed === resolvedPreset.seed,
    ) ?? SHADER_PRESET_CATALOG.find(
      (card) =>
        card.id === this.selectedCatalogCardId &&
        card.preset.shaderId === shader.id,
    );
    const selectedLook = selectedCard?.name ?? `${shader.name} / custom`;
    const numericPreviewValues = shader.parameterDefinitions
      .map((parameter) => resolvedPreset.parameters[parameter.id])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const previewScale = 0.82 + clamp(numericPreviewValues[0] ?? 0.5, 0, 1) * 0.3;
    const previewRotation = Math.round(clamp(numericPreviewValues[1] ?? 0.5, 0, 1) * 360);
    const outputGrid = document.getElementById("output-grid");
    if (!outputGrid) {
      return;
    }
    outputGrid.dataset.shaderFamily = shader.family;
    outputGrid.dataset.shaderId = shader.id;
    outputGrid.dataset.shaderSeed = String(resolvedPreset.seed);
    outputGrid.dataset.shaderVariant = selectedCard ? String(selectedCard.variant) : "custom";
    outputGrid.dataset.shaderLook = selectedLook;
    const displayLook = selectedLook.toLowerCase().includes(shader.family)
      ? selectedLook
      : `${selectedLook} · ${shader.family}`;
    outputGrid.querySelectorAll<HTMLElement>(".output-tile-preview").forEach((preview) => {
      preview.classList.remove(...SHADER_PREVIEW_CLASSES, ...SHADER_ALGORITHM_PREVIEW_CLASSES);
      preview.classList.add(`shader-preview-${shader.family}`, `shader-preview-${shader.id}`);
      preview.style.setProperty("--shader-seed", String(resolvedPreset.seed % 97));
      preview.style.setProperty("--shader-preview-scale", previewScale.toFixed(3));
      preview.style.setProperty("--shader-preview-rotation", `${previewRotation}deg`);
    });
    outputGrid.querySelectorAll<HTMLElement>(".output-tile small").forEach((label, index) => {
      const mode = this.projectorOutputModes[index] === "pre" ? "pre-mapping" : "post-mapping";
      label.textContent = `${displayLook} · ${mode} · live`;
    });
    const view = outputGrid.dataset.viewMode as MappingViewMode;
    this.updateOutputViewSemantics(MAPPING_VIEW_MODES.includes(view) ? view : "sphere");
    this.refreshOpenOutputInspector();
  }

  private updateOutputViewSemantics(view: MappingViewMode): void {
    const outputGrid = document.getElementById("output-grid");
    if (!outputGrid) {
      return;
    }
    outputGrid.dataset.viewMode = view;
    const viewLabel = mappingViewLabel(view);
    const selectedLook = outputGrid.dataset.shaderLook ?? "Current shader";
    const shaderFamily = outputGrid.dataset.shaderFamily ?? "neutral";
    const displayLook = selectedLook.toLowerCase().includes(shaderFamily)
      ? selectedLook
      : `${selectedLook} · ${shaderFamily}`;
    outputGrid.setAttribute(
      "aria-label",
      `${viewLabel} · ${selectedLook} · ${shaderFamily} shader`,
    );
    outputGrid.querySelectorAll<HTMLElement>(".output-tile-preview").forEach((preview, index) => {
      preview.setAttribute(
        "aria-label",
        `${viewLabel} · ${displayLook} · P${index + 1} preview`,
      );
    });
  }

  setScore(score: ShowScore): void {
    this.score = score;
    if (
      !this.score.movements.some(
        (movement) => movement.id === this.selectedMovementId,
      )
    ) {
      this.selectedMovementId = this.score.movements[0]?.id ?? "";
    }
    this.scrubber.max = this.score.durationS.toString();
    this.renderMovementOptions();
    this.buildTimeline();
    this.syncEditorControls();
  }

  setAuthoringStatus(message: string, error = false): void {
    this.elements.authoringStatus.textContent = message;
    this.elements.authoringStatus.dataset.error = String(error);
  }

  setCueStatus(
    recording: boolean,
    frameCount: number,
    elapsedS: number,
    message?: string,
    error = false,
  ): void {
    this.elements.cueRecordButton.textContent = recording
      ? "Stop recording"
      : "Record cue stream";
    this.elements.cueRecordButton.dataset.recording = String(recording);
    this.elements.cueFrameCount.textContent = frameCount.toString();
    this.elements.cueDuration.textContent = formatCueDuration(elapsedS);
    this.elements.cueStatus.textContent =
      message ??
      (recording
        ? "Recording shared runtime frames"
        : frameCount > 0
          ? "Ready to export JSONL"
          : "No cue frames recorded");
    this.elements.cueStatus.dataset.error = String(error);
  }

  setCueReplayActive(active: boolean): void {
    this.cueReplayActive = active;
    const shell = document.querySelector<HTMLElement>(".studio-shell");
    if (shell) {
      shell.dataset.cueReplay = String(active);
    }
    const playButton = this.elements.cueReplayPlayButton as HTMLButtonElement;
    const resetButton = this.elements.cueReplayResetButton as HTMLButtonElement;
    const recordButton = this.elements.cueRecordButton as HTMLButtonElement;
    const transportButton = this.elements.playButton as HTMLButtonElement;
    playButton.disabled = !active;
    resetButton.disabled = !active;
    this.cueReplayScrubber.disabled = !active;
    recordButton.disabled = active;
    transportButton.disabled = active;
    if (!active) {
      this.elements.mode.textContent = this.lastSnapshot?.world.mode ?? "simulation";
    }
  }

  setCueReplayState(
    loaded: boolean,
    playing: boolean,
    frameCount: number,
    durationS: number,
    positionS: number,
    message?: string,
    error = false,
  ): void {
    const playButton = this.elements.cueReplayPlayButton as HTMLButtonElement;
    playButton.textContent = playing ? "Pause rehearsal" : "Play rehearsal";
    playButton.dataset.playing = String(playing);
    this.elements.cueReplayFrameCount.textContent = frameCount.toString();
    this.elements.cueReplayDuration.textContent = formatCueDuration(durationS);
    this.elements.cueReplayPosition.textContent = formatCueDuration(positionS);
    this.cueReplayScrubber.max = Math.max(0, durationS).toString();
    this.cueReplayScrubber.value = Math.min(
      Math.max(0, positionS),
      Math.max(0, durationS),
    ).toString();
    this.elements.cueReplayStatus.textContent =
      message ?? (loaded ? "Rehearsal stream loaded" : "No rehearsal stream loaded");
    this.elements.cueReplayStatus.dataset.error = String(error);
  }

  setPlaying(playing: boolean): void {
    this.elements.playButton.textContent = playing ? "Pause" : "Run test";
    this.elements.playButton.dataset.playing = String(playing);
  }

  setAudioEnabled(enabled: boolean): void {
    this.elements.audioButton.textContent = enabled
      ? "Mute preview"
      : "Enable audio preview";
    this.elements.audioButton.dataset.enabled = String(enabled);
  }

  setMode(mode: RuntimeMode): void {
    document
      .querySelectorAll<HTMLButtonElement>("[data-runtime-mode]")
      .forEach((button) => {
        button.dataset.active = String(button.dataset.runtimeMode === mode);
      });
  }

  applyManualLayer(snapshot: RuntimeSnapshot): RuntimeSnapshot {
    if (!this.manualLayer) {
      return snapshot;
    }
    const audiovisual = {
      ...snapshot.audiovisual,
    };
    for (const [key, input] of this.parameterInputs) {
      audiovisual[key] = clamp(Number(input.value));
    }
    return {
      ...snapshot,
      audiovisual,
    };
  }

  private bind(root: HTMLElement): void {
    const activateWorkspace = (workspace: string): void => {
      root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
        const active = button.dataset.workspaceTab === workspace;
        button.dataset.active = String(active);
        button.setAttribute("aria-selected", String(active));
      });
      root.querySelectorAll<HTMLElement>("[data-workspace-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.workspacePanel !== workspace;
        if (!panel.hidden && panel instanceof HTMLDetailsElement) {
          panel.open = true;
        }
      });
      const shell = root.querySelector<HTMLElement>(".studio-shell");
      if (shell) shell.dataset.workspace = workspace;
    };
    root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
      button.addEventListener("click", () => activateWorkspace(button.dataset.workspaceTab ?? "looks"));
    });
    activateWorkspace("looks");

    this.requireElement(root, "output-inspector-close").addEventListener("click", () => {
      this.closeOutputInspector();
    });
    this.requireElement(root, "output-inspector-popout").addEventListener("click", () => {
      const view = (document.getElementById("output-inspector")?.dataset.view ?? "projector-1") as MappingViewMode;
      this.openOutputWindow(view);
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeOutputInspector();
      }
    });
    this.elements.playButton.addEventListener("click", () => {
      this.callbacks.onPlayToggle();
    });
    this.requireElement(root, "reset-button").addEventListener("click", () => {
      this.callbacks.onReset();
    });
    this.elements.audioButton.addEventListener("click", () => {
      this.callbacks.onAudioToggle();
    });
    this.scrubber.max = this.score.durationS.toString();
    this.scrubber.addEventListener("input", () => {
      this.callbacks.onSeek(Number(this.scrubber.value));
    });
    this.requireSelect(root, "rate-select").addEventListener(
      "change",
      (event) => {
        this.callbacks.onRate(Number((event.target as HTMLSelectElement).value));
      },
    );
    root
      .querySelectorAll<HTMLButtonElement>("[data-runtime-mode]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const mode = button.dataset.runtimeMode as RuntimeMode;
          if (mode === "replay") {
            this.requireInput(root, "replay-input").click();
            return;
          }
          this.callbacks.onMode(mode);
        });
      });
    this.requireInput(root, "replay-input").addEventListener(
      "change",
      (event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
          this.callbacks.onReplayFile(file);
        }
        input.value = "";
      },
    );
    this.requireInput(root, "inject-loss").addEventListener(
      "change",
      (event) => {
        this.callbacks.onInjectedLoss(
          (event.target as HTMLInputElement).checked,
        );
      },
    );
    this.requireInput(root, "fan-fault").addEventListener(
      "change",
      (event) => {
        this.callbacks.onFanFault((event.target as HTMLInputElement).checked);
      },
    );
    const fanTestCue = this.elements.fanTestCue as HTMLInputElement;
    const fanTestOverride = this.elements.fanTestOverride as HTMLInputElement;
    fanTestCue.addEventListener("input", () => {
      this.elements.fanTestCueValue.textContent = `${Math.round(
        Number(fanTestCue.value) * 100,
      )}%`;
      fanTestOverride.checked = true;
      this.callbacks.onFanCueOverride(Number(fanTestCue.value));
    });
    fanTestOverride.addEventListener("change", () => {
      this.callbacks.onFanCueOverride(
        fanTestOverride.checked
          ? Number(fanTestCue.value)
          : null,
      );
    });
    const warehouseEnabled = this.elements.warehouseEnabled as HTMLInputElement;
    const peopleEnabled = this.elements.peopleEnabled as HTMLInputElement;
    const environmentLighting = this.elements.environmentLighting as HTMLInputElement;
    const updateEnvironment = () => {
      const lighting = Number(environmentLighting.value);
      peopleEnabled.disabled = !warehouseEnabled.checked;
      this.elements.environmentLightingValue.textContent = `${Math.round(lighting * 100)}%`;
      this.environmentControls = {
        warehouseEnabled: warehouseEnabled.checked,
        peopleEnabled: peopleEnabled.checked,
        lighting,
      };
      this.callbacks.onEnvironmentControls(this.environmentControls);
    };
    warehouseEnabled.addEventListener("change", updateEnvironment);
    peopleEnabled.addEventListener("change", updateEnvironment);
    environmentLighting.addEventListener("input", updateEnvironment);
    const overlapInput = this.requireInput(root, "calibration-overlap");
    const featherInput = this.requireInput(root, "calibration-feather");
    const blackInput = this.requireInput(root, "calibration-black-level");
    const refreshCalibrationSettings = () => {
      this.projectionCalibrationSettings = {
        overlap: Number(overlapInput.value),
        featherGamma: Number(featherInput.value),
        blackLevel: Number(blackInput.value),
      };
      this.requireElement(root, "calibration-overlap-value").textContent =
        `${Math.round(this.projectionCalibrationSettings.overlap * 100)}%`;
      this.requireElement(root, "calibration-feather-value").textContent =
        this.projectionCalibrationSettings.featherGamma.toFixed(1);
      this.requireElement(root, "calibration-black-level-value").textContent =
        `${Math.round(this.projectionCalibrationSettings.blackLevel * 100)}%`;
    };
    [overlapInput, featherInput, blackInput].forEach((input) =>
      input.addEventListener("input", refreshCalibrationSettings),
    );
    this.requireElement(root, "run-auto-calibration").addEventListener("click", () => {
      refreshCalibrationSettings();
      this.callbacks.onProjectionCalibration(this.projectionCalibrationSettings);
    });
    this.requireElement(root, "open-installation-guide").addEventListener("click", () => {
      activateWorkspace("guide");
    });
    root.querySelectorAll<HTMLButtonElement>("[data-output-cycle]").forEach((button) => {
      button.addEventListener("click", () => {
        const current = Number((document.getElementById("output-inspector")?.dataset.view ?? "projector-1").slice(-1)) || 1;
        const delta = button.dataset.outputCycle === "previous" ? -1 : 1;
        const next = ((current - 1 + delta + 5) % 5) + 1;
        const view = `projector-${next}` as MappingViewMode;
        this.openOutputInspector(view);
        this.callbacks.onMappingView(view);
      });
    });
    const inspectorZoom = this.requireInput(root, "output-inspector-zoom");
    inspectorZoom.addEventListener("input", () => {
      const zoom = Number(inspectorZoom.value);
      const canvas = document.getElementById("output-inspector-canvas");
      if (canvas) canvas.style.setProperty("--output-zoom", String(zoom));
      this.requireElement(root, "output-inspector-zoom-value").textContent = `${zoom.toFixed(1)}×`;
    });
    this.requireElement(root, "output-inspector-fullscreen").addEventListener("click", () => {
      const panel = document.querySelector<HTMLElement>(".output-inspector-panel");
      if (!panel) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else if (typeof panel.requestFullscreen === "function") {
        void panel.requestFullscreen();
      }
    });
    this.requireSelect(root, "projection-pattern").addEventListener(
      "change",
      (event) => {
        this.projectionPattern = (event.target as HTMLSelectElement).value as ProjectionPattern;
        const seamButton = this.requireElement(root, "seam-test-toggle");
        const seamActive = this.projectionPattern === "seam";
        seamButton.dataset.active = String(seamActive);
        seamButton.setAttribute("aria-pressed", String(seamActive));
        this.callbacks.onProjectionPattern(this.projectionPattern);
      },
    );
    this.requireElement(root, "seam-test-toggle").addEventListener("click", () => {
      this.projectionPattern = this.projectionPattern === "seam" ? "authored" : "seam";
      this.requireSelect(root, "projection-pattern").value = this.projectionPattern;
      const seamButton = this.requireElement(root, "seam-test-toggle");
      const seamActive = this.projectionPattern === "seam";
      seamButton.dataset.active = String(seamActive);
      seamButton.setAttribute("aria-pressed", String(seamActive));
      this.callbacks.onProjectionPattern(this.projectionPattern);
      this.setAuthoringStatus(
        seamActive
          ? "Seam stress test active · rotate the sphere and inspect every axis"
          : "Shader surface restored",
        false,
      );
    });
    this.requireInput(root, "shader-preview-exposure").addEventListener("input", (event) => {
      const exposure = Number((event.target as HTMLInputElement).value);
      this.previewExposure = exposure;
      this.requireElement(root, "shader-preview-exposure-value").textContent = `${Math.round(exposure * 100)}%`;
      this.callbacks.onShaderPreviewExposure(exposure);
    });
    root.querySelectorAll<HTMLInputElement>("[data-shader-look-control]")
      .forEach((input) => {
        input.addEventListener("input", () => {
          const id = input.dataset.shaderLookControl as ShaderLookControlId;
          this.shaderLookControls = normaliseShaderLookControls({
            ...this.shaderLookControls,
            [id]: Number(input.value),
          });
          const output = input.parentElement?.querySelector("output");
          if (output) {
            output.textContent = formatShaderLookControl(id, this.shaderLookControls[id]);
          }
          this.callbacks.onShaderLookControls(this.shaderLookControls);
        });
      });
    this.elements.shaderLookReset.addEventListener("click", () => {
      this.shaderLookControls = { ...DEFAULT_SHADER_LOOK_CONTROLS };
      root.querySelectorAll<HTMLInputElement>("[data-shader-look-control]")
        .forEach((input) => {
          const id = input.dataset.shaderLookControl as ShaderLookControlId;
          input.value = String(this.shaderLookControls[id]);
          const output = input.parentElement?.querySelector("output");
          if (output) {
            output.textContent = formatShaderLookControl(id, this.shaderLookControls[id]);
          }
        });
      this.callbacks.onShaderLookControls(this.shaderLookControls);
      this.setAuthoringStatus("Finishing controls reset", false);
    });
    this.requireElement(root, "camera-discover").addEventListener("click", () => {
      this.callbacks.onCameraDiscover();
    });
    this.requireElement(root, "camera-arm").addEventListener("click", () => {
      this.callbacks.onCameraArm();
    });
    this.requireElement(root, "camera-stream").addEventListener("click", () => {
      this.callbacks.onCameraStreamToggle();
    });
    this.requireSelect(root, "camera-profile").addEventListener(
      "change",
      (event) => {
        this.callbacks.onCameraProfile(
          (event.target as HTMLSelectElement).value,
        );
      },
    );
    this.requireSelect(root, "shader-select").addEventListener(
      "change",
      (event) => {
        this.selectedShaderId = (event.target as HTMLSelectElement).value;
        this.callbacks.onShaderSelect(this.selectedShaderId);
      },
    );
    this.elements.shaderCatalog.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const cardButton = target.closest<HTMLButtonElement>("[data-shader-card-id]");
      if (!cardButton) {
        return;
      }
      const card = SHADER_PRESET_CATALOG.find(
        (candidate) => candidate.id === cardButton.dataset.shaderCardId,
      );
      if (!card) {
        return;
      }
      this.activateShaderCard(card, `${card.name} selected · sphere preview`);
    });
    this.requireInput(root, "shader-search").addEventListener("input", (event) => {
      this.shaderCatalogSearch = (event.target as HTMLInputElement).value;
      if (this.shaderCatalogSearch.trim()) {
        this.shaderCatalogFamily = "all";
        this.shaderCatalogTag = "all";
        this.requireSelect(root, "shader-family-filter").value = "all";
        this.syncShaderQuickFilters(root);
      }
      this.shaderCatalogLimit = SHADER_CATALOG_PAGE_SIZE;
      this.renderShaderCatalog();
    });
    this.requireSelect(root, "shader-family-filter").addEventListener("change", (event) => {
      this.shaderCatalogSearch = "";
      this.requireInput(root, "shader-search").value = "";
      this.shaderCatalogFamily = (event.target as HTMLSelectElement).value;
      this.shaderCatalogTag = "all";
      this.shaderCatalogLimit = SHADER_CATALOG_PAGE_SIZE;
      this.syncShaderQuickFilters(root);
      this.renderShaderCatalog();
    });
    this.requireSelect(root, "shader-gpu-filter").addEventListener("change", (event) => {
      this.shaderCatalogGpu = (event.target as HTMLSelectElement).value;
      this.shaderCatalogLimit = SHADER_CATALOG_PAGE_SIZE;
      this.renderShaderCatalog();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-shader-quick]").forEach((button) => {
      button.addEventListener("click", () => {
        this.shaderCatalogSearch = "";
        this.requireInput(root, "shader-search").value = "";
        const value = button.dataset.shaderQuick ?? "all";
        const kind = button.dataset.shaderQuickKind ?? "family";
        if (kind === "tag") {
          this.shaderCatalogTag = value;
          this.shaderCatalogFamily = "all";
          this.requireSelect(root, "shader-family-filter").value = "all";
        } else if (kind === "all") {
          this.shaderCatalogTag = "all";
          this.shaderCatalogFamily = "all";
          this.requireSelect(root, "shader-family-filter").value = "all";
        } else {
          this.shaderCatalogTag = "all";
          this.shaderCatalogFamily = value;
          this.requireSelect(root, "shader-family-filter").value = value;
        }
        this.shaderCatalogLimit = SHADER_CATALOG_PAGE_SIZE;
        this.syncShaderQuickFilters(root);
        this.renderShaderCatalog();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("button[data-shader-variant]").forEach((button) => {
      button.addEventListener("click", () => {
        const direction = button.dataset.shaderVariant === "previous" ? -1 : 1;
        this.navigateShaderVariant(direction);
      });
    });
    this.requireElement(root, "shader-recent").addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const recentButton = target.closest<HTMLButtonElement>("[data-recent-shader-id]");
      const card = recentButton
        ? SHADER_PRESET_CATALOG.find((candidate) => candidate.id === recentButton.dataset.recentShaderId)
        : undefined;
      if (!card) {
        return;
      }
      this.restoreRecentShaderCard(card);
    });
    this.elements.shaderCatalogMore.addEventListener("click", () => {
      const filtered = this.filteredShaderCards();
      this.shaderCatalogLimit = Math.min(
        filtered.length,
        this.shaderCatalogLimit + SHADER_CATALOG_PAGE_SIZE,
      );
      this.renderShaderCatalog();
    });
    this.requireElement(root, "assign-selected-shader").addEventListener("click", () => {
      this.assignSelectedShaderToRegion();
    });
    this.requireInput(root, "surface-regions-enabled").addEventListener("change", (event) => {
      const enabled = (event.target as HTMLInputElement).checked;
      this.surfaceRegionsEnabled = enabled;
      this.callbacks.onSurfaceRegionsEnabled(enabled);
      this.elements.regionActive.textContent = enabled
        ? "Mixed regions enabled · select a band and assign a look"
        : "Full-sphere look active · mixed regions are off";
      this.setAuthoringStatus(
        enabled
          ? "Mixed surface regions enabled"
          : "Full-sphere shader restored",
        false,
      );
    });
    this.elements.shaderReset.addEventListener("click", () => {
      const card = SHADER_PRESET_CATALOG.find(
        (candidate) => candidate.id === this.selectedCatalogCardId,
      );
      if (!card) {
        return;
      }
      this.activateShaderCard(card, `${card.name} restored to its saved preset`);
    });
    this.elements.shaderUpdate.addEventListener("click", () => {
      this.updateSelectedPreset();
    });
    this.elements.regionAssignments.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const regionButton = target.closest<HTMLButtonElement>("[data-region-id]");
      if (!regionButton?.dataset.regionId) {
        return;
      }
      this.activeRegionId = regionButton.dataset.regionId;
      this.renderRegionControls();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-mapping-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.mappingView as MappingViewMode;
        if (!MAPPING_VIEW_MODES.includes(view)) {
          return;
        }
        root.querySelectorAll<HTMLButtonElement>("[data-mapping-view]").forEach((candidate) => {
          const isActive = candidate.dataset.mappingView === view;
          candidate.dataset.active = String(isActive);
          candidate.setAttribute("aria-selected", String(isActive));
        });
        this.elements.mappingViewReadout.textContent = view.startsWith("projector-")
          ? `${mappingViewLabel(view)} · main viewport uses the simulated projector camera`
          : view === "uv"
            ? "UV coverage proxy · calibrated unwrap renderer not connected"
            : "Sphere preview · continuous 3D surface mapping";
        this.updateOutputViewSemantics(view);
        this.callbacks.onMappingView(view);
        if (view.startsWith("projector-")) {
          this.setAuthoringStatus(`${mappingViewLabel(view)} selected`, false);
        }
      });
    });
    // Delegate output actions from the stable grid so the handler survives
    // preview tile updates and host-specific DOM refreshes.
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const inspectButton = target.closest<HTMLButtonElement>("[data-inspect-view]");
      const inspectView = inspectButton?.dataset.inspectView as MappingViewMode | undefined;
      if (inspectView && MAPPING_VIEW_MODES.includes(inspectView)) {
        this.openOutputInspector(inspectView);
        return;
      }
      const modeButton = target.closest<HTMLButtonElement>("[data-output-mode-index]");
      const modeIndex = Number(modeButton?.dataset.outputModeIndex);
      if (modeButton && Number.isInteger(modeIndex) && modeIndex >= 0 && modeIndex < 5) {
        const nextMode = this.projectorOutputModes[modeIndex] === "post" ? "pre" : "post";
        this.projectorOutputModes[modeIndex] = nextMode;
        const canvas = document.querySelector<HTMLCanvasElement>(
          `canvas[data-projector-output="${modeIndex}"]`,
        );
        if (canvas) canvas.dataset.outputMode = nextMode;
        modeButton.textContent = nextMode === "post" ? "POST" : "PRE";
        modeButton.setAttribute("aria-label", `Projector ${modeIndex + 1} output mode: ${nextMode === "post" ? "post-mapping" : "pre-mapping"}. Click to switch.`);
        this.setAuthoringStatus(`P${modeIndex + 1} ${nextMode === "post" ? "post-mapping" : "pre-mapping source"} view selected`, false);
        const label = modeButton.closest(".output-tile")?.querySelector<HTMLElement>("small");
        const look = document.getElementById("output-grid")?.dataset.shaderLook ?? "Current shader";
        if (label) label.textContent = `${look} · ${nextMode}-mapping · live`;
        this.refreshProjectorOutputFrame(modeIndex);
        return;
      }
      const popoutButton = target.closest<HTMLButtonElement>("[data-popout-view]");
      const popoutView = popoutButton?.dataset.popoutView as MappingViewMode | undefined;
      if (popoutView && MAPPING_VIEW_MODES.includes(popoutView)) {
        this.openOutputWindow(popoutView);
      }
    });
    this.requireElement(root, "transport-connect").addEventListener("click", () => {
      this.callbacks.onTransportConnect(
        this.requireSelect(root, "transport-protocol").value as TransportProtocol,
      );
    });
    this.requireElement(root, "transport-pulse").addEventListener("click", () => {
      this.callbacks.onTransportPulse();
    });
    this.requireElement(root, "transport-disconnect").addEventListener("click", () => {
      this.callbacks.onTransportDisconnect();
    });
    this.requireSelect(root, "render-quality").addEventListener(
      "change",
      (event) => {
        this.callbacks.onRenderQuality(
          (event.target as HTMLSelectElement).value as RenderQualityMode,
        );
      },
    );
    this.requireElement(root, "camera-apply-settings").addEventListener(
      "click",
      () => {
        this.callbacks.onCameraSettings(
          Number((this.elements.cameraExposure as HTMLInputElement).value),
          Number((this.elements.cameraGain as HTMLInputElement).value),
        );
      },
    );
    [
      this.requireInput(root, "camera-exposure"),
      this.requireInput(root, "camera-gain"),
    ].forEach((input) => {
      input.addEventListener("focus", () => {
        this.cameraSettingsFocused = input.id;
      });
      input.addEventListener("blur", () => {
        if (this.cameraSettingsFocused === input.id) {
          this.cameraSettingsFocused = null;
        }
      });
    });
    root
      .querySelectorAll<HTMLInputElement>("[data-debug-option]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          const key = input.dataset.debugOption as keyof DebugOptions;
          this.debugOptions[key] = input.checked;
          this.callbacks.onDebug({
            ...this.debugOptions,
          });
        });
      });
    this.requireInput(root, "manual-layer").addEventListener(
      "change",
      (event) => {
        this.manualLayer = (event.target as HTMLInputElement).checked;
        const shell = root.querySelector<HTMLElement>(".studio-shell");
        if (shell) {
          shell.dataset.manualLayer = String(this.manualLayer);
        }
        if (this.manualLayer && this.lastSnapshot) {
          this.syncParameterInputs(this.lastSnapshot.audiovisual);
        }
      },
    );
    this.requireElement(root, "export-preset").addEventListener("click", () => {
      this.exportPreset();
    });
    this.movementEditorSelect.addEventListener("change", () => {
      this.selectedMovementId = this.movementEditorSelect.value;
      this.syncEditorControls();
      const movement = this.selectedMovement();
      if (movement) {
        this.callbacks.onSeek(movement.startS);
      }
    });
    this.curveParameterSelect.addEventListener("change", () => {
      this.syncEditorControls();
    });
    [
      this.curveStartInput,
      this.curvePeakInput,
      this.curveEndInput,
      this.curvePeakAtInput,
    ].forEach((input) => {
      input.addEventListener("input", () => {
        this.applyCurveEdit();
      });
    });
    this.curveUsePeakInput.addEventListener("change", () => {
      this.applyCurveEdit();
    });
    this.movementDurationInput.addEventListener("change", () => {
      this.applyDurationEdit();
    });
    this.requireElement(root, "apply-duration").addEventListener(
      "click",
      () => this.applyDurationEdit(),
    );
    this.movementMajorPeakInput.addEventListener("change", () => {
      const movement = this.selectedMovement();
      if (!movement) {
        return;
      }
      this.commitScore(
        updateMovementMetadata(this.score, movement.id, {
          majorPeak: this.movementMajorPeakInput.checked,
        }),
      );
    });
    this.requireElement(root, "save-show-preset").addEventListener(
      "click",
      () => this.callbacks.onSavePreset(this.score),
    );
    this.requireElement(root, "export-show-preset").addEventListener(
      "click",
      () => this.callbacks.onExportPreset(this.score),
    );
    this.requireElement(root, "load-show-preset").addEventListener(
      "click",
      () => this.requireInput(root, "preset-input").click(),
    );
    this.requireInput(root, "preset-input").addEventListener(
      "change",
      (event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
          this.callbacks.onImportPreset(file);
        }
        input.value = "";
      },
    );
    this.requireElement(root, "reset-show-score").addEventListener(
      "click",
      () => this.callbacks.onResetScore(),
    );
    this.requireElement(root, "record-cue-stream").addEventListener(
      "click",
      () => this.callbacks.onCueRecordToggle(),
    );
    this.requireElement(root, "export-cue-stream").addEventListener(
      "click",
      () => this.callbacks.onCueExport(),
    );
    this.requireElement(root, "clear-cue-stream").addEventListener(
      "click",
      () => this.callbacks.onCueClear(),
    );
    this.requireElement(root, "load-cue-stream").addEventListener(
      "click",
      () => this.requireInput(root, "cue-replay-input").click(),
    );
    this.requireElement(root, "cue-replay-play").addEventListener(
      "click",
      () => this.callbacks.onCuePlayToggle(),
    );
    this.requireElement(root, "cue-replay-reset").addEventListener(
      "click",
      () => this.callbacks.onCueReset(),
    );
    this.cueReplayScrubber.addEventListener("input", () => {
      this.callbacks.onCueSeek(Number(this.cueReplayScrubber.value));
    });
    this.requireInput(root, "cue-replay-input").addEventListener(
      "change",
      (event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
          this.callbacks.onCueLoad(file);
        }
        input.value = "";
      },
    );
  }

  private buildShaderCatalog(): void {
    this.renderShaderCatalog();
  }

  private filteredShaderCards(): readonly ShaderPresetCard[] {
    const query = this.shaderCatalogSearch.trim();
    const filtered = SHADER_PRESET_CATALOG.filter((card) => {
      if (this.shaderCatalogFamily !== "all" && card.shader.family !== this.shaderCatalogFamily) {
        return false;
      }
      if (this.shaderCatalogTag !== "all" && !card.tags.includes(this.shaderCatalogTag)) {
        return false;
      }
      if (this.shaderCatalogGpu !== "all" && card.shader.gpuCost !== this.shaderCatalogGpu) {
        return false;
      }
      return shaderCardMatchesSearch(card, query);
    });
    if (this.shaderCatalogFamily !== "all" || this.shaderCatalogTag !== "all" || query) {
      return filtered;
    }
    const cardsByShader = new Map<string, ShaderPresetCard[]>();
    for (const card of filtered) {
      const shaderCards = cardsByShader.get(card.shader.id) ?? [];
      shaderCards.push(card);
      cardsByShader.set(card.shader.id, shaderCards);
    }
    const shaderOrder = [...CURATED_SHADER_REGISTRY.shaders]
      .sort((left, right) => {
        const familyDifference =
          SHADER_SHELF_FAMILY_ORDER.indexOf(left.family) -
          SHADER_SHELF_FAMILY_ORDER.indexOf(right.family);
        return familyDifference || left.name.localeCompare(right.name);
      })
      .map((shader) => shader.id);
    const ordered: ShaderPresetCard[] = [];
    for (let cardIndex = 0; cardIndex < SHADER_PRESET_VARIANTS_PER_SHADER; cardIndex += 1) {
      for (const shaderId of shaderOrder) {
        const card = cardsByShader.get(shaderId)?.[cardIndex];
        if (card) {
          ordered.push(card);
        }
      }
    }
    return ordered;
  }

  private rememberShaderCard(cardId: string): void {
    if (!SHADER_PRESET_CATALOG.some((card) => card.id === cardId)) {
      return;
    }
    this.recentShaderCardIds = [
      cardId,
      ...this.recentShaderCardIds.filter((candidate) => candidate !== cardId),
    ].slice(0, 6);
    this.renderRecentShaderCards();
  }

  private activateShaderCard(card: ShaderPresetCard, status?: string): void {
    this.selectedCatalogCardId = card.id;
    const saved = this.presetOverrides[card.id];
    if (saved) {
      this.applySavedSharedControls(saved);
    }
    const preset = saved?.preset ?? card.preset;
    this.setShaderDefinition(card.shader, preset);
    this.callbacks.onShaderPreset(preset);
    if (status) {
      this.setAuthoringStatus(status, false);
    }
  }

  private applySavedSharedControls(
    saved: StudioPresetOverrideMap[string],
  ): void {
    this.shaderLookControls = { ...saved.lookControls };
    document
      .querySelectorAll<HTMLInputElement>("[data-shader-look-control]")
      .forEach((input) => {
        const id = input.dataset.shaderLookControl as ShaderLookControlId;
        input.value = String(this.shaderLookControls[id]);
        const output = input.parentElement?.querySelector("output");
        if (output) {
          output.textContent = formatShaderLookControl(id, this.shaderLookControls[id]);
        }
      });
    this.callbacks.onShaderLookControls(this.shaderLookControls);

    this.previewExposure = saved.previewExposure;
    const exposure = document.getElementById("shader-preview-exposure") as HTMLInputElement | null;
    if (exposure) {
      exposure.value = String(saved.previewExposure);
      const output = document.getElementById("shader-preview-exposure-value");
      if (output) {
        output.textContent = `${Math.round(saved.previewExposure * 100)}%`;
      }
    }
    this.callbacks.onShaderPreviewExposure(saved.previewExposure);

    const fan = this.elements.fanTestCue as HTMLInputElement;
    const override = this.elements.fanTestOverride as HTMLInputElement;
    fan.value = String(saved.fanSpeed);
    override.checked = true;
    this.elements.fanTestCueValue.textContent = `${Math.round(saved.fanSpeed * 100)}%`;
    this.callbacks.onFanCueOverride(saved.fanSpeed);

    this.environmentControls = { ...saved.environment };
    const warehouse = this.elements.warehouseEnabled as HTMLInputElement;
    const people = this.elements.peopleEnabled as HTMLInputElement;
    const lighting = this.elements.environmentLighting as HTMLInputElement;
    warehouse.checked = saved.environment.warehouseEnabled;
    people.checked = saved.environment.peopleEnabled;
    people.disabled = !warehouse.checked;
    lighting.value = String(saved.environment.lighting);
    this.elements.environmentLightingValue.textContent = `${Math.round(saved.environment.lighting * 100)}%`;
    this.callbacks.onEnvironmentControls(saved.environment);
  }

  private updateSelectedPreset(): void {
    const card = SHADER_PRESET_CATALOG.find(
      (candidate) => candidate.id === this.selectedCatalogCardId,
    );
    if (!card) {
      this.setAuthoringStatus("Choose a preset before updating it", true);
      return;
    }
    const fanSpeed = Number((this.elements.fanTestCue as HTMLInputElement).value);
    const warehouseEnabled = (this.elements.warehouseEnabled as HTMLInputElement).checked;
    const peopleEnabled = (this.elements.peopleEnabled as HTMLInputElement).checked;
    const lighting = Number((this.elements.environmentLighting as HTMLInputElement).value);
    try {
      const updated = createStudioPresetOverride({
        cardId: card.id,
        preset: this.currentShaderPreset,
        lookControls: this.shaderLookControls,
        previewExposure: this.previewExposure,
        fanSpeed,
        environment: {
          warehouseEnabled,
          peopleEnabled,
          lighting,
        },
      });
      this.presetOverrides = {
        ...this.presetOverrides,
        [card.id]: updated,
      };
      writeStudioPresetOverrides(this.presetStorage, this.presetOverrides);
      this.setAuthoringStatus(
        `${card.name} updated · shader, appearance, scene and fan speed saved`,
        false,
      );
    } catch (error) {
      this.setAuthoringStatus(
        error instanceof Error ? error.message : "Preset update failed",
        true,
      );
    }
  }

  private restoreRecentShaderCard(card: ShaderPresetCard): void {
    const cleared: string[] = [];
    if (this.shaderCatalogSearch && !shaderCardMatchesSearch(card, this.shaderCatalogSearch)) {
      this.shaderCatalogSearch = "";
      const search = document.getElementById("shader-search") as HTMLInputElement | null;
      if (search) {
        search.value = "";
      }
      cleared.push("search");
    }
    if (this.shaderCatalogFamily !== "all" && card.shader.family !== this.shaderCatalogFamily) {
      this.shaderCatalogFamily = "all";
      const familyFilter = document.getElementById("shader-family-filter") as HTMLSelectElement | null;
      if (familyFilter) {
        familyFilter.value = "all";
      }
      document.querySelectorAll<HTMLButtonElement>("[data-shader-quick]").forEach((button) => {
        const active = button.dataset.shaderQuick === "all";
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      });
      cleared.push("family");
    }
    if (this.shaderCatalogTag !== "all" && !card.tags.includes(this.shaderCatalogTag)) {
      this.shaderCatalogTag = "all";
      cleared.push("focus");
    }
    if (this.shaderCatalogGpu !== "all" && card.shader.gpuCost !== this.shaderCatalogGpu) {
      this.shaderCatalogGpu = "all";
      const gpuFilter = document.getElementById("shader-gpu-filter") as HTMLSelectElement | null;
      if (gpuFilter) {
        gpuFilter.value = "all";
      }
      cleared.push("GPU");
    }
    this.activateShaderCard(card);
    const shell = document.querySelector<HTMLElement>(".studio-shell");
    if (shell) {
      this.syncShaderQuickFilters(shell);
    }
    const suffix = cleared.length > 0
      ? ` · cleared incompatible ${cleared.join(" + ")} filter${cleared.length > 1 ? "s" : ""}`
      : "";
    this.setAuthoringStatus(`${card.name} restored from recent looks${suffix}`, false);
  }

  private renderRecentShaderCards(): void {
    const container = document.getElementById("shader-recent");
    if (!container) {
      return;
    }
    const cards = this.recentShaderCardIds
      .map((id) => SHADER_PRESET_CATALOG.find((card) => card.id === id))
      .filter((card): card is ShaderPresetCard => Boolean(card));
    container.innerHTML = cards.length === 0
      ? `<span class="shader-recent-empty">Choose a look to build a short audition trail.</span>`
      : `<span class="shader-recent-label">RECENT</span>${cards
        .map(
          (card) => `
            <button type="button" data-recent-shader-id="${card.id}" data-recent-family="${card.shader.family}" data-recent-variant="${card.variant}" aria-label="Restore ${escapeHtml(card.name)}, ${card.shader.family} shader" aria-pressed="${card.id === this.selectedCatalogCardId}"><span class="shader-recent-preview shader-preview-${card.shader.family} shader-preview-${card.shader.id}" style="--shader-seed:${card.preset.seed % 97}" aria-hidden="true"></span><span class="shader-recent-copy"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.shader.family)} · ${card.variant.toString().padStart(2, "0")}</small></span></button>`,
        )
        .join("")}`;
  }

  private syncShaderQuickFilters(root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>("[data-shader-quick]").forEach((button) => {
      const value = button.dataset.shaderQuick ?? "all";
      const kind = button.dataset.shaderQuickKind ?? "family";
      const active = kind === "tag"
        ? this.shaderCatalogTag === value && this.shaderCatalogFamily === "all"
        : kind === "all"
          ? this.shaderCatalogTag === "all" && this.shaderCatalogFamily === "all"
          : this.shaderCatalogTag === "all" && this.shaderCatalogFamily === value;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  private renderShaderCatalog(): void {
    const filtered = this.filteredShaderCards();
    let visible = filtered.slice(0, this.shaderCatalogLimit);
    let selectedCard = filtered.find((card) => card.id === this.selectedCatalogCardId);
    if (!selectedCard && filtered.length > 0) {
      selectedCard = filtered[0];
      this.selectedShaderId = selectedCard.shader.id;
      this.activateShaderCard(selectedCard);
      return;
    }
    if (selectedCard && !visible.some((card) => card.id === selectedCard.id)) {
      visible = [
        selectedCard,
        ...visible.slice(0, Math.max(0, this.shaderCatalogLimit - 1)),
      ];
    }
    const assignButton = document.getElementById("assign-selected-shader") as HTMLButtonElement | null;
    const assignmentAvailable = Boolean(selectedCard);
    if (assignButton) {
      assignButton.disabled = !assignmentAvailable;
      assignButton.setAttribute("aria-disabled", String(!assignmentAvailable));
      assignButton.setAttribute(
        "aria-label",
        assignmentAvailable
          ? "Assign selected shader to active region"
          : "Choose a visible preset before assigning to active region",
      );
      assignButton.title = assignmentAvailable
        ? "Assign the selected preset to the active region"
        : "Choose a visible preset before assigning it to the active region";
    }
    this.elements.shaderCatalogCount.textContent = `${filtered.length} presets · showing ${visible.length}`;
    const remaining = Math.max(0, filtered.length - visible.length);
    const moreButton = this.elements.shaderCatalogMore as HTMLButtonElement;
    moreButton.hidden = remaining === 0;
    if (remaining > 0) {
      const increment = Math.min(SHADER_CATALOG_PAGE_SIZE, remaining);
      moreButton.textContent = `Load ${increment} more`;
      moreButton.setAttribute(
        "aria-label",
        `Load ${increment} more shader presets, ${remaining} remaining`,
      );
    }
    this.elements.shaderCatalog.innerHTML = visible.length === 0
      ? `<p class="shader-catalog-empty" role="status">No presets match. Try grid, water, fire or matrix.</p>`
      : visible
        .map(
          (card) => `
          <button type="button" class="shader-card${card.id === this.selectedCatalogCardId ? " is-selected" : ""}" data-shader-card-id="${card.id}" aria-label="${card.name}, ${card.shader.family} shader" aria-pressed="${card.id === this.selectedCatalogCardId}">
            <span class="shader-card-preview shader-preview-${card.shader.family} shader-preview-${card.shader.id}" style="--shader-seed:${card.preset.seed % 97}"></span>
            <span class="shader-card-name">${card.name}</span>
            <span class="shader-card-meta">${card.shader.family} · ${card.shader.gpuCost}</span>
          </button>`,
        )
        .join("");
    this.renderShaderVariantNavigator();
  }

  private renderShaderVariantNavigator(): void {
    const readout = document.getElementById("shader-variant-readout");
    const previous = document.querySelector<HTMLButtonElement>(
      '[data-shader-variant="previous"]',
    );
    const next = document.querySelector<HTMLButtonElement>(
      '[data-shader-variant="next"]',
    );
    if (!readout || !previous || !next) {
      return;
    }
    const selected = SHADER_PRESET_CATALOG.find(
      (card) => card.id === this.selectedCatalogCardId,
    );
    if (!selected) {
      readout.textContent = "Choose a preset";
      previous.disabled = true;
      next.disabled = true;
      return;
    }
    const variants = SHADER_PRESET_CATALOG.filter(
      (card) => card.preset.shaderId === selected.preset.shaderId,
    );
    readout.textContent = `VARIANT ${selected.variant.toString().padStart(2, "0")} / ${variants.length}`;
    readout.setAttribute(
      "aria-label",
      `${selected.name}, variant ${selected.variant} of ${variants.length}`,
    );
    previous.disabled = variants.length < 2;
    next.disabled = variants.length < 2;
    previous.setAttribute(
      "aria-label",
      `Previous ${selected.shader.name} variant`,
    );
    next.setAttribute(
      "aria-label",
      `Next ${selected.shader.name} variant`,
    );
  }

  private navigateShaderVariant(direction: -1 | 1): void {
    const selected = SHADER_PRESET_CATALOG.find(
      (card) => card.id === this.selectedCatalogCardId,
    );
    if (!selected) {
      return;
    }
    const variants = SHADER_PRESET_CATALOG.filter(
      (card) => card.preset.shaderId === selected.preset.shaderId,
    );
    if (variants.length < 2) {
      return;
    }
    const currentIndex = variants.findIndex((card) => card.id === selected.id);
    const nextIndex = (currentIndex + direction + variants.length) % variants.length;
    const nextCard = variants[nextIndex];
    if (!nextCard) {
      return;
    }
    if (this.shaderCatalogSearch && !shaderCardMatchesSearch(nextCard, this.shaderCatalogSearch)) {
      this.shaderCatalogSearch = "";
      const search = document.getElementById("shader-search") as HTMLInputElement | null;
      if (search) {
        search.value = "";
      }
    }
    this.activateShaderCard(
      nextCard,
      `${nextCard.name} selected · variant ${nextCard.variant} of ${variants.length}`,
    );
  }

  private buildRegionControls(): void {
    this.renderRegionControls();
  }

  private renderRegionControls(): void {
    this.elements.regionAssignments.innerHTML = SURFACE_REGION_DEFINITIONS.map((definition) => {
      const assignment = this.surfaceRegions.find(
        (candidate) => candidate.regionId === definition.id,
      );
      const shader = assignment ? getShaderDefinition(assignment.shaderId) : null;
      const presetCard = assignment
        ? SHADER_PRESET_CATALOG.find((card) => card.id === assignment.shaderPresetId)
        : null;
      const assignedLook = presetCard?.name ?? shader?.name ?? "Unassigned";
      const active = definition.id === this.activeRegionId;
      return `
        <button type="button" class="region-assignment${active ? " is-active" : ""}" data-region-id="${definition.id}" data-region-preset-id="${escapeHtml(assignment?.shaderPresetId ?? "")}" aria-pressed="${active}">
          <span class="region-assignment-marker region-${definition.shortLabel.toLowerCase()}"></span>
          <span class="region-assignment-copy"><strong>${definition.shortLabel}</strong><small>${escapeHtml(assignedLook)}</small></span>
          <span class="region-assignment-value">${Math.round((assignment?.intensity ?? 0) * 100)}%</span>
        </button>`;
    }).join("");
    const activeDefinition = SURFACE_REGION_DEFINITIONS.find(
      (definition) => definition.id === this.activeRegionId,
    );
    this.elements.regionActive.textContent = !this.surfaceRegionsEnabled
      ? "Full-sphere look active · mixed regions are off"
      : activeDefinition
        ? `${activeDefinition.label} active · assign the selected preset here`
        : "Select a region to assign a preset";
  }

  private assignSelectedShaderToRegion(): void {
    const card = SHADER_PRESET_CATALOG.find(
      (candidate) => candidate.id === this.selectedCatalogCardId,
    );
    if (!card) {
      return;
    }
    this.surfaceRegions = this.surfaceRegions.map((assignment) =>
      assignment.regionId === this.activeRegionId
        ? {
            ...assignment,
            shaderId: card.shader.id,
            shaderFamily: card.shader.family,
            shaderPresetId: card.id,
            intensity: Math.min(1, Math.max(0.2, assignment.intensity)),
          }
        : assignment,
    );
    this.callbacks.onSurfaceRegions(this.surfaceRegions);
    this.renderRegionControls();
    this.setAuthoringStatus(`${card.name} assigned to ${this.activeRegionId}`, false);
  }

  private closeOutputInspector(): void {
    const inspector = document.getElementById("output-inspector");
    if (inspector) {
      inspector.hidden = true;
      this.setAuthoringStatus("Inline output inspector closed", false);
    }
  }

  private refreshOpenOutputInspector(): void {
    const inspector = document.getElementById("output-inspector");
    const outputGrid = document.getElementById("output-grid");
    if (!inspector || inspector.hidden || !outputGrid) {
      return;
    }
    const view = (inspector.dataset.view ?? outputGrid.dataset.viewMode) as MappingViewMode;
    if (MAPPING_VIEW_MODES.includes(view)) {
      this.openOutputInspector(view, false);
    }
  }

  private openOutputInspector(view: MappingViewMode, announce = true): void {
    const outputGrid = document.getElementById("output-grid");
    const sourceCanvas = view.startsWith("projector-")
      ? outputGrid?.querySelector<HTMLCanvasElement>(`[data-output-view="${view}"] canvas`)
      : outputGrid?.querySelector<HTMLCanvasElement>("canvas[data-projector-output]");
    const inspector = document.getElementById("output-inspector");
    const inspectorTitle = document.getElementById("output-inspector-title");
    const inspectorCanvas = document.getElementById("output-inspector-canvas") as HTMLCanvasElement | null;
    const inspectorMeta = document.getElementById("output-inspector-meta");
    const closeButton = document.getElementById("output-inspector-close");
    if (!outputGrid || !sourceCanvas || !inspector || !inspectorTitle || !inspectorCanvas || !inspectorMeta) {
      this.setAuthoringStatus("Output inspector unavailable · inspect the mapping panel", true);
      return;
    }
    const selectedLook = outputGrid.dataset.shaderLook ?? "Current shader";
    const shaderFamily = outputGrid.dataset.shaderFamily ?? "neutral";
    const label = mappingViewLabel(view);
    const outputMode = sourceCanvas.dataset.outputMode === "pre" ? "pre-mapping source" : "post-mapping projector raster";
    inspectorTitle.textContent = `${label} · ${selectedLook}`;
    inspectorCanvas.setAttribute(
      "aria-label",
      `${label} · ${selectedLook} · ${shaderFamily} · ${outputMode}`,
    );
    inspector.dataset.view = view;
    inspector.hidden = false;
    const sourceIndex = Number(sourceCanvas.dataset.projectorOutput ?? 0);
    this.refreshProjectorOutputFrame(sourceIndex);
    inspectorMeta.innerHTML = `<strong>${escapeHtml(selectedLook)}</strong><span>${escapeHtml(shaderFamily)} · ${outputMode} · live render</span>`;
    if (announce) {
      this.setAuthoringStatus(`${label} inline inspector opened`, false);
    }
    if (announce && closeButton && typeof closeButton.focus === "function") {
      closeButton.focus();
    }
  }

  private openOutputWindow(view: MappingViewMode): void {
    if (typeof window.open !== "function") {
      this.openOutputInspector(view);
      return;
    }
    const output = window.open(
      "",
      `orbital-${view}`,
      "popup,width=760,height=600,resizable=yes",
    );
    if (!output) {
      this.openOutputInspector(view);
      this.setAuthoringStatus("Output window blocked · inline inspector opened", false);
      return;
    }
    const label = mappingViewLabel(view);
    const outputGrid = document.getElementById("output-grid");
    const sourceCanvas = view.startsWith("projector-")
      ? outputGrid?.querySelector<HTMLCanvasElement>(`[data-output-view="${view}"] canvas`)
      : outputGrid?.querySelector<HTMLCanvasElement>("canvas[data-projector-output]");
    if (!sourceCanvas) {
      output.close();
      this.openOutputInspector(view);
      return;
    }
    const selectedLook = outputGrid?.dataset.shaderLook ?? "Current shader";
    const shaderFamily = outputGrid?.dataset.shaderFamily ?? "neutral";
    const safeLabel = escapeHtml(label);
    const safeLook = escapeHtml(selectedLook);
    const safeFamily = escapeHtml(shaderFamily);
    const safeMode = sourceCanvas.dataset.outputMode === "pre" ? "pre-mapping source" : "post-mapping projector raster";
    output.document.title = `Orbital · ${label} · ${selectedLook}`;
    output.document.body.innerHTML = `
      <style>
        :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background:#030605; color:#e9efec; }
        body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 50% 38%, #102c38, #030605 65%); }
        main { width:min(92vw, 720px); display:grid; gap:16px; }
        header { display:flex; justify-content:space-between; align-items:baseline; color:#8b9a94; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
        strong { color:#e9efec; font-size:16px; letter-spacing:.04em; }
        .surface { aspect-ratio:16/10; overflow:auto; display:grid; place-items:center; border:1px solid rgba(206,234,224,.24); background:#000; box-shadow:0 0 42px rgba(45,205,198,.12); }
        canvas { width:100%; height:auto; display:block; image-rendering:auto; }
        small { color:#63736c; letter-spacing:.04em; }
        .meta { display:flex; justify-content:space-between; gap:12px; color:#8b9a94; font-size:11px; letter-spacing:.06em; }
        .meta strong { font-size:11px; color:#b9d6ce; }
      </style>
      <main><header><strong>ORBITAL</strong><span>${safeLabel}</span></header><div class="surface"><canvas width="640" height="400" aria-label="${safeLabel} · ${safeLook} · ${safeFamily} live projector raster"></canvas></div><div class="meta"><strong>${safeLook}</strong><span>${safeFamily} · ${safeMode} · live render</span></div><small>Monitor window only · physical accuracy requires a measured camera solve</small></main>`;
    const windowCanvas = output.document.querySelector("canvas") as HTMLCanvasElement | null;
    const syncWindow = () => {
      if (output.closed || !windowCanvas) return;
      windowCanvas.getContext("2d")?.drawImage(sourceCanvas, 0, 0, windowCanvas.width, windowCanvas.height);
    };
    syncWindow();
    const syncTimer = window.setInterval(syncWindow, 100);
    output.addEventListener("beforeunload", () => window.clearInterval(syncTimer), { once: true });
    output.focus();
  }

  private buildTimeline(): void {
    this.timeline.replaceChildren();
    for (const [index, movement] of this.score.movements.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timeline-movement";
      button.dataset.movementId = movement.id;
      button.dataset.majorPeak = String(movement.majorPeak);
      button.style.flexGrow = movement.durationS.toString();
      button.innerHTML = `<span>${(index + 1)
        .toString()
        .padStart(2, "0")}</span><strong>${movement.name}</strong>`;
      button.title = `Seek to ${formatTime(movement.startS)}: ${
        movement.name
      }`;
      button.addEventListener("click", () => {
        this.selectedMovementId = movement.id;
        this.movementEditorSelect.value = movement.id;
        this.syncEditorControls();
        this.callbacks.onSeek(movement.startS);
      });
      this.timeline.append(button);
    }
  }

  private buildEditorOptions(): void {
    this.renderMovementOptions();
    this.curveParameterSelect.replaceChildren();
    for (const parameter of EDITOR_PARAMETERS) {
      const option = document.createElement("option");
      option.value = parameter.key;
      option.textContent = parameter.label;
      this.curveParameterSelect.append(option);
    }
  }

  private renderMovementOptions(): void {
    this.movementEditorSelect.replaceChildren();
    for (const [index, movement] of this.score.movements.entries()) {
      const option = document.createElement("option");
      option.value = movement.id;
      option.textContent = `${(index + 1).toString().padStart(2, "0")} · ${
        movement.name
      }`;
      this.movementEditorSelect.append(option);
    }
    this.movementEditorSelect.value = this.selectedMovementId;
  }

  private selectedMovement(): ShowScore["movements"][number] | null {
    return (
      this.score.movements.find(
        (movement) => movement.id === this.selectedMovementId,
      ) ?? null
    );
  }

  private currentCurveKey(): CurveParameterKey {
    return this.curveParameterSelect.value as CurveParameterKey;
  }

  private syncEditorControls(): void {
    const movement = this.selectedMovement();
    if (!movement) {
      return;
    }
    this.movementEditorSelect.value = movement.id;
    const key = this.currentCurveKey();
    const peakAt = movement.localPeak?.at ?? 0.5;
    const peakOverride = movement.localPeak?.[key];
    const baselinePeak =
      movement.start[key] + (movement.end[key] - movement.start[key]) * peakAt;
    this.curveStartInput.value = movement.start[key].toFixed(2);
    this.curvePeakInput.value = (peakOverride ?? baselinePeak).toFixed(2);
    this.curveEndInput.value = movement.end[key].toFixed(2);
    this.curvePeakAtInput.value = peakAt.toFixed(2);
    this.curveUsePeakInput.checked = peakOverride !== undefined;
    this.curvePeakInput.disabled = !this.curveUsePeakInput.checked;
    this.curvePeakAtInput.disabled = !this.curveUsePeakInput.checked;
    this.elements.curveStartValue.textContent = this.curveStartInput.value;
    this.elements.curvePeakValue.textContent = this.curvePeakInput.value;
    this.elements.curveEndValue.textContent = this.curveEndInput.value;
    this.elements.curvePeakAtValue.textContent = this.curvePeakAtInput.value;
    this.movementDurationInput.value = movement.durationS.toString();
    this.movementMajorPeakInput.checked = movement.majorPeak;
  }

  private applyCurveEdit(): void {
    const movement = this.selectedMovement();
    if (!movement) {
      return;
    }
    try {
      const next = updateMovementCurve(this.score, movement.id, this.currentCurveKey(), {
        start: Number(this.curveStartInput.value),
        peak: Number(this.curvePeakInput.value),
        end: Number(this.curveEndInput.value),
        peakAt: Number(this.curvePeakAtInput.value),
        usePeak: this.curveUsePeakInput.checked,
      });
      this.commitScore(next);
    } catch (error) {
      this.setAuthoringStatus(
        error instanceof Error ? error.message : "Curve edit rejected",
        true,
      );
      this.syncEditorControls();
    }
  }

  private applyDurationEdit(): void {
    const movement = this.selectedMovement();
    if (!movement) {
      return;
    }
    try {
      const next = updateMovementDuration(
        this.score,
        movement.id,
        Number(this.movementDurationInput.value),
      );
      this.commitScore(next);
    } catch (error) {
      this.setAuthoringStatus(
        error instanceof Error ? error.message : "Duration edit rejected",
        true,
      );
      this.syncEditorControls();
    }
  }

  private commitScore(score: ShowScore): void {
    this.score = score;
    this.callbacks.onScoreChange(score);
    this.setAuthoringStatus("Unsaved score edits");
  }

  private buildParameterControls(root: HTMLElement): void {
    const container = this.requireElement(root, "parameter-controls");
    for (const parameter of OVERRIDABLE_PARAMETERS) {
      const wrapper = document.createElement("label");
      wrapper.className = "parameter-control";
      wrapper.innerHTML = `<span>${parameter.label}</span><output>0.00</output>`;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.value = "0";
      input.disabled = true;
      input.dataset.parameterKey = parameter.key;
      input.addEventListener("input", () => {
        const output = wrapper.querySelector("output");
        if (output) {
          output.textContent = Number(input.value).toFixed(2);
        }
      });
      wrapper.append(input);
      container.append(wrapper);
      this.parameterInputs.set(parameter.key, input);
    }
  }

  private buildShaderOptions(root: HTMLElement): void {
    const select = this.requireSelect(root, "shader-select");
    select.innerHTML = CURATED_SHADER_REGISTRY.shaders
      .map(
        (shader) =>
          `<option value="${shader.id}">${shader.name} · ${shader.family}</option>`,
      )
      .join("");
    const shader = getShaderDefinition(this.selectedShaderId) ?? CURATED_SHADER_REGISTRY.shaders[0];
    if (shader) {
      this.setShaderDefinition(shader);
    }
  }

  private updateParameters(parameters: AudiovisualParameters): void {
    if (!this.manualLayer) {
      this.syncParameterInputs(parameters);
    }
    this.elements.parameterReadout.textContent = `Energy ${parameters.energy.toFixed(
      2,
    )} · prediction ${parameters.predictionVisibility.toFixed(2)}`;
  }

  private syncParameterInputs(parameters: AudiovisualParameters): void {
    for (const [key, input] of this.parameterInputs) {
      const value = parameters[key];
      input.value = value.toFixed(2);
      input.disabled = !this.manualLayer;
      const output = input.parentElement?.querySelector("output");
      if (output) {
        output.textContent = value.toFixed(2);
      }
    }
  }

  private updateTimeline(snapshot: RuntimeSnapshot): void {
    document
      .querySelectorAll<HTMLElement>("[data-movement-id]")
      .forEach((element) => {
        const active = element.dataset.movementId === snapshot.movement.id;
        element.dataset.active = String(active);
        if (active) {
          element.style.setProperty(
            "--movement-progress",
            snapshot.movementProgress.toString(),
          );
        } else {
          element.style.removeProperty("--movement-progress");
        }
      });
  }

  private updateQuad(levels: [number, number, number, number]): void {
    levels.forEach((level, index) => {
      const meter = document.querySelector<HTMLElement>(
        `[data-quad-meter="${index}"]`,
      );
      const output = document.querySelector<HTMLElement>(
        `[data-quad-value="${index}"]`,
      );
      meter?.style.setProperty("--level", clamp(level).toString());
      if (output) {
        output.textContent = `${Math.round(clamp(level) * 100)}%`;
      }
    });
  }

  private updateProjectors(levels: ProjectorLevels): void {
    const active = levels.filter((level) => level > 0.01).length;
    this.elements.projectionStatus.textContent = `${active}/5 active · shape-locked`;
    levels.forEach((level, index) => {
      const meter = document.querySelector<HTMLElement>(
        `[data-projector-meter="${index}"]`,
      );
      const output = document.querySelector<HTMLElement>(
        `[data-projector-value="${index}"]`,
      );
      meter?.style.setProperty("--level", clamp(level).toString());
      if (output) {
        output.textContent = `${Math.round(clamp(level) * 100)}%`;
      }
    });
  }

  private exportPreset(): void {
    if (!this.lastSnapshot) {
      return;
    }
    const snapshot = this.applyManualLayer(this.lastSnapshot);
    const payload = {
      schemaVersion: "orbital.content-preset/1.0",
      exportedAtShowTimeS: snapshot.showTimeS,
      movementId: snapshot.movement.id,
      manualLayer: this.manualLayer,
      audiovisual: snapshot.audiovisual,
      note:
        "Development preset only. Fan output, projector calibration and physical tracking are not included.",
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `orbital-${snapshot.movement.id}-${Math.round(
      snapshot.showTimeS,
    )}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  private template(): string {
    return `
      <div class="studio-shell" data-manual-layer="false">
        <header class="studio-header">
          <div class="brand">
            <span class="brand-mark"></span>
            <div>
              <strong>ORBITAL</strong>
              <span>Phase One · mapping lab</span>
            </div>
          </div>
          <div class="mode-switcher" aria-label="Runtime mode">
            <button type="button" data-runtime-mode="simulation" data-active="true">Synthetic</button>
            <button type="button" data-runtime-mode="replay">Replay capture</button>
            <button type="button" data-runtime-mode="live">Live gate</button>
            <input id="replay-input" type="file" accept=".jsonl,.ndjson,text/plain" hidden>
          </div>
          <div class="transport">
            <button id="play-button" class="transport-primary" type="button">Run test</button>
            <button id="reset-button" type="button">Stop</button>
            <select id="rate-select" aria-label="Playback rate">
              <option value="1">1×</option>
              <option value="6">6×</option>
              <option value="30">30×</option>
              <option value="60">60×</option>
            </select>
            <span id="transport-time">TEST LOOP · 00:00</span>
          </div>
        </header>

        <main class="studio-main">
          <section class="stage-column" aria-label="Orbital digital twin">
            <div class="viewport-shell">
              <div id="orbital-viewport"></div>
              <div class="viewport-overlay overlay-top-left">
                <span>PHASE ONE / MAPPING TARGET</span>
                <strong>SPHERE SURFACE</strong>
                <output id="active-shader-readout" class="active-shader-readout" role="status" aria-live="polite">Geometric grid / 01 · geometric</output>
                <small id="parameter-readout">Grid lock · UV follows observed shape</small>
              </div>
              <div class="viewport-overlay overlay-top-right">
                <span id="mode-readout">simulation</span>
                <strong id="tracking-status" data-status="tracking">tracking</strong>
              </div>
              <div class="viewport-overlay live-notice" id="live-notice" hidden>
                Live capture remains unavailable until a measured machine-vision adapter passes hardware tests.
              </div>
              <div class="viewport-legend">
                <span><i class="legend-observed"></i>Observed</span>
                <span><i class="legend-predicted"></i>Predicted</span>
                <span><i class="legend-residual"></i>Residual</span>
              </div>
            </div>

            <section class="mapping-lab-panel" aria-label="Phase One mapping lab">
              <div class="phase-one-heading">
                <div>
                  <span>PHASE ONE / MAPPING LAB</span>
                  <strong>Track the envelope. Inspect the output.</strong>
                </div>
                <output id="phase-one-status" role="status">ACQUIRING · 0 cameras · 0.0 ms source age</output>
              </div>
              <div class="mapping-view-tabs" role="tablist" aria-label="Mapping views">
                ${MAPPING_VIEW_MODES.map((view, index) => `<button type="button" data-mapping-view="${view}" data-active="${index === 0}" role="tab" aria-selected="${index === 0}">${view === "sphere" ? "Sphere" : view === "uv" ? "UV proxy" : `P${view.slice(-1)}`}</button>`).join("")}
                <button id="seam-test-toggle" class="seam-test-toggle" type="button" data-active="false" aria-pressed="false">Seam test</button>
              </div>
              <div id="mapping-view-readout" class="mapping-view-readout">Sphere preview · continuous 3D surface mapping</div>
              <div id="output-grid" class="output-grid" data-view-mode="sphere" data-shader-family="neutral" role="tabpanel" tabindex="0" aria-label="Five projector output previews · neutral shader">
                ${[1, 2, 3, 4, 5].map((index) => {
                  const actionLabel = `Inspect projector ${index} output`;
                  const actionText = "Inspect";
                  return `<article class="output-tile" data-output-view="projector-${index}"><div class="output-tile-heading"><span>P${index}</span><div><button type="button" data-output-mode-index="${index - 1}" aria-label="Projector ${index} output mode: post-mapping. Click to switch.">POST</button><button type="button" data-inspect-view="projector-${index}" aria-label="${actionLabel}">${actionText}</button></div></div><div class="output-tile-preview" role="img" aria-label="Live P${index} projector raster"><canvas data-projector-output="${index - 1}" data-output-mode="post" width="640" height="400"></canvas></div><small>post-mapping · live render</small></article>`;
                }).join("")}
              </div>
              <div class="mapping-lab-note">P1–P5 move the main viewport to each projector camera. After calibration, every tile shows its loaded post-warp shape and per-edge blend mask. SIMULATED means rehearsal data, MEASURED means camera-derived data.</div>
              <section id="output-inspector" class="output-inspector" role="dialog" aria-modal="true" aria-labelledby="output-inspector-title" hidden>
                <div class="output-inspector-panel">
                  <header class="output-inspector-heading">
                    <div><span>INLINE OUTPUT INSPECTOR</span><strong id="output-inspector-title">Projector output</strong></div>
                    <div class="output-inspector-actions"><button type="button" data-output-cycle="previous" aria-label="Previous projector">← P</button><button type="button" data-output-cycle="next" aria-label="Next projector">P →</button><button id="output-inspector-popout" type="button">Open window</button><button id="output-inspector-close" type="button">Close</button></div>
                  </header>
                  <div id="output-inspector-preview" class="output-inspector-preview"><canvas id="output-inspector-canvas" width="640" height="400" role="img"></canvas></div>
                  <div class="output-inspector-zoom"><label for="output-inspector-zoom">Zoom <output id="output-inspector-zoom-value">1.0×</output></label><input id="output-inspector-zoom" type="range" min="1" max="3" step="0.1" value="1"><button id="output-inspector-fullscreen" type="button">Full screen</button></div>
                  <div id="output-inspector-meta" class="output-inspector-meta"></div>
                  <small class="output-inspector-note">This is the final warped and blended raster described by the loaded calibration dataset. Physical accuracy requires a measured camera solve.</small>
                </div>
              </section>
            </section>

            <div class="legacy-runtime-state" hidden aria-hidden="true">
              <section class="timeline-panel" aria-label="Legacy score timeline">
                <div class="timeline-heading">
                  <div>
                    <span>LEGACY SCORE DATA</span>
                    <strong id="movement-index">01 / 08</strong>
                  </div>
                  <p id="movement-description">Hidden in Phase One. The score engine remains available under Advanced tools.</p>
                </div>
                <div id="movement-timeline" class="movement-timeline"></div>
                <input id="show-scrubber" class="show-scrubber" type="range" min="0" max="2880" step="0.1" value="0" aria-label="Legacy show time">
                <span id="movement-name">Phase One</span>
              </section>
            </div>
          </section>

          <aside class="control-column">
            <nav class="workspace-tabs" role="tablist" aria-label="Studio workspaces">
              <button type="button" data-workspace-tab="looks" data-active="true" role="tab" aria-selected="true">Looks</button>
              <button type="button" data-workspace-tab="projection" role="tab" aria-selected="false">Projection</button>
              <button type="button" data-workspace-tab="tracking" role="tab" aria-selected="false">Tracking</button>
              <button type="button" data-workspace-tab="system" role="tab" aria-selected="false">System</button>
              <button type="button" data-workspace-tab="guide" role="tab" aria-selected="false">Guide</button>
            </nav>
            <section class="control-section shader-section" data-workspace-panel="looks">
              <div class="section-heading">
                <span>SHADER TEST BENCH</span>
                <small>click a look to put it on the sphere</small>
              </div>
              <div class="shader-library-toolbar">
                <input id="shader-search" type="search" placeholder="Try ocean, ink, grid, fire, nebula..." aria-label="Search shader presets">
                <select id="shader-family-filter" aria-label="Filter shader family">
                  <option value="all">All families</option>
                  ${CURATED_SHADER_REGISTRY.shaders.map((shader) => `<option value="${shader.family}">${shader.family}</option>`).filter((value, index, values) => values.indexOf(value) === index).join("")}
                </select>
                <select id="shader-gpu-filter" aria-label="Filter shader GPU cost">
                  <option value="all">All GPU tiers</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div class="shader-quick-filters" aria-label="Shader family and Phase One focus filters">
                <button type="button" data-shader-quick="all" data-shader-quick-kind="all" data-active="true" aria-pressed="true">All</button>
                <button type="button" data-shader-quick="phase-one" data-shader-quick-kind="tag" data-active="false" aria-pressed="false">Start here</button>
                <button type="button" data-shader-quick="new" data-shader-quick-kind="tag" data-active="false" aria-pressed="false">New</button>
                <button type="button" data-shader-quick="geometric" data-shader-quick-kind="family" data-active="false" aria-pressed="false">Grid</button>
                <button type="button" data-shader-quick="water" data-active="false" aria-pressed="false">Water</button>
                <button type="button" data-shader-quick="fire" data-active="false" aria-pressed="false">Fire</button>
                <button type="button" data-shader-quick="matrix" data-active="false" aria-pressed="false">Matrix</button>
                <button type="button" data-shader-quick="turbulence" data-active="false" aria-pressed="false">Turbulence</button>
              </div>
              <label class="shader-preview-exposure">
                <span>Preview light <output id="shader-preview-exposure-value">68%</output></span>
                <input id="shader-preview-exposure" type="range" min="0" max="1" step="0.01" value="0.68" aria-label="Shader preview light">
              </label>
              ${SHADER_LOOK_CONTROL_DEFINITIONS.filter((control) => control.id === "motion").map((control) => `
                <label class="shader-preview-exposure shader-animation-speed" title="${control.description}">
                  <span>${control.label} <output>${formatShaderLookControl(control.id, control.defaultValue)}</output></span>
                  <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.defaultValue}" data-shader-look-control="${control.id}" aria-label="${control.label}">
                </label>
              `).join("")}
              <section class="scene-preview-controls" aria-label="Scene and fan lift preview controls">
                <div class="section-heading">
                  <span>SCENE &amp; LIFT</span>
                  <small>simulation only</small>
                </div>
                <label class="fan-test-control">
                  <span>Fan speed <output id="fan-test-cue-value">${Math.round(DEFAULT_FAN_PREVIEW_SPEED * 100)}%</output></span>
                  <input id="fan-test-cue" type="range" min="0" max="1" step="0.01" value="${DEFAULT_FAN_PREVIEW_SPEED}" aria-label="Virtual fan speed and balloon lift">
                </label>
                <input id="fan-test-override" type="checkbox" checked hidden aria-hidden="true">
                <dl class="metric-grid scene-lift-metrics">
                  <div><dt>Airflow</dt><dd id="fan-requested-value">${Math.round(DEFAULT_FAN_PREVIEW_SPEED * 100)}%</dd></div>
                  <div><dt>Simulated</dt><dd id="fan-actual-value">0%</dd></div>
                  <div><dt>Fan clearance</dt><dd id="fan-hover-clearance">0.6 m</dd></div>
                </dl>
                <strong id="fan-state-value" class="fan-state">SIMULATED / HEALTHY</strong>
                <div class="scene-switches">
                  <label class="switch-row"><span>Warehouse laboratory</span><input id="warehouse-enabled" type="checkbox" checked></label>
                  <label class="switch-row"><span>Human scale figures</span><input id="warehouse-people" type="checkbox" checked></label>
                </div>
                <label class="fan-test-control environment-light-control">
                  <span>Warehouse lighting <output id="environment-lighting-value">${Math.round(DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.lighting * 100)}%</output></span>
                  <input id="environment-lighting" type="range" min="0" max="1" step="0.01" value="${DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.lighting}" aria-label="Warehouse environment lighting">
                </label>
                <small class="control-note">Six 3D observers, including chin-stroking poses, establish the scale of the five-metre balloon.</small>
              </section>
              <div id="shader-recent" class="shader-recent" role="group" aria-label="Recently viewed shader presets"></div>
              <div class="shader-catalog-heading"><span>PRESETS</span><small id="shader-catalog-count" role="status" aria-live="polite">${SHADER_PRESET_CATALOG.length} presets · showing 72</small></div>
              <div class="shader-variant-nav" aria-label="Selected shader variant navigator">
                <button type="button" data-shader-variant="previous" aria-label="Previous shader variant">Prev</button>
                <output id="shader-variant-readout" aria-live="polite">VARIANT 01 / ${SHADER_PRESET_VARIANTS_PER_SHADER}</output>
                <button type="button" data-shader-variant="next" aria-label="Next shader variant">Next</button>
              </div>
              <div id="shader-catalog" class="shader-catalog" aria-label="Shader preset shelf"></div>
              <button id="shader-catalog-more" class="shader-catalog-more" type="button" aria-controls="shader-catalog" hidden>Load more presets</button>
              <label class="editor-field shader-base-module" hidden>
                <span>Base module</span>
                <select id="shader-select" aria-label="Shader surface module"></select>
              </label>
              <dl class="metric-grid">
                <div><dt>Family</dt><dd id="shader-family">NEUTRAL</dd></div>
                <div><dt>GPU estimate</dt><dd id="shader-gpu">LOW · 1 pass</dd></div>
              </dl>
              <p id="shader-description" class="shader-description">A quiet fallback surface that keeps the ball legible in near darkness.</p>
              <div id="shader-parameters" class="shader-parameter-list"></div>
              <details class="shader-look-panel" open>
                <summary><span>SHAPE &amp; COLOUR</span><small>applies to every shader</small></summary>
                <div id="shader-look-controls" class="shader-parameter-list shader-look-controls">
                  ${SHADER_LOOK_CONTROL_DEFINITIONS.filter((control) => control.id !== "motion").map((control) => `
                    <label class="shader-parameter" title="${control.description}">
                      <span>${control.label}</span><output>${formatShaderLookControl(control.id, control.defaultValue)}</output>
                      <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.defaultValue}" data-shader-look-control="${control.id}" aria-label="${control.label}">
                    </label>
                  `).join("")}
                </div>
                <button id="reset-shader-look-controls" class="wide-button shader-look-reset" type="button">Reset shape &amp; colour</button>
              </details>
              <div class="shader-action-row">
                <button id="update-selected-shader" class="wide-button primary-action" type="button">Update preset</button>
                <button id="reset-selected-shader" class="wide-button" type="button">Restore saved preset</button>
                <button id="assign-selected-shader" class="wide-button" type="button">Assign to active region</button>
              </div>
              <small class="control-note">The sphere preview runs the original procedural algorithms directly. Calibrated projector output and physical luminance remain open gates.</small>
            </section>

            <section class="control-section region-section" data-workspace-panel="looks">
              <div class="section-heading">
                <span>SURFACE REGIONS</span>
                <small>stack different shaders on the sphere</small>
              </div>
              <label class="switch-row region-enable-row">
                <span>Enable mixed regions</span>
                <input id="surface-regions-enabled" type="checkbox">
              </label>
              <div id="region-assignments" class="region-assignments" aria-label="Surface region shader assignments"></div>
              <div id="region-active" class="region-active" role="status">Full-sphere look active · mixed regions are off</div>
              <small class="control-note">Regions are optional latitude bands. The selected look covers the full sphere until mixed regions are enabled. Assigned algorithm IDs are retained for comparison; calibrated per-region uniforms remain an open integration gate.</small>
            </section>

            <div class="secondary-section module-stack">
            <section class="control-section system-section" data-workspace-panel="tracking">
              <div class="section-heading">
                <span>TRACKING / SHAPE LOCK</span>
                <small>the primary Phase One gate</small>
              </div>
              <dl class="metric-grid">
                <div><dt>Confidence</dt><dd id="confidence-value">100%</dd></div>
                <div><dt>Source age</dt><dd id="source-age-value">0.0 ms</dd></div>
                <div><dt>Cameras</dt><dd id="camera-count-value">4</dd></div>
                <div><dt>Residual</dt><dd id="residual-value">0 mm</dd></div>
              </dl>
              <dl class="metric-list">
                <div><dt>Centre XYZ</dt><dd id="position-value">0, 0, 0 m</dd></div>
                <div><dt>Velocity</dt><dd id="velocity-value">0.00 m/s</dd></div>
              </dl>
              <label class="switch-row">
                <span>Inject tracking loss</span>
                <input id="inject-loss" type="checkbox">
              </label>
            </section>

            <section class="control-section projection-section" data-workspace-panel="projection">
              <div class="section-heading">
                <span>PROJECTOR RIG</span>
                <small>five simulated outputs</small>
              </div>
              <dl class="metric-grid">
                <div><dt>Rig</dt><dd id="projection-rig-status">5/5 active</dd></div>
                <div><dt>Calibration</dt><dd id="projection-calibration-status">SIMULATED</dd></div>
              </dl>
              <label class="editor-field">
                <span>Preview pattern</span>
                <select id="projection-pattern">
                  <option value="authored" selected>Shader surface</option>
                  <option value="coverage">Projector coverage</option>
                  <option value="grid">Calibration grid</option>
                  <option value="seam">Seam stress test</option>
                  <option value="black">Black / alignment</option>
                </select>
              </label>
              <div class="auto-calibration-card">
                <div class="calibration-card-heading">
                  <div><span>AUTOMATIC CALIBRATION</span><strong>Camera-assisted stitch + blend</strong></div>
                  <span class="simulation-badge">SIMULATION</span>
                </div>
                <p>One guided pass locates the sphere, scans structured-light patterns, solves five warp meshes, builds overlap masks, then validates the seams.</p>
                <ol id="calibration-stages" class="calibration-stages">
                  <li><i>1</i><span>Check cameras and outputs</span><strong>WAIT</strong></li>
                  <li><i>2</i><span>Locate the sphere</span><strong>WAIT</strong></li>
                  <li><i>3</i><span>Scan projected patterns</span><strong>WAIT</strong></li>
                  <li><i>4</i><span>Solve five warp meshes</span><strong>WAIT</strong></li>
                  <li><i>5</i><span>Build overlap masks</span><strong>WAIT</strong></li>
                  <li><i>6</i><span>Validate with seam grid</span><strong>WAIT</strong></li>
                </ol>
                <label class="calibration-slider"><span>Overlap <output id="calibration-overlap-value">14%</output></span><input id="calibration-overlap" type="range" min="0.04" max="0.34" step="0.01" value="0.14"></label>
                <label class="calibration-slider"><span>Feather curve <output id="calibration-feather-value">2.2</output></span><input id="calibration-feather" type="range" min="0.5" max="4" step="0.1" value="2.2"></label>
                <label class="calibration-slider"><span>Black level <output id="calibration-black-level-value">2%</output></span><input id="calibration-black-level" type="range" min="0" max="0.12" step="0.005" value="0.02"></label>
                <button id="run-auto-calibration" class="wide-button primary-action" type="button">Run automatic calibration</button>
                <div id="calibration-summary" class="calibration-summary"><strong>Not run</strong><span>Browser rehearsal only</span></div>
              </div>
              <div class="projector-layout" aria-label="Five projector levels">
                ${["FL", "FR", "RL", "RR", "OH"]
                  .map(
                    (label, index) => `
                    <div class="projector-channel">
                      <span>${label}</span>
                      <div class="projector-meter" data-projector-meter="${index}"><i></i></div>
                      <output data-projector-value="${index}">0%</output>
                    </div>`,
                  )
                  .join("")}
              </div>
              <button id="open-installation-guide" class="wide-button" type="button">Open step-by-step setup guide</button>
              <small class="control-note">Per-edge feather masks are normalized across all five projector contributions as the tracked envelope moves. A camera measurement is still required before this can describe a physical installation.</small>
            </section>

            <section class="control-section camera-section" data-workspace-panel="tracking">
              <div class="section-heading">
                <span>CAMERA TRACKING</span>
                <small>five-head lifecycle rehearsal</small>
              </div>
              <dl class="metric-grid">
                <div><dt>Rig state</dt><dd id="camera-rig-status">OFFLINE</dd></div>
                <div><dt>Active</dt><dd id="camera-rig-count">0/5</dd></div>
              </dl>
              <label class="editor-field">
                <span>Camera profile</span>
                <select id="camera-profile">
                  ${CAMERA_PROFILES.map(
                    (profile) =>
                      `<option value="${profile.id}"${profile.id === DEFAULT_CAMERA_PROFILE_ID ? " selected" : ""}>${profile.vendor} · ${profile.model}</option>`,
                  ).join("")}
                </select>
              </label>
              <div class="camera-profile-readout" id="camera-profile-readout">Basler ace 2 a2A2048-114g5mBAS</div>
              <div class="camera-settings-grid">
                <label class="editor-field">
                  <span>Exposure (µs)</span>
                  <input id="camera-exposure" type="number" min="1" max="100000" step="100" value="2500">
                </label>
                <label class="editor-field">
                  <span>Gain (dB)</span>
                  <input id="camera-gain" type="number" min="-12" max="36" step="0.5" value="0">
                </label>
              </div>
              <button id="camera-apply-settings" class="wide-button" type="button">Apply virtual settings</button>
              <div class="camera-actions">
                <button id="camera-discover" type="button">Discover</button>
                <button id="camera-arm" type="button">Arm</button>
                <button id="camera-stream" type="button">Start stream</button>
              </div>
              <div id="camera-health-list" class="camera-health-list"></div>
              <small class="control-note">Default shortlist is an NIR-capable global-shutter profile. All buttons currently exercise a no-write simulator, not the camera hardware.</small>
            </section>
            </div>

            <section class="control-section guide-section" data-workspace-panel="guide">
              <div class="guide-hero"><span>ORBITAL INSTALLATION GUIDE</span><h2>From an empty room to one seamless sphere</h2><p>No prior projection-mapping experience required. Work through these cards in order.</p></div>
              <figure class="rig-diagram" aria-label="Top view of five projectors and cameras around the sphere">
                <svg viewBox="0 0 520 330" role="img">
                  <defs><radialGradient id="sphereGlow"><stop stop-color="#dffef5"/><stop offset="1" stop-color="#5bcab7"/></radialGradient></defs>
                  <rect x="12" y="12" width="496" height="306" rx="18" fill="#07110f" stroke="#28483f"/>
                  <circle cx="260" cy="168" r="53" fill="url(#sphereGlow)" opacity=".9"/><circle cx="260" cy="168" r="66" fill="none" stroke="#8cf3d8" stroke-dasharray="4 7"/>
                  <text x="260" y="174" text-anchor="middle" fill="#06110e" font-size="14" font-weight="700">BALL</text>
                  ${[[80,60,"P1"],[440,60,"P2"],[80,270,"P3"],[440,270,"P4"],[260,36,"P5"]].map(([x,y,label]) => `<g><path d="M${x} ${y} L260 168" stroke="#4ea995" stroke-width="2" opacity=".5"/><rect x="${Number(x)-22}" y="${Number(y)-13}" width="44" height="26" rx="5" fill="#142923" stroke="#83dcc5"/><text x="${x}" y="${Number(y)+5}" text-anchor="middle" fill="#dffef5" font-size="12">${label}</text></g>`).join("")}
                  ${[[155,85,"C1"],[365,85,"C2"],[155,245,"C3"],[365,245,"C4"]].map(([x,y,label]) => `<g><circle cx="${x}" cy="${y}" r="14" fill="#13201e" stroke="#f1bc6a"/><text x="${x}" y="${Number(y)+4}" text-anchor="middle" fill="#f7dcae" font-size="10">${label}</text></g>`).join("")}
                  <rect x="234" y="255" width="52" height="28" rx="5" fill="#1e2926" stroke="#9ca9a4"/><text x="260" y="273" text-anchor="middle" fill="#e8efec" font-size="10">FAN</text>
                </svg>
                <figcaption>Example top view. P1–P5 cover the ball; C1–C4 watch the surface without blocking the projection paths.</figcaption>
              </figure>
              <div class="guide-steps">
                <article><i>1</i><div><h3>Place the physical rig</h3><p>Centre the fan and ball. Lock every projector and camera mount. Mark all floor positions. Do not move hardware after calibration.</p></div></article>
                <article><i>2</i><div><h3>Connect outputs and cameras</h3><p>Connect one computer output to each projector and label them P1 to P5. Connect the global-shutter cameras, then open <strong>Tracking</strong> and press Discover, Arm, Start stream.</p></div></article>
                <article><i>3</i><div><h3>Darken and focus</h3><p>Set each projector to the same resolution, refresh rate, colour mode and focus. Avoid automatic keystone, dynamic contrast and image enhancement.</p></div></article>
                <article><i>4</i><div><h3>Find the ball</h3><p>Check that every camera can see the full silhouette. The live gate must report a valid centre, shape and confidence before measured calibration can begin.</p></div></article>
                <article><i>5</i><div><h3>Run automatic calibration</h3><p>Open <strong>Projection</strong> and press Run automatic calibration. Each projector flashes coded patterns in turn. The cameras identify corresponding surface points and the solver creates five warp meshes.</p></div></article>
                <article><i>6</i><div><h3>Inspect P1 to P5</h3><p>Use P1–P5 under the sphere or press Inspect on a tile. The post-warp view shows the image after geometry correction and edge feathering, exactly according to the loaded calibration dataset.</p></div></article>
                <article><i>7</i><div><h3>Check the seams</h3><p>Select Seam test. Look at every overlap on the physical ball. Adjust overlap, feather curve and black level, then repeat validation until no bright or dark bands remain.</p></div></article>
                <article><i>8</i><div><h3>Test movement</h3><p>Run the grid while the ball rises, falls and bulges. The content should remain locked to the changing surface. If it slips, fix camera visibility or latency before using authored looks.</p></div></article>
                <article class="guide-warning"><i>!</i><div><h3>Keep safety independent</h3><p>The fan requires its own rated controller, emergency stop, guards and physical supervision. The browser app is not a safety controller.</p></div></article>
              </div>
              <a class="wide-button guide-download" href="/docs/Orbital_Studio_Installation_Guide.pdf" target="_blank" rel="noreferrer">Open illustrated PDF booklet</a>
            </section>

            <details class="advanced-section" data-workspace-panel="system">
              <summary>Advanced / legacy score and live bridge</summary>
            <section class="control-section sequencer-section">
              <div class="section-heading">
                <span>LIVE SEQUENCER</span>
                <small>beat, phrase and bridge health</small>
              </div>
              <dl class="metric-grid">
                <div><dt>Beat</dt><dd id="sequencer-beat">0.00</dd></div>
                <div><dt>Bar · beat</dt><dd id="sequencer-bar">1 · 0.00</dd></div>
                <div><dt>Phrase · beat</dt><dd id="sequencer-phrase">1 · 0.00</dd></div>
                <div><dt>Tracks</dt><dd id="sequencer-track">0/0 tracks</dd></div>
              </dl>
              <div class="transport-bridge-heading">
                <span>ABLETON / OSC CLOCK BRIDGE</span>
                <small>receive-only simulator</small>
              </div>
              <div class="transport-bridge-grid">
                <label class="editor-field">
                  <span>Protocol</span>
                  <select id="transport-protocol">
                    <option value="osc">OSC</option>
                    <option value="link">Ableton Link</option>
                    <option value="midi">MIDI clock</option>
                    <option value="mtc">MTC</option>
                  </select>
                </label>
                <dl class="metric-list transport-readout">
                  <div><dt>State</dt><dd id="transport-state" data-state="disconnected">DISCONNECTED</dd></div>
                  <div><dt>Protocol</dt><dd id="transport-protocol-readout">NONE</dd></div>
                  <div><dt>Source age</dt><dd id="transport-age">—</dd></div>
                </dl>
              </div>
              <div class="transport-actions">
                <button id="transport-connect" type="button">Connect virtual clock</button>
                <button id="transport-pulse" type="button">Send clock pulse</button>
                <button id="transport-disconnect" type="button">Disconnect</button>
              </div>
              <small class="control-note">This exercises the versioned bridge and stale-clock fallback only. It opens no Ableton, OSC, MIDI or MTC device.</small>
            </section>

            <section class="control-section content-section">
              <div class="section-heading">
                <span>CONTENT DEVELOPMENT</span>
                <small>shared image and sound parameters</small>
              </div>
              <label class="switch-row manual-switch">
                <span>Manual parameter layer</span>
                <input id="manual-layer" type="checkbox">
              </label>
              <div id="parameter-controls" class="parameter-controls"></div>
              <div class="authoring-heading">
                <span>SHOW AUTHORING</span>
                <small>versioned local score</small>
              </div>
              <div class="authoring-actions">
                <button id="save-show-preset" type="button">Save</button>
                <button id="export-show-preset" type="button">Export</button>
                <button id="load-show-preset" type="button">Load</button>
                <button id="reset-show-score" type="button">Reset score</button>
                <input id="preset-input" type="file" accept=".json,application/json" hidden>
              </div>
              <label class="editor-field">
                <span>Movement</span>
                <select id="movement-editor-select"></select>
              </label>
              <label class="editor-field">
                <span>Curve parameter</span>
                <select id="curve-parameter"></select>
              </label>
              <div class="curve-fields">
                <label class="curve-field">
                  <span>Start <output id="curve-start-value">0.00</output></span>
                  <input id="curve-start" aria-label="Curve start" type="range" min="0" max="1" step="0.01" value="0">
                </label>
                <label class="curve-field">
                  <span>Peak <output id="curve-peak-value">0.00</output></span>
                  <input id="curve-peak" aria-label="Curve peak" type="range" min="0" max="1" step="0.01" value="0" disabled>
                </label>
                <label class="curve-field">
                  <span>End <output id="curve-end-value">0.00</output></span>
                  <input id="curve-end" aria-label="Curve end" type="range" min="0" max="1" step="0.01" value="0">
                </label>
                <label class="curve-field">
                  <span>Peak position <output id="curve-peak-at-value">0.50</output></span>
                  <input id="curve-peak-at" aria-label="Curve peak position" type="range" min="0.05" max="0.95" step="0.01" value="0.5" disabled>
                </label>
              </div>
              <label class="switch-row editor-switch">
                <span>Use local peak for this parameter</span>
                <input id="curve-use-peak" type="checkbox">
              </label>
              <div class="editor-meta">
                <label class="editor-field">
                  <span>Duration (seconds)</span>
                  <input id="movement-duration" type="number" min="30" max="1800" step="1" value="360">
                </label>
                <label class="switch-row">
                  <span>Major peak</span>
                  <input id="movement-major-peak" type="checkbox">
                </label>
                <button id="apply-duration" class="editor-apply" type="button">Apply duration</button>
              </div>
              <div id="authoring-status" class="authoring-status" role="status">Bundled score · edits are unsaved</div>
              <button id="export-preset" class="wide-button" type="button">Export current snapshot</button>
            </section>

            <section class="control-section cue-section">
              <div class="section-heading">
                <span>CUE BRIDGE</span>
                <small>20 Hz timestamped JSONL</small>
              </div>
              <dl class="metric-grid cue-metrics">
                <div><dt>Frames</dt><dd id="cue-frame-count">0</dd></div>
                <div><dt>Duration</dt><dd id="cue-duration">00:00.0</dd></div>
              </dl>
              <div class="cue-actions">
                <button id="record-cue-stream" class="wide-button" type="button">Record cue stream</button>
                <button id="export-cue-stream" class="wide-button" type="button">Export JSONL</button>
                <button id="clear-cue-stream" class="wide-button" type="button">Clear</button>
              </div>
              <div id="cue-status" class="cue-status" role="status">No cue frames recorded</div>
              <small class="cue-note">Shared score, tracking, quad levels, five projector levels and fan telemetry. Hardware writes remain blocked.</small>
              <div class="cue-replay-heading">
                <span>REHEARSAL PLAYBACK</span>
                <small>recorded timing diagnostics</small>
              </div>
              <div class="cue-replay-actions">
                <button id="load-cue-stream" class="wide-button" type="button">Load JSONL</button>
                <button id="cue-replay-play" class="wide-button" type="button" disabled>Play rehearsal</button>
                <button id="cue-replay-reset" class="wide-button" type="button" disabled>Reset</button>
                <input id="cue-replay-input" type="file" accept=".jsonl,.ndjson,text/plain" hidden>
              </div>
              <dl class="metric-grid cue-replay-metrics">
                <div><dt>Replay frames</dt><dd id="cue-replay-frame-count">0</dd></div>
                <div><dt>Replay duration</dt><dd id="cue-replay-duration">00:00.0</dd></div>
                <div><dt>Replay position</dt><dd id="cue-replay-position">00:00.0</dd></div>
              </dl>
              <input id="cue-replay-scrubber" class="show-scrubber cue-replay-scrubber" type="range" min="0" max="0" step="0.01" value="0" disabled aria-label="Cue replay position">
              <div id="cue-replay-status" class="cue-status" role="status">No rehearsal stream loaded</div>
            </section>

            <section class="control-section audio-section">
              <div class="section-heading">
                <span>QUAD AUDIO PREVIEW</span>
                <small>browser fold-down, not calibrated output</small>
              </div>
              <div class="quad-layout" aria-label="Simulated quad speaker levels">
                ${["FL", "FR", "RL", "RR"]
                  .map(
                    (label, index) => `
                    <div class="quad-channel">
                      <span>${label}</span>
                      <div class="quad-meter" data-quad-meter="${index}"><i></i></div>
                      <output data-quad-value="${index}">0%</output>
                    </div>`,
                  )
                  .join("")}
              </div>
              <button id="audio-button" class="wide-button" type="button">Enable audio preview</button>
            </section>

            <section class="control-section fan-section">
              <div class="section-heading">
                <span>FAN SAFETY FAULT</span>
                <small>simulator diagnostic</small>
              </div>
              <label class="switch-row">
                <span>Inject controller fault</span>
                <input id="fan-fault" type="checkbox">
              </label>
            </section>

            <section class="control-section performance-section">
              <div class="section-heading">
                <span>RUNTIME HEALTH</span>
                <small>browser frame diagnostics</small>
              </div>
              <label class="quality-select-row" for="render-quality">
                <span>Preview quality</span>
                <select id="render-quality" aria-label="Preview render quality">
                  ${RENDER_QUALITY_MODES.map((mode) => `<option value="${mode}">${mode === "adaptive" ? "Adaptive" : RENDER_QUALITY_PROFILES[mode].label}</option>`).join("")}
                </select>
              </label>
              <div id="render-quality-status" class="quality-status" role="status" aria-live="polite">ADAPTIVE · BALANCED · WARMING</div>
              <small id="render-quality-budget" class="control-note">P95 0.0 ms / 16.7 ms target · 1.25× max DPR</small>
              <dl class="metric-grid">
                <div><dt>Frame rate</dt><dd id="performance-fps">0.0 fps</dd></div>
                <div><dt>Average</dt><dd id="performance-frame-time">0.0 ms</dd></div>
                <div><dt>P95 frame</dt><dd id="performance-p95">0.0 ms</dd></div>
                <div><dt>Status</dt><dd id="performance-status" data-stable="false">WARMING</dd></div>
              </dl>
              <small class="control-note">This measures the local browser render loop. It is not projector motion-to-photon evidence.</small>
            </section>

            <section class="control-section debug-section">
              <div class="section-heading">
                <span>VIEW LAYERS</span>
                <small>development diagnostics</small>
              </div>
              <div class="debug-grid">
                <label><input type="checkbox" data-debug-option="projectors" checked>Projectors</label>
                <label><input type="checkbox" data-debug-option="prediction" checked>Prediction</label>
                <label><input type="checkbox" data-debug-option="speakers" checked>Speakers</label>
                <label><input type="checkbox" data-debug-option="room" checked>Room</label>
              </div>
            </section>
            </details>
          </aside>
        </main>

        <footer class="studio-footer">
          <span>SIMULATION AND REPLAY ARE SOFTWARE EVIDENCE ONLY</span>
          <span>NO CAMERA · PROJECTOR · QUAD ROOM · FAN CONTROL CLAIM</span>
        </footer>
      </div>
    `;
  }

  private requireElement(root: ParentNode, id: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(`#${id}`);
    if (!element) {
      throw new Error(`Missing UI element #${id}`);
    }
    return element;
  }

  private requireInput(root: ParentNode, id: string): HTMLInputElement {
    const element = root.querySelector<HTMLInputElement>(`#${id}`);
    if (!element) {
      throw new Error(`Missing input #${id}`);
    }
    return element;
  }

  private requireSelect(root: ParentNode, id: string): HTMLSelectElement {
    const element = root.querySelector<HTMLSelectElement>(`#${id}`);
    if (!element) {
      throw new Error(`Missing select #${id}`);
    }
    return element;
  }
}
