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
import { createDefaultProjectionRig } from "../core/projectionRig";
import {
  CAMERA_LENS_PRESETS,
  DEFAULT_INSTALLATION_RIG_CONTROLS,
  NIR_ILLUMINATOR_PRESETS,
  PROJECTOR_OPTICAL_PRESETS,
  installationRigSummary,
  normaliseInstallationRigControls,
  type InstallationRigControls,
} from "../core/installationRig";
import {
  DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  warpCornersToCss,
  type ProjectionCalibrationResult,
  type ProjectionCalibrationSettings,
} from "../core/projectionCalibration";
import { describeOutputBlockReason } from "../core/projectionOutputGate";
import { patternRuns, type CalibrationPattern } from "../core/structuredLight";
import { projectorSurfaceSignature } from "../core/scanMapping";
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
  projectionStartingLook,
  type ShaderLookControlId,
  type ShaderLookControls,
} from "../core/shaderLookControls";
import { readShaderShortlist, saveShaderShortlist, toggleShaderShortlist } from "../core/shaderShortlist";
import { CREATIVE_RECIPES, type CreativeRecipe } from "../core/creativeRecipes";
import type { ContentMotionSettings } from "../core/contentMotion";
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
  ENVIRONMENT_LIGHTING_PRESETS,
  fanSpeedToClearanceM,
  type EnvironmentPreviewControls,
} from "../core/environmentPreview";
import {
  createStudioPresetOverride,
  readStudioPresetOverrides,
  writeStudioPresetOverrides,
  type StudioPresetOverrideMap,
} from "../core/studioPresetOverrides";
import type { BernoulliBalloonState } from "../core/bernoulliAirflow";
import {
  BALLOON_MATERIAL_PROFILE_IDS,
  DEFAULT_BALLOON_PHYSICS_CONTROLS,
  DEFAULT_PROJECTION_MATERIAL_CONTROLS,
  materialControlsForProfile,
  type BalloonPhysicsControls,
  type ProjectionMaterialControls,
} from "../core/balloonSurfaceControls";
import type { ProjectionCoverageAnalysis } from "../core/projectionCoverage";
import type { RenderProjectAuthoringState } from "../core/renderProject";
import {
  DEFAULT_LIVING_SKIN_CONTROLS,
  normaliseLivingSkinControls,
  type LivingSkinControls,
  type LivingSkinSequenceMode,
} from "../core/livingSkin";
import {
  SOCIAL_ASPECT_PRESETS,
  SOCIAL_CAMERA_PRESETS,
  type SocialAspectPreset,
  type SocialCameraPreset,
} from "../core/socialCapture";
import {
  DEFAULT_CINEMATIC_SCENE_CONTROLS,
  normaliseCinematicSceneControls,
  type CinematicSceneControls,
} from "../core/cinematicScene";
import {
  DEFAULT_SHADER_EVENT_SOUND_CONTROLS,
  SHADER_EVENT_SOUND_PALETTES,
  normaliseShaderEventSoundControls,
  type ShaderEventSoundControls,
} from "../core/shaderEventSound";
import {
  DEFAULT_PROJECTOR_TEST_PRESET_ID,
  PROJECTOR_TEST_OBSERVATION_VERDICTS,
  PROJECTOR_TEST_PHYSICAL_VERDICTS,
  PROJECTOR_TEST_PRESETS,
  PROJECTOR_TEST_PATTERNS,
  buildProjectorTestFilename,
  buildProjectorTestRecord,
  getProjectorTestPreset,
  parseProjectorTestRecord,
  patternLabel,
  projectorTestObservationVerdictLabel,
  projectorTestPhysicalVerdictLabel,
  projectorTestThrowRatio,
  renderProjectorTestPattern,
  type ProjectorTestPattern,
  type ProjectorTestRecord,
} from "../core/projectorTest";

export interface DebugOptions {
  projectors: boolean;
  prediction: boolean;
  speakers: boolean;
  room: boolean;
}

export interface StudioCallbacks {
  onPlayToggle(): void;
  onAudiovisualShow(): void;
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
  onBalloonPhysicsControls(controls: BalloonPhysicsControls): void;
  onProjectionMaterialControls(controls: ProjectionMaterialControls): void;
  onProjectionPattern(pattern: ProjectionPattern): void;
  onInstallationRigControls(controls: InstallationRigControls): void;
  onRenderProjectorOutput(
    index: number,
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    mode: "pre" | "post",
    driveRuntime: boolean,
  ): void;
  onDisposeProjectorOutput(canvas: HTMLCanvasElement): void;
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
  onExportRenderProject(authoring: RenderProjectAuthoringState): void;
  onLivingSkinControls(controls: LivingSkinControls): void;
  onCinematicSceneControls(controls: CinematicSceneControls): void;
  onCinematicCameraFocus(camera: SocialCameraPreset): void;
  onShaderEventSoundControls(controls: ShaderEventSoundControls): void;
  onAuditionShaderEvent(): void;
  onCaptureSocialStill(aspect: SocialAspectPreset, camera: SocialCameraPreset): void;
  onRecordSocialClip(aspect: SocialAspectPreset, camera: SocialCameraPreset): void;
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
const SHADER_CATALOG_IDS = new Set(SHADER_PRESET_CATALOG.map(card => card.id));
const SHADER_SHORTLIST_IDS = new Set([...SHADER_CATALOG_IDS, ...CREATIVE_RECIPES.map(recipe => `recipe:${recipe.id}`)]);

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
  return id === "exposure" ? `${value > 0 ? "+" : ""}${value.toFixed(2)} EV` : id === "brightness" || id === "saturation" ? `${Math.round(value * 100)}%` : id === "motion" ? `${value.toFixed(2)}×` : id === "shellGridWidth" ? value.toFixed(3) : value.toFixed(2);
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

/**
 * Write the projector window's page. When the window is already full screen (Studio
 * reloaded after an update and Go live is reconnecting it), keep its full-screen
 * surface element and swap only what is inside and around it: replacing the surface
 * itself would drop the window out of full screen, and nobody wants to walk over to
 * the projector after every update.
 */
function writeProjectorWindowBody(output: Window, markup: string): void {
  const doc = output.document;
  const oldSurface = doc.querySelector<HTMLElement>(".surface");
  const keep = !!oldSurface && doc.fullscreenElement === oldSurface;
  if (!keep || !oldSurface) { doc.body.innerHTML = markup; return; }
  const scratch = doc.createElement("div");
  scratch.innerHTML = markup;
  const newSurface = scratch.querySelector<HTMLElement>(".surface");
  const newMain = scratch.querySelector("main"), oldMain = doc.querySelector("main");
  if (!newSurface || !newMain || !oldMain || !oldMain.contains(oldSurface)) { doc.body.innerHTML = markup; return; }
  // Match the fresh surface's attributes too: a stale data attribute from the previous
  // session (the block reason) made status updates overwrite the new canvas.
  for (const name of oldSurface.getAttributeNames()) oldSurface.removeAttribute(name);
  for (const name of newSurface.getAttributeNames()) oldSurface.setAttribute(name, newSurface.getAttribute(name) ?? "");
  oldSurface.replaceChildren(...Array.from(newSurface.childNodes));
  for (const selector of ["header", ".meta"]) {
    const fresh = newMain.querySelector(selector), stale = oldMain.querySelector(selector);
    if (fresh && stale) stale.replaceWith(fresh);
  }
  const freshStyle = scratch.querySelector("style"), staleStyle = doc.querySelector("style");
  if (freshStyle && staleStyle) staleStyle.replaceWith(freshStyle);
}

/** Runs inside a projector window, so it needs nothing from the Studio page that opened it. */
const PROJECTOR_WINDOW_FULLSCREEN_TOGGLE = "document.fullscreenElement?document.exitFullscreen():document.querySelector('.surface').requestFullscreen()";

interface ProjectorOutputWindowSession {
  canvas: HTMLCanvasElement;
  owner: Window;
  frameRequest: number;
  disposed?: boolean;
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
  private installationRigControls: InstallationRigControls = {
    ...DEFAULT_INSTALLATION_RIG_CONTROLS,
  };
  private readonly projectorOutputModes: Array<"pre" | "post"> = [
    "post", "post", "post", "post", "post",
  ];
  private projectionCalibrationSettings: ProjectionCalibrationSettings = {
    ...DEFAULT_PROJECTION_CALIBRATION_SETTINGS,
  };
  private selectedCatalogCardId = "geometric-grid-01";
  private selectedCreativeRecipeName: string | null = null;
  private selectedCreativeRecipeId: string | null = null;
  private creativeRecipeMotionHandler: ((settings: ContentMotionSettings) => void) | null = null;
  private favouriteShaderCardIds: string[] = [];
  private recentShaderCardIds: string[] = ["geometric-grid-01"];
  private activeRegionId = SURFACE_REGION_DEFINITIONS[0]?.id ?? "north-cap";
  private surfaceRegions = [...createDefaultSurfaceRegionAssignments()];
  private surfaceRegionsEnabled = false;
  private currentShaderPreset: ShaderPreset = createShaderPreset("geometric-grid");
  private livingSkinControls: LivingSkinControls = {
    ...DEFAULT_LIVING_SKIN_CONTROLS,
  };
  private cinematicSceneControls: CinematicSceneControls = {
    ...DEFAULT_CINEMATIC_SCENE_CONTROLS,
  };
  private shaderEventSoundControls: ShaderEventSoundControls = {
    ...DEFAULT_SHADER_EVENT_SOUND_CONTROLS,
  };
  private previewExposure = 1;
  private environmentControls: EnvironmentPreviewControls = {
    ...DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS,
  };
  private balloonPhysicsControls: BalloonPhysicsControls = {
    ...DEFAULT_BALLOON_PHYSICS_CONTROLS,
  };
  private projectionMaterialControls: ProjectionMaterialControls = {
    ...DEFAULT_PROJECTION_MATERIAL_CONTROLS,
  };
  private shaderThumbnailRenderer: ((preset: ShaderPreset, canvas: HTMLCanvasElement) => void) | null = null;
  private shaderThumbnailObserver: IntersectionObserver | null = null;
  private readonly visibleShaderThumbnails = new Set<HTMLCanvasElement>();
  private shaderThumbnailIdleRequest: number | null = null;
  private shaderThumbnailTimer: number | null = null;
  private lastCoverageSignature = "";
  private lastProjectionCalibrationResult: ProjectionCalibrationResult | null = null;
  private calibrationStep = -1;
  private calibrationPointCount = 0;
  private outputResolution = { width: 1200, height: 1920, refreshHz: 60 };
  private readonly outputWindowSessions = new Map<
    MappingViewMode,
    ProjectorOutputWindowSession
  >();
  private projectorTestPattern: ProjectorTestPattern = "latency";
  private projectorTestOverlay = true;
  private projectorTestObservedHz: number | null = null;
  private projectorComparisonRecords: ProjectorTestRecord[] = [];
  private projectorTestWindowSession: {
    owner: Window;
    frameRequest: number;
  } | null = null;
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
    this.favouriteShaderCardIds = readShaderShortlist(this.presetStorage, SHADER_SHORTLIST_IDS);
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
      environmentWarmth: this.requireInput(root, "environment-warmth"),
      environmentWarmthValue: this.requireElement(root, "environment-warmth-value"),
      concretePatina: this.requireInput(root, "concrete-patina"),
      concretePatinaValue: this.requireElement(root, "concrete-patina-value"),
      aerodynamicStatus: this.requireElement(root, "aerodynamic-status"),
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
    const physicalLiveSource = world.mode === "live"
      && !world.diagnostics.flags.includes("SIMULATED_NATIVE_CAPTURE")
      && !world.diagnostics.flags.includes("NO_HARDWARE_CLAIM");
    this.elements.phaseOneStatus.textContent = world.mode === "live"
      ? `${world.status.toUpperCase()} · ${world.diagnostics.activeCameraCount} ${physicalLiveSource ? "physical cameras" : "simulated camera streams"} · ${world.diagnostics.sourceAgeMs.toFixed(1)} ms source age`
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
      ? `${world.diagnostics.activeCameraCount} ${physicalLiveSource ? "physical" : "simulated"}`
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
    // Only a simulated bridge needs the "software evidence only" warning; a real camera does not.
    this.elements.liveNotice.hidden = world.mode !== "live" || !world.diagnostics.flags.includes("SIMULATED_NATIVE_CAPTURE");
    this.scrubber.value = snapshot.showTimeS.toString();
    this.updateTimeline(snapshot);
    this.updateParameters(snapshot.audiovisual);
    this.updateQuad(snapshot.quadLevels);
    this.updateProjectors(snapshot.projectorLevels);
    this.updateProjectorPreviewLabels();
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

  updateAerodynamics(state: Readonly<BernoulliBalloonState> | null): void {
    if (!state) {
      this.elements.aerodynamicStatus.textContent = "LIVE TRACKING · AERODYNAMICS MEASURED EXTERNALLY";
      return;
    }
    const lateralM = Math.hypot(state.offsetM.x, state.offsetM.z);
    this.elements.aerodynamicStatus.textContent =
      `VIDEO-DERIVED LATEX · FLOW LOCK ${Math.round(state.flowAttachment * 100)}% · LATERAL ${lateralM.toFixed(2)} m · HOVER ${state.offsetM.y.toFixed(2)} m`;
    this.elements.fanHoverClearance.textContent = `${state.offsetM.y.toFixed(1)} m`;
  }

  updateProjectionCoverage(analysis: Readonly<ProjectionCoverageAnalysis> | null): void {
    if (!analysis) return;
    const signature = `${analysis.status}:${analysis.overallPercent.toFixed(1)}:${analysis.projectors.map((item) => `${item.status}:${item.clippedEdge}`).join(":")}`;
    if (signature === this.lastCoverageSignature) return;
    this.lastCoverageSignature = signature;
    const summary = document.getElementById("coverage-summary");
    if (summary) {
      summary.dataset.status = analysis.status;
      summary.innerHTML = this.installationRigControls.mode === "production-5"
        ? `<strong>${analysis.overallPercent.toFixed(1)}% five-projector envelope coverage</strong><span>${analysis.uncoveredPercent.toFixed(1)}% outside · ${analysis.overlapPercent.toFixed(1)}% overlap</span>`
        : `<strong>One-projector prototype · P${this.installationRigControls.prototypeProjectorIndex + 1}</strong><span>${analysis.projectors[this.installationRigControls.prototypeProjectorIndex]?.coveragePercent.toFixed(1) ?? "0.0"}% in frame · P1–P5 available from Outputs above</span>`;
    }
    analysis.projectors.forEach((projector, index) => {
      const tile = document.querySelector<HTMLElement>(`[data-output-view="projector-${index + 1}"]`);
      if (!tile) return;
      tile.dataset.coverageStatus = projector.status;
      const badge = tile.querySelector<HTMLElement>("[data-coverage-badge]");
      const footer = tile.querySelector<HTMLElement>("small");
      const active = this.installationRigControls.mode === "production-5"
        || index === this.installationRigControls.prototypeProjectorIndex;
      tile.dataset.outputActive = String(active);
      if (badge) {
        badge.textContent = active
          ? `${projector.coveragePercent.toFixed(1)}% · ${projector.clippedEdge === "none" ? "IN FRAME" : `${projector.clippedEdge.toUpperCase()} CLIP`}`
          : "STANDBY · ONE-PROJECTOR MODE";
      }
      if (footer) {
        footer.dataset.previewDescription = active
          ? "post-mapping · diagnostic preview"
          : "output ready · currently inactive";
      }
    });
    this.updateProjectorPreviewLabels();
  }

  private updateProjectorPreviewLabels(): void {
    document.querySelectorAll<HTMLElement>(".output-tile[data-output-view]").forEach(tile => {
      const canvas = tile.querySelector<HTMLCanvasElement>("canvas[data-projector-output]");
      const footer = tile.querySelector<HTMLElement>("small");
      if (!canvas || !footer) return;
      const label = canvas.dataset.previewPaused === "true"
        ? canvas.dataset.previewState === "paused-output-priority"
          ? "PREVIEW PAUSED · OUTPUT PRIORITY"
          : "PREVIEW PAUSED · HIDDEN"
        : canvas.dataset.previewState === "awaiting-frame"
          ? "PREVIEW WAITING FOR FRAME"
          : canvas.dataset.previewState === "blocked"
            ? "PREVIEW BLOCKED · CHECK OUTPUT GATE"
            : footer.dataset.previewDescription ?? "post-mapping · diagnostic preview";
      if (footer.textContent !== label) footer.textContent = label;
    });
  }

  setShaderThumbnailRenderer(
    renderer: (preset: ShaderPreset, canvas: HTMLCanvasElement) => void,
  ): void {
    this.shaderThumbnailRenderer = renderer;
    this.renderVisibleShaderThumbnails();
  }

  updateProjectionCalibration(result: ProjectionCalibrationResult): void {
    this.lastProjectionCalibrationResult = result;
    const exportButton = document.getElementById("export-calibration") as HTMLButtonElement | null;
    if (exportButton) exportButton.disabled = false;
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
        label.dataset.previewDescription = `${projector.meanErrorPx.toFixed(2)} px · post-warp + blend`;
      }
    });
    this.updateProjectorPreviewLabels();
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

  setTestOutputSize(width: number, height: number): void {
    // Existing windows captured their raster at creation. Close them only when
    // the raster actually changes, so a position nudge or re-apply keeps a
    // projector window (and its fullscreen state) alive.
    const rasterChanged = this.outputResolution.width !== width || this.outputResolution.height !== height;
    if (rasterChanged) this.closeProjectorWindows(false);
    this.outputResolution = { width, height, refreshHz: 60 };
    document.getElementById("studio-shell")!.dataset.testLayout = "true";
    const select = document.getElementById('output-resolution') as HTMLSelectElement;
    const value = `${width}x${height}`;
    if (!Array.from(select.options).some(option => option.value === value)) select.add(new Option(`${width} × ${height}`, value));
    select.value = value;
    (document.getElementById('output-refresh') as HTMLSelectElement).value = '60';
    const pattern = document.getElementById('projector-test-resolution') as HTMLSelectElement;
    if (!Array.from(pattern.options).some(option => option.value === value)) pattern.add(new Option(`${width} × ${height}`, value));
    pattern.value = value;
    pattern.dispatchEvent(new Event('change'));
    const orientation = document.querySelector<HTMLElement>('.orientation-readout');
    if (orientation) { orientation.querySelector('strong')!.textContent = width >= height ? 'LANDSCAPE TEST RIG' : 'PORTRAIT TEST RIG'; orientation.querySelector('span')!.textContent = `One projector / ${width} × ${height} requested`; }
    const first = document.querySelector<HTMLElement>('[data-output-view="projector-1"] .output-tile-heading > span');
    if (first) first.textContent = `P1 · ${width >= height ? '0°' : '90°'}`;
    document.querySelectorAll<HTMLButtonElement>('[data-open-output-window]').forEach(button => { button.disabled = button.dataset.openOutputWindow !== 'projector-1'; });
  }

  private outputBlackedOut = true;

  /** True while at least one projector output or projector pattern window is open. */
  hasOpenOutputWindow(): boolean {
    for (const [view, session] of this.outputWindowSessions) {
      if (session.owner.closed) this.disposeProjectorWindow(view, session);
    }
    if (this.projectorTestWindowSession?.owner.closed) this.projectorTestWindowSession = null;
    const open = this.outputWindowSessions.size > 0 || this.projectorTestWindowSession !== null;
    this.syncCloseProjectorWindowsButton(open);
    return open;
  }

  closeProjectorWindows(announce = true): void {
    for (const [view, session] of [...this.outputWindowSessions]) this.disposeProjectorWindow(view, session, true);
    this.outputWindowSessions.clear();
    const test = this.projectorTestWindowSession;
    this.projectorTestWindowSession = null;
    if (test) {
      try { test.owner.cancelAnimationFrame(test.frameRequest); } catch { /* Window already detached. */ }
      try { if (!test.owner.closed) test.owner.close(); } catch { /* Window already detached. */ }
    }
    this.syncCloseProjectorWindowsButton(false);
    if (announce) {
      this.setAuthoringStatus("Projector windows closed", false);
      this.renderVisibleShaderThumbnails();
    }
  }

  private disposeProjectorWindow(view: MappingViewMode, session: ProjectorOutputWindowSession, close = false): void {
    if (session.disposed) return;
    session.disposed = true;
    try { session.owner.cancelAnimationFrame(session.frameRequest); } catch { /* Window already detached. */ }
    this.callbacks.onDisposeProjectorOutput(session.canvas);
    if (this.outputWindowSessions.get(view) === session) this.outputWindowSessions.delete(view);
    if (close) {
      try { if (!session.owner.closed) session.owner.close(); } catch { /* Window already detached. */ }
    }
    this.syncCloseProjectorWindowsButton();
  }

  private syncCloseProjectorWindowsButton(open = this.outputWindowSessions.size > 0 || this.projectorTestWindowSession !== null): void {
    const button = document.getElementById("close-projector-windows") as HTMLButtonElement | null;
    if (button && button.hidden === open) button.hidden = !open;
  }

  getActiveWorkspace(): string {
    return document.querySelector<HTMLElement>(".studio-shell")?.dataset.workspace ?? "looks";
  }

  setOutputBlackout(active: boolean): void {
    this.outputBlackedOut = active;
    const testSurface = this.projectorTestWindowSession?.owner.document.querySelector<HTMLElement>('.surface');
    if (testSurface) testSurface.dataset.blackout = String(active);
    for (const session of this.outputWindowSessions.values()) {
      const surface = session.owner.document.querySelector<HTMLElement>('.surface');
      if (surface) surface.dataset.blackout = String(active);
    }
  }

  /** The open P1 projector output window, if any. */
  private projectorOneWindow(): Window | null {
    const session = this.outputWindowSessions.get("projector-1" as MappingViewMode);
    return session && !session.owner.closed ? session.owner : null;
  }

  hasProjectorOneWindow(): boolean { return this.projectorOneWindow() !== null; }

  /** True when the P1 window fills its screen: HTML full screen, or macOS full screen (which does not set fullscreenElement). */
  projectorOneIsFullscreen(): boolean {
    const output = this.projectorOneWindow();
    if (!output) return false;
    if (output.document.fullscreenElement) return true;
    return output.innerWidth >= output.screen.width - 2 && output.innerHeight >= output.screen.height - 2;
  }

  /** Device-pixel layout of the P1 raster on screen, or null without a P1 window. See projectorSurfaceSignature. */
  projectorOneSurfaceSignature(): string | null {
    const output = this.projectorOneWindow();
    const canvas = output?.document.querySelector<HTMLCanvasElement>(".surface canvas[data-render-source]");
    if (!output || !canvas) return null;
    const box = canvas.getBoundingClientRect();
    return projectorSurfaceSignature({
      boxLeft: box.left, boxTop: box.top, boxWidth: box.width, boxHeight: box.height,
      rasterWidth: this.outputResolution.width, rasterHeight: this.outputResolution.height,
      devicePixelRatio: output.devicePixelRatio || 1, screenX: output.screenX, screenY: output.screenY,
    });
  }

  getOutputRaster(): { width: number; height: number } {
    return { width: this.outputResolution.width, height: this.outputResolution.height };
  }

  /**
   * Draw a structured-light pattern at native raster 1:1 over the P1 window,
   * above blackout and the sphere. Resolves after two animation frames in the
   * popup so the pattern has been presented before the bridge captures.
   */
  showCalibrationPattern(pattern: CalibrationPattern, width: number, height: number): Promise<void> {
    const output = this.projectorOneWindow();
    if (!output) return Promise.reject(new Error("Open the P1 output window before scanning"));
    const doc = output.document;
    const surface = doc.querySelector<HTMLElement>(".surface");
    if (!surface) return Promise.reject(new Error("P1 output window has no projection surface"));
    let canvas = doc.querySelector<HTMLCanvasElement>("canvas[data-calibration-pattern]");
    if (!canvas) {
      canvas = doc.createElement("canvas");
      canvas.dataset.calibrationPattern = "true";
      // Same box and the same object-fit rule as the live output canvas, so a
      // raster pixel lands on the same physical spot in the scan and in live
      // output, whatever the window scaling. Above the blackout overlay, no
      // smoothing. In full screen at native resolution this is exactly 1:1.
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;z-index:1000;image-rendering:pixelated;background:#000;";
      surface.append(canvas);
    }
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    canvas.hidden = false;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return Promise.reject(new Error("Pattern canvas unavailable"));
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    if(pattern.kind==='spot') {ctx.beginPath();ctx.arc(pattern.x,pattern.y,pattern.radius,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(pattern.x,pattern.y,pattern.radius*.65,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';}
    for (const [start, end] of patternRuns(pattern, width, height)) {
      if (pattern.kind === "gray" && pattern.axis === "y") ctx.fillRect(0, start, width, end - start);
      else ctx.fillRect(start, 0, end - start, height);
    }
    canvas.dataset.patternKind = pattern.kind;
    canvas.dataset.patternDesc = pattern.kind === "gray" ? `${pattern.axis}${pattern.bit}${pattern.inverted ? "i" : ""}` : pattern.kind;
    return new Promise((resolve, reject) => {
      if (output.closed) { reject(new Error("P1 output window closed")); return; }
      output.requestAnimationFrame(() => output.requestAnimationFrame(() => (output.closed ? reject(new Error("P1 output window closed")) : resolve())));
    });
  }

  /** Remove the pattern overlay; normal (blacked out) output shows again. */
  clearCalibrationPattern(): void {
    const canvas = this.projectorOneWindow()?.document.querySelector<HTMLCanvasElement>("canvas[data-calibration-pattern]");
    if (canvas) canvas.remove();
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
    const selectedLook = this.selectedCreativeRecipeName ?? selectedCard?.name ?? `${shader.name} / custom`;
    this.elements.activeShaderReadout.textContent = selectedCard
      ? `${selectedLook} · ${shader.family}`
      : `${selectedLook} · custom`;
    const activeLook = document.getElementById("shader-active-look-name");
    if (activeLook) activeLook.textContent = selectedLook;
    this.updateShaderOutputPreview(shader, resolvedPreset);
    if (selectedCard) {
      this.selectedCatalogCardId = selectedCard.id;
      if (!this.selectedCreativeRecipeName) this.rememberShaderCard(selectedCard.id);
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

  selectTestComposition(shaderId: string): void {
    const card = SHADER_PRESET_CATALOG.find(candidate => candidate.preset.shaderId === shaderId);
    if (!card) throw new Error(`Unknown test composition: ${shaderId}`);
    this.activateShaderCard(card);
  }

  setCreativeRecipeMotionHandler(handler: (settings: ContentMotionSettings) => void): void {
    this.creativeRecipeMotionHandler = handler;
  }

  selectCreativeRecipe(recipe: CreativeRecipe): void {
    const card = SHADER_PRESET_CATALOG.find(candidate => candidate.id === `${recipe.preset.shaderId}-01`);
    if (!card) return;
    this.activateShaderCard(card, undefined, { ignoreSaved: true, recipe });
    this.shaderLookControls = projectionStartingLook(recipe.look);
    document.querySelectorAll<HTMLInputElement>("[data-shader-look-control]").forEach(input => {
      const id = input.dataset.shaderLookControl as ShaderLookControlId;
      input.value = String(this.shaderLookControls[id]);
      const output = input.parentElement?.querySelector("output");
      if (output) output.textContent = formatShaderLookControl(id, this.shaderLookControls[id]);
    });
    this.callbacks.onShaderLookControls(this.shaderLookControls);
    const preset = createShaderPreset(recipe.preset.shaderId, { ...recipe.preset.parameters }, recipe.preset.seed);
    this.setShaderDefinition(card.shader, preset);
    this.callbacks.onShaderPreset(preset);
    this.creativeRecipeMotionHandler?.(recipe.motion);
    this.setAuthoringStatus(`${recipe.name} selected · ${recipe.description}`, false);
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
    const selectedLook = this.selectedCreativeRecipeName ?? selectedCard?.name ?? `${shader.name} / custom`;
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
      label.textContent = `${displayLook} · portrait · ${mode} · live`;
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
        `${viewLabel} · ${displayLook} · P${index + 1} portrait preview`,
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
    const stationaryTest = document.getElementById("studio-shell")?.dataset.testLayout === "true";
    this.elements.playButton.textContent = stationaryTest ? (playing ? "Pause visuals" : "Animate test visuals") : (playing ? "Pause motion" : "Run motion test");
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
      const workspacePurpose = this.requireElement(root, "workspace-purpose");
      const workspacePurposeTitle = this.requireElement(root, "workspace-purpose-title");
      const workspacePurposeCopy = this.requireElement(root, "workspace-purpose-copy");
      const purpose = {
        "projector-test": ["TEST THE PHYSICAL PROJECTOR", "Open deterministic fullscreen patterns, confirm the accepted signal on the projector itself, then export a structured test record."],
        projection: ["SET UP THE OUTPUTS", "Choose one or five projectors, then run guided calibration. Results remain simulated until physical hardware is measured."],
        tracking: ["PROVE SHAPE LOCK", "Inspect confidence, source age and camera health. Use Replay before Live, and treat synthetic data as rehearsal only."],
        system: ["CONNECT AND VERIFY", "Check render performance, transport and device services here. Green software status does not claim that physical hardware is connected."],
        guide: ["INSTALL STEP BY STEP", "Follow the room, camera and projector setup in order. Each physical gate must pass before opening the installation."],
      }[workspace];
      workspacePurpose.hidden = !purpose;
      if (purpose) {
        workspacePurposeTitle.textContent = purpose[0];
        workspacePurposeCopy.textContent = purpose[1];
      }
      this.renderVisibleShaderThumbnails();
    };
    root.querySelectorAll<HTMLButtonElement>("[data-workspace-tab]").forEach((button) => {
      button.addEventListener("click", () => activateWorkspace(button.dataset.workspaceTab ?? "looks"));
    });
    activateWorkspace("looks");
    document.addEventListener("visibilitychange", () => this.renderVisibleShaderThumbnails());
    this.requireElement(root, "close-projector-windows").addEventListener("click", () => this.closeProjectorWindows());
    window.addEventListener("beforeunload", () => {
      // Leave named output windows on their physical display for the next
      // Studio instance to reconnect. Explicit Close still closes them.
      for (const [view, session] of [...this.outputWindowSessions]) this.disposeProjectorWindow(view, session, false);
      const test=this.projectorTestWindowSession;
      if(test) { try { test.owner.cancelAnimationFrame(test.frameRequest); if(!test.owner.closed) test.owner.close(); } catch { /* detached */ } }
      this.projectorTestWindowSession=null;
    }, { once: true });
    this.bindProjectorTest(root);

    const shell = this.requireElement(root, "studio-shell");
    const expertToggle = this.requireElement(root, "looks-expert-toggle");
    const setLooksExpert = (enabled: boolean): void => {
      shell.dataset.looksExpert = String(enabled);
      expertToggle.textContent = enabled ? "Hide expert controls" : "Show expert controls";
      expertToggle.setAttribute("aria-expanded", String(enabled));
      this.requireElement(root, "looks-mode-readout").textContent = enabled
        ? "EXPERT · ALL CONTROLS"
        : "SIMPLE · CREATE A LOOK";
    };
    expertToggle.addEventListener("click", () => {
      setLooksExpert(shell.dataset.looksExpert !== "true");
    });
    setLooksExpert(false);

    const syncQuickShowControls = (): void => {
      const bpm = Math.round(this.livingSkinControls.bpm);
      const fragment = Math.round(
        ((this.livingSkinControls.variety + this.livingSkinControls.glitch + this.livingSkinControls.flashRate) / 3) * 100,
      );
      const level = Math.round(this.shaderEventSoundControls.level * 100);
      const rhythmScatter = Math.round(this.livingSkinControls.eventHold * 100);
      const phraseEvolution = Math.round(this.livingSkinControls.phraseEvolution * 100);
      this.requireInput(root, "quick-show-bpm").value = String(bpm);
      this.requireElement(root, "quick-show-bpm-value").textContent = String(bpm);
      this.requireInput(root, "quick-show-fragment").value = String(fragment);
      this.requireElement(root, "quick-show-fragment-value").textContent = `${fragment}%`;
      this.requireInput(root, "quick-show-sound").value = String(level);
      this.requireElement(root, "quick-show-sound-value").textContent = `${level}%`;
      this.requireInput(root, "quick-show-sound-enabled").checked = this.shaderEventSoundControls.enabled;
      this.requireInput(root, "quick-show-rhythm").value = String(rhythmScatter);
      this.requireElement(root, "quick-show-rhythm-value").textContent = `${rhythmScatter}%`;
      this.requireInput(root, "quick-show-phrase").value = String(phraseEvolution);
      this.requireElement(root, "quick-show-phrase-value").textContent = `${phraseEvolution}%`;
    };
    this.requireElement(root, "quick-audiovisual-show").addEventListener("click", () => {
      const bpm = this.requireInput(root, "quick-show-bpm").value;
      const fragment = this.requireInput(root, "quick-show-fragment").value;
      const sound = this.requireInput(root, "quick-show-sound").value;
      const rhythm = this.requireInput(root, "quick-show-rhythm").value;
      const phrase = this.requireInput(root, "quick-show-phrase").value;
      this.startAudiovisualShow(root);
      this.requireInput(root, "quick-show-bpm").value = bpm;
      this.requireInput(root, "quick-show-bpm").dispatchEvent(new Event("input", { bubbles: true }));
      this.requireInput(root, "quick-show-fragment").value = fragment;
      this.requireInput(root, "quick-show-fragment").dispatchEvent(new Event("input", { bubbles: true }));
      this.requireInput(root, "quick-show-rhythm").value = rhythm;
      this.requireInput(root, "quick-show-rhythm").dispatchEvent(new Event("input", { bubbles: true }));
      this.requireInput(root, "quick-show-phrase").value = phrase;
      this.requireInput(root, "quick-show-phrase").dispatchEvent(new Event("input", { bubbles: true }));
      this.requireInput(root, "quick-show-sound").value = sound;
      this.requireInput(root, "quick-show-sound-enabled").checked = true;
      this.requireInput(root, "quick-show-sound").dispatchEvent(new Event("input", { bubbles: true }));
      this.setAuthoringStatus(
        `Audiovisual show running · P1–P5 · ${Math.round(Number(bpm))} BPM · beat-cut skins + sound`,
        false,
      );
    });
    this.requireInput(root, "quick-show-bpm").addEventListener("input", (event) => {
      const bpm = Number((event.target as HTMLInputElement).value);
      this.updateLivingSkinControls({ bpm });
      root.querySelectorAll<HTMLInputElement>('[data-living-skin-control="bpm"]').forEach((input) => {
        input.value = String(bpm);
        input.parentElement?.querySelector("output")?.replaceChildren(String(Math.round(bpm)));
      });
      this.requireElement(root, "quick-show-bpm-value").textContent = String(Math.round(bpm));
    });
    this.requireInput(root, "quick-show-fragment").addEventListener("input", (event) => {
      const amount = Number((event.target as HTMLInputElement).value) / 100;
      this.updateLivingSkinControls({
        enabled: amount > 0.02,
        variety: 0.42 + amount * 0.58,
        glitch: 0.12 + amount * 0.82,
        flashRate: 0.28 + amount * 0.68,
        patchCount: Math.round(3 + amount * 9),
      });
      this.requireInput(root, "living-skins-enabled").checked = this.livingSkinControls.enabled;
      root.querySelectorAll<HTMLInputElement>("[data-living-skin-control]").forEach((input) => {
        const id = input.dataset.livingSkinControl as keyof LivingSkinControls;
        const value = this.livingSkinControls[id];
        if (typeof value !== "number") return;
        input.value = String(value);
        input.parentElement?.querySelector("output")?.replaceChildren(
          id === "patchCount" || id === "bpm" ? String(Math.round(value)) : value.toFixed(2),
        );
      });
      this.requireElement(root, "quick-show-fragment-value").textContent = `${Math.round(amount * 100)}%`;
    });
    this.requireInput(root, "quick-show-rhythm").addEventListener("input", (event) => {
      const amount = Number((event.target as HTMLInputElement).value) / 100;
      this.updateLivingSkinControls({ eventHold: amount });
      root.querySelectorAll<HTMLInputElement>('[data-living-skin-control="eventHold"]').forEach((input) => {
        input.value = String(amount);
        input.parentElement?.querySelector("output")?.replaceChildren(amount.toFixed(2));
      });
      this.requireElement(root, "quick-show-rhythm-value").textContent = `${Math.round(amount * 100)}%`;
    });
    this.requireInput(root, "quick-show-phrase").addEventListener("input", (event) => {
      const amount = Number((event.target as HTMLInputElement).value) / 100;
      this.updateLivingSkinControls({ phraseEvolution: amount });
      root.querySelectorAll<HTMLInputElement>('[data-living-skin-control="phraseEvolution"]').forEach((input) => {
        input.value = String(amount);
        input.parentElement?.querySelector("output")?.replaceChildren(amount.toFixed(2));
      });
      this.requireElement(root, "quick-show-phrase-value").textContent = `${Math.round(amount * 100)}%`;
    });
    const updateQuickSound = (): void => {
      const enabled = this.requireInput(root, "quick-show-sound-enabled").checked;
      const level = Number(this.requireInput(root, "quick-show-sound").value) / 100;
      this.shaderEventSoundControls = normaliseShaderEventSoundControls({
        ...this.shaderEventSoundControls,
        enabled,
        level,
      });
      this.requireInput(root, "shader-event-sound-enabled").checked = enabled;
      this.requireInput(root, "shader-event-sound-level").value = String(level);
      this.requireElement(root, "shader-event-sound-level-value").textContent = `${Math.round(level * 100)}%`;
      this.requireElement(root, "quick-show-sound-value").textContent = `${Math.round(level * 100)}%`;
      this.callbacks.onShaderEventSoundControls(this.shaderEventSoundControls);
    };
    this.requireInput(root, "quick-show-sound-enabled").addEventListener("change", updateQuickSound);
    this.requireInput(root, "quick-show-sound").addEventListener("input", updateQuickSound);
    syncQuickShowControls();

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
    this.requireElement(root, "audiovisual-show-button").addEventListener("click", () => {
      this.startAudiovisualShow(root);
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
    const environmentWarmth = this.elements.environmentWarmth as HTMLInputElement;
    const concretePatina = this.elements.concretePatina as HTMLInputElement;
    const updateEnvironment = () => {
      const lighting = Number(environmentLighting.value);
      const warmth = Number(environmentWarmth.value);
      const patina = Number(concretePatina.value);
      peopleEnabled.disabled = !warehouseEnabled.checked;
      this.elements.environmentLightingValue.textContent = `${Math.round(lighting * 100)}%`;
      this.elements.environmentWarmthValue.textContent = `${Math.round(warmth * 100)}%`;
      this.elements.concretePatinaValue.textContent = `${Math.round(patina * 100)}%`;
      this.environmentControls = {
        warehouseEnabled: warehouseEnabled.checked,
        peopleEnabled: peopleEnabled.checked,
        lighting,
        warmth,
        concretePatina: patina,
      };
      this.callbacks.onEnvironmentControls(this.environmentControls);
    };
    warehouseEnabled.addEventListener("change", updateEnvironment);
    peopleEnabled.addEventListener("change", updateEnvironment);
    environmentLighting.addEventListener("input", updateEnvironment);
    environmentWarmth.addEventListener("input", updateEnvironment);
    concretePatina.addEventListener("input", updateEnvironment);
    this.requireSelect(root, "environment-lighting-preset").addEventListener("change", (event) => {
      const preset = ENVIRONMENT_LIGHTING_PRESETS[(event.target as HTMLSelectElement).value as keyof typeof ENVIRONMENT_LIGHTING_PRESETS];
      if (!preset) return;
      environmentLighting.value = String(preset.lighting);
      environmentWarmth.value = String(preset.warmth);
      updateEnvironment();
    });
    const refreshPhysics = () => {
      const values = new Map(
        Array.from(root.querySelectorAll<HTMLInputElement>("[data-balloon-physics]")).map((input) => {
          input.parentElement?.querySelector("output")?.replaceChildren(Number(input.value).toFixed(2));
          return [input.dataset.balloonPhysics ?? "", Number(input.value)];
        }),
      );
      this.balloonPhysicsControls = {
        centerDrift: values.get("center-drift") ?? 0,
        verticalBreathing: values.get("vertical-breathing") ?? 0,
        squashStretch: values.get("squash-stretch") ?? 0,
        lowerBulge: values.get("lower-bulge") ?? 0,
        asymmetry: values.get("asymmetry") ?? 0,
        damping: values.get("damping") ?? 0,
        mass: values.get("mass") ?? 0,
        jetTurbulence: values.get("jet-turbulence") ?? 0,
      };
      this.callbacks.onBalloonPhysicsControls(this.balloonPhysicsControls);
    };
    root.querySelectorAll<HTMLInputElement>("[data-balloon-physics]").forEach((input) =>
      input.addEventListener("input", refreshPhysics),
    );
    const materialProfile = this.requireSelect(root, "balloon-material-profile");
    const refreshMaterial = () => {
      const values = new Map(
        Array.from(root.querySelectorAll<HTMLInputElement>("[data-material-control]")).map((input) => {
          input.parentElement?.querySelector("output")?.replaceChildren(Number(input.value).toFixed(2));
          return [input.dataset.materialControl ?? "", Number(input.value)];
        }),
      );
      this.projectionMaterialControls = {
        profile: materialProfile.value as ProjectionMaterialControls["profile"],
        reflectance: values.get("reflectance") ?? 0,
        translucency: values.get("translucency") ?? 0,
        internalBleed: values.get("internal-bleed") ?? 0,
        roughness: values.get("roughness") ?? 0,
      };
      this.callbacks.onProjectionMaterialControls(this.projectionMaterialControls);
    };
    root.querySelectorAll<HTMLInputElement>("[data-material-control]").forEach((input) =>
      input.addEventListener("input", () => {
        materialProfile.value = "custom";
        refreshMaterial();
      }),
    );
    materialProfile.addEventListener("change", () => {
      const profile = materialControlsForProfile(materialProfile.value as ProjectionMaterialControls["profile"]);
      root.querySelectorAll<HTMLInputElement>("[data-material-control]").forEach((input) => {
        const key = input.dataset.materialControl === "internal-bleed"
          ? "internalBleed"
          : input.dataset.materialControl as keyof ProjectionMaterialControls;
        const value = profile[key];
        if (typeof value === "number") input.value = String(value);
      });
      refreshMaterial();
    });
    refreshPhysics();
    refreshMaterial();
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
    const calibrationStages = [
      ["Lock five portrait outputs", "Confirm every projector is secured on its side at 90 degrees and the computer reports a portrait raster."],
      ["Mark six sphere references", "Count six rehearsal points. No camera correspondences are recorded."],
      ["Rehearse structured-light stage", "No patterns are captured here. This is a simulated workflow."],
      ["Generate example calibration", "Create deterministic rehearsal camera and warp values."],
      ["Build stitch and blend masks", "Normalise overlaps, feather curves and black levels."],
      ["Validate the vertical hover envelope", "Run the portrait seam grid from minimum to maximum fan height."],
    ] as const;
    const refreshCalibrationWizard = () => {
      root.querySelectorAll<HTMLElement>("#calibration-stages li").forEach((item, index) => {
        item.dataset.complete = String(this.calibrationStep > index);
        item.dataset.active = String(this.calibrationStep === index);
        const state = item.querySelector("strong");
        if (state) state.textContent = this.calibrationStep > index ? "READY" : this.calibrationStep === index ? "ACTIVE" : "WAIT";
      });
      const active = Math.min(Math.max(this.calibrationStep, 0), calibrationStages.length - 1);
      this.requireElement(root, "calibration-step-title").textContent = this.calibrationStep < 0 ? "Start with locked hardware" : calibrationStages[active][0];
      this.requireElement(root, "calibration-step-help").textContent = this.calibrationStep < 0 ? "The wizard will guide each physical stage and keep simulation clearly labelled." : calibrationStages[active][1];
      this.requireElement(root, "calibration-point-count").textContent = `${this.calibrationPointCount} / 6 alignment points`;
      (this.requireElement(root, "calibration-back") as HTMLButtonElement).disabled = this.calibrationStep <= 0;
      (this.requireElement(root, "calibration-capture-point") as HTMLButtonElement).disabled = this.calibrationStep !== 1;
      const next = this.requireElement(root, "run-auto-calibration") as HTMLButtonElement;
      next.textContent = this.calibrationStep < 0 ? "Start simulated rehearsal" : this.calibrationStep >= 5 ? "Solve and validate" : "Next stage";
      next.disabled = this.calibrationStep === 1 && this.calibrationPointCount < 6;
    };
    this.requireElement(root, "calibration-capture-point").addEventListener("click", () => {
      this.calibrationPointCount = Math.min(12, this.calibrationPointCount + 1);
      refreshCalibrationWizard();
    });
    this.requireElement(root, "calibration-back").addEventListener("click", () => {
      this.calibrationStep = Math.max(0, this.calibrationStep - 1);
      refreshCalibrationWizard();
    });
    this.requireElement(root, "run-auto-calibration").addEventListener("click", () => {
      if (this.calibrationStep < 0) this.calibrationStep = 0;
      else if (this.calibrationStep < 5) this.calibrationStep += 1;
      else {
        refreshCalibrationSettings();
        this.callbacks.onProjectionCalibration(this.projectionCalibrationSettings);
        this.calibrationStep = 6;
      }
      refreshCalibrationWizard();
    });
    this.requireElement(root, "export-calibration").addEventListener("click", () => {
      if (!this.lastProjectionCalibrationResult) return;
      const blob = new Blob([JSON.stringify(this.lastProjectionCalibrationResult, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `orbital-projection-calibration-${this.lastProjectionCalibrationResult.mode}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
    refreshCalibrationWizard();
    const outputResolution = this.requireSelect(root, "output-resolution");
    const outputRefresh = this.requireSelect(root, "output-refresh");
    const refreshOutputRouting = () => {
      const [width, height] = outputResolution.value.split("x").map(Number);
      this.outputResolution = { width, height, refreshHz: Number(outputRefresh.value) };
    };
    outputResolution.addEventListener("change", refreshOutputRouting);
    outputRefresh.addEventListener("change", refreshOutputRouting);
    root.querySelectorAll<HTMLButtonElement>("[data-open-output-window]").forEach((button) =>
      button.addEventListener("click", () => this.openOutputWindow(button.dataset.openOutputWindow as MappingViewMode)),
    );
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
    const updateInstallationRig = () => {
      this.installationRigControls = normaliseInstallationRigControls({
        mode: this.requireSelect(root, "installation-rig-mode").value as InstallationRigControls["mode"],
        prototypeProjectorIndex: Number(this.requireSelect(root, "installation-prototype-head").value),
        projectorOpticId: this.requireSelect(root, "installation-projector-optic").value,
        cameraLensId: this.requireSelect(root, "installation-camera-lens").value,
        nirIlluminatorId: this.requireSelect(root, "installation-nir-light").value,
        cameraSeparationM: Number(this.requireInput(root, "installation-camera-separation").value),
        hazeDensity: Number(this.requireInput(root, "installation-haze").value),
        showTruss: this.requireInput(root, "installation-show-truss").checked,
        showCameras: this.requireInput(root, "installation-show-cameras").checked,
        showNir: this.requireInput(root, "installation-show-nir").checked,
      });
      const summary = installationRigSummary(createDefaultProjectionRig(), this.installationRigControls);
      this.requireSelect(root, "installation-prototype-head").disabled =
        this.installationRigControls.mode === "production-5";
      this.requireSelect(root, "quick-rig-mode").value = this.installationRigControls.mode;
      this.requireElement(root, "quick-rig-status").textContent =
        this.installationRigControls.mode === "production-5"
          ? "P1–P5 ACTIVE"
          : `P${this.installationRigControls.prototypeProjectorIndex + 1} ACTIVE · P${[1, 2, 3, 4, 5].filter((value) => value !== this.installationRigControls.prototypeProjectorIndex + 1).join("/")} STANDBY`;
      this.requireElement(root, "installation-rig-counts").textContent =
        `${summary.activeProjectors}P · ${summary.activeCameras}C · ${summary.activeNir} NIR`;
      this.requireElement(root, "installation-distance").textContent = `${summary.firstDistanceM.toFixed(1)} m`;
      this.requireElement(root, "installation-distance-label").textContent =
        `${this.installationRigControls.mode === "prototype-1" ? `P${this.installationRigControls.prototypeProjectorIndex + 1}` : "P1"} optical path`;
      this.requireElement(root, "installation-haze-value").textContent = `${Math.round(this.installationRigControls.hazeDensity * 100)}%`;
      this.requireElement(root, "installation-camera-separation-value").textContent = `${this.installationRigControls.cameraSeparationM.toFixed(2)} m`;
      this.callbacks.onInstallationRigControls(this.installationRigControls);
    };
    ["installation-rig-mode", "installation-prototype-head", "installation-projector-optic", "installation-camera-lens",
      "installation-nir-light", "installation-camera-separation", "installation-haze",
      "installation-show-truss", "installation-show-cameras", "installation-show-nir"].forEach((id) => {
      this.requireElement(root, id).addEventListener("input", updateInstallationRig);
      this.requireElement(root, id).addEventListener("change", updateInstallationRig);
    });
    this.requireSelect(root, "quick-rig-mode").addEventListener("change", (event) => {
      this.requireSelect(root, "installation-rig-mode").value =
        (event.target as HTMLSelectElement).value;
      updateInstallationRig();
    });
    updateInstallationRig();
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
          this.savePresetFinishing();
        });
      });
    this.requireElement(root, "save-shader-specific").addEventListener("click", () => this.updateSelectedPreset());
    this.elements.shaderLookReset.addEventListener("click", () => {
      this.shaderLookControls = projectionStartingLook(DEFAULT_SHADER_LOOK_CONTROLS);
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
      this.savePresetFinishing();
      this.setAuthoringStatus("Finishing controls reset for this preset", false);
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
    this.requireElement(root, "shader-shortlist-toggle").addEventListener("click", () => {
      const id = this.selectedCreativeRecipeId ? `recipe:${this.selectedCreativeRecipeId}` : this.selectedCatalogCardId;
      this.favouriteShaderCardIds = toggleShaderShortlist(this.favouriteShaderCardIds, id, SHADER_SHORTLIST_IDS);
      const saved = saveShaderShortlist(this.presetStorage, this.favouriteShaderCardIds);
      this.renderShaderShortlist();
      this.setAuthoringStatus(saved ? "Favourite shortlist saved on this browser" : "Shortlist updated for this session; browser storage is unavailable", !saved);
    });
    this.requireElement(root, "shader-shortlist").addEventListener("click", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("[data-favourite-shader-id]") : null;
      const id = button?.dataset.favouriteShaderId;
      const recipe = id?.startsWith("recipe:") ? CREATIVE_RECIPES.find(candidate => `recipe:${candidate.id}` === id) : undefined;
      if (recipe) { this.selectCreativeRecipe(recipe); return; }
      const card = id ? SHADER_PRESET_CATALOG.find(candidate => candidate.id === id) : undefined;
      if (card) this.activateShaderCard(card, `${card.name} selected from favourites`);
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
    this.requireElement(root, "export-render-project").addEventListener("click", () => {
      this.callbacks.onExportRenderProject({
        shaderPreset: this.currentShaderPreset,
        shaderLook: this.shaderLookControls,
        surfaceRegionsEnabled: this.surfaceRegionsEnabled,
        surfaceRegions: this.surfaceRegions,
        previewExposure: this.previewExposure,
        livingSkins: this.livingSkinControls,
        installationRig: this.installationRigControls,
        shaderEventSound: this.shaderEventSoundControls,
      });
    });
    this.requireInput(root, "living-skins-enabled").addEventListener("change", (event) => {
      this.updateLivingSkinControls({ enabled: (event.target as HTMLInputElement).checked });
    });
    this.requireSelect(root, "living-skin-sequence-mode").addEventListener("change", (event) => {
      this.updateLivingSkinControls({
        sequenceMode: (event.target as HTMLSelectElement).value as LivingSkinSequenceMode,
      });
    });
    root.querySelectorAll<HTMLInputElement>("[data-living-skin-control]").forEach((input) => {
      input.addEventListener("input", () => {
        const id = input.dataset.livingSkinControl as keyof LivingSkinControls;
        this.updateLivingSkinControls({ [id]: Number(input.value) });
        input.parentElement?.querySelector("output")?.replaceChildren(
          id === "patchCount" || id === "bpm"
            ? String(Math.round(Number(input.value)))
            : Number(input.value).toFixed(2),
        );
        syncQuickShowControls();
      });
    });
    const updateShaderEventSound = () => {
      this.shaderEventSoundControls = normaliseShaderEventSoundControls({
        enabled: this.requireInput(root, "shader-event-sound-enabled").checked,
        palette: this.requireSelect(root, "shader-event-sound-palette").value as ShaderEventSoundControls["palette"],
        density: Number(this.requireInput(root, "shader-event-sound-density").value),
        reverb: Number(this.requireInput(root, "shader-event-sound-reverb").value),
        level: Number(this.requireInput(root, "shader-event-sound-level").value),
      });
      for (const id of ["density", "reverb", "level"] as const) {
        this.requireElement(root, `shader-event-sound-${id}-value`).textContent =
          `${Math.round(this.shaderEventSoundControls[id] * 100)}%`;
      }
      this.callbacks.onShaderEventSoundControls(this.shaderEventSoundControls);
      syncQuickShowControls();
    };
    ["shader-event-sound-enabled", "shader-event-sound-palette", "shader-event-sound-density",
      "shader-event-sound-reverb", "shader-event-sound-level"].forEach((id) => {
      this.requireElement(root, id).addEventListener("input", updateShaderEventSound);
      this.requireElement(root, id).addEventListener("change", updateShaderEventSound);
    });
    this.requireElement(root, "shader-event-sound-audition").addEventListener("click", () => {
      this.callbacks.onAuditionShaderEvent();
    });
    const updateCinematicScene = () => {
      this.cinematicSceneControls = normaliseCinematicSceneControls({
        cameraTourEnabled: this.requireInput(root, "cinematic-camera-tour").checked,
        cameraA: this.requireSelect(root, "cinematic-camera-a").value as SocialCameraPreset,
        cameraB: this.requireSelect(root, "cinematic-camera-b").value as SocialCameraPreset,
        cameraC: this.requireSelect(root, "cinematic-camera-c").value as SocialCameraPreset,
        transitionSeconds: Number(this.requireInput(root, "cinematic-camera-duration").value),
        holdSeconds: Number(this.requireInput(root, "cinematic-camera-hold").value),
        projectorBodies: this.requireInput(root, "cinematic-projector-bodies").checked,
        projectorThrows: this.requireInput(root, "cinematic-projector-throws").checked,
        technicalGuides: this.requireInput(root, "cinematic-technical-guides").checked,
        fanRig: this.requireInput(root, "cinematic-fan-rig").checked,
        speakerRig: this.requireInput(root, "cinematic-speaker-rig").checked,
        roomArchitecture: this.requireInput(root, "cinematic-room-architecture").checked,
      });
      this.requireElement(root, "cinematic-camera-duration-value").textContent =
        `${this.cinematicSceneControls.transitionSeconds.toFixed(0)} sec`;
      this.requireElement(root, "cinematic-camera-hold-value").textContent =
        `${this.cinematicSceneControls.holdSeconds.toFixed(0)} sec`;
      this.callbacks.onCinematicSceneControls(this.cinematicSceneControls);
      this.setAuthoringStatus(
        this.cinematicSceneControls.cameraTourEnabled
          ? "Smooth three-angle camera tour active"
          : "Manual camera control active",
        false,
      );
    };
    ["cinematic-camera-tour", "cinematic-camera-a", "cinematic-camera-b",
      "cinematic-camera-c", "cinematic-camera-duration", "cinematic-camera-hold",
      "cinematic-projector-bodies", "cinematic-projector-throws", "cinematic-technical-guides",
      "cinematic-fan-rig", "cinematic-speaker-rig", "cinematic-room-architecture"].forEach((id) => {
      this.requireElement(root, id).addEventListener("input", updateCinematicScene);
      this.requireElement(root, id).addEventListener("change", updateCinematicScene);
    });
    root.querySelectorAll<HTMLButtonElement>("[data-camera-focus]").forEach((button) => {
      button.addEventListener("click", () => {
        const slot = button.dataset.cameraFocus as "a" | "b" | "c";
        const camera = this.requireSelect(root, `cinematic-camera-${slot}`).value as SocialCameraPreset;
        this.requireInput(root, "cinematic-camera-tour").checked = false;
        updateCinematicScene();
        this.callbacks.onCinematicCameraFocus(camera);
        this.setAuthoringStatus(`Moving smoothly to shot ${slot.toUpperCase()}`, false);
      });
    });
    this.requireElement(root, "capture-social-still").addEventListener("click", () => {
      this.callbacks.onCaptureSocialStill(this.selectedSocialAspect(), this.selectedSocialCamera());
    });
    this.requireElement(root, "record-social-clip").addEventListener("click", () => {
      this.callbacks.onRecordSocialClip(this.selectedSocialAspect(), this.selectedSocialCamera());
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
        if (label) label.textContent = `${look} · portrait · ${nextMode}-mapping · live`;
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

  private savePresetFinishing(): void {
    if (this.selectedCreativeRecipeId) {
      this.setAuthoringStatus("Recipe controls applied · Save shader-specific settings explicitly to update its catalogue preset", false);
      return;
    }
    try {
      if (!this.presetStorage) throw new Error('Storage unavailable');
      this.presetStorage.setItem(`orbital.finishing/1.0/${this.selectedCatalogCardId}`, JSON.stringify(this.shaderLookControls));
      this.setAuthoringStatus('Projection controls saved for this preset', false);
    } catch { this.setAuthoringStatus('Controls applied, but browser storage is unavailable', true); }
  }

  private activateShaderCard(card: ShaderPresetCard, status?: string, options: { ignoreSaved?: boolean; recipe?: CreativeRecipe } = {}): void {
    this.selectedCatalogCardId = card.id;
    this.selectedCreativeRecipeName = options.recipe?.name ?? null;
    this.selectedCreativeRecipeId = options.recipe?.id ?? null;
    const saved = options.ignoreSaved ? undefined : this.presetOverrides[card.id];
    if (saved) {
      this.applySavedSharedControls(saved);
    }
    let finishing = saved?.lookControls ?? DEFAULT_SHADER_LOOK_CONTROLS;
    try {
      const raw = options.ignoreSaved ? null : this.presetStorage?.getItem(`orbital.finishing/1.0/${card.id}`);
      if (raw) finishing = normaliseShaderLookControls(JSON.parse(raw));
    } catch { /* use validated legacy/default settings */ }
    this.shaderLookControls = projectionStartingLook(finishing);
    this.previewExposure = 1;
    const previewLight = document.getElementById('shader-preview-exposure') as HTMLInputElement | null;
    if (previewLight) previewLight.value = '1';
    const previewReadout = document.getElementById('shader-preview-exposure-value');
    if (previewReadout) previewReadout.textContent = '100%';
    this.callbacks.onShaderPreviewExposure(1);
    document.querySelectorAll<HTMLInputElement>('[data-shader-look-control]').forEach(input => {
      const id = input.dataset.shaderLookControl as ShaderLookControlId;
      input.value = String(this.shaderLookControls[id]);
      const output = input.parentElement?.querySelector('output');
      if (output) output.textContent = formatShaderLookControl(id, this.shaderLookControls[id]);
    });
    this.callbacks.onShaderLookControls(this.shaderLookControls);
    document.querySelectorAll<HTMLElement>('[data-interior-grid-control]').forEach(el => {
      el.hidden = !['interior-orbits', 'interior-crystal', 'interior-tidal', 'back-hemisphere-mesh'].includes(card.shader.id);
    });
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
    const warmth = this.elements.environmentWarmth as HTMLInputElement;
    const patina = this.elements.concretePatina as HTMLInputElement;
    warehouse.checked = saved.environment.warehouseEnabled;
    people.checked = saved.environment.peopleEnabled;
    people.disabled = !warehouse.checked;
    lighting.value = String(saved.environment.lighting);
    warmth.value = String(saved.environment.warmth);
    patina.value = String(saved.environment.concretePatina);
    this.elements.environmentLightingValue.textContent = `${Math.round(saved.environment.lighting * 100)}%`;
    this.elements.environmentWarmthValue.textContent = `${Math.round(saved.environment.warmth * 100)}%`;
    this.elements.concretePatinaValue.textContent = `${Math.round(saved.environment.concretePatina * 100)}%`;
    this.callbacks.onEnvironmentControls(saved.environment);

    this.balloonPhysicsControls = { ...saved.balloonPhysics };
    const physicsValues: Record<string, number> = {
      "center-drift": saved.balloonPhysics.centerDrift,
      "vertical-breathing": saved.balloonPhysics.verticalBreathing,
      "squash-stretch": saved.balloonPhysics.squashStretch,
      "lower-bulge": saved.balloonPhysics.lowerBulge,
      asymmetry: saved.balloonPhysics.asymmetry,
      damping: saved.balloonPhysics.damping,
      mass: saved.balloonPhysics.mass,
      "jet-turbulence": saved.balloonPhysics.jetTurbulence,
    };
    document.querySelectorAll<HTMLInputElement>("[data-balloon-physics]").forEach((input) => {
      input.value = String(physicsValues[input.dataset.balloonPhysics ?? ""] ?? 0);
      input.parentElement?.querySelector("output")?.replaceChildren(Number(input.value).toFixed(2));
    });
    this.callbacks.onBalloonPhysicsControls(saved.balloonPhysics);

    this.projectionMaterialControls = { ...saved.projectionMaterial };
    const profile = document.getElementById("balloon-material-profile") as HTMLSelectElement | null;
    if (profile) profile.value = saved.projectionMaterial.profile;
    const materialValues: Record<string, number> = {
      reflectance: saved.projectionMaterial.reflectance,
      translucency: saved.projectionMaterial.translucency,
      "internal-bleed": saved.projectionMaterial.internalBleed,
      roughness: saved.projectionMaterial.roughness,
    };
    document.querySelectorAll<HTMLInputElement>("[data-material-control]").forEach((input) => {
      input.value = String(materialValues[input.dataset.materialControl ?? ""] ?? 0);
      input.parentElement?.querySelector("output")?.replaceChildren(Number(input.value).toFixed(2));
    });
    this.callbacks.onProjectionMaterialControls(saved.projectionMaterial);
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
    const warmth = Number((this.elements.environmentWarmth as HTMLInputElement).value);
    const concretePatina = Number((this.elements.concretePatina as HTMLInputElement).value);
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
          warmth,
          concretePatina,
        },
        balloonPhysics: this.balloonPhysicsControls,
        projectionMaterial: this.projectionMaterialControls,
      });
      this.presetOverrides = {
        ...this.presetOverrides,
        [card.id]: updated,
      };
      writeStudioPresetOverrides(this.presetStorage, this.presetOverrides);
      this.setAuthoringStatus(
        `${card.name} updated · shader, material, balloon physics, scene and fan speed saved`,
        false,
      );
    } catch (error) {
      this.setAuthoringStatus(
        error instanceof Error ? error.message : "Preset update failed",
        true,
      );
    }
  }

  private updateLivingSkinControls(edit: Partial<LivingSkinControls>): void {
    this.livingSkinControls = normaliseLivingSkinControls({
      ...this.livingSkinControls,
      ...edit,
    });
    this.callbacks.onLivingSkinControls(this.livingSkinControls);
    this.setAuthoringStatus(
      this.livingSkinControls.enabled
        ? `${this.livingSkinControls.patchCount} living shader skins active`
        : "Living shader skins disabled",
      false,
    );
  }

  private startAudiovisualShow(root: HTMLElement): void {
    this.requireSelect(root, "quick-rig-mode").value = "production-5";
    this.requireSelect(root, "installation-rig-mode").value = "production-5";
    this.requireSelect(root, "installation-rig-mode").dispatchEvent(new Event("change"));

    this.requireInput(root, "living-skins-enabled").checked = true;
    this.requireSelect(root, "living-skin-sequence-mode").value = "eruption";
    this.updateLivingSkinControls({
      enabled: true,
      bpm: 112,
      flashRate: 0.82,
      glitch: 0.74,
      variety: 0.9,
      patchCount: 11,
      eventHold: 0.82,
      phraseEvolution: 0.88,
      attackSharpness: 0.86,
    });
    root.querySelectorAll<HTMLInputElement>("[data-living-skin-control]").forEach((input) => {
      const id = input.dataset.livingSkinControl as keyof LivingSkinControls;
      const value = this.livingSkinControls[id];
      if (typeof value !== "number") return;
      input.value = String(value);
      input.parentElement?.querySelector("output")?.replaceChildren(
        id === "patchCount" || id === "bpm" ? String(Math.round(value)) : value.toFixed(2),
      );
    });

    this.requireInput(root, "shader-event-sound-enabled").checked = true;
    this.requireSelect(root, "shader-event-sound-palette").value = "mixed";
    this.shaderEventSoundControls = normaliseShaderEventSoundControls({
      enabled: true,
      palette: "mixed",
      density: 0.78,
      reverb: 0.76,
      level: 0.62,
    });
    for (const id of ["density", "reverb", "level"] as const) {
      const input = this.requireInput(root, `shader-event-sound-${id}`);
      input.value = String(this.shaderEventSoundControls[id]);
      this.requireElement(root, `shader-event-sound-${id}-value`).textContent =
        `${Math.round(this.shaderEventSoundControls[id] * 100)}%`;
    }
    this.callbacks.onShaderEventSoundControls(this.shaderEventSoundControls);
    this.requireInput(root, "quick-show-bpm").value = "112";
    this.requireElement(root, "quick-show-bpm-value").textContent = "112";
    this.requireInput(root, "quick-show-fragment").value = "82";
    this.requireElement(root, "quick-show-fragment-value").textContent = "82%";
    this.requireInput(root, "quick-show-rhythm").value = "82";
    this.requireElement(root, "quick-show-rhythm-value").textContent = "82%";
    this.requireInput(root, "quick-show-phrase").value = "88";
    this.requireElement(root, "quick-show-phrase-value").textContent = "88%";
    this.requireInput(root, "quick-show-sound-enabled").checked = true;
    this.requireInput(root, "quick-show-sound").value = "62";
    this.requireElement(root, "quick-show-sound-value").textContent = "62%";
    this.callbacks.onAudiovisualShow();
    this.setAuthoringStatus("Audiovisual show running · P1–P5 · 112 BPM · beat-cut skins + sound", false);
  }

  private selectedSocialAspect(): SocialAspectPreset {
    return this.requireSelect(document, "social-aspect").value as SocialAspectPreset;
  }

  private selectedSocialCamera(): SocialCameraPreset {
    return this.requireSelect(document, "social-camera").value as SocialCameraPreset;
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
            <button type="button" data-recent-shader-id="${card.id}" data-recent-family="${card.shader.family}" data-recent-variant="${card.variant}" aria-label="Restore ${escapeHtml(card.name)}, ${card.shader.family} shader" aria-pressed="${card.id === this.selectedCatalogCardId}"><canvas class="shader-recent-preview shader-preview-${card.shader.family} shader-preview-${card.shader.id}" data-shader-thumbnail="${card.id}" width="180" height="120" style="--shader-seed:${card.preset.seed % 97}" aria-hidden="true"></canvas><span class="shader-recent-copy"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.shader.family)} · ${card.variant.toString().padStart(2, "0")}</small></span></button>`,
        )
        .join("")}`;
    this.renderVisibleShaderThumbnails();
  }

  private renderShaderShortlist(): void {
    const container = document.getElementById("shader-shortlist");
    const toggle = document.getElementById("shader-shortlist-toggle") as HTMLButtonElement | null;
    const count = document.getElementById("shader-shortlist-count");
    if (!container || !toggle || !count) return;
    const activeId = this.selectedCreativeRecipeId ? `recipe:${this.selectedCreativeRecipeId}` : this.selectedCatalogCardId;
    const saved = this.favouriteShaderCardIds.includes(activeId);
    toggle.textContent = saved ? "Remove selected favourite" : "Favourite selected look";
    toggle.setAttribute("aria-pressed", String(saved));
    count.textContent = `${this.favouriteShaderCardIds.length} saved`;
    container.innerHTML = this.favouriteShaderCardIds.length === 0
      ? '<p class="shader-shortlist-empty">Keep successful looks here for quick recall. Saved on this browser.</p>'
      : this.favouriteShaderCardIds.map(id => {
        const recipe = id.startsWith("recipe:") ? CREATIVE_RECIPES.find(candidate => `recipe:${candidate.id}` === id) : undefined;
        const card = SHADER_PRESET_CATALOG.find(candidate => candidate.id === id);
        const name = recipe?.name ?? card?.name;
        if (!name) return "";
        return `<button type="button" data-favourite-shader-id="${id}" aria-label="Select favourite ${escapeHtml(name)}" aria-pressed="${id === activeId}"><strong>${escapeHtml(name)}</strong><small>${recipe ? "composition" : `${card!.shader.family} · variant ${card!.variant.toString().padStart(2, "0")}`}</small></button>`;
      }).join("");
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
    const selectedCard = SHADER_PRESET_CATALOG.find(card => card.id === this.selectedCatalogCardId);
    const selectedInFilter = !this.selectedCreativeRecipeId && filtered.some(card => card.id === this.selectedCatalogCardId);
    if (selectedCard && selectedInFilter && !visible.some((card) => card.id === selectedCard.id)) {
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
    this.elements.shaderCatalogCount.textContent = `${filtered.length} presets · showing ${visible.length}${this.selectedCreativeRecipeId ? " · composition active" : selectedInFilter ? "" : " · active look outside filter"}`;
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
      ? `<p class="shader-catalog-empty" role="status">No presets match. Your active look continues. Try grid, water, fire or matrix.</p>`
      : visible
        .map(
          (card) => `
          <button type="button" class="shader-card${!this.selectedCreativeRecipeId && card.id === this.selectedCatalogCardId ? " is-selected" : ""}" data-shader-card-id="${card.id}" aria-label="${card.name}, ${card.shader.family} shader" aria-pressed="${!this.selectedCreativeRecipeId && card.id === this.selectedCatalogCardId}">
            <canvas class="shader-card-preview shader-preview-${card.shader.family} shader-preview-${card.shader.id}" data-shader-thumbnail="${card.id}" width="180" height="120" style="--shader-seed:${card.preset.seed % 97}" aria-label="${escapeHtml(card.name)} rendered on the balloon"></canvas>
            <span class="shader-card-name">${card.name}</span>
            <span class="shader-card-meta">${card.shader.family} · ${card.shader.gpuCost}</span>
          </button>`,
        )
        .join("");
    this.renderShaderVariantNavigator();
    this.renderShaderShortlist();
    this.renderVisibleShaderThumbnails();
  }

  private renderVisibleShaderThumbnails(): void {
    this.shaderThumbnailObserver?.disconnect();
    this.visibleShaderThumbnails.clear();
    if (this.shaderThumbnailIdleRequest !== null) window.cancelIdleCallback(this.shaderThumbnailIdleRequest);
    if (this.shaderThumbnailTimer !== null) window.clearTimeout(this.shaderThumbnailTimer);
    this.shaderThumbnailIdleRequest = null;
    this.shaderThumbnailTimer = null;
    if (!this.shaderThumbnailRenderer || this.getActiveWorkspace() !== "looks" || document.visibilityState !== "visible") return;
    const canvases = Array.from(
      document.querySelectorAll<HTMLCanvasElement>("canvas[data-shader-thumbnail]:not([data-rendered='true'])"),
    );
    if (!this.shaderThumbnailObserver) {
      this.shaderThumbnailObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const canvas = entry.target as HTMLCanvasElement;
          if (entry.isIntersecting && canvas.isConnected && canvas.dataset.rendered !== "true") this.visibleShaderThumbnails.add(canvas);
          else this.visibleShaderThumbnails.delete(canvas);
        }
        this.scheduleShaderThumbnail();
      });
    }
    canvases.forEach(canvas => this.shaderThumbnailObserver!.observe(canvas));
  }

  private scheduleShaderThumbnail(): void {
    if (this.shaderThumbnailIdleRequest !== null || this.shaderThumbnailTimer !== null || this.visibleShaderThumbnails.size === 0) return;
    if (this.getActiveWorkspace() !== "looks" || document.visibilityState !== "visible") return;
    if (this.hasOpenOutputWindow()) {
      // Projector frames take priority; resume thumbnail work after the output closes.
      this.shaderThumbnailTimer = window.setTimeout(() => {
        this.shaderThumbnailTimer = null;
        this.scheduleShaderThumbnail();
      }, 1_000);
      return;
    }
    const renderOne = (deadline?: IdleDeadline): void => {
      this.shaderThumbnailIdleRequest = null;
      this.shaderThumbnailTimer = null;
      if (this.getActiveWorkspace() !== "looks" || document.visibilityState !== "visible" || !this.shaderThumbnailRenderer) return;
      if (this.hasOpenOutputWindow() || (deadline && !deadline.didTimeout && deadline.timeRemaining() < 5)) {
        this.scheduleShaderThumbnail();
        return;
      }
      const canvas = this.visibleShaderThumbnails.values().next().value as HTMLCanvasElement | undefined;
      if (!canvas) return;
      this.visibleShaderThumbnails.delete(canvas);
      const card = SHADER_PRESET_CATALOG.find(candidate => candidate.id === canvas.dataset.shaderThumbnail);
      if (card && canvas.isConnected && canvas.getClientRects().length > 0) {
        this.shaderThumbnailRenderer(card.preset, canvas);
        this.shaderThumbnailObserver?.unobserve(canvas);
      }
      this.scheduleShaderThumbnail();
    };
    if (typeof window.requestIdleCallback === "function") {
      this.shaderThumbnailIdleRequest = window.requestIdleCallback(renderOne, { timeout: 1_000 });
    } else {
      this.shaderThumbnailTimer = window.setTimeout(() => renderOne(), 80);
    }
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
    readout.textContent = this.selectedCreativeRecipeName ? "AUTHORED COMPOSITION" : `VARIANT ${selected.variant.toString().padStart(2, "0")} / ${variants.length}`;
    readout.setAttribute(
      "aria-label",
      this.selectedCreativeRecipeName ?? `${selected.name}, variant ${selected.variant} of ${variants.length}`,
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
    const outputMode = sourceCanvas.dataset.outputMode === "pre" ? "portrait pre-mapping source" : "portrait post-mapping projector raster";
    const projectorNumber = Number(sourceCanvas.dataset.projectorOutput ?? 0) + 1;
    inspectorTitle.textContent = `Projector ${projectorNumber} · ${outputMode} · ${selectedLook}`;
    inspectorCanvas.setAttribute(
      "aria-label",
      `Projector ${projectorNumber} · ${selectedLook} · ${shaderFamily} · ${outputMode}`,
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

  private bindProjectorTest(root: HTMLElement): void {
    const preview = this.requireElement(root, "projector-test-preview") as HTMLCanvasElement;
    const patternSelect = this.requireSelect(root, "projector-test-pattern");
    const presetSelect = this.requireSelect(root, "projector-test-preset");
    const overlayInput = this.requireInput(root, "projector-test-overlay");
    const renderPreview = (): void => {
      this.projectorTestPattern = patternSelect.value as ProjectorTestPattern;
      this.projectorTestOverlay = overlayInput.checked;
      renderProjectorTestPattern(preview, {
        pattern: this.projectorTestPattern,
        frame: 24,
        timestampMs: 200,
        startedAtMs: 0,
        showOverlay: this.projectorTestOverlay,
        requestedRefreshHz: Number(this.requireSelect(root, "projector-test-refresh").value),
      });
      this.requireElement(root, "projector-test-pattern-readout").textContent =
        patternLabel(this.projectorTestPattern).toUpperCase();
    };
    patternSelect.addEventListener("change", renderPreview);
    overlayInput.addEventListener("change", renderPreview);
    this.requireSelect(root, "projector-test-refresh").addEventListener("change", renderPreview);
    presetSelect.addEventListener("change", () => {
      const preset = getProjectorTestPreset(presetSelect.value);
      if (!preset) return;
      this.requireInput(root, "projector-test-model").value = preset.projectorModel;
      this.requireInput(root, "projector-test-lens").value = preset.lens;
      this.requireSelect(root, "projector-test-resolution").value = preset.requestedResolution;
      this.requireSelect(root, "projector-test-refresh").value = String(preset.requestedRefreshHz);
      (this.requireElement(root, "projector-test-notes") as HTMLTextAreaElement).value = preset.notes;
      this.requireInput(root, "projector-test-confirmed").checked = false;
      [
        "projector-test-serial",
        "projector-test-firmware",
        "projector-test-signal-mode",
        "projector-test-image-mode",
        "projector-test-throw-distance",
        "projector-test-image-width",
        "projector-test-recording-fps",
        "projector-test-latency-best",
        "projector-test-latency-median",
        "projector-test-latency-worst",
      ].forEach((id) => { this.requireInput(root, id).value = ""; });
      this.requireSelect(root, "projector-test-focus-verdict").value = "not-tested";
      this.requireSelect(root, "projector-test-material-verdict").value = "not-tested";
      this.requireSelect(root, "projector-test-physical-verdict").value = "unmeasured";
      this.projectorTestObservedHz = null;
      this.requireElement(root, "projector-test-observed-hz").textContent = "Not measured";
      this.requireElement(root, "projector-test-status").textContent =
        `PRESET LOADED · ${preset.label.toUpperCase()} · hardware mode unconfirmed`;
      renderPreview();
      this.setAuthoringStatus(`${preset.label} preset loaded`, false);
    });
    root.querySelectorAll<HTMLButtonElement>("[data-projector-test-pattern]").forEach((button) => {
      button.addEventListener("click", () => {
        patternSelect.value = button.dataset.projectorTestPattern ?? "latency";
        renderPreview();
      });
    });
    this.requireElement(root, "open-projector-test").addEventListener("click", () => {
      this.openProjectorTestWindow(root);
    });
    this.requireElement(root, "export-projector-test").addEventListener("click", () => {
      this.exportProjectorTestRecord(root);
    });
    this.requireElement(root, "import-projector-tests").addEventListener("click", () => {
      this.requireInput(root, "projector-test-import").click();
    });
    this.requireInput(root, "projector-test-import").addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      const files = Array.from(input.files ?? []);
      void (async () => {
        const imported: ProjectorTestRecord[] = [];
        const errors: string[] = [];
        for (const file of files) {
          try {
            imported.push(parseProjectorTestRecord(JSON.parse(await file.text())));
          } catch (error) {
            errors.push(`${file.name}: ${error instanceof Error ? error.message : "invalid record"}`);
          }
        }
        if (imported.length > 0) {
          this.projectorComparisonRecords = files.length > 1
            ? imported.slice(-2)
            : [...this.projectorComparisonRecords, ...imported].slice(-2);
          this.renderProjectorTestComparison(root);
        }
        const status = this.requireElement(root, "projector-test-comparison-status");
        if (errors.length > 0) {
          status.textContent = errors.join(" · ");
          status.dataset.state = "error";
          this.setAuthoringStatus("Some projector records could not be imported", true);
        } else if (imported.length > 0) {
          status.textContent = `${this.projectorComparisonRecords.length} verified record${this.projectorComparisonRecords.length === 1 ? "" : "s"} loaded · missing measurements remain unresolved`;
          status.dataset.state = "ready";
          this.setAuthoringStatus("Projector comparison updated", false);
        }
        input.value = "";
      })();
    });
    this.requireElement(root, "clear-projector-tests").addEventListener("click", () => {
      this.projectorComparisonRecords = [];
      this.renderProjectorTestComparison(root);
      const status = this.requireElement(root, "projector-test-comparison-status");
      status.textContent = "No test records loaded";
      status.dataset.state = "empty";
    });
    this.renderProjectorTestComparison(root);
    renderPreview();
  }

  private openProjectorTestWindow(root: HTMLElement): void {
    const output = window.open(
      "",
      "orbital-projector-test",
      "popup,width=1100,height=720,resizable=yes",
    );
    if (!output) {
      this.setAuthoringStatus("Projector test window blocked", true);
      return;
    }
    if (this.projectorTestWindowSession) {
      this.projectorTestWindowSession.owner.cancelAnimationFrame(
        this.projectorTestWindowSession.frameRequest,
      );
      this.projectorTestWindowSession.owner.close();
      this.projectorTestWindowSession = null;
    }
    const [width, height] = this.requireSelect(root, "projector-test-resolution").value
      .split("x")
      .map(Number);
    const requestedRefreshHz = Number(this.requireSelect(root, "projector-test-refresh").value);
    const safePatternLabel = escapeHtml(patternLabel(this.projectorTestPattern));
    output.document.title = `Orbital · Projector test · ${safePatternLabel}`;
    output.document.body.innerHTML = `
      <style>
        :root { color-scheme:dark; font-family:Inter,system-ui,sans-serif; background:#030605; color:#e9efec; }
        body { margin:0; min-height:100vh; overflow:hidden; background:#000; }
        main { width:100vw; height:100vh; display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
        header,.controls { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 12px; background:#040706; color:#8b9a94; font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
        header strong { color:#e9efec; font-size:14px; }
        .surface { position:relative; overflow:hidden; background:#000; }
        .surface:fullscreen { width:100vw; height:100vh; }
        .surface[data-blackout="true"]::after { content:""; position:absolute; inset:0; background:#000; z-index:100; }
        canvas { width:100%; height:100%; display:block; object-fit:contain; image-rendering:auto; }
        button { color:#b9d6ce; border:1px solid #29423b; background:#09110f; padding:6px 9px; }
        output { color:#9cf5dd; font-variant-numeric:tabular-nums; }
      </style>
      <main>
        <header><strong>ORBITAL · PROJECTOR TEST</strong><span>${width}×${height} · REQUESTED ${requestedRefreshHz} Hz</span></header>
        <div class="surface"><canvas width="${width}" height="${height}" aria-label="Orbital ${safePatternLabel} projector test"></canvas></div>
        <div class="controls"><span><strong data-pattern-label>${safePatternLabel}</strong> · <output data-cadence>MEASURING BROWSER CADENCE</output></span><div><button data-cycle>Next pattern</button><button data-overlay>Hide overlay</button><button data-fullscreen>Full screen</button></div></div>
      </main>`;
    const canvas = output.document.querySelector("canvas") as HTMLCanvasElement;
    const testSurface = output.document.querySelector<HTMLElement>('.surface');
    if (testSurface) testSurface.dataset.blackout = String(this.outputBlackedOut);
    const patternReadout = output.document.querySelector<HTMLElement>("[data-pattern-label]");
    const cadenceReadout = output.document.querySelector<HTMLOutputElement>("[data-cadence]");
    const overlayButton = output.document.querySelector<HTMLButtonElement>("[data-overlay]");
    const startedAtMs = output.performance.now();
    const frameTimes: number[] = [];
    let frame = 0;
    let pattern = this.projectorTestPattern;
    let showOverlay = this.projectorTestOverlay;
    let frameRequest = 0;
    const syncControls = (): void => {
      if (patternReadout) patternReadout.textContent = patternLabel(pattern);
      if (overlayButton) overlayButton.textContent = showOverlay ? "Hide overlay" : "Show overlay";
    };
    const cyclePattern = (): void => {
      const index = PROJECTOR_TEST_PATTERNS.findIndex((candidate) => candidate.id === pattern);
      pattern = PROJECTOR_TEST_PATTERNS[(index + 1) % PROJECTOR_TEST_PATTERNS.length].id;
      this.projectorTestPattern = pattern;
      this.requireSelect(root, "projector-test-pattern").value = pattern;
      this.requireSelect(root, "projector-test-pattern").dispatchEvent(new Event("change"));
      syncControls();
    };
    const render = (timestampMs: number): void => {
      if (output.closed) return;
      frame += 1;
      frameTimes.push(timestampMs);
      while (frameTimes.length > 120) frameTimes.shift();
      if (frameTimes.length >= 30) {
        const durationMs = frameTimes[frameTimes.length - 1] - frameTimes[0];
        this.projectorTestObservedHz = durationMs > 0
          ? ((frameTimes.length - 1) * 1000) / durationMs
          : null;
        if (cadenceReadout && this.projectorTestObservedHz !== null) {
          cadenceReadout.textContent = `BROWSER ${this.projectorTestObservedHz.toFixed(1)} Hz · PROJECTOR UNCONFIRMED`;
        }
        const appReadout = document.getElementById("projector-test-observed-hz");
        if (appReadout && this.projectorTestObservedHz !== null) {
          appReadout.textContent = `${this.projectorTestObservedHz.toFixed(1)} Hz browser`;
        }
      }
      renderProjectorTestPattern(canvas, {
        pattern,
        frame,
        timestampMs,
        startedAtMs,
        showOverlay,
        requestedRefreshHz,
      });
      frameRequest = output.requestAnimationFrame(render);
      if (this.projectorTestWindowSession?.owner === output) {
        this.projectorTestWindowSession.frameRequest = frameRequest;
      }
    };
    output.document.querySelector<HTMLButtonElement>("[data-cycle]")?.addEventListener("click", cyclePattern);
    overlayButton?.addEventListener("click", () => {
      showOverlay = !showOverlay;
      this.projectorTestOverlay = showOverlay;
      this.requireInput(root, "projector-test-overlay").checked = showOverlay;
      syncControls();
    });
    output.document.querySelector<HTMLButtonElement>("[data-fullscreen]")?.addEventListener("click", () => {
      if (output.document.fullscreenElement) void output.document.exitFullscreen();
      else void output.document.querySelector<HTMLElement>(".surface")?.requestFullscreen?.();
    });
    output.document.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === 'b') {
        document.getElementById('test-blackout')?.click();
      } else if (event.key === " ") {
        event.preventDefault();
        cyclePattern();
      } else if (event.key.toLowerCase() === "o") {
        showOverlay = !showOverlay;
        syncControls();
      } else if (event.key.toLowerCase() === "f") {
        if (output.document.fullscreenElement) void output.document.exitFullscreen();
        else void output.document.querySelector<HTMLElement>(".surface")?.requestFullscreen?.();
      }
    });
    output.addEventListener("beforeunload", () => {
      output.cancelAnimationFrame(frameRequest);
      if (this.projectorTestWindowSession?.owner === output) {
        this.projectorTestWindowSession = null;
      }
      this.syncCloseProjectorWindowsButton();
    }, { once: true });
    syncControls();
    frameRequest = output.requestAnimationFrame(render);
    this.projectorTestWindowSession = { owner: output, frameRequest };
    this.syncCloseProjectorWindowsButton();
    this.requireElement(root, "projector-test-status").textContent =
      `OPEN · ${width}×${height} · requested ${requestedRefreshHz} Hz · projector confirmation required`;
    this.setAuthoringStatus("Projector test output opened", false);
  }

  private exportProjectorTestRecord(root: HTMLElement): void {
    const value = (id: string): string => this.requireInput(root, id).value.trim();
    const optionalNumber = (id: string): number | null => {
      const raw = value(id);
      const parsed = Number(raw);
      return raw !== "" && Number.isFinite(parsed) ? parsed : null;
    };
    const requestedResolution = this.requireSelect(root, "projector-test-resolution").value;
    const requestedRefreshHz = Number(this.requireSelect(root, "projector-test-refresh").value);
    const record = buildProjectorTestRecord({
      projectorModel: value("projector-test-model"),
      serialNumber: value("projector-test-serial"),
      firmware: value("projector-test-firmware"),
      lens: value("projector-test-lens"),
      signalMode: value("projector-test-signal-mode"),
      imageMode: value("projector-test-image-mode"),
      throwDistanceM: optionalNumber("projector-test-throw-distance"),
      imageWidthM: optionalNumber("projector-test-image-width"),
      requestedResolution,
      requestedRefreshHz,
      projectorConfirmedMode: this.requireInput(root, "projector-test-confirmed").checked,
      observedBrowserHz: this.projectorTestObservedHz === null
        ? null
        : Number(this.projectorTestObservedHz.toFixed(2)),
      recordingFps: optionalNumber("projector-test-recording-fps"),
      latencyBestMs: optionalNumber("projector-test-latency-best"),
      latencyMedianMs: optionalNumber("projector-test-latency-median"),
      latencyWorstMs: optionalNumber("projector-test-latency-worst"),
      focusVerdict: this.requireSelect(root, "projector-test-focus-verdict").value as ProjectorTestRecord["focusVerdict"],
      materialVerdict: this.requireSelect(root, "projector-test-material-verdict").value as ProjectorTestRecord["materialVerdict"],
      physicalTestVerdict: this.requireSelect(root, "projector-test-physical-verdict").value as ProjectorTestRecord["physicalTestVerdict"],
      notes: (this.requireElement(root, "projector-test-notes") as HTMLTextAreaElement).value.trim(),
    });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    const filename = buildProjectorTestFilename(record);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    this.requireElement(root, "projector-test-status").textContent =
      `EXPORTED · ${filename} · physical latency measurement still required`;
    this.setAuthoringStatus("Projector test record exported", false);
  }

  private renderProjectorTestComparison(root: HTMLElement): void {
    const grid = this.requireElement(root, "projector-test-comparison-grid");
    if (this.projectorComparisonRecords.length === 0) {
      grid.innerHTML = `<div class="projector-comparison-empty"><strong>NO RECORDS LOADED</strong><span>Import one or two exported projector test JSON files. No result is inferred from an empty field.</span></div>`;
      return;
    }
    const numberValue = (value: number | null | undefined, suffix: string, digits = 1): string =>
      value === null || value === undefined ? "Not measured" : `${value.toFixed(digits)} ${suffix}`;
    grid.innerHTML = this.projectorComparisonRecords.map((record) => {
      const throwRatio = projectorTestThrowRatio(record);
      const latencyRange = record.latencyBestMs === null || record.latencyBestMs === undefined ||
        record.latencyWorstMs === null || record.latencyWorstMs === undefined
        ? "Not measured"
        : `${record.latencyBestMs.toFixed(1)} to ${record.latencyWorstMs.toFixed(1)} ms`;
      const recordedAt = new Date(record.recordedAt).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const confirmedSignal = record.signalMode.trim() ||
        `${record.requestedResolution} at ${record.requestedRefreshHz} Hz requested`;
      const physicalVerdict = projectorTestPhysicalVerdictLabel(record.physicalTestVerdict ?? "unmeasured");
      return `<article class="projector-comparison-card" data-verdict="${escapeHtml(record.physicalTestVerdict ?? "unmeasured")}">
        <header><strong>${escapeHtml(record.projectorModel || "Unknown projector")}</strong><span>${escapeHtml(recordedAt)}</span></header>
        <dl>
          <div><dt>Signal</dt><dd>${escapeHtml(confirmedSignal)}</dd></div>
          <div><dt>Hardware confirmed</dt><dd>${record.projectorConfirmedMode ? "YES" : "NO"}</dd></div>
          <div><dt>Median latency</dt><dd>${numberValue(record.latencyMedianMs, "ms")}</dd></div>
          <div><dt>Latency range</dt><dd>${latencyRange}</dd></div>
          <div><dt>Recording rate</dt><dd>${numberValue(record.recordingFps, "fps", 0)}</dd></div>
          <div><dt>Throw distance</dt><dd>${numberValue(record.throwDistanceM, "m", 2)}</dd></div>
          <div><dt>Image width</dt><dd>${numberValue(record.imageWidthM, "m", 2)}</dd></div>
          <div><dt>Measured throw</dt><dd>${throwRatio === null ? "Not measured" : throwRatio.toFixed(3)}</dd></div>
          <div><dt>Curved focus</dt><dd>${escapeHtml(projectorTestObservationVerdictLabel(record.focusVerdict ?? "not-tested"))}</dd></div>
          <div><dt>Material response</dt><dd>${escapeHtml(projectorTestObservationVerdictLabel(record.materialVerdict ?? "not-tested"))}</dd></div>
        </dl>
        <div class="projector-comparison-verdict"><span>PHYSICAL VERDICT</span><strong>${escapeHtml(physicalVerdict)}</strong></div>
      </article>`;
    }).join("");
  }

  /**
   * Put a projector window on the projector: the largest screen other than the one
   * Studio is on. Chrome asks once for "window management" permission; without it,
   * or with one screen, the window stays where it opened.
   */
  /** Set by callers that want a freshly opened projector window to go full screen straight away. */
  public fullscreenOnOpen = true;

  /**
   * Make the projector window full screen from a click in Studio. A browser only lets
   * the window that was clicked go full screen, so the click's permission is handed to
   * the projector window with capability delegation (Chrome 104+). Returns false when no
   * projector window is open or the browser cannot delegate.
   */
  public requestProjectorFullscreen(): boolean {
    const owner = this.outputWindowSessions.get("projector-1")?.owner;
    if (!owner || owner.closed) return false;
    try {
      owner.focus();
      (owner.postMessage as (message: unknown, options: { targetOrigin: string; delegate: string }) => void)(
        "orbital-projector-fullscreen", { targetOrigin: window.location.origin, delegate: "fullscreen" },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async placeOnProjectorScreen(output: Window): Promise<void> {
    const details = window as Window & { getScreenDetails?: () => Promise<{ screens: Array<{ availLeft: number; availTop: number; availWidth: number; availHeight: number; width: number; height: number }>; currentScreen: { availLeft: number; availTop: number } }> };
    if (typeof details.getScreenDetails !== "function") return;
    try {
      const { screens, currentScreen } = await details.getScreenDetails();
      const others = screens.filter((screen) => screen.availLeft !== currentScreen.availLeft || screen.availTop !== currentScreen.availTop);
      const target = others.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!target || output.closed) return;
      output.moveTo(target.availLeft, target.availTop);
      output.resizeTo(target.availWidth, target.availHeight);
      output.focus();
    } catch { /* permission declined or unsupported: the window stays where it opened */ }
  }

  private openOutputWindow(view: MappingViewMode): void {
    if (typeof window.open !== "function") {
      this.openOutputInspector(view);
      return;
    }
    const output = window.open(
      "",
      `orbital-${view}`,
      this.outputResolution.width >= this.outputResolution.height
        ? "popup,width=1100,height=700,resizable=yes"
        : "popup,width=620,height=900,resizable=yes",
    );
    if (!output) {
      this.openOutputInspector(view);
      this.setAuthoringStatus("Output window blocked · inline inspector opened", false);
      return;
    }
    // Bring it forward: a new popup can open behind the main window, and an existing
    // window with this name is reused in place (27 September, the window "never opened").
    try { output.focus(); } catch { /* focus is best effort */ }
    const previousSession = this.outputWindowSessions.get(view);
    if (previousSession) this.disposeProjectorWindow(view, previousSession);
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
    const orientation = this.outputResolution.width >= this.outputResolution.height ? "landscape" : "portrait";
    const safeMode = sourceCanvas.dataset.outputMode === "pre" ? `${orientation} pre-mapping source` : `${orientation} post-mapping projector raster`;
    const projectorNumber = Number(sourceCanvas.dataset.projectorOutput ?? 0) + 1;
    const sourceIndex = projectorNumber - 1;
    const { width, height, refreshHz } = this.outputResolution;
    const previousWindowCanvas = output.document.querySelector<HTMLCanvasElement>("canvas");
    if (previousWindowCanvas) {
      this.callbacks.onDisposeProjectorOutput(previousWindowCanvas);
    }
    output.document.title = `Orbital · ${label} · ${selectedLook}`;
    const windowMarkup = `
      <style>
        :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background:#030605; color:#e9efec; }
        body { margin:0; min-height:100vh; display:grid; place-items:center; background:#000; overflow:hidden; }
        main { width:100vw; height:100vh; display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
        header { display:flex; justify-content:space-between; align-items:baseline; color:#8b9a94; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
        strong { color:#e9efec; font-size:16px; letter-spacing:.04em; }
        header,.meta { padding:8px 12px; background:#040706; }
        .surface { position:relative; overflow:hidden; display:grid; place-items:center; background:#000; }
        .surface:fullscreen { width:100vw; height:100vh; }
        .surface[data-blackout="true"]::after { content:""; position:absolute; inset:0; background:#000; z-index:100; }
        canvas { width:100%; height:100%; object-fit:contain; display:block; image-rendering:auto; }
        .identify { position:absolute; inset:0; display:none; place-items:center; color:#fff; background:#00a88b; font:900 24vw/1 system-ui; }
        .identify[data-visible="true"] { display:grid; }
        small { color:#63736c; letter-spacing:.04em; }
        .meta { display:flex; justify-content:space-between; align-items:center; gap:12px; color:#8b9a94; font-size:11px; letter-spacing:.06em; }
        .meta strong { font-size:11px; color:#b9d6ce; }
        [data-block-reason]:empty { display:none; }
        [data-block-reason] { color:#f0a094; font-weight:600; letter-spacing:.04em; }
        button { color:#b9d6ce; border:1px solid #29423b; background:#09110f; padding:5px 8px; }
      </style>
      <main><header><strong>ORBITAL · P${projectorNumber} · PRESS F OR DOUBLE-CLICK FOR FULL SCREEN</strong><span>DIRECT WEBGL · ${width}×${height} · ${refreshHz} Hz</span></header><div class="surface"><canvas width="${width}" height="${height}" data-render-source="direct-webgl" aria-label="${safeLabel} · ${safeLook} · ${safeFamily} native-resolution projector raster"></canvas><div class="identify">P${projectorNumber}</div></div><div class="meta"><strong>${safeLook}</strong><span>${safeFamily} · ${safeMode}</span><span data-block-reason role="status" aria-live="polite"></span><div><button data-freeze>Freeze</button> <button data-identify>Identify</button> <button data-fullscreen onclick="${PROJECTOR_WINDOW_FULLSCREEN_TOGGLE}">Full screen</button></div></div></main>`;
    writeProjectorWindowBody(output, windowMarkup);
    const windowCanvas = output.document.querySelector("canvas") as HTMLCanvasElement | null;
    const surface = output.document.querySelector<HTMLElement>('.surface');
    if (surface) surface.dataset.blackout = String(this.outputBlackedOut);
    const blockReasonLabel = output.document.querySelector<HTMLElement>('.meta [data-block-reason]');
    let lastBlockReason: string | null = null;
    const syncBlockReason = () => {
      if (!blockReasonLabel || !windowCanvas) return;
      const code = windowCanvas.dataset.outputBlockReason || null;
      if (code === lastBlockReason) return;
      lastBlockReason = code;
      const text = describeOutputBlockReason(code);
      blockReasonLabel.textContent = text ? `OUTPUT BLOCKED: ${text}` : "";
      surface?.setAttribute("data-block-reason", code ?? "");
    };
    output.document.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'b') document.getElementById('test-blackout')?.click();
    });
    let frozen = false;
    const syncWindow = () => {
      if (output.closed || !windowCanvas) return;
      if (frozen && this.lastSnapshot?.world.mode !== "live") return;
      // Only the first open output window drives the runtime, so two windows
      // never double-tick the engine. The others only render.
      const firstSession = this.outputWindowSessions.values().next().value;
      const isDriver = !firstSession || firstSession.owner === output;
      this.callbacks.onRenderProjectorOutput(
        sourceIndex,
        windowCanvas,
        width,
        height,
        sourceCanvas.dataset.outputMode === "pre" ? "pre" : "post",
        isDriver,
      );
      syncBlockReason();
    };
    // The render clock belongs to the projector window: its own
    // requestAnimationFrame runs at the projector's refresh while the control
    // page is throttled behind a fullscreen window.
    const session: ProjectorOutputWindowSession = { canvas: windowCanvas!, owner: output, frameRequest: 0 };
    const loop = () => {
      if (output.closed || session.disposed) return;
      session.frameRequest = output.requestAnimationFrame(loop);
      syncWindow();
    };
    if (windowCanvas) this.outputWindowSessions.set(view, session);
    this.syncCloseProjectorWindowsButton();
    syncWindow();
    session.frameRequest = output.requestAnimationFrame(loop);
    output.document.querySelector<HTMLButtonElement>("[data-freeze]")?.addEventListener("click", (event) => {
      if (this.lastSnapshot?.world.mode === "live") {
        frozen = false;
        (event.currentTarget as HTMLButtonElement).textContent = "Live output cannot freeze";
        return;
      }
      frozen = !frozen;
      (event.currentTarget as HTMLButtonElement).textContent = frozen ? "Resume" : "Freeze";
    });
    const identify = output.document.querySelector<HTMLElement>(".identify");
    output.document.querySelector<HTMLButtonElement>("[data-identify]")?.addEventListener("click", () => {
      if (!identify) return;
      identify.dataset.visible = "true";
      output.setTimeout(() => { identify.dataset.visible = "false"; }, 1800);
    });
    output.document.addEventListener("fullscreenchange", syncWindow);
    // Full screen (button, F or Cmd+F, double-click) is wired with inline handlers that live in the
    // projector window itself, so they keep working after Studio reloads and orphans the window.
    // Clear the listener-based versions an earlier build attached, so nothing toggles twice.
    const keyed = output as Window & { __orbitalKeys?: (event: KeyboardEvent) => void; __orbitalDblClick?: () => void };
    if (keyed.__orbitalKeys) output.document.removeEventListener("keydown", keyed.__orbitalKeys);
    if (keyed.__orbitalDblClick) output.document.removeEventListener("dblclick", keyed.__orbitalDblClick);
    keyed.__orbitalKeys = undefined; keyed.__orbitalDblClick = undefined;
    output.document.body.setAttribute("ondblclick", PROJECTOR_WINDOW_FULLSCREEN_TOGGLE);
    output.document.body.setAttribute("onkeydown", "if(event.key.toLowerCase()==='f'&&!event.altKey&&!event.ctrlKey){event.preventDefault();" + PROJECTOR_WINDOW_FULLSCREEN_TOGGLE + "}");
    // Studio's own Full screen button delegates its click to this window (see requestProjectorFullscreen).
    output.document.body.setAttribute("onmessage", "if(event.data==='orbital-projector-fullscreen'&&!document.fullscreenElement){document.querySelector('.surface').requestFullscreen().catch(function(){});}");
    void this.placeOnProjectorScreen(output).then(() => { if (this.fullscreenOnOpen) this.requestProjectorFullscreen(); });
    output.addEventListener("beforeunload", () => {
      output.document.removeEventListener("fullscreenchange", syncWindow);
      this.disposeProjectorWindow(view, session);
    }, { once: true });
    output.focus();
    this.setAuthoringStatus(
      `P${projectorNumber} direct ${width} × ${height} WebGL output opened`,
      false,
    );
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
    this.elements.projectionStatus.textContent = `${active}/5 active · portrait 90° · shape-locked`;
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
      <div id="studio-shell" class="studio-shell" data-manual-layer="false" data-looks-expert="false">
        <header class="studio-header">
          <div class="brand">
            <span class="brand-mark"></span>
            <div>
              <strong>ORBITAL</strong>
              <span>Spherical projection / test studio</span>
            </div>
          </div>
          <div class="mode-switcher" aria-label="Runtime mode">
            <button type="button" data-runtime-mode="simulation" data-active="true">Synthetic</button>
            <button type="button" data-runtime-mode="replay">Replay capture</button>
            <button type="button" data-runtime-mode="live">Live gate</button>
            <input id="replay-input" type="file" accept=".jsonl,.ndjson,text/plain" hidden>
          </div>
          <div class="quick-rig" aria-label="Projector test mode">
            <label for="quick-rig-mode">OUTPUTS</label>
            <select id="quick-rig-mode" aria-label="Active projector test mode">
              <option value="prototype-1">ONE PROJECTOR</option>
              <option value="production-5">ALL FIVE PROJECTORS</option>
            </select>
            <small id="quick-rig-status">P1 ACTIVE · P2/3/4/5 STANDBY</small>
          </div>
          <div class="transport">
            <button id="audiovisual-show-button" class="transport-show" type="button">Play audiovisual show</button>
            <button id="play-button" class="transport-primary" type="button">Run motion test</button>
            <button id="reset-button" type="button">Stop</button>
            <button id="close-projector-windows" type="button" hidden>Close projector windows</button>
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
                Local fused-state bridge active. Simulated native capture is software evidence only, not camera validation.
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
                  return `<article class="output-tile" data-output-view="projector-${index}"><div class="output-tile-heading"><span>P${index} · 90°</span><div><button type="button" data-output-mode-index="${index - 1}" aria-label="Projector ${index} output mode: post-mapping. Click to switch.">POST</button><button type="button" data-inspect-view="projector-${index}" aria-label="${actionLabel}">${actionText}</button><button type="button" data-open-output-window="projector-${index}" aria-label="Open projector ${index} output window">OPEN</button></div></div><div class="output-tile-preview" role="img" aria-label="P${index} projector raster preview"><canvas data-projector-output="${index - 1}" data-output-mode="post" width="300" height="480"></canvas></div><b data-coverage-badge>ANALYSING</b><small data-preview-description="post-mapping · diagnostic preview">post-mapping · diagnostic preview</small></article>`;
                }).join("")}
              </div>
              <div class="mapping-lab-note">P1–P5 move the main viewport to each projector camera. After calibration, every tile shows its loaded post-warp shape and per-edge blend mask. SIMULATED means rehearsal data, MEASURED means camera-derived data.</div>
              <section id="output-inspector" class="output-inspector" role="dialog" aria-modal="true" aria-labelledby="output-inspector-title" hidden>
                <div class="output-inspector-panel">
                  <header class="output-inspector-heading">
                    <div><span>INLINE OUTPUT INSPECTOR</span><strong id="output-inspector-title">Projector output</strong></div>
                    <div class="output-inspector-actions"><button type="button" data-output-cycle="previous" aria-label="Previous projector">← P</button><button type="button" data-output-cycle="next" aria-label="Next projector">P →</button><button id="output-inspector-popout" type="button">Open window</button><button id="output-inspector-close" type="button">Close</button></div>
                  </header>
                  <div id="output-inspector-preview" class="output-inspector-preview"><canvas id="output-inspector-canvas" width="300" height="480" role="img"></canvas></div>
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
              <button type="button" data-workspace-tab="test" role="tab" aria-selected="false">Test bench</button>
              <button type="button" data-workspace-tab="looks" data-active="true" role="tab" aria-selected="true">Looks</button>
              <button type="button" data-workspace-tab="projector-test" role="tab" aria-selected="false">Projector test</button>
              <button type="button" data-workspace-tab="projection" role="tab" aria-selected="false">Projection</button>
              <button type="button" data-workspace-tab="tracking" role="tab" aria-selected="false">Tracking</button>
              <button type="button" data-workspace-tab="system" role="tab" aria-selected="false">System</button>
              <button type="button" data-workspace-tab="guide" role="tab" aria-selected="false">Guide</button>
            </nav>
            <section id="workspace-purpose" class="workspace-purpose" aria-live="polite" hidden>
              <span>WORKSPACE</span>
              <strong id="workspace-purpose-title">SET UP THE OUTPUTS</strong>
              <p id="workspace-purpose-copy"></p>
            </section>
            <section class="control-section shader-section" data-workspace-panel="looks">
              <div class="section-heading">
                <span>SHADER TEST BENCH</span>
                <small>click a look to put it on the sphere</small>
              </div>
              <section class="shader-active-look" aria-label="Active look and favourite shortlist">
                <div class="shader-active-look-heading"><div><span>ACTIVE LOOK</span><strong id="shader-active-look-name">Geometric grid / 01</strong></div><button id="shader-shortlist-toggle" type="button" aria-pressed="false">Favourite selected look</button></div>
                <div class="shader-shortlist-heading"><span>FAVOURITES</span><small id="shader-shortlist-count">0 saved</small></div>
                <div id="shader-shortlist" class="shader-shortlist" role="group" aria-label="Saved favourite looks"></div>
              </section>
              ${SHADER_LOOK_CONTROL_DEFINITIONS.filter((control) => control.id === "motion").map((control) => `
                <label class="shader-preview-exposure shader-animation-speed" title="${control.description}">
                  <span>${control.label} <output>${formatShaderLookControl(control.id, control.defaultValue)}</output></span>
                  <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.defaultValue}" data-shader-look-control="${control.id}" aria-label="${control.label}">
                </label>
              `).join("")}
              <details class="shader-look-panel"><summary>Shader-specific controls</summary><div id="shader-parameters" class="shader-parameter-list"></div><button id="save-shader-specific" class="wide-button" type="button">Save shader-specific settings</button></details>
              <details class="shader-look-panel" open>
                <summary><span>PROJECTION COLOUR &amp; SHELL</span><small>100% native brightness</small></summary>
                <div id="shader-look-controls" class="shader-parameter-list shader-look-controls">
                  ${[...SHADER_LOOK_CONTROL_DEFINITIONS].filter((control) => control.id !== "motion").sort((a, b) => (["exposure", "brightness", "contrast", "saturation"].includes(a.id) ? ["exposure", "brightness", "contrast", "saturation"].indexOf(a.id) : 10) - (["exposure", "brightness", "contrast", "saturation"].includes(b.id) ? ["exposure", "brightness", "contrast", "saturation"].indexOf(b.id) : 10)).map((control) => `
                    <label class="shader-parameter" ${control.id.startsWith("shellGrid") ? 'data-interior-grid-control hidden' : ''} title="${control.description}">
                      <span>${control.label}</span><output>${formatShaderLookControl(control.id, control.defaultValue)}</output>
                      <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.defaultValue}" data-shader-look-control="${control.id}" aria-label="${control.label}">
                    </label>
                  `).join("")}
                </div>
                <button id="reset-shader-look-controls" class="wide-button shader-look-reset" type="button">Reset this preset’s projection controls</button>
              </details>
              <small class="control-note">Bright colours are authored in the shaders. Presets start at 100% native brightness, full original colour and neutral exposure (0 EV). Raising exposure is optional. Selecting a preset restores these starting levels. Outer grid controls appear on interior looks and stay attached to the balloon.</small>
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
                <span>Preview light <output id="shader-preview-exposure-value">100%</output></span>
                <input id="shader-preview-exposure" type="range" min="0" max="1" step="0.01" value="1" aria-label="Shader preview light">
              </label>
              <section class="scene-preview-controls expert-only" aria-label="Scene and fan lift preview controls">
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
                <div id="aerodynamic-status" class="aerodynamic-status">BERNOULLI FLOW MODEL ACQUIRING</div>
                <div class="scene-switches">
                  <label class="switch-row"><span>Warehouse laboratory</span><input id="warehouse-enabled" type="checkbox" checked></label>
                  <label class="switch-row"><span>Human scale figures</span><input id="warehouse-people" type="checkbox" checked></label>
                </div>
                <label class="fan-test-control environment-light-control">
                  <span>Warehouse lighting <output id="environment-lighting-value">${Math.round(DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.lighting * 100)}%</output></span>
                  <input id="environment-lighting" type="range" min="0" max="1" step="0.01" value="${DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.lighting}" aria-label="Warehouse environment lighting">
                </label>
                <label class="editor-field"><span>Lighting scene</span><select id="environment-lighting-preset">${Object.entries(ENVIRONMENT_LIGHTING_PRESETS).map(([id, preset]) => `<option value="${id}"${id === "gallery" ? " selected" : ""}>${preset.label}</option>`).join("")}</select></label>
                <div class="material-control-grid">
                  <label class="material-slider"><span>Light warmth <output id="environment-warmth-value">${Math.round(DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.warmth * 100)}%</output></span><input id="environment-warmth" type="range" min="0" max="1" step="0.01" value="${DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.warmth}" aria-label="Warehouse light warmth"></label>
                  <label class="material-slider"><span>Concrete patina <output id="concrete-patina-value">${Math.round(DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.concretePatina * 100)}%</output></span><input id="concrete-patina" type="range" min="0" max="1" step="0.01" value="${DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS.concretePatina}" aria-label="Rustic concrete patina"></label>
                </div>
                <small class="control-note">Rustic panel-jointed concrete, warm industrial practicals and six observers establish human scale.</small>
              </section>
              <details class="material-lab expert-only">
                <summary><span>BALLOON PHYSICS</span><small>real-material movement layers</small></summary>
                <div class="material-control-grid">
                  ${[
                    ["center-drift", "Centre drift", DEFAULT_BALLOON_PHYSICS_CONTROLS.centerDrift],
                    ["vertical-breathing", "Vertical breathing", DEFAULT_BALLOON_PHYSICS_CONTROLS.verticalBreathing],
                    ["squash-stretch", "Squash / stretch", DEFAULT_BALLOON_PHYSICS_CONTROLS.squashStretch],
                    ["lower-bulge", "Lower bulge", DEFAULT_BALLOON_PHYSICS_CONTROLS.lowerBulge],
                    ["asymmetry", "Asymmetric lobes", DEFAULT_BALLOON_PHYSICS_CONTROLS.asymmetry],
                    ["damping", "Damping", DEFAULT_BALLOON_PHYSICS_CONTROLS.damping],
                    ["mass", "Envelope mass", DEFAULT_BALLOON_PHYSICS_CONTROLS.mass],
                    ["jet-turbulence", "Jet turbulence", DEFAULT_BALLOON_PHYSICS_CONTROLS.jetTurbulence],
                  ].map(([id, label, value]) => `<label class="material-slider"><span>${label}<output>${Number(value).toFixed(2)}</output></span><input type="range" min="0" max="1" step="0.01" value="${value}" data-balloon-physics="${id}"></label>`).join("")}
                </div>
              </details>
              <details class="material-lab expert-only">
                <summary><span>PROJECTION MATERIAL</span><small>optional preview response</small></summary>
                <label class="editor-field"><span>Material profile</span><select id="balloon-material-profile">${BALLOON_MATERIAL_PROFILE_IDS.map((id) => `<option value="${id}"${id === "latex" ? " selected" : ""}>${id.replace("-", " ")}</option>`).join("")}</select></label>
                <div class="material-control-grid">
                  ${[
                    ["reflectance", "Reflectance", DEFAULT_PROJECTION_MATERIAL_CONTROLS.reflectance],
                    ["translucency", "Translucency", DEFAULT_PROJECTION_MATERIAL_CONTROLS.translucency],
                    ["internal-bleed", "Internal light bleed", DEFAULT_PROJECTION_MATERIAL_CONTROLS.internalBleed],
                    ["roughness", "Surface roughness", DEFAULT_PROJECTION_MATERIAL_CONTROLS.roughness],
                  ].map(([id, label, value]) => `<label class="material-slider"><span>${label}<output>${Number(value).toFixed(2)}</output></span><input type="range" min="0" max="1" step="0.01" value="${value}" data-material-control="${id}"></label>`).join("")}
                </div>
                <small class="control-note">Optional illustrative surface response. Enable Material preview lighting to compare reflectance/translucency; this affects the 3D preview, not the projector colour signal. Values are not physical measurements.</small>
              </details>
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
              <dl class="metric-grid expert-only">
                <div><dt>Family</dt><dd id="shader-family">NEUTRAL</dd></div>
                <div><dt>GPU estimate</dt><dd id="shader-gpu">LOW · 1 pass</dd></div>
              </dl>
              <p id="shader-description" class="shader-description expert-only">A quiet fallback surface that keeps the ball legible in near darkness.</p>

              <div class="shader-action-row expert-only">
                <button id="update-selected-shader" class="wide-button primary-action" type="button">Update preset</button>
                <button id="reset-selected-shader" class="wide-button" type="button">Restore saved preset</button>
                <button id="assign-selected-shader" class="wide-button" type="button">Assign to active region</button>
                <button id="export-render-project" class="wide-button" type="button">Export to Orbital Engine</button>
              </div>
              <small class="control-note expert-only">The sphere preview runs the original procedural algorithms directly. Calibrated projector output and physical luminance remain open gates.</small>
            </section>

            <section class="control-section show-controls" data-workspace-panel="looks" aria-label="Simple audiovisual show controls">
              <div class="show-controls-heading">
                <div><span>SHOW CONTROLS</span><strong>Make the sphere perform</strong></div>
                <output id="looks-mode-readout">SIMPLE · CREATE A LOOK</output>
              </div>
              <button id="quick-audiovisual-show" class="show-controls-play" type="button">Play full audiovisual show</button>
              <div class="show-controls-grid">
                <label><span>Tempo <output id="quick-show-bpm-value">${DEFAULT_LIVING_SKIN_CONTROLS.bpm}</output></span><input id="quick-show-bpm" type="range" min="54" max="180" step="1" value="${DEFAULT_LIVING_SKIN_CONTROLS.bpm}"></label>
                <label><span>Shader chopping <output id="quick-show-fragment-value">${Math.round(((DEFAULT_LIVING_SKIN_CONTROLS.variety + DEFAULT_LIVING_SKIN_CONTROLS.glitch + DEFAULT_LIVING_SKIN_CONTROLS.flashRate) / 3) * 100)}%</output></span><input id="quick-show-fragment" type="range" min="0" max="100" step="1" value="72"></label>
                <label><span>Rhythm scatter <output id="quick-show-rhythm-value">${Math.round(DEFAULT_LIVING_SKIN_CONTROLS.eventHold * 100)}%</output></span><input id="quick-show-rhythm" type="range" min="0" max="100" step="1" value="${Math.round(DEFAULT_LIVING_SKIN_CONTROLS.eventHold * 100)}"></label>
                <label><span>Phrase evolution <output id="quick-show-phrase-value">${Math.round(DEFAULT_LIVING_SKIN_CONTROLS.phraseEvolution * 100)}%</output></span><input id="quick-show-phrase" type="range" min="0" max="100" step="1" value="${Math.round(DEFAULT_LIVING_SKIN_CONTROLS.phraseEvolution * 100)}"></label>
                <label><span>Sound level <output id="quick-show-sound-value">${Math.round(DEFAULT_SHADER_EVENT_SOUND_CONTROLS.level * 100)}%</output></span><input id="quick-show-sound" type="range" min="0" max="100" step="1" value="${Math.round(DEFAULT_SHADER_EVENT_SOUND_CONTROLS.level * 100)}"></label>
                <label class="quick-sound-switch"><span>Beat sound</span><input id="quick-show-sound-enabled" type="checkbox"></label>
              </div>
              <div class="show-controls-help"><span>1. Choose a shader above</span><span>2. Set the rhythm</span><span>3. Press play</span></div>
              <button id="looks-expert-toggle" class="looks-expert-toggle" type="button" aria-expanded="false">Show expert controls</button>
            </section>
            <section class="control-section living-skin-section expert-only" data-workspace-panel="looks">
              <div class="section-heading">
                <span>SPHERE BEAUTY</span>
                <small>independent presentation finish</small>
              </div>
              <div class="material-control-grid">
                ${[
                  ["beautyLighting", "Material preview lighting", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.beautyLighting],
                  ["glow", "Sphere glow", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.glow],
                ].map(([id, label, min, max, step, value]) => `<label class="material-slider"><span>${label}<output>${Number(value).toFixed(2)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-living-skin-control="${id}" aria-label="${label}"></label>`).join("")}
              </div>
              <div class="section-heading social-output-heading">
                <span>SHADER EVENT SOUND</span>
                <small>audio-reactive glitch pings</small>
              </div>
              <label class="switch-row"><span>Beat-synced kick, noise and shader hits</span><input id="shader-event-sound-enabled" type="checkbox"></label>
              <label class="editor-field"><span>Sound palette</span><select id="shader-event-sound-palette">${SHADER_EVENT_SOUND_PALETTES.map((palette) => `<option value="${palette}"${palette === DEFAULT_SHADER_EVENT_SOUND_CONTROLS.palette ? " selected" : ""}>${palette === "mixed" ? "Mixed space, metal, bass, sweep + attack" : palette}</option>`).join("")}</select></label>
              <div class="material-control-grid">
                ${(["density", "reverb", "level"] as const).map((id) => `<label class="material-slider"><span>${id === "density" ? "Event density" : id === "reverb" ? "Reverb tail" : "Ping level"}<output id="shader-event-sound-${id}-value">${Math.round(DEFAULT_SHADER_EVENT_SOUND_CONTROLS[id] * 100)}%</output></span><input id="shader-event-sound-${id}" type="range" min="0" max="1" step="0.01" value="${DEFAULT_SHADER_EVENT_SOUND_CONTROLS[id]}"></label>`).join("")}
              </div>
              <button id="shader-event-sound-audition" class="wide-button" type="button">Audition next ping</button>
              <small class="control-note">The browser preview cycles synthetic space drops, metallic strikes, bass impacts, sweeps and sharp attacks through a generated reverb. It is a composition sketch, not the final quadraphonic Ableton mix.</small>
              <div class="section-heading social-output-heading">
                <span>BEAT-CUT SKIN FRAGMENTATION</span>
                <small>musical geometry, separate from shader tests</small>
              </div>
              <label class="switch-row">
                <span>Beat-sync fractured shader geometry</span>
                <input id="living-skins-enabled" type="checkbox"${DEFAULT_LIVING_SKIN_CONTROLS.enabled ? " checked" : ""}>
              </label>
              <label class="editor-field"><span>Fragment choreography</span><select id="living-skin-sequence-mode"><option value="random">Random glitch field</option><option value="cascade">Orbital cascade</option><option value="face-scan">Cube-face scan</option><option value="eruption" selected>Eruption build</option><option value="breathing">Slow breathing field</option></select></label>
              <div class="material-control-grid">
                ${[
                  ["patchCount", "Active quadrants", 3, 12, 1, DEFAULT_LIVING_SKIN_CONTROLS.patchCount],
                  ["variety", "Shader variety", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.variety],
                  ["glitch", "Rhythmic syncopation", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.glitch],
                  ["flashRate", "Beat subdivision", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.flashRate],
                  ["bpm", "Beat tempo", 54, 180, 1, DEFAULT_LIVING_SKIN_CONTROLS.bpm],
                  ["eventHold", "Rhythmic scatter", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.eventHold],
                  ["phraseEvolution", "16-bar phrase evolution", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.phraseEvolution],
                  ["attackSharpness", "Attack sharpness", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.attackSharpness],
                  ["breath", "Patch breathing", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.breath],
                  ["edgeSoftness", "Panel edge softness", 0, 1, 0.01, DEFAULT_LIVING_SKIN_CONTROLS.edgeSoftness],
                ].map(([id, label, min, max, step, value]) => `<label class="material-slider"><span>${label}<output>${id === "patchCount" || id === "bpm" ? value : Number(value).toFixed(2)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-living-skin-control="${id}" aria-label="${label}"></label>`).join("")}
              </div>
              <small class="control-note">Every visual cut stays on the 4/4 clock, but regions hold independently for an eighth of a beat, quarter beat, half beat, one beat, two beats or a whole bar. The 16-bar phrase joins two 8-bar arcs through emergence, breakdown, accumulation, suspension, fracture, crescendo, release and a brief void.</small>
              <div class="section-heading social-output-heading">
                <span>SCENE CAMERA</span>
                <small>Prismatica-style smooth shot route</small>
              </div>
              <label class="switch-row"><span>Smooth three-angle tour</span><input id="cinematic-camera-tour" type="checkbox"></label>
              <div class="cinematic-camera-grid">
                ${(["a", "b", "c"] as const).map((slot, index) => `<div class="camera-shot-card"><label class="editor-field"><span>Shot ${slot.toUpperCase()}</span><select id="cinematic-camera-${slot}">${Object.entries(SOCIAL_CAMERA_PRESETS).map(([id, preset]) => `<option value="${id}"${id === [DEFAULT_CINEMATIC_SCENE_CONTROLS.cameraA, DEFAULT_CINEMATIC_SCENE_CONTROLS.cameraB, DEFAULT_CINEMATIC_SCENE_CONTROLS.cameraC][index] ? " selected" : ""}>${preset.label}</option>`).join("")}</select></label><button type="button" data-camera-focus="${slot}">Go to shot</button></div>`).join("")}
              </div>
              <label class="fan-test-control"><span>Move duration <output id="cinematic-camera-duration-value">${DEFAULT_CINEMATIC_SCENE_CONTROLS.transitionSeconds} sec</output></span><input id="cinematic-camera-duration" type="range" min="2" max="18" step="1" value="${DEFAULT_CINEMATIC_SCENE_CONTROLS.transitionSeconds}" aria-label="Camera transition duration"></label>
              <label class="fan-test-control"><span>Hold on each shot <output id="cinematic-camera-hold-value">${DEFAULT_CINEMATIC_SCENE_CONTROLS.holdSeconds} sec</output></span><input id="cinematic-camera-hold" type="range" min="0" max="12" step="1" value="${DEFAULT_CINEMATIC_SCENE_CONTROLS.holdSeconds}" aria-label="Camera hold duration"></label>
              <div class="scene-switches cinematic-visibility-grid">
                <label class="switch-row"><span>Projector bodies</span><input id="cinematic-projector-bodies" type="checkbox" checked></label>
                <label class="switch-row"><span>Projector light throws</span><input id="cinematic-projector-throws" type="checkbox" checked></label>
                <label class="switch-row"><span>Technical guides</span><input id="cinematic-technical-guides" type="checkbox"></label>
                <label class="switch-row"><span>Fan rig</span><input id="cinematic-fan-rig" type="checkbox" checked></label>
                <label class="switch-row"><span>Speaker rig</span><input id="cinematic-speaker-rig" type="checkbox"></label>
                <label class="switch-row"><span>Room architecture</span><input id="cinematic-room-architecture" type="checkbox" checked></label>
              </div>
              <div class="section-heading social-output-heading">
                <span>SOCIAL CAPTURE</span>
                <small>clean high-resolution exports</small>
              </div>
              <label class="editor-field"><span>Output ratio</span><select id="social-aspect">${Object.entries(SOCIAL_ASPECT_PRESETS).map(([id, preset]) => `<option value="${id}">${preset.label} · ${preset.width}×${preset.height}</option>`).join("")}</select></label>
              <label class="editor-field"><span>Camera angle</span><select id="social-camera">${Object.entries(SOCIAL_CAMERA_PRESETS).map(([id, preset]) => `<option value="${id}">${preset.label}</option>`).join("")}</select></label>
              <div class="shader-action-row">
                <button id="capture-social-still" class="wide-button primary-action" type="button">Export PNG still</button>
                <button id="record-social-clip" class="wide-button" type="button">Record 6 sec WebM</button>
              </div>
              <small class="control-note">Cinematic Mosaic flashes geometric shader panels independently. Leave it off to test one shader over the complete sphere. Scene Camera changes the live presentation view, while Social Capture exports a chosen camera.</small>
            </section>

            <section class="control-section region-section expert-only" data-workspace-panel="looks">
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
            <section class="control-section projector-test-section" data-workspace-panel="projector-test">
              <div class="section-heading">
                <span>PHYSICAL PROJECTOR TEST</span>
                <small>deterministic fullscreen output</small>
              </div>
              <div class="projector-test-verdict">
                <strong id="projector-test-status">READY · no physical signal confirmed</strong>
                <span>The browser measurement is useful diagnostic evidence, not proof of the mode accepted by the projector.</span>
              </div>
              <canvas id="projector-test-preview" class="projector-test-preview" width="480" height="270" aria-label="Selected projector test pattern preview"></canvas>
              <div class="projector-test-pattern-heading"><strong id="projector-test-pattern-readout">LATENCY FLASH</strong><span>Space cycles patterns in the output window</span></div>
              <label class="editor-field"><span>Test pattern</span><select id="projector-test-pattern">${PROJECTOR_TEST_PATTERNS.map((pattern) => `<option value="${pattern.id}"${pattern.id === "latency" ? " selected" : ""}>${pattern.label}</option>`).join("")}</select></label>
              <div class="projector-test-shortcuts" aria-label="Projector test pattern shortcuts">
                <button type="button" data-projector-test-pattern="latency">Latency</button>
                <button type="button" data-projector-test-pattern="grid">Grid</button>
                <button type="button" data-projector-test-pattern="focus">Focus</button>
                <button type="button" data-projector-test-pattern="circles">Circles</button>
                <button type="button" data-projector-test-pattern="white">White</button>
                <button type="button" data-projector-test-pattern="black">Black</button>
              </div>
              <div class="projector-test-signal-grid">
                <label class="editor-field"><span>Requested raster</span><select id="projector-test-resolution"><option value="1920x1080" selected>1920 × 1080</option><option value="3840x2160">3840 × 2160</option><option value="1280x720">1280 × 720</option></select></label>
                <label class="editor-field"><span>Requested refresh</span><select id="projector-test-refresh"><option value="60">60 Hz</option><option value="120" selected>120 Hz</option><option value="240">240 Hz</option></select></label>
              </div>
              <label class="switch-row"><span>Show frame counter and evidence overlay</span><input id="projector-test-overlay" type="checkbox" checked></label>
              <dl class="metric-grid projector-test-metrics">
                <div><dt>Observed cadence</dt><dd id="projector-test-observed-hz">Not measured</dd></div>
                <div><dt>Accepted signal</dt><dd>Projector check required</dd></div>
              </dl>
              <button id="open-projector-test" class="primary-action wide-button" type="button">Open projector test output</button>
              <small class="control-note">Use Full screen on the projector display. For the latency test, film the physical sphere and projected flash together with a high-speed camera. The alternating field and frame counter run from the output window's own animation clock.</small>
              <div class="projector-test-record">
                <div class="section-heading"><span>TEST RECORD</span><small>export after each projector session</small></div>
                <label class="editor-field"><span>Projector preset</span><select id="projector-test-preset">${PROJECTOR_TEST_PRESETS.map((preset) => `<option value="${preset.id}"${preset.id === DEFAULT_PROJECTOR_TEST_PRESET_ID ? " selected" : ""}>${preset.label}</option>`).join("")}<option value="custom">Custom / another projector</option></select></label>
                <div class="projector-test-record-grid">
                  <label class="editor-field"><span>Projector model</span><input id="projector-test-model" type="text" value="Sharp XP-P601Q-W / XP-P60Q-W"></label>
                  <label class="editor-field"><span>Serial number</span><input id="projector-test-serial" type="text"></label>
                  <label class="editor-field"><span>Firmware</span><input id="projector-test-firmware" type="text"></label>
                  <label class="editor-field"><span>Lens / throw</span><input id="projector-test-lens" type="text" value="Integrated motorised 1.6× zoom · 1.25–2.0:1 throw · H ±25% / V +55% shift"></label>
                  <label class="editor-field"><span>Projector signal screen</span><input id="projector-test-signal-mode" type="text" placeholder="1920 × 1080 at 120 Hz"></label>
                  <label class="editor-field"><span>Image mode</span><input id="projector-test-image-mode" type="text" placeholder="Game / Fast"></label>
                  <label class="editor-field"><span>Throw distance, m</span><input id="projector-test-throw-distance" type="number" min="0" step="0.01"></label>
                  <label class="editor-field"><span>Image width, m</span><input id="projector-test-image-width" type="number" min="0" step="0.01"></label>
                  <label class="editor-field"><span>Recording frame rate</span><input id="projector-test-recording-fps" type="number" min="0" step="1" placeholder="240"></label>
                  <label class="editor-field"><span>Best latency, ms</span><input id="projector-test-latency-best" type="number" min="0" step="0.01"></label>
                  <label class="editor-field"><span>Median latency, ms</span><input id="projector-test-latency-median" type="number" min="0" step="0.01"></label>
                  <label class="editor-field"><span>Worst latency, ms</span><input id="projector-test-latency-worst" type="number" min="0" step="0.01"></label>
                  <label class="editor-field"><span>Curved-surface focus</span><select id="projector-test-focus-verdict">${PROJECTOR_TEST_OBSERVATION_VERDICTS.map((verdict) => `<option value="${verdict.id}">${verdict.label}</option>`).join("")}</select></label>
                  <label class="editor-field"><span>Material brightness / contrast</span><select id="projector-test-material-verdict">${PROJECTOR_TEST_OBSERVATION_VERDICTS.map((verdict) => `<option value="${verdict.id}">${verdict.label}</option>`).join("")}</select></label>
                  <label class="editor-field"><span>Physical-test verdict</span><select id="projector-test-physical-verdict">${PROJECTOR_TEST_PHYSICAL_VERDICTS.map((verdict) => `<option value="${verdict.id}">${verdict.label}</option>`).join("")}</select></label>
                </div>
                <label class="switch-row projector-confirm-row"><span>Projector information screen confirms the recorded signal mode</span><input id="projector-test-confirmed" type="checkbox"></label>
                <label class="editor-field"><span>Session notes</span><textarea id="projector-test-notes" rows="4" placeholder="Focus, edge sharpness, colour, artifacts, latency camera and clip reference">Sharp evaluation pretest. Start at 1080p120, attempt 1080p240 only if the projector information screen confirms it, then test 4K60 and 1080p60. Record the exact unit, firmware and processing settings. Published synchronization support is not an input-lag measurement. No purchase, loan, publicity or partnership commitment.</textarea></label>
                <button id="export-projector-test" class="wide-button" type="button">Export test result JSON</button>
              </div>
              <div class="projector-test-comparison">
                <div class="section-heading"><span>TEST COMPARISON</span><small>measured records only</small></div>
                <div class="projector-comparison-actions">
                  <button id="import-projector-tests" class="wide-button" type="button">Import test records</button>
                  <button id="clear-projector-tests" type="button">Clear</button>
                  <input id="projector-test-import" type="file" accept=".json,application/json" multiple hidden>
                </div>
                <div id="projector-test-comparison-status" class="projector-comparison-status" data-state="empty">No test records loaded</div>
                <div id="projector-test-comparison-grid" class="projector-comparison-grid"></div>
                <small class="control-note">Import up to two exported Orbital projector test records. Missing latency, throw or verdict fields remain unmeasured and are never converted into a pass.</small>
              </div>
            </section>

            <section class="control-section system-section" data-workspace-panel="tracking">
              <div class="section-heading">
                <span>TRACKING / SHAPE LOCK</span>
                <small>the primary Phase One gate</small>
              </div>
              <dl class="metric-grid">
                <div><dt>Confidence</dt><dd id="confidence-value">100%</dd></div>
                <div><dt>Source age</dt><dd id="source-age-value">0.0 ms</dd></div>
                <div><dt>Cameras</dt><dd id="camera-count-value">0 physical</dd></div>
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
                <div><dt>Rig</dt><dd id="projection-rig-status">5/5 active · portrait</dd></div>
                <div><dt>Calibration</dt><dd id="projection-calibration-status">SIMULATED</dd></div>
              </dl>
              <div class="installation-rig-card">
                <div class="section-heading"><span>INSTALLATION DIGITAL TWIN</span><small>planning geometry, not physical proof</small></div>
                <label class="editor-field"><span>Rig mode</span><select id="installation-rig-mode"><option value="prototype-1" selected>Prototype · 1 projector + 1 camera + 1 NIR</option><option value="production-5">Production rehearsal · 5 projectors + 3 cameras + 3 NIR</option></select></label>
                <label class="editor-field"><span>Prototype head</span><select id="installation-prototype-head">${[1, 2, 3, 4, 5].map((index) => `<option value="${index - 1}"${index === 1 ? " selected" : ""}>P${index}</option>`).join("")}</select></label>
                <div class="installation-optics-grid">
                  <label class="editor-field"><span>Projector optic</span><select id="installation-projector-optic">${PROJECTOR_OPTICAL_PRESETS.map((preset) => `<option value="${preset.id}"${preset.id === DEFAULT_INSTALLATION_RIG_CONTROLS.projectorOpticId ? " selected" : ""}>${preset.label}</option>`).join("")}</select></label>
                  <label class="editor-field"><span>Camera lens</span><select id="installation-camera-lens">${CAMERA_LENS_PRESETS.map((preset) => `<option value="${preset.id}"${preset.id === DEFAULT_INSTALLATION_RIG_CONTROLS.cameraLensId ? " selected" : ""}>${preset.label} · ${preset.horizontalFovDeg.toFixed(0)}° HFOV</option>`).join("")}</select></label>
                  <label class="editor-field"><span>Infrared light</span><select id="installation-nir-light">${NIR_ILLUMINATOR_PRESETS.map((preset) => `<option value="${preset.id}"${preset.id === DEFAULT_INSTALLATION_RIG_CONTROLS.nirIlluminatorId ? " selected" : ""}>${preset.label}</option>`).join("")}</select></label>
                </div>
                <label class="calibration-slider"><span>Camera offset from projector <output id="installation-camera-separation-value">${DEFAULT_INSTALLATION_RIG_CONTROLS.cameraSeparationM.toFixed(2)} m</output></span><input id="installation-camera-separation" type="range" min="0" max="2.5" step="0.05" value="${DEFAULT_INSTALLATION_RIG_CONTROLS.cameraSeparationM}"></label>
                <label class="calibration-slider"><span>Haze density <output id="installation-haze-value">${Math.round(DEFAULT_INSTALLATION_RIG_CONTROLS.hazeDensity * 100)}%</output></span><input id="installation-haze" type="range" min="0" max="1" step="0.01" value="${DEFAULT_INSTALLATION_RIG_CONTROLS.hazeDensity}"></label>
                <div class="scene-switches installation-visibility-grid">
                  <label class="switch-row"><span>Truss towers</span><input id="installation-show-truss" type="checkbox" checked></label>
                  <label class="switch-row"><span>Tracking cameras</span><input id="installation-show-cameras" type="checkbox" checked></label>
                  <label class="switch-row"><span>NIR illuminators</span><input id="installation-show-nir" type="checkbox" checked></label>
                </div>
                <dl class="metric-grid"><div><dt>Active heads</dt><dd id="installation-rig-counts">1P · 1C · 1 NIR</dd></div><div><dt id="installation-distance-label">P1 optical path</dt><dd id="installation-distance">15.7 m</dd></div></dl>
                <small class="control-note">Cameras are intentionally near, but not exactly co-located with projectors. The offset protects the tracking view from direct optical interference and is editable. Every device and lens entry is provisional until the exact hardware and venue are measured.</small>
              </div>
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
              <div id="coverage-summary" class="coverage-summary" data-status="warning"><strong>Analysing moving envelope</strong><span>Coverage updates from the current tracked shape</span></div>
              <div class="output-routing-card">
                <div class="section-heading"><span>OUTPUT WINDOWS</span><small>separate projector output windows</small></div>
                <div class="orientation-readout"><strong>PORTRAIT RIG</strong><span>Long axis vertical for the full hover envelope</span></div>
                <div class="output-routing-controls"><label><span>Requested output raster</span><select id="output-resolution"><option value="1200x1920" selected>1200 × 1920</option><option value="1600x2560">1600 × 2560</option><option value="2400x3840">2400 × 3840</option></select></label><label><span>Refresh</span><select id="output-refresh"><option value="60" selected>60 Hz</option><option value="50">50 Hz</option><option value="30">30 Hz</option></select></label></div>
                <div class="output-window-buttons">${[1,2,3,4,5].map((index) => `<button type="button" data-open-output-window="projector-${index}">Open P${index}</button>`).join("")}</div>
                <small>Open windows render directly at the selected native pixel dimensions. Dashboard tiles remain lightweight previews. Browser monitor routing only, physical EDID assignment and frame-lock still require hardware verification.</small>
              </div>
              <div class="auto-calibration-card">
                <div class="calibration-card-heading">
                  <div><span>AUTOMATIC CALIBRATION</span><strong>Camera-assisted stitch + blend</strong></div>
                  <span class="simulation-badge">SIMULATION</span>
                </div>
                <p>This rehearsal generates deterministic example calibration. It does not capture camera observations or solve physical alignment. Import measured calibration through the Test bench.</p>
                <ol id="calibration-stages" class="calibration-stages">
                  <li><i>1</i><span>Lock five portrait outputs</span><strong>WAIT</strong></li>
                  <li><i>2</i><span>Locate the sphere</span><strong>WAIT</strong></li>
                  <li><i>3</i><span>Scan projected patterns</span><strong>WAIT</strong></li>
                  <li><i>4</i><span>Solve five warp meshes</span><strong>WAIT</strong></li>
                  <li><i>5</i><span>Build overlap masks</span><strong>WAIT</strong></li>
                  <li><i>6</i><span>Validate vertical hover range</span><strong>WAIT</strong></li>
                </ol>
                <label class="calibration-slider"><span>Overlap <output id="calibration-overlap-value">14%</output></span><input id="calibration-overlap" type="range" min="0.04" max="0.34" step="0.01" value="0.14"></label>
                <label class="calibration-slider"><span>Feather curve <output id="calibration-feather-value">2.2</output></span><input id="calibration-feather" type="range" min="0.5" max="4" step="0.1" value="2.2"></label>
                <label class="calibration-slider"><span>Black level <output id="calibration-black-level-value">2%</output></span><input id="calibration-black-level" type="range" min="0" max="0.12" step="0.005" value="0.02"></label>
                <div class="calibration-point-capture"><strong id="calibration-step-title">Start with locked hardware</strong><span id="calibration-step-help">The wizard will guide each physical stage and keep simulation clearly labelled.</span><output id="calibration-point-count">0 / 6 alignment points</output></div>
                <div class="calibration-wizard-actions"><button id="calibration-back" type="button" disabled>Back</button><button id="calibration-capture-point" type="button" disabled>Add rehearsal point</button><button id="run-auto-calibration" class="primary-action" type="button">Start simulated rehearsal</button></div>
                <button id="export-calibration" class="wide-button" type="button" disabled>Export calibration JSON</button>
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

            <section class="control-section recorded-tracking-section" data-workspace-panel="tracking">
              <div class="section-heading">
                <span>STAGE A / RECORDED TRACKING</span>
                <small>video-to-envelope commissioning lab</small>
              </div>
              <label class="recorded-tracking-file">
                <span>Balloon test footage</span>
                <input id="recorded-tracking-file" type="file" accept="video/*,.mov,.mp4,.m4v,.webm">
              </label>
              <div class="recorded-tracking-actions">
                <button id="recorded-tracking-play" type="button" disabled>Play tracking</button>
                <button id="recorded-tracking-stop" type="button" disabled>Return to simulation</button>
              </div>
              <video id="recorded-tracking-video" muted loop playsinline preload="metadata" hidden></video>
              <div class="tracking-vision-grid">
                <figure><canvas id="tracking-raw-canvas" width="320" height="180"></canvas><figcaption>RAW VIDEO</figcaption></figure>
                <figure><canvas id="tracking-mask-canvas" width="320" height="180"></canvas><figcaption>SILHOUETTE MASK</figcaption></figure>
                <figure><canvas id="tracking-fit-canvas" width="320" height="180"></canvas><figcaption>FITTED ENVELOPE</figcaption></figure>
              </div>
              <label class="calibration-slider"><span>White threshold <output id="recorded-tracking-threshold-value">135</output></span><input id="recorded-tracking-threshold" type="range" min="40" max="245" step="1" value="135"></label>
              <dl class="metric-grid recorded-tracking-metrics">
                <div><dt>Detector</dt><dd id="recorded-tracking-status">NO VIDEO</dd></div>
                <div><dt>Confidence</dt><dd id="recorded-tracking-confidence">0%</dd></div>
                <div><dt>Boundary fit</dt><dd id="recorded-tracking-fit">OPEN</dd></div>
                <div><dt>Processing</dt><dd id="recorded-tracking-processing">0.0 ms</dd></div>
              </dl>
              <small class="control-note">This browser path is for recorded visible-light rehearsal. It uses the same world-state boundary as the future global-shutter NIR adapter, but does not claim physical calibration or 3D reconstruction.</small>
            </section>

            <section class="control-section live-bridge-section" data-workspace-panel="tracking">
              <div class="section-heading">
                <span>LOCAL LIVE BRIDGE</span>
                <small>fused state only</small>
              </div>
              <div id="live-bridge-endpoint" class="camera-profile-readout">ws://127.0.0.1:8765</div>
              <dl class="metric-grid">
                <div><dt>Connection</dt><dd id="live-bridge-connection">DISCONNECTED</dd></div>
                <div><dt>Source</dt><dd id="live-bridge-source">WAITING</dd></div>
                <div><dt>States</dt><dd id="live-bridge-frames">0</dd></div>
                <div><dt>Dropped</dt><dd id="live-bridge-drops">0</dd></div>
                <div><dt>Processing</dt><dd id="live-bridge-processing">WAITING</dd></div>
                <div><dt>Browser feeds</dt><dd>0 RAW</dd></div>
              </dl>
              <small class="control-note">Choose Live gate above to connect. The Stage A bridge captures the HuaTeng camera at 1024 × 768 Mono8 and targets 91 fps. Only compact tracking state crosses this socket, never raw camera frames.</small>
            </section>

            <section class="control-section camera-section" data-workspace-panel="tracking">
              <div class="section-heading">
                <span>CAMERA TRACKING</span>
                <small>one-camera Stage A profile</small>
              </div>
              <dl class="metric-grid">
                <div><dt>Rig state</dt><dd id="camera-rig-status">OFFLINE</dd></div>
                <div><dt>Active</dt><dd id="camera-rig-count">VIRTUAL 0/1</dd></div>
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
              <div class="camera-profile-readout" id="camera-profile-readout">HuaTeng Vision HT-GE134GM-T1P-C</div>
              <div class="camera-settings-grid">
                <label class="editor-field">
                  <span>Exposure (µs)</span>
                  <input id="camera-exposure" type="number" min="1" max="100000" step="100" value="3000">
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
              <small class="control-note">This is a virtual HuaTeng profile. These lifecycle buttons remain a safe no-write rehearsal; physical acquisition is controlled by the native HuaTeng bridge.</small>
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
                <article><i>1</i><div><h3>Mount every projector in portrait</h3><p>First confirm the exact projector model permits 90° roll operation and that its cooling path remains compliant. Centre the fan and ball, then secure P1 to P5 on rated mounts with each supported projector physically rotated onto its side. Use the same rotation direction for all outputs, mark every position and do not move hardware after calibration.</p></div></article>
                <article><i>2</i><div><h3>Connect portrait outputs and cameras</h3><p>Connect one computer output to each projector and label them P1 to P5. In the operating system or native renderer, rotate each display 90° and confirm a 1200 × 1920 portrait raster before calibration. Then connect the global-shutter camera and use <strong>Test bench</strong> to discover, configure and start the native bridge.</p></div></article>
                <article><i>3</i><div><h3>Darken, identify and focus</h3><p>Set every projector to the same portrait resolution, refresh rate, colour mode and focus. Use Identify to confirm the labelled top edge. Focus and frame the complete balloon from its minimum to maximum fan height. Avoid automatic keystone, dynamic contrast and image enhancement.</p></div></article>
                <article><i>4</i><div><h3>Find the ball</h3><p>Check that every camera can see the full silhouette. The live gate must report a valid centre, shape and confidence before measured calibration can begin.</p></div></article>
                <article><i>5</i><div><h3>Import measured calibration</h3><p>Use an external measured camera/projector solve and import its JSON in <strong>Test bench</strong>. The Projection wizard generates simulated rehearsal data only.</p></div></article>
                <article><i>6</i><div><h3>Inspect P1 to P5 in portrait</h3><p>Each tall tile is a live 10:16 render from its real projector camera. POST shows the tracked geometry with that projector's feather mask and black level. Press POST to switch to the canonical PRE source. Press Inspect to expand, zoom up to 3×, enter full screen or open a separate portrait window.</p></div></article>
                <article><i>7</i><div><h3>Check the seams</h3><p>Select Seam test. Look at every overlap on the physical ball. Adjust overlap, feather curve and black level, then repeat validation until no bright or dark bands remain.</p></div></article>
                <article><i>8</i><div><h3>Test the full vertical movement</h3><p>Run the grid while the ball rises, falls and bulges. Move fan speed through the complete planned range and confirm the sphere remains inside every portrait raster. In simulation, the Scene &amp; Lift readout shows Bernoulli flow lock, lateral displacement and hover offset. If content slips physically, fix camera visibility or latency before using authored looks.</p></div></article>
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
