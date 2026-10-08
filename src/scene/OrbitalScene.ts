import { silhouetteRadii } from "../core/silhouetteMask";
import { trackingLightAllowed, trackingLightLinear } from "../core/projectorTrackingLight";
import { ContentMotion, type ContentMotionSettings } from "../core/contentMotion";
import { parseTestRigSetup, applyTestRigToProjectionRig, applyTestRigPreview, testRigOverviewCamera, type TestRigSetup } from "../core/testRig";
import { projectorWarpMatrix } from "../core/projectorWarp";
import { projectionOutputBlockReason, type StructuredLightGateInput } from "../core/projectionOutputGate";
import { orthoFramingForEllipse, type ImageEllipse } from "../core/scanMapping";
import { OutputHold, ellipseEdgeNote } from "../core/outputHold";
import { BoundedPreviewCache, PreviewWorkBudget } from "../core/previewWorkBudget";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type {
  RuntimeMode,
  RuntimeSnapshot,
  TrackingStatus,
} from "../core/contracts";
import {
  DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS,
  normaliseEnvironmentPreviewControls,
  type EnvironmentPreviewControls,
} from "../core/environmentPreview";
import {
  BernoulliAirJetModel,
  type BernoulliBalloonState,
} from "../core/bernoulliAirflow";
import {
  DEFAULT_BALLOON_PHYSICS_CONTROLS,
  DEFAULT_PROJECTION_MATERIAL_CONTROLS,
  normaliseBalloonPhysicsControls,
  normaliseProjectionMaterialControls,
  type BalloonPhysicsControls,
  type ProjectionMaterialControls,
} from "../core/balloonSurfaceControls";
import {
  analyseProjectionCoverage,
  type ProjectionCoverageAnalysis,
} from "../core/projectionCoverage";
import {
  createDefaultSurfaceRegionAssignments,
  type MappingViewMode,
  shaderRenderModeIndex,
  SURFACE_REGION_DEFINITIONS,
  validateSurfaceRegionAssignments,
  type SurfaceRegionAssignment,
} from "../core/mappingLab";
import {
  getRenderQualityProfile,
  type RenderQualityTier,
} from "../core/renderQuality";
import {
  deriveDeterministicShaderSeed,
  getShaderDefinition,
  type ShaderPreset,
} from "../core/shaderRegistry";
import {
  DEFAULT_SHADER_LOOK_CONTROLS,
  advanceShaderAnimationTime,
  type ShaderLookControls,
} from "../core/shaderLookControls";
import {
  createDefaultProjectionRig,
  PROJECTOR_RASTER_ASPECT,
  PROJECTOR_RASTER_HEIGHT,
  PROJECTOR_RASTER_WIDTH,
  toProjectorShaderInputs,
  validateProjectionRig,
  type ProjectionPattern,
  type ProjectionRigConfig,
} from "../core/projectionRig";
import { sampleMotion } from "../core/motionPreference";
import {
  DEFAULT_LIVING_SKIN_CONTROLS,
  livingSkinSequenceModeIndex,
  normaliseLivingSkinControls,
  type LivingSkinControls,
} from "../core/livingSkin";
import {
  SOCIAL_CAMERA_PRESETS,
  type SocialCameraPreset,
} from "../core/socialCapture";
import {
  DEFAULT_CINEMATIC_SCENE_CONTROLS,
  normaliseCinematicSceneControls,
  heldCameraTourPhase,
  type CinematicSceneControls,
} from "../core/cinematicScene";
import {
  DEFAULT_INSTALLATION_RIG_CONTROLS,
  CAMERA_LENS_PRESETS,
  NIR_ILLUMINATOR_PRESETS,
  createInstallationHeadPlans,
  normaliseInstallationRigControls,
  type InstallationRigControls,
} from "../core/installationRig";
import {
  createOrbitalSurfaceMaterial,
  setOrbitalSurfaceLookControls,
  updateOrbitalSurfaceMaterial,
} from "./shaders/orbitalSurface";
import {
  createPredictionGhostMaterial,
  updatePredictionGhostMaterial,
} from "./shaders/predictionGhost";
import {
  createProjectionBeamMaterial,
  updateProjectionBeamMaterial,
} from "./shaders/projectionBeam";

const ROOM_WIDTH_M = 28;
const ROOM_HEIGHT_M = 14;
const ROOM_DEPTH_M = 34;
const DEFAULT_CENTER_M = new THREE.Vector3(0, 3.35, 0);
const DEFAULT_RADII_M = new THREE.Vector3(2.5, 2.5, 2.5);
const RESIDUAL_PARTICLE_COUNT = 28;
const PROJECTOR_OUTPUT_WIDTH = PROJECTOR_RASTER_WIDTH;
const PROJECTOR_OUTPUT_HEIGHT = PROJECTOR_RASTER_HEIGHT;

export interface OrbitalDebugOptions {
  projectors: boolean;
  prediction: boolean;
  speakers: boolean;
  room: boolean;
}

export interface OrbitalSceneOptions {
  projectorOutputCanvases?: readonly HTMLCanvasElement[];
  onProjectorOutputFrame?: (index: number) => void;
}

export interface OrbitalDigitalTwinState {
  classification: "digital-twin";
  physicalProof: false;
  physicalValidation: "not-validated";
  coordinateUnit: "metres";
  sceneScale: {
    roomM: Readonly<{ width: number; height: number; depth: number }>;
    nominalSphereDiameterM: number;
  };
  limitations: readonly string[];
  lastRuntimeMode: RuntimeMode | null;
  lastTrackingStatus: TrackingStatus | null;
  lastSequence: number | null;
  debug: Readonly<OrbitalDebugOptions>;
}

interface ProjectorRig {
  definition: ProjectionRigConfig["projectors"][number];
  light: THREE.SpotLight;
  beamMaterial: THREE.ShaderMaterial;
}

interface SpeakerRig {
  meter: THREE.Group;
  meterMaterials: THREE.MeshStandardMaterial[];
  wooferMaterial: THREE.MeshStandardMaterial;
}

const DIGITAL_TWIN_LIMITATIONS = Object.freeze([
  "Software visualisation only, not evidence of physical projection lock.",
  "Projector coverage, brightness, latency and blends are illustrative until calibrated and measured.",
  "Fan motion visualises simulated telemetry and never writes to hardware.",
  "The five-metre membrane is a low-order envelope, not a cloth or fluid simulation.",
] as const);

export class OrbitalScene {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly projectorOutputScene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver | null;

  private readonly roomGroup = new THREE.Group();
  private readonly warehouseGroup = new THREE.Group();
  private readonly peopleGroup = new THREE.Group();
  private readonly projectorBodyGroup = new THREE.Group();
  private readonly projectorDebugGroup = new THREE.Group();
  private readonly projectorLightGroup = new THREE.Group();
  private readonly projectorTargetGroup = new THREE.Group();
  private readonly predictionGroup = new THREE.Group();
  private readonly speakerBodyGroup = new THREE.Group();
  private readonly speakerMeterGroup = new THREE.Group();
  private readonly fanAssemblyGroup = new THREE.Group();
  private readonly installationTrussGroup = new THREE.Group();
  private readonly installationCameraGroup = new THREE.Group();
  private readonly installationNirGroup = new THREE.Group();

  private readonly worldContentMotion = new ContentMotion();
  private readonly scanContentMotion = new ContentMotion();
  public setContentMotion(settings: ContentMotionSettings): void {
    this.worldContentMotion.set(settings); this.scanContentMotion.set(settings);
  }
  public getContentMotion(): ContentMotionSettings { return this.worldContentMotion.getSettings(); }
  public recenterContentMotion(): void { this.worldContentMotion.recenter(); this.scanContentMotion.recenter(); }
  public getContentMotionState() {
    const scanned = !!this.structuredLight?.active;
    return { ...(scanned ? this.scanContentMotion : this.worldContentMotion).snapshot(),
      coordinateSpace: scanned ? 'projector-pixels' as const : 'world-metres' as const };
  }
  private applyContentMotionUniforms(state: ReturnType<ContentMotion['snapshot']>, scale: number): void {
    const uniforms = this.surfaceMaterial.uniforms;
    if (!uniforms.uContentMotionEnabled) return;
    uniforms.uContentMotionEnabled.value = state.mode === 'surface' ? 0 : 1;
    uniforms.uContentMotionScale.value = scale;
    (uniforms.uContentMotionOffset.value as THREE.Vector3).set(state.offset.x, state.offset.y, state.offset.z);
  }
  private readonly surfaceMaterial = createOrbitalSurfaceMaterial();
  private readonly silhouetteTexture = new THREE.DataTexture(new Float32Array(128),128,1,THREE.RedFormat,THREE.FloatType);
  private readonly thumbnailMaterial = createOrbitalSurfaceMaterial();
  private readonly thumbnailScene = new THREE.Scene();
  private readonly thumbnailCamera = new THREE.PerspectiveCamera(34, 1.5, 0.1, 10);
  private readonly thumbnailTarget = new THREE.WebGLRenderTarget(180, 120);
  private readonly thumbnailPixels = new Uint8Array(180 * 120 * 4);
  private readonly predictionMaterial = createPredictionGhostMaterial();
  private readonly sphereMesh: THREE.Mesh;
  private readonly sphereGlowMesh: THREE.Mesh;
  private readonly sphereGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x54cfff,
    transparent: true,
    opacity: 0,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly projectorOutputSphere: THREE.Mesh;
  private readonly projectorOutputCameras: THREE.PerspectiveCamera[] = [];
  private readonly projectorOutputTarget = new THREE.WebGLRenderTarget(
    PROJECTOR_OUTPUT_WIDTH,
    PROJECTOR_OUTPUT_HEIGHT,
    {
    depthBuffer: true,
    stencilBuffer: false,
    },
  );
  private readonly projectorOutputPixels = new Uint8Array(
    PROJECTOR_OUTPUT_WIDTH * PROJECTOR_OUTPUT_HEIGHT * 4,
  );
  private readonly projectorOutputImage = new ImageData(
    PROJECTOR_OUTPUT_WIDTH,
    PROJECTOR_OUTPUT_HEIGHT,
  );
  private readonly projectorOutputCanvases: readonly HTMLCanvasElement[];
  private readonly projectorWindowRenderers = new Map<HTMLCanvasElement, THREE.WebGLRenderer>();
  private readonly onProjectorOutputFrame?: (index: number) => void;
  private nextProjectorOutputIndex = 0;
  private projectorOutputSequence = 0;
  private projectorWindowOutputSequence = 0;
  private readonly predictionMesh: THREE.Mesh;
  private readonly residualLine: THREE.Line;
  private readonly residualLineGeometry: THREE.BufferGeometry;
  private readonly residualParticles: THREE.Points;
  private readonly residualParticleGeometry: THREE.BufferGeometry;
  private readonly residualParticlePositions = new Float32Array(
    RESIDUAL_PARTICLE_COUNT * 3,
  );

  private readonly projectorRigs: ProjectorRig[] = [];
  private projectionRig = createDefaultProjectionRig();
  private projectionPattern: ProjectionPattern = "authored";
  private mappingView: MappingViewMode = "sphere";
  private readonly speakerRigs: SpeakerRig[] = [];
  private readonly fanRotor = new THREE.Group();
  private readonly warehouseLights: THREE.PointLight[] = [];
  private readonly warehouseFillLights: THREE.Light[] = [];
  private readonly warehouseEmissiveMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly warehouseConcreteMaterials: THREE.MeshStandardMaterial[] = [];
  private fanAirMaterial!: THREE.MeshBasicMaterial;
  private fanCoreMaterial!: THREE.MeshStandardMaterial;
  private readonly observedCenter = DEFAULT_CENTER_M.clone();
  private readonly predictedCenter = DEFAULT_CENTER_M.clone();
  private readonly currentRadii = DEFAULT_RADII_M.clone();
  private readonly currentResidual = new THREE.Vector3();
  private readonly residualPerpendicular = new THREE.Vector3();
  private readonly workingVector = new THREE.Vector3();
  private readonly bernoulliAirflow = new BernoulliAirJetModel();
  private aerodynamicState: BernoulliBalloonState | null = null;
  private coverageAnalysis: ProjectionCoverageAnalysis | null = null;
  private balloonPhysicsControls: BalloonPhysicsControls = {
    ...DEFAULT_BALLOON_PHYSICS_CONTROLS,
  };
  private projectionMaterialControls: ProjectionMaterialControls = {
    ...DEFAULT_PROJECTION_MATERIAL_CONTROLS,
  };
  private livingSkinControls: LivingSkinControls = {
    ...DEFAULT_LIVING_SKIN_CONTROLS,
  };
  private cinematicSceneControls: CinematicSceneControls = {
    ...DEFAULT_CINEMATIC_SCENE_CONTROLS,
  };
  private installationRigControls: InstallationRigControls = {
    ...DEFAULT_INSTALLATION_RIG_CONTROLS,
  };
  private cameraTourElapsedS = 0;
  private cameraMoveElapsedS = 0;
  private cameraMoveDurationS = 0;
  private readonly cameraMoveFrom = new THREE.Vector3();
  private readonly cameraMoveTo = new THREE.Vector3();

  private debugOptions: OrbitalDebugOptions = {
    projectors: true,
    prediction: true,
    speakers: true,
    room: true,
  };
  private environmentControls: EnvironmentPreviewControls = {
    ...DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS,
  };
  private shaderElapsedS = 0;
  private shaderAnimationSpeed = DEFAULT_SHADER_LOOK_CONTROLS.motion;
  private lastShaderClockAtMs = performance.now();
  private lastRuntimeMode: RuntimeMode | null = null;
  private lastTrackingStatus: TrackingStatus | null = null;
  private lastSequence: number | null = null;
  private predictionAvailable = false;
  private shaderControl = 0;
  private activeShaderId = "neutral";
  private surfaceRegions = createDefaultSurfaceRegionAssignments();
  private surfaceRegionsEnabled = false;
  private readonly regionCenters = new Float32Array(
    SURFACE_REGION_DEFINITIONS.map((region) => region.latitudeCenter),
  );
  private readonly regionWidths = new Float32Array(
    SURFACE_REGION_DEFINITIONS.map((region) => region.latitudeWidth),
  );
  private readonly regionStyles = new Float32Array(4);
  private readonly regionIntensities = new Float32Array(4);
  private readonly disabledRegionIntensities = new Float32Array(4);
  private renderQuality: RenderQualityTier = "balanced";
  private reducedMotion = false;
  private disposed = false;
  private testRigSetup: TestRigSetup | null = null;
  private rigBeforeTest: ProjectionRigConfig | null = null;
  private lightweightPreview = false;
  private coverageDirty = true;
  private readonly previewWorkBudget = new PreviewWorkBudget();
  private visibleProjectorPreviewIndices = new Set<number>();
  private coverageUpdateCount = 0;
  private mappingReadbackCount = 0;
  private thumbnailReadbackCount = 0;
  private thumbnailCacheHitCount = 0;
  private readonly thumbnailCache = new BoundedPreviewCache<ImageData>(96);

  /** Only dashboard tiles or the inline inspector consume diagnostic GPU readbacks. */
  public setProjectorPreviewIndices(indices: readonly number[]): void {
    this.visibleProjectorPreviewIndices = new Set(indices.filter(index => Number.isInteger(index) && index >= 0 && index < this.projectorOutputCanvases.length));
    this.container.dataset.visibleProjectorPreviews = [...this.visibleProjectorPreviewIndices].join(',');
    this.syncProjectorPreviewPauseState();
  }

  private syncProjectorPreviewPauseState(): void {
    const outputPriority = this.projectorWindowRenderers.size > 0;
    this.container.dataset.mappingPreviewOutputPriority = String(outputPriority);
    this.projectorOutputCanvases.forEach((canvas, index) => {
      const paused = outputPriority || !this.visibleProjectorPreviewIndices.has(index);
      const pausedReason = outputPriority ? 'paused-output-priority' : 'paused-hidden';
      if (canvas.dataset.previewPaused !== String(paused) || (paused && canvas.dataset.previewState !== pausedReason)) {
        canvas.dataset.previewPaused = String(paused);
        canvas.dataset.previewState = paused ? pausedReason : 'awaiting-frame';
      }
    });
  }

  /**
   * Lightweight preview keeps the control page cheap while the physical test
   * bench or a projector output window needs the GPU. Diagnostic coverage
   * uses a ten-Hz budget. Visible mapping tiles use at most ten Hz and pause
   * entirely while a direct projector window owns the GPU.
   */
  public setLightweightPreview(active: boolean): void {
    if (this.lightweightPreview === active) return;
    this.lightweightPreview = active;
    this.coverageDirty = true;
    this.container.dataset.lightweightPreview = String(active);
  }

  public isLightweightPreview(): boolean {
    return this.lightweightPreview;
  }

  /** Current output gate result for one projector head, null when output may show. */
  public getOutputBlockReason(index = 0): string | null {
    return this.outputBlockReason(index);
  }

  public clearTestRigSetup(): void {
    if (!this.testRigSetup) return;
    this.testRigSetup = null;
    const restore = this.rigBeforeTest; this.rigBeforeTest = null;
    if (restore) {
      restore.calibration = { state: "uncalibrated", pattern: "authored", reprojectionErrorPx: null, lastCalibratedAt: null, calibratedProjectorIds: [], projectorErrorsPx: {} };
      this.setProjectionRig(restore);
    }
    delete this.container.dataset.testRig;
    this.setEnvironmentControls(this.environmentControls);
    this.syncSceneVisibility();
  }

  private scanProjectorOverride: { lensShift: { x: number; y: number }; fovDeg: number | null } | null = null;
  /** Lens shift (and field of view, when measured) for P1 from the active scan; null restores the rig's own. */
  public setScanProjectorOverride(value: { lensShift: { x: number; y: number }; fovDeg: number | null } | null): void {
    this.scanProjectorOverride = value;
    if (this.testRigSetup) this.setTestRigSetup(this.testRigSetup, { refocus: false });
  }

  public setTestRigSetup(value: TestRigSetup, options: { refocus?: boolean } = {}): void {
    const setup = parseTestRigSetup(value);
    const refocus = options.refocus ?? true;
    if (!this.testRigSetup) this.rigBeforeTest = structuredClone(this.projectionRig);
    this.testRigSetup = setup;
    this.installationRigControls = { ...this.installationRigControls, mode: "prototype-1", prototypeProjectorIndex: 0, showTruss: false, showCameras: true, showNir: false, hazeDensity: 0 };
    this.cinematicSceneControls = { ...this.cinematicSceneControls, cameraTourEnabled: false };
    this.cameraMoveDurationS = 0;
    const rig = applyTestRigToProjectionRig(this.projectionRig, setup);
    // A structured-light scan knows where the real projector's picture sits around the ball.
    if (this.scanProjectorOverride && rig.projectors[0]) {
      rig.projectors[0].lensShift = { ...this.scanProjectorOverride.lensShift };
      if (this.scanProjectorOverride.fovDeg !== null) rig.projectors[0].fovDeg = this.scanProjectorOverride.fovDeg;
    }
    this.setProjectionRig(rig);
    this.scene.fog = null;
    this.mappingView = "sphere";
    if (refocus || !this.container.dataset.testRigFocus) this.focusTestLayout();
    this.container.dataset.testRig = "manual-stationary-preview";
    this.container.dataset.ballDiameterM = String(setup.ballDiameterM);
    this.container.dataset.testCameraPosition = JSON.stringify(setup.cameraPositionM);
    this.container.dataset.testProjectorPosition = JSON.stringify(setup.projectorPositionM);
    this.renderer.domElement.setAttribute("aria-label", `Orbital ${Math.round(setup.ballDiameterM * 100)} centimetre test ball with one camera and one projector, manual uncalibrated geometry`);
    this.syncSceneVisibility();
  }

  public focusTestLayout(): void {
    if (!this.testRigSetup) return;
    const framing = testRigOverviewCamera(this.testRigSetup, Math.max(0.1, this.container.clientWidth / Math.max(1, this.container.clientHeight)));
    this.mappingView = "sphere"; this.cameraMoveDurationS = 0;
    this.camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    this.camera.fov = 45; this.camera.near = 0.01; this.camera.updateProjectionMatrix();
    this.controls.target.set(framing.target.x, framing.target.y, framing.target.z);
    this.controls.enabled = true; this.controls.minDistance = this.testRigSetup.ballDiameterM * 0.65;
    this.controls.maxDistance = Math.max(30, this.camera.position.distanceTo(this.controls.target) * 5);
    this.controls.update(); this.syncSceneVisibility();
    this.container.dataset.testRigFocus = "layout";
  }

  public focusTestBall(): void {
    if (!this.testRigSetup) return;
    const setup = this.testRigSetup;
    const halfVertical = THREE.MathUtils.degToRad(45 / 2);
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * this.camera.aspect);
    const distance = setup.ballDiameterM / 2 / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.3;
    this.mappingView = "sphere"; this.cameraMoveDurationS = 0;
    this.controls.target.set(setup.ballCenterM.x, setup.ballCenterM.y, setup.ballCenterM.z);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0.9, 0.5, 1.2).normalize().multiplyScalar(distance));
    this.camera.fov = 45; this.camera.updateProjectionMatrix(); this.controls.enabled = true;
    this.controls.update(); this.syncSceneVisibility();
    this.container.dataset.testRigFocus = "ball";
  }

  private projectorTrackingLight = { enabled: false, level: 0.55 };
  public setProjectorTrackingLight(enabled: boolean, level: number): void {
    this.projectorTrackingLight = { enabled, level: Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 1) : 0.55 };
  }
  private approximateBallMapping: (() => (ImageEllipse & { opacity?: number; phase?: string }) | null) | null = null;
  public setApproximateBallMapping(sample: (() => (ImageEllipse & { opacity?: number; phase?: string }) | null) | null): void { this.approximateBallMapping=sample; }
  private fullFrameArtworkTest = false;
  public setFullFrameArtworkTest(enabled: boolean): void { this.fullFrameArtworkTest = enabled; }
  private outputBlackout = false;
  private outputWorldReceivedAtMs = 0;

  private outputBlockReason(index = 0): string | null {
    if (this.outputBlackout) return "OPERATOR_BLACKOUT";
    if ((this.fullFrameArtworkTest || this.approximateBallMapping) && index === 0) return null;
    if (this.outputWorld?.mode === "live" && performance.now() - this.outputWorldReceivedAtMs + this.outputWorld.diagnostics.sourceAgeMs > 80) return "LIVE_TRACKING_EXPIRED";
    const reason = projectionOutputBlockReason(this.outputBlackout, this.outputWorld, this.projectionRig, index, this.structuredLight);
    if (reason || index !== 0 || !this.structuredLight?.active) return reason;
    return this.structuredLight.blockReason?.() ?? null;
  }

  private structuredLight: (StructuredLightGateInput & { ellipse: () => ImageEllipse | null; blockReason?: () => string | null }) | null = null;
  private readonly structuredLightCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);

  /**
   * Structured-light 2D mapping mode for P1. `ellipse` returns the tracked ball
   * outline already mapped into projector pixels, or null when unavailable.
   */
  private readonly structuredLightHold = new OutputHold();
  private probeDark = false;
  private probeDarkRenderedAtMs: number | null = null;
  /** Black out the structured-light ball for the delay probe; the first black frame's draw time is kept. */
  public setProbeDark(on: boolean): void { this.probeDark = on; if (on) this.probeDarkRenderedAtMs = null; }
  public getProbeDarkRenderedAtMs(): number | null { return this.probeDarkRenderedAtMs; }
  private projectedEdgeNote: string | null = null;
  /** Plain-language note when the projected ball runs off the projector picture, else null. */
  public getProjectedEdgeNote(): string | null { return this.projectedEdgeNote; }

  public setStructuredLightOutput(state: (StructuredLightGateInput & { ellipse: () => ImageEllipse | null; blockReason?: () => string | null }) | null): void {
    if (state !== this.structuredLight) this.scanContentMotion.invalidate();
    this.structuredLight = state;
    this.container.dataset.outputCalibration = state?.active ? "structured-light" : "measured";
  }
  private outputWorld: RuntimeSnapshot["world"] | null = null;

  public setOutputBlackout(blackout: boolean): void {
    this.outputBlackout = blackout;
    if (blackout) this.clearProjectorOutputs("OPERATOR_BLACKOUT");
  }

  private clearProjectorOutputs(reason: string): void {
    for (const canvas of this.projectorOutputCanvases) {
      const context = canvas.getContext("2d");
      if (context) { context.save(); context.setTransform(1, 0, 0, 1, 0, 0); context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height); context.restore(); }
      canvas.dataset.outputBlockReason = reason;
    }
    for (const [canvas, renderer] of this.projectorWindowRenderers) {
      renderer.setClearColor(0x000000, 1); renderer.clear(true, true, true);
      canvas.dataset.outputBlockReason = reason;
    }
  }

  public constructor(container: HTMLElement, options: OrbitalSceneOptions = {}) {
    this.container = container;
    this.container.dataset.coverageUpdates = '0';
    this.container.dataset.mappingPreviewReadbacks = '0';
    this.container.dataset.shaderThumbnailReadbacks = '0';
    this.container.dataset.shaderThumbnailCacheHits = '0';
    this.projectorOutputCanvases = options.projectorOutputCanvases ?? [];
    this.onProjectorOutputFrame = options.onProjectorOutputFrame;

    this.scene.background = new THREE.Color(0x010204);
    this.scene.fog = new THREE.FogExp2(0x010204, 0.018);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.08, 100);
    this.camera.position.set(10.8, 7.1, 14.1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.applyRenderQuality();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.93;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Orbital digital twin, a simulated five metre projection-mapped sphere in a dark room",
    );
    this.container.append(this.renderer.domElement);

    this.thumbnailScene.background = new THREE.Color(0x020506);
    // The shader emits linear light; an sRGB attachment stores display-ready
    // bytes for ImageData, matching the direct WebGL canvas output transfer.
    this.thumbnailTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.thumbnailCamera.position.set(0, 0, 3.35);
    this.thumbnailCamera.lookAt(0, 0, 0);
    this.thumbnailScene.add(
      new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), this.thumbnailMaterial),
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 4.5, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 7.5;
    this.controls.maxDistance = 39;
    this.controls.minPolarAngle = 0.16;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enablePan = true;
    this.controls.panSpeed = 0.6;

    this.buildLighting();
    this.buildRoom();
    this.buildWarehouse();
    this.buildPeople();
    this.buildFan();

    const sphereGeometry = new THREE.SphereGeometry(1, 112, 80);
    this.sphereMesh = new THREE.Mesh(sphereGeometry, this.surfaceMaterial);
    this.sphereMesh.name = "Observed five-metre sphere";
    this.sphereMesh.position.copy(DEFAULT_CENTER_M);
    this.sphereMesh.frustumCulled = false;
    this.scene.add(this.sphereMesh);
    this.sphereGlowMesh = new THREE.Mesh(sphereGeometry.clone(), this.sphereGlowMaterial);
    this.sphereGlowMesh.name = "Optional cinematic sphere glow";
    this.sphereGlowMesh.renderOrder = -1;
    this.scene.add(this.sphereGlowMesh);
    this.projectorOutputScene.background = new THREE.Color(0x000000);
    // Output windows render at native projector raster every frame; 64x48 is
    // visually identical on a projected silhouette and far cheaper than 112x80.
    this.projectorOutputSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), this.surfaceMaterial);
    this.projectorOutputSphere.name = "Projector raster surface";
    this.projectorOutputSphere.position.copy(DEFAULT_CENTER_M);
    this.projectorOutputSphere.frustumCulled = false;
    this.projectorOutputScene.add(this.projectorOutputSphere);
    this.projectorOutputTarget.texture.colorSpace = THREE.SRGBColorSpace;

    this.predictionMesh = new THREE.Mesh(
      sphereGeometry.clone(),
      this.predictionMaterial,
    );
    this.predictionMesh.name = "Predicted sphere";
    this.predictionMesh.position.copy(DEFAULT_CENTER_M);
    this.predictionMesh.renderOrder = 3;
    this.predictionMesh.frustumCulled = false;
    this.predictionGroup.add(this.predictionMesh);

    this.residualLineGeometry = new THREE.BufferGeometry();
    this.residualLineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(6), 3),
    );
    const residualLineMaterial = new THREE.LineDashedMaterial({
      color: 0xff6b9b,
      transparent: true,
      opacity: 0.75,
      dashSize: 0.16,
      gapSize: 0.09,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.residualLine = new THREE.Line(
      this.residualLineGeometry,
      residualLineMaterial,
    );
    this.residualLine.name = "Prediction residual";
    this.residualLine.renderOrder = 4;
    this.predictionGroup.add(this.residualLine);

    this.residualParticleGeometry = new THREE.BufferGeometry();
    this.residualParticleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.residualParticlePositions, 3),
    );
    const residualParticleMaterial = new THREE.PointsMaterial({
      color: 0xffa3c0,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.residualParticles = new THREE.Points(
      this.residualParticleGeometry,
      residualParticleMaterial,
    );
    this.residualParticles.name = "Residual samples";
    this.residualParticles.renderOrder = 4;
    this.predictionGroup.add(this.residualParticles);

    this.scene.add(
      this.roomGroup,
      this.warehouseGroup,
      this.peopleGroup,
      this.projectorBodyGroup,
      this.projectorDebugGroup,
      this.projectorLightGroup,
      this.projectorTargetGroup,
      this.predictionGroup,
      this.fanAssemblyGroup,
      this.installationTrussGroup,
      this.installationCameraGroup,
      this.installationNirGroup,
      this.speakerBodyGroup,
      this.speakerMeterGroup,
    );
    this.buildProjectors();
    this.buildInstallationSupportRig();
    this.buildSpeakers();
    this.setSurfaceRegions(this.surfaceRegions);
    this.setLivingSkinControls(this.livingSkinControls);
    this.setDebugOptions(this.debugOptions);
    this.setEnvironmentControls(this.environmentControls);
    this.setCinematicSceneControls(this.cinematicSceneControls);
    this.setInstallationRigControls(this.installationRigControls);

    this.resize();
    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.container);
    this.renderer.render(this.scene, this.camera);
  }

  public update(
    snapshot: RuntimeSnapshot,
    deltaS: number,
    renderDashboard = true,
  ): void {
    if (this.disposed) {
      return;
    }

    if (this.testRigSetup) snapshot = { ...snapshot, world: applyTestRigPreview(snapshot.world, this.testRigSetup) };
    this.outputWorld = snapshot.world;
    this.outputWorldReceivedAtMs = performance.now();
    const outputBlock = this.outputBlockReason();
    if (outputBlock && !this.projectorTrackingLight.enabled && !["SELECTED_PROJECTOR_NOT_CALIBRATED", "PROJECTOR_REPROJECTION_ERROR_EXCEEDS_2PX"].includes(outputBlock)) this.clearProjectorOutputs(outputBlock);
    const safeDeltaS = THREE.MathUtils.clamp(deltaS, 0, 0.1);
    const motion = sampleMotion(snapshot.showTimeS, safeDeltaS, this.reducedMotion);
    // The shader clock can also be advanced by a visible projector window.
    // This prevents fullscreen from depending on the throttled control-page
    // requestAnimationFrame loop.
    this.advanceShaderClock(performance.now());
    this.lastRuntimeMode = snapshot.world.mode;
    this.lastTrackingStatus = snapshot.world.status;
    this.lastSequence = snapshot.world.sequence;
    const fanSpeed = clamp01(snapshot.fan.actualNormalized);
    const airflowState = snapshot.world.mode === "simulation" && !this.testRigSetup
      ? this.bernoulliAirflow.step(
          fanSpeed,
          this.reducedMotion ? 0 : safeDeltaS,
          this.shaderElapsedS,
          this.balloonPhysicsControls,
        )
      : null;
    this.aerodynamicState = airflowState;
    this.container.dataset.aerodynamicModel = airflowState
      ? "bernoulli-air-jet"
      : this.testRigSetup && snapshot.world.mode === "simulation" ? "stationary-test-rig-preview" : "measured-tracking";
    if (airflowState) {
      this.container.dataset.flowAttachment = airflowState.flowAttachment.toFixed(3);
      this.container.dataset.airflowLateralOffsetM = Math.hypot(
        airflowState.offsetM.x,
        airflowState.offsetM.z,
      ).toFixed(3);
      this.container.dataset.airflowHoverOffsetM = airflowState.offsetM.y.toFixed(3);
    }

    if (snapshot.world.centerM !== null) {
      if (airflowState) {
        this.observedCenter.set(
          airflowState.offsetM.x,
          DEFAULT_CENTER_M.y + airflowState.offsetM.y,
          airflowState.offsetM.z,
        );
      } else {
        this.observedCenter.set(
          snapshot.world.centerM.x,
          snapshot.world.centerM.y,
          snapshot.world.centerM.z,
        );
      }
    }
    this.predictedCenter.copy(this.observedCenter);
    if (snapshot.world.prediction !== null) {
      this.predictedCenter.set(
        airflowState ? airflowState.offsetM.x : snapshot.world.prediction.predictedCenterM.x,
        snapshot.world.prediction.predictedCenterM.y + (airflowState?.offsetM.y ?? 0),
        airflowState ? airflowState.offsetM.z : snapshot.world.prediction.predictedCenterM.z,
      );
      this.currentResidual.set(
        snapshot.world.prediction.residualM.x,
        snapshot.world.prediction.residualM.y,
        snapshot.world.prediction.residualM.z,
      );
    } else {
      this.currentResidual.set(0, 0, 0);
    }

    if (snapshot.world.shape !== null) {
      if (airflowState) {
        this.currentRadii.set(
          DEFAULT_RADII_M.x * airflowState.radiiScale.x,
          DEFAULT_RADII_M.y * airflowState.radiiScale.y,
          DEFAULT_RADII_M.z * airflowState.radiiScale.z,
        );
      } else {
        this.currentRadii.set(
          (snapshot.world.mode === "live" || this.testRigSetup) ? snapshot.world.shape.radiiM.x : safeRadius(snapshot.world.shape.radiiM.x),
          (snapshot.world.mode === "live" || this.testRigSetup) ? snapshot.world.shape.radiiM.y : safeRadius(snapshot.world.shape.radiiM.y),
          (snapshot.world.mode === "live" || this.testRigSetup) ? snapshot.world.shape.radiiM.z : safeRadius(snapshot.world.shape.radiiM.z),
        );
      }
    } else {
      this.currentRadii.copy(DEFAULT_RADII_M);
    }
    const previewNowMs = performance.now();
    if (this.previewWorkBudget.coverageDue(previewNowMs, this.observedCenter, this.currentRadii, this.coverageDirty || !this.coverageAnalysis)) {
      this.coverageAnalysis = analyseProjectionCoverage(
        this.projectionRig,
        this.observedCenter,
        this.currentRadii,
      );
      this.coverageDirty = false;
      this.container.dataset.coverageUpdates = String(++this.coverageUpdateCount);
      this.container.dataset.coverageUpdatedAtMs = previewNowMs.toFixed(1);
      this.container.dataset.projectionCoverage = this.coverageAnalysis.overallPercent.toFixed(1);
      this.container.dataset.projectionCoverageStatus = this.coverageAnalysis.status;
    }

    const shape = snapshot.world.shape;
    const prediction = snapshot.world.prediction;
    const principalAxisRad = THREE.MathUtils.degToRad(
      (shape?.principalAxisDeg ?? 0) + (airflowState?.principalAxisOffsetDeg ?? 0),
    );
    const confidence = THREE.MathUtils.clamp(snapshot.world.confidence, 0, 1);

    this.sphereMesh.position.copy(this.observedCenter);
    this.sphereGlowMesh.position.copy(this.observedCenter);
    this.sphereGlowMesh.scale.set(
      this.currentRadii.x * 1.035,
      this.currentRadii.y * 1.035,
      this.currentRadii.z * 1.035,
    );
    updateOrbitalSurfaceMaterial(this.surfaceMaterial, {
      timeS: this.shaderElapsedS,
      centerM: this.observedCenter,
      radiiM: this.currentRadii,
      principalAxisRad,
      wobble: THREE.MathUtils.clamp(
        airflowState?.wobble ?? shape?.wobble ?? 0,
        0,
        1,
      ),
      deformationRate: THREE.MathUtils.clamp(
        Math.abs(airflowState?.deformationRate ?? shape?.deformationRate ?? 0),
        0,
        1,
      ),
      energy: clamp01(snapshot.audiovisual.energy),
      brightness: clamp01(snapshot.audiovisual.brightness),
      visualDensity: clamp01(snapshot.audiovisual.visualDensity),
      fluidity: clamp01(snapshot.audiovisual.fluidity),
      fracture: clamp01(snapshot.audiovisual.fracture),
      glitch: clamp01(snapshot.audiovisual.glitch),
      organic: clamp01(snapshot.audiovisual.organic),
      melody: clamp01(snapshot.audiovisual.melody),
      residualGain: clamp01(snapshot.audiovisual.residualGain),
      residualM: this.currentResidual,
      trackingConfidence: confidence,
      stateValid: snapshot.world.stateValid,
      projectors: toProjectorShaderInputs(
        this.projectionRig,
        snapshot.projectorLevels,
      ),
      projectionPattern: this.projectionPattern,
      regionCenters: this.regionCenters,
      regionWidths: this.regionWidths,
      regionStyles: this.regionStyles,
      regionIntensities: this.surfaceRegionsEnabled
        ? this.regionIntensities
        : this.disabledRegionIntensities,
    });
    const motionWorld = snapshot.world;
    const contentState = this.worldContentMotion.sample({
      center: this.observedCenter, radius: Math.max(0.00001, this.currentRadii.x),
      valid: motionWorld.stateValid && motionWorld.measurementValid && motionWorld.status === 'tracking' && motionWorld.centerM !== null,
      source: `${motionWorld.mode}:${motionWorld.diagnostics.flags.filter(flag => /PHYSICAL_CAMERA|SIMULATED_NATIVE|REPLAY|HUATENG|UNCALIBRATED/.test(flag)).join(',')}`,
      sequence: motionWorld.sequence, timeS: motionWorld.monotonicTimeS,
    });
    this.applyContentMotionUniforms(contentState, 1 / contentState.referenceRadius);
    // The registry is renderer-neutral, but its bounded controls still shape
    // the active preview until a native shader compiler is attached.
    this.surfaceMaterial.uniforms.uBrightness.value = clamp01(
      snapshot.audiovisual.brightness * 0.82 + this.shaderControl * 0.18,
    );
    this.surfaceMaterial.uniforms.uGlitch.value = clamp01(
      snapshot.audiovisual.glitch * 0.82 + this.shaderControl * 0.18,
    );
    this.surfaceMaterial.uniforms.uLowerBulge.value = this.balloonPhysicsControls.lowerBulge;
    this.surfaceMaterial.uniforms.uAsymmetry.value = this.balloonPhysicsControls.asymmetry;
    this.surfaceMaterial.uniforms.uMaterialReflectance.value = this.projectionMaterialControls.reflectance;
    this.surfaceMaterial.uniforms.uMaterialTranslucency.value = this.projectionMaterialControls.translucency;
    this.surfaceMaterial.uniforms.uMaterialInternalBleed.value = this.projectionMaterialControls.internalBleed;
    this.surfaceMaterial.uniforms.uMaterialRoughness.value = this.projectionMaterialControls.roughness;

    this.predictionMesh.position.copy(this.predictedCenter);
    updatePredictionGhostMaterial(this.predictionMaterial, {
        timeS: motion.timeS,
      radiiM: this.currentRadii,
      principalAxisRad,
      wobble: THREE.MathUtils.clamp(shape?.wobble ?? 0, 0, 1),
      opacity:
        0.12 +
        clamp01(snapshot.audiovisual.predictionVisibility) * 0.34,
      confidence: prediction?.confidence ?? 0,
    });

    const predictionVisible =
      this.debugOptions.prediction &&
      snapshot.world.stateValid &&
      prediction !== null &&
      clamp01(snapshot.audiovisual.predictionVisibility) > 0.01;
    this.predictionAvailable =
      snapshot.world.stateValid &&
      prediction !== null &&
      clamp01(snapshot.audiovisual.predictionVisibility) > 0.01;
    this.predictionGroup.visible = predictionVisible;
    if (predictionVisible) {
      this.updateResidualField(motion.timeS);
    }

    this.fanRotor.rotation.y += motion.deltaS * (0.7 + fanSpeed * 23);
    this.fanAirMaterial.opacity = 0.012 + fanSpeed * 0.055;
    this.fanAirMaterial.color.setRGB(
      0.08 + fanSpeed * 0.08,
      0.22 + fanSpeed * 0.14,
      0.35 + fanSpeed * 0.24,
    );
    this.fanCoreMaterial.emissiveIntensity = 0.08 + fanSpeed * 1.7;

    this.updateProjectors(snapshot, motion.timeS);
    this.updateSpeakers(snapshot.quadLevels);
    if (renderDashboard) {
      this.updateCameraTour(safeDeltaS);
      if (!this.cinematicSceneControls.cameraTourEnabled && this.cameraMoveDurationS <= 0) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
    if (!this.projectorWindowRenderers.size && this.visibleProjectorPreviewIndices.size && this.previewWorkBudget.readbackDue(previewNowMs)) this.renderNextProjectorOutput();
  }

  public setDebugOptions(options: Partial<OrbitalDebugOptions>): void {
    this.debugOptions = {
      ...this.debugOptions,
      ...options,
    };
    this.syncSceneVisibility();
    this.predictionGroup.visible =
      this.debugOptions.prediction && this.predictionAvailable;
  }

  public setCinematicSceneControls(controls: Partial<CinematicSceneControls>): void {
    const previousTour = this.cinematicSceneControls.cameraTourEnabled;
    this.cinematicSceneControls = normaliseCinematicSceneControls({
      ...this.cinematicSceneControls,
      ...controls,
    });
    if (!previousTour && this.cinematicSceneControls.cameraTourEnabled) {
      this.cameraTourElapsedS = 0;
    }
    this.controls.enabled = !this.cinematicSceneControls.cameraTourEnabled;
    this.syncSceneVisibility();
  }

  private syncSceneVisibility(): void {
    const inspectingOutput = this.mappingView !== "sphere";
    this.projectorBodyGroup.visible = !inspectingOutput && this.cinematicSceneControls.projectorBodies;
    this.projectorLightGroup.visible = !inspectingOutput && this.cinematicSceneControls.projectorThrows;
    this.projectorTargetGroup.visible = !inspectingOutput && this.cinematicSceneControls.technicalGuides;
    this.projectorDebugGroup.visible = !inspectingOutput &&
      this.cinematicSceneControls.technicalGuides && this.debugOptions.projectors;
    this.fanAssemblyGroup.visible = !this.testRigSetup && !inspectingOutput && this.cinematicSceneControls.fanRig;
    this.speakerBodyGroup.visible = !this.testRigSetup && !inspectingOutput && this.cinematicSceneControls.speakerRig;
    this.speakerMeterGroup.visible = !this.testRigSetup && !inspectingOutput && this.cinematicSceneControls.speakerRig && this.debugOptions.speakers;
    this.roomGroup.visible = !this.testRigSetup && this.cinematicSceneControls.roomArchitecture && this.debugOptions.room;
    this.installationTrussGroup.visible = !inspectingOutput && this.installationRigControls.showTruss;
    this.installationCameraGroup.visible = !inspectingOutput && this.installationRigControls.showCameras;
    this.installationNirGroup.visible = !inspectingOutput && this.installationRigControls.showNir;
    if (this.testRigSetup) { this.warehouseGroup.visible = false; this.peopleGroup.visible = false; }
    this.container.dataset.projectorBodies = String(this.projectorBodyGroup.visible);
    this.container.dataset.projectorThrows = String(this.projectorLightGroup.visible);
    this.container.dataset.technicalGuides = String(this.projectorDebugGroup.visible);
    this.container.dataset.fanRig = String(this.fanAssemblyGroup.visible);
    this.container.dataset.speakerRig = String(this.speakerBodyGroup.visible);
    this.container.dataset.installationMode = this.installationRigControls.mode;
    this.container.dataset.hazeDensity = this.installationRigControls.hazeDensity.toFixed(2);
  }

  public setInstallationRigControls(controls: Partial<InstallationRigControls>): void {
    if (this.testRigSetup && controls.mode === "production-5") this.clearTestRigSetup();
    if (this.testRigSetup) return;
    this.installationRigControls = normaliseInstallationRigControls({
      ...this.installationRigControls,
      ...controls,
    });
    const plans = createInstallationHeadPlans(this.projectionRig, this.installationRigControls);
    plans.forEach((plan) => {
      this.projectionRig.projectors[plan.projectorIndex]!.enabled = plan.active;
    });
    this.scene.fog = new THREE.FogExp2(
      new THREE.Color(0x030607),
      0.004 + this.installationRigControls.hazeDensity * 0.052,
    );
    this.rebuildProjectors();
    this.buildInstallationSupportRig();
    this.syncSceneVisibility();
  }

  private updateCameraTour(deltaS: number): void {
    if (this.testRigSetup) this.cinematicSceneControls.cameraTourEnabled = false;
    if (!this.cinematicSceneControls.cameraTourEnabled) {
      this.updateCameraMove(deltaS);
      return;
    }
    this.cameraTourElapsedS += deltaS;
    const route = [
      this.cinematicSceneControls.cameraA,
      this.cinematicSceneControls.cameraB,
      this.cinematicSceneControls.cameraC,
    ] as const;
    const phase = heldCameraTourPhase(
      this.cameraTourElapsedS,
      this.cinematicSceneControls.transitionSeconds,
      this.cinematicSceneControls.holdSeconds,
    );
    const target = this.sphereMesh.position;
    const from = SOCIAL_CAMERA_PRESETS[route[phase.fromIndex]];
    const to = SOCIAL_CAMERA_PRESETS[route[phase.toIndex]];
    const fromPosition = new THREE.Vector3(...from.direction)
      .normalize().multiplyScalar(from.distance).add(target);
    const toPosition = new THREE.Vector3(...to.direction)
      .normalize().multiplyScalar(to.distance).add(target);
    this.camera.position.lerpVectors(fromPosition, toPosition, phase.mix);
    this.container.dataset.cameraTourSegment = `${phase.fromIndex}-${phase.toIndex}`;
    this.container.dataset.cameraTourMix = phase.mix.toFixed(3);
    this.controls.target.lerp(target, 0.08);
    this.camera.lookAt(this.controls.target);
  }

  public focusCameraPreset(presetId: SocialCameraPreset, durationS = 1.6): void {
    const preset = SOCIAL_CAMERA_PRESETS[presetId];
    this.cinematicSceneControls.cameraTourEnabled = false;
    this.controls.enabled = false;
    this.cameraMoveFrom.copy(this.camera.position);
    this.cameraMoveTo.copy(new THREE.Vector3(...preset.direction)
      .normalize().multiplyScalar(this.testRigSetup ? Math.max(this.testRigSetup.ballDiameterM * 2.5, 0.5) : preset.distance).add(this.sphereMesh.position));
    this.cameraMoveElapsedS = 0;
    this.cameraMoveDurationS = THREE.MathUtils.clamp(durationS, 0.4, 4);
  }

  private updateCameraMove(deltaS: number): void {
    if (this.cameraMoveDurationS <= 0) return;
    this.cameraMoveElapsedS += deltaS;
    const raw = THREE.MathUtils.clamp(this.cameraMoveElapsedS / this.cameraMoveDurationS, 0, 1);
    const eased = raw * raw * (3 - 2 * raw);
    this.camera.position.lerpVectors(this.cameraMoveFrom, this.cameraMoveTo, eased);
    this.controls.target.lerp(this.sphereMesh.position, 0.12);
    this.camera.lookAt(this.controls.target);
    if (raw >= 1) {
      this.cameraMoveDurationS = 0;
      this.controls.enabled = true;
    }
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  public setBalloonPhysicsControls(controls: Partial<BalloonPhysicsControls>): void {
    this.balloonPhysicsControls = normaliseBalloonPhysicsControls(controls);
  }

  public setProjectionMaterialControls(controls: Partial<ProjectionMaterialControls>): void {
    this.projectionMaterialControls = normaliseProjectionMaterialControls(controls);
  }

  public setLivingSkinControls(controls: Partial<LivingSkinControls>): void {
    this.livingSkinControls = normaliseLivingSkinControls({
      ...this.livingSkinControls,
      ...controls,
    });
    const uniforms = this.surfaceMaterial.uniforms;
    uniforms.uLivingSkinsEnabled.value = this.livingSkinControls.enabled ? 1 : 0;
    uniforms.uLivingSkinPatchCount.value = this.livingSkinControls.patchCount;
    uniforms.uLivingSkinVariety.value = this.livingSkinControls.variety;
    uniforms.uLivingSkinGlitch.value = this.livingSkinControls.glitch;
    uniforms.uLivingSkinFlashRate.value = this.livingSkinControls.flashRate;
    uniforms.uLivingSkinSequenceMode.value = livingSkinSequenceModeIndex(this.livingSkinControls.sequenceMode);
    uniforms.uLivingSkinEventHold.value = this.livingSkinControls.eventHold;
    uniforms.uLivingSkinAttackSharpness.value = this.livingSkinControls.attackSharpness;
    uniforms.uLivingSkinBreath.value = this.livingSkinControls.breath;
    uniforms.uLivingSkinEdgeSoftness.value = this.livingSkinControls.edgeSoftness;
    uniforms.uLivingSkinBpm.value = this.livingSkinControls.bpm;
    uniforms.uLivingSkinPhraseEvolution.value = this.livingSkinControls.phraseEvolution;
    uniforms.uBeautyLighting.value = this.livingSkinControls.beautyLighting;
    uniforms.uSphereGlow.value = this.livingSkinControls.glow;
    this.sphereGlowMaterial.opacity = this.livingSkinControls.glow * 0.14;
    this.sphereGlowMaterial.visible = this.livingSkinControls.glow > 0.005;
  }

  private createSocialCamera(
    width: number,
    height: number,
    presetId: SocialCameraPreset,
  ): THREE.PerspectiveCamera {
    const preset = SOCIAL_CAMERA_PRESETS[presetId];
    const target = this.sphereMesh.position.clone();
    const direction = new THREE.Vector3(...preset.direction).normalize();
    const camera = new THREE.PerspectiveCamera(
      height > width ? 48 : 42,
      width / height,
      0.08,
      100,
    );
    camera.position.copy(target).addScaledVector(direction, preset.distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    return camera;
  }

  private applyTourToCamera(camera: THREE.PerspectiveCamera, elapsedS: number): void {
    const route = [
      this.cinematicSceneControls.cameraA,
      this.cinematicSceneControls.cameraB,
      this.cinematicSceneControls.cameraC,
    ] as const;
    const phase = heldCameraTourPhase(
      elapsedS,
      this.cinematicSceneControls.transitionSeconds,
      this.cinematicSceneControls.holdSeconds,
    );
    const target = this.sphereMesh.position;
    const from = SOCIAL_CAMERA_PRESETS[route[phase.fromIndex]];
    const to = SOCIAL_CAMERA_PRESETS[route[phase.toIndex]];
    const fromPosition = new THREE.Vector3(...from.direction)
      .normalize().multiplyScalar(from.distance).add(target);
    const toPosition = new THREE.Vector3(...to.direction)
      .normalize().multiplyScalar(to.distance).add(target);
    camera.position.lerpVectors(fromPosition, toPosition, phase.mix);
    camera.lookAt(target);
  }

  public async captureSocialStill(
    width: number,
    height: number,
    cameraPreset: SocialCameraPreset,
  ): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const outputRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    outputRenderer.outputColorSpace = THREE.SRGBColorSpace;
    outputRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    outputRenderer.toneMappingExposure = 1.06;
    outputRenderer.shadowMap.enabled = true;
    outputRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    outputRenderer.setPixelRatio(1);
    outputRenderer.setSize(width, height, false);
    outputRenderer.render(this.scene, this.createSocialCamera(width, height, cameraPreset));
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Social still encoding failed")),
        "image/png",
      );
    });
    outputRenderer.dispose();
    return blob;
  }

  public async recordSocialClip(
    width: number,
    height: number,
    cameraPreset: SocialCameraPreset,
    durationS = 6,
    fps = 30,
  ): Promise<Blob> {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("This browser does not support local social clip recording");
    }
    const canvas = document.createElement("canvas");
    const outputRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    outputRenderer.outputColorSpace = THREE.SRGBColorSpace;
    outputRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    outputRenderer.toneMappingExposure = 1.06;
    outputRenderer.shadowMap.enabled = true;
    outputRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    outputRenderer.setPixelRatio(1);
    outputRenderer.setSize(width, height, false);
    const camera = this.createSocialCamera(width, height, cameraPreset);
    const stream = canvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 14_000_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Social clip recording failed"));
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });
    recorder.start(250);
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const renderFrame = (): void => {
        if (this.cinematicSceneControls.cameraTourEnabled) {
          this.applyTourToCamera(camera, (performance.now() - startedAt) / 1000);
        }
        outputRenderer.render(this.scene, camera);
        if (performance.now() - startedAt >= durationS * 1000) {
          resolve();
        } else {
          requestAnimationFrame(renderFrame);
        }
      };
      renderFrame();
    });
    recorder.stop();
    const blob = await finished;
    stream.getTracks().forEach((track) => track.stop());
    outputRenderer.dispose();
    return blob;
  }

  public getProjectionCoverage(): Readonly<ProjectionCoverageAnalysis> | null {
    return this.coverageAnalysis;
  }

  public renderShaderThumbnail(preset: ShaderPreset, canvas: HTMLCanvasElement): void {
    const cacheKey = `native-colour-v2:${JSON.stringify(preset)}`;
    const cached = this.thumbnailCache.get(cacheKey);
    if (cached) {
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      canvas.width = 180; canvas.height = 120;
      context.putImageData(cached, 0, 0);
      canvas.dataset.rendered = "true";
      canvas.dataset.colourPipeline = 'native-srgb';
      this.container.dataset.shaderThumbnailCacheHits = String(++this.thumbnailCacheHitCount);
      return;
    }
    const shader = getShaderDefinition(preset.shaderId);
    const numericValues = Object.values(preset.parameters).filter(
      (value): value is number => typeof value === "number",
    );
    const uniforms = this.thumbnailMaterial.uniforms;
    uniforms.uShaderMode.value = shader ? shaderRenderModeIndex(shader.id) : 0;
    uniforms.uShaderSeed.value = deriveDeterministicShaderSeed(preset.shaderId, preset.seed) / 4294967296;
    uniforms.uShaderParamA.value = numericValues[0] ?? 0.5;
    uniforms.uShaderParamB.value = numericValues[1] ?? 0.5;
    uniforms.uShaderParamC.value = numericValues[2] ?? 0.5;
    uniforms.uShaderParamD.value = numericValues[3] ?? 0.5;
    uniforms.uShaderParamE.value = numericValues[4] ?? 0.5;
    uniforms.uTime.value = 2.1 + (preset.seed % 17) * 0.13;
    (uniforms.uCenter.value as THREE.Vector3).set(0, 0, 0);
    (uniforms.uRadii.value as THREE.Vector3).set(1, 1, 1);
    uniforms.uWobble.value = 0.09;
    uniforms.uDeformationRate.value = 0.04;
    uniforms.uEnergy.value = 0.58;
    uniforms.uBrightness.value = 1;
    uniforms.uDensity.value = 0.5;
    uniforms.uFluidity.value = 0.55;
    uniforms.uOrganic.value = 0.58;
    uniforms.uMelody.value = 0.3;
    uniforms.uTrackingConfidence.value = 1;
    uniforms.uStateValid.value = 1;
    uniforms.uPreviewExposure.value = 1;
    uniforms.uProjectionPattern.value = 0;
    uniforms.uOutputPreviewMode.value = 0;
    uniforms.uLookScale.value = 1;
    uniforms.uLookRotation.value = 0;
    uniforms.uLookHue.value = 0;
    uniforms.uLookSaturation.value = 1;
    uniforms.uLookContrast.value = 1;
    uniforms.uLookExposure.value = 0;
    uniforms.uLookBrightness.value = 1;
    uniforms.uLookSoftness.value = 0.48;
    uniforms.uLookLevel.value = 1;
    uniforms.uLowerBulge.value = 0.5;
    uniforms.uAsymmetry.value = 0.5;
    (uniforms.uRegionIntensities.value as Float32Array).fill(0);
    const previousTarget = this.renderer.getRenderTarget();
    const previousClearColour = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.thumbnailTarget);
    this.renderer.setClearColor(0x020506, 1);
    this.renderer.render(this.thumbnailScene, this.thumbnailCamera);
    this.renderer.readRenderTargetPixels(this.thumbnailTarget, 0, 0, 180, 120, this.thumbnailPixels);
    this.container.dataset.shaderThumbnailReadbacks = String(++this.thumbnailReadbackCount);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearColor(previousClearColour, previousClearAlpha);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    canvas.width = 180;
    canvas.height = 120;
    const image = context.createImageData(180, 120);
    for (let y = 0; y < 120; y += 1) {
      const source = (119 - y) * 180 * 4;
      image.data.set(this.thumbnailPixels.subarray(source, source + 180 * 4), y * 180 * 4);
    }
    context.putImageData(image, 0, 0);
    this.thumbnailCache.set(cacheKey, image);
    canvas.dataset.rendered = "true";
    canvas.dataset.colourPipeline = 'native-srgb';
  }

  public setEnvironmentControls(
    controls: Partial<EnvironmentPreviewControls>,
  ): void {
    this.environmentControls = normaliseEnvironmentPreviewControls({
      ...this.environmentControls,
      ...controls,
    });
    this.warehouseGroup.visible = !this.testRigSetup && this.environmentControls.warehouseEnabled;
    this.peopleGroup.visible =
      !this.testRigSetup && this.environmentControls.warehouseEnabled &&
      this.environmentControls.peopleEnabled;
    const light = this.environmentControls.lighting;
    const warmth = this.environmentControls.warmth;
    this.warehouseLights.forEach((source, index) => {
      source.intensity = (index === 1 ? 78 : 62) * (0.22 + light * 0.78);
    });
    this.warehouseFillLights.forEach((source, index) => {
      source.intensity = (index === 0 ? 0.36 : 0.48) + light * 0.66;
      source.color.lerpColors(
        new THREE.Color(0x9ebad1),
        new THREE.Color(0xffba78),
        warmth,
      );
    });
    this.warehouseEmissiveMaterials.forEach((material) => {
      material.emissiveIntensity = 0.25 + light * 1.35;
      material.emissive.lerpColors(
        new THREE.Color(0x82b5ce),
        new THREE.Color(0xffbd7c),
        warmth,
      );
    });
    this.warehouseConcreteMaterials.forEach((material, index) => {
      const patina = this.environmentControls.concretePatina;
      material.roughness = 0.68 + patina * 0.28;
      material.color.setHSL(0.085 - warmth * 0.035, 0.04 + patina * 0.055, 0.21 + index * 0.025);
      material.bumpScale = 0.025 + patina * 0.065;
    });
    this.renderer.toneMappingExposure = 0.72 + light * 0.42;
  }

  public setProjectionPattern(pattern: ProjectionPattern): void {
    this.projectionPattern = pattern;
    this.projectionRig.calibration.pattern = pattern;
  }

  public setPreviewExposure(exposure: number): void {
    this.surfaceMaterial.uniforms.uPreviewExposure.value = THREE.MathUtils.clamp(
      exposure,
      0,
      1,
    );
  }

  public setShaderLookControls(controls: Partial<ShaderLookControls>): void {
    const resolved = setOrbitalSurfaceLookControls(this.surfaceMaterial, controls);
    this.shaderAnimationSpeed = resolved.motion;
  }

  public setMappingView(view: MappingViewMode): void {
    this.mappingView = view;
    if (view.startsWith("projector-")) {
      const projectorIndex = Number(view.slice(-1)) - 1;
      const projector = this.projectionRig.projectors[projectorIndex];
      if (projector) {
        this.camera.position.set(
          projector.positionM.x,
          projector.positionM.y,
          projector.positionM.z,
        );
        this.controls.target.set(
          projector.targetM.x,
          projector.targetM.y,
          projector.targetM.z,
        );
        this.camera.fov = projector.fovDeg;
      }
    } else if (view === "uv") {
      // This is an honest front-on coverage proxy until a calibrated UV atlas
      // renderer exists. It does not pretend to be a projector-ready unwrap.
      if (this.testRigSetup) {
        const center = this.testRigSetup.ballCenterM;
        this.camera.position.set(center.x, center.y, center.z + Math.max(0.4, this.testRigSetup.ballDiameterM * 2.5));
        this.controls.target.set(center.x, center.y, center.z);
      } else {
        this.camera.position.set(0, 3.35, 15.8);
        this.controls.target.set(0, 3.35, 0);
      }
      this.camera.fov = 34;
    } else if (this.testRigSetup) {
      this.focusTestLayout();
    } else {
      this.camera.position.set(10.8, 7.1, 14.1);
      this.controls.target.set(0, 3.5, 0);
      this.camera.fov = 42;
    }
    this.camera.updateProjectionMatrix();
    this.syncSceneVisibility();
    this.controls.update();
  }

  public setShaderPreset(preset: ShaderPreset): void {
    this.activeShaderId = preset.shaderId;
    const numericValues = Object.values(preset.parameters).filter(
      (value): value is number => typeof value === "number",
    );
    this.shaderControl = numericValues.length
      ? numericValues.reduce((sum, value) => sum + value, 0) /
        numericValues.length
      : 0;
    this.surfaceMaterial.name = `OrbitalProjectedSurface:${preset.shaderId}`;
    this.surfaceMaterial.userData.shaderPreset = preset;
    this.surfaceMaterial.userData.shaderId = this.activeShaderId;
    const shader = getShaderDefinition(preset.shaderId);
    const shaderSeed = deriveDeterministicShaderSeed(preset.shaderId, preset.seed);
    this.surfaceMaterial.uniforms.uShaderMode.value = shader
      ? shaderRenderModeIndex(shader.id)
      : 0;
    this.surfaceMaterial.uniforms.uShaderSeed.value = shaderSeed / 4294967296;
    this.surfaceMaterial.uniforms.uShaderParamA.value = numericValues[0] ?? 0.5;
    this.surfaceMaterial.uniforms.uShaderParamB.value = numericValues[1] ?? 0.5;
    this.surfaceMaterial.uniforms.uShaderParamC.value = numericValues[2] ?? 0.5;
    this.surfaceMaterial.uniforms.uShaderParamD.value = numericValues[3] ?? 0.5;
    this.surfaceMaterial.uniforms.uShaderParamE.value = numericValues[4] ?? 0.5;
  }

  public setSurfaceRegions(assignments: readonly SurfaceRegionAssignment[]): void {
    this.surfaceRegions = validateSurfaceRegionAssignments(assignments);
    for (let index = 0; index < SURFACE_REGION_DEFINITIONS.length; index += 1) {
      const definition = SURFACE_REGION_DEFINITIONS[index];
      const assignment = this.surfaceRegions.find(
        (candidate) => candidate.regionId === definition.id,
      );
      this.regionStyles[index] = assignment
        ? shaderRenderModeIndex(assignment.shaderId)
        : 0;
      this.regionIntensities[index] = assignment?.intensity ?? 0;
    }
  }

  public getSurfaceRegions(): readonly SurfaceRegionAssignment[] {
    return this.surfaceRegions;
  }

  public setSurfaceRegionsEnabled(enabled: boolean): void {
    this.surfaceRegionsEnabled = enabled;
  }

  public setRenderQuality(tier: RenderQualityTier): void {
    if (this.renderQuality === tier) {
      return;
    }
    this.renderQuality = tier;
    this.applyRenderQuality();
    this.resize();
  }

  public getRenderQuality(): RenderQualityTier {
    return this.renderQuality;
  }

  public getProjectionRig(): Readonly<ProjectionRigConfig> {
    return this.projectionRig;
  }

  public getAerodynamicState(): Readonly<BernoulliBalloonState> | null {
    return this.aerodynamicState;
  }

  public setProjectionRig(config: ProjectionRigConfig): void {
    const validated = validateProjectionRig(config);
    this.projectionRig = validated;
    this.coverageDirty = true;
    this.projectionPattern = validated.calibration.pattern;
    this.rebuildProjectors();
    this.buildInstallationSupportRig();
    this.setMappingView(this.mappingView);
  }

  public getDigitalTwinState(): Readonly<OrbitalDigitalTwinState> {
    return Object.freeze({
      classification: "digital-twin",
      physicalProof: false,
      physicalValidation: "not-validated",
      coordinateUnit: "metres",
      sceneScale: Object.freeze({
        roomM: Object.freeze({
          width: ROOM_WIDTH_M,
          height: ROOM_HEIGHT_M,
          depth: ROOM_DEPTH_M,
        }),
        nominalSphereDiameterM: this.testRigSetup?.ballDiameterM ?? this.projectionRig.sphereDiameterM,
      }),
      limitations: this.testRigSetup ? ["Manual test-rig geometry is uncalibrated and does not verify physical alignment.", "Generic camera and projector field-of-view values are editable planning assumptions.", "Live tracked geometry uses its own calibration and is not resized to the preview ball."] : DIGITAL_TWIN_LIMITATIONS,
      lastRuntimeMode: this.lastRuntimeMode,
      lastTrackingStatus: this.lastTrackingStatus,
      lastSequence: this.lastSequence,
      debug: Object.freeze({ ...this.debugOptions }),
    });
  }

  public resize(): void {
    if (this.disposed) {
      return;
    }
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.applyRenderQuality();
    this.renderer.setSize(width, height, false);
    if (this.testRigSetup && this.container.dataset.testRigFocus === "layout") this.focusTestLayout();
  }

  public renderProjectorOutputWindow(
    index: number,
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    mode: "pre" | "post",
  ): void {
    if (this.disposed) return;
    const outputCamera = this.projectorOutputCameras[index];
    if (!outputCamera) return;
    this.advanceShaderClock(performance.now());

    let outputRenderer = this.projectorWindowRenderers.get(canvas);
    if (!outputRenderer) {
      outputRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      outputRenderer.outputColorSpace = THREE.SRGBColorSpace;
      // Projector artwork owns its native colour/exposure in the shader.
      // Filmic tone mapping remains on the room renderer only.
      outputRenderer.toneMapping = THREE.NoToneMapping;
      outputRenderer.toneMappingExposure = 1;
      outputRenderer.shadowMap.enabled = false;
      outputRenderer.setPixelRatio(1);
      this.projectorWindowRenderers.set(canvas, outputRenderer);
      this.syncProjectorPreviewPauseState();
    }

    const renderWidth = Math.max(1, Math.round(width));
    const renderHeight = Math.max(1, Math.round(height));
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      outputRenderer.setSize(renderWidth, renderHeight, false);
    }

    const previousAspect = outputCamera.aspect;
    const restoreSurfaceState = this.applyProjectorOutputState(index, mode === "pre" ? 1 : 2);
    try {
      const definition = this.projectionRig.projectors[index];
      outputCamera.aspect = definition.raster.widthPx / definition.raster.heightPx;
      outputCamera.updateProjectionMatrix();
      outputRenderer.setClearColor(0x000000, 1);
      outputRenderer.clear(true, true, true);
      let blocked = this.outputBlockReason(index);
      const approximate = !!this.approximateBallMapping && index === 0 && !this.outputBlackout && !this.probeDark;
      const fullFrameTest = this.fullFrameArtworkTest && index === 0 && !this.outputBlackout && !this.probeDark;
      const structured = !approximate && !fullFrameTest && index === 0 && mode === "post" && !!this.structuredLight?.active;
      let scanEllipse = !blocked && structured ? this.structuredLight!.ellipse() : null;
      if (!blocked && structured && !scanEllipse) blocked = "STRUCTURED_LIGHT_NO_ELLIPSE";
      if (structured && this.probeDark) {
        // Delay probe: this frame goes black on purpose; note when the first one is drawn.
        scanEllipse = null; blocked = "DELAY_PROBE";
        this.probeDarkRenderedAtMs ??= performance.now();
      } else if (structured) {
        // Ride out a single late or unsure tracking frame instead of flashing black.
        const held = this.structuredLightHold.resolve(performance.now(), blocked, scanEllipse);
        scanEllipse = held.ellipse; blocked = held.blocked;
        canvas.dataset.outputHeld = held.held ? "true" : "false";
        this.projectedEdgeNote = scanEllipse ? ellipseEdgeNote(scanEllipse, renderWidth, renderHeight) : null;
      }
      if (structured && (blocked || canvas.dataset.outputHeld === "true")) this.scanContentMotion.invalidate();
      const illumination = trackingLightAllowed(this.projectorTrackingLight.enabled, this.outputBlackout,
        this.outputWorld, this.probeDark, index, mode === "post") && definition.enabled;
      const light = illumination ? trackingLightLinear(this.projectorTrackingLight.level) : 0;
      this.surfaceMaterial.uniforms.uTrackingFill.value = light;
      if (illumination) {
        outputRenderer.setClearColor(new THREE.Color().setRGB(light, light, light), 1);
        outputRenderer.clear(true, true, true);
      }
      canvas.dataset.trackingLight = illumination ? (blocked ? "recovery" : "artwork-and-light") : "off";
      canvas.dataset.trackingLightLevel = String(illumination ? this.projectorTrackingLight.level : 0);
      canvas.dataset.outputBlockReason = blocked ?? "";
      canvas.dataset.outputCalibration = this.structuredLight?.active && index === 0 ? "structured-light" : "measured";
      if (approximate) {
        canvas.dataset.outputCalibration = "estimated-balloon-mapping";
        const ellipse=this.approximateBallMapping!();
        canvas.dataset.outputPrediction = ellipse?.phase ?? "expired";
        canvas.dataset.outputSilhouette = ellipse?.outlinePx?.length===64 ? (ellipse.outlineHeld ? "held-64-point-edge" : "64-point-balloon-edge") : "ellipse-fallback";
        if (ellipse) {
          const uniforms=this.surfaceMaterial.uniforms;
          const confidence=uniforms.uTrackingConfidence.value,valid=uniforms.uStateValid.value;
          uniforms.uTrackingConfidence.value=1;uniforms.uStateValid.value=1;uniforms.uFullFrameArtworkTest.value=1;uniforms.uEstimatedOpacity.value=ellipse.opacity ?? 1;
          try { this.renderStructuredLightOutput(outputRenderer,ellipse,renderWidth,renderHeight,false); }
          finally { uniforms.uTrackingConfidence.value=confidence;uniforms.uStateValid.value=valid;uniforms.uFullFrameArtworkTest.value=0;uniforms.uEstimatedOpacity.value=1; }
        } else { canvas.dataset.outputBlockReason="ESTIMATED_TRACKING_EXPIRED"; }
      } else if (fullFrameTest) {
        canvas.dataset.outputCalibration = "unmapped-artwork-test";
        canvas.dataset.trackingLight = "off";
        const uniforms = this.surfaceMaterial.uniforms;
        const confidence = uniforms.uTrackingConfidence.value, valid = uniforms.uStateValid.value;
        uniforms.uTrackingConfidence.value = 1; uniforms.uStateValid.value = 1;
        uniforms.uFullFrameArtworkTest.value = 1;
        const diameter = Math.hypot(renderWidth, renderHeight) * 1.03;
        try {
          this.renderStructuredLightOutput(outputRenderer, { centerPx: [renderWidth/2, renderHeight/2], majorPx: diameter, minorPx: diameter, angleDeg: 0 }, renderWidth, renderHeight, false);
        } finally { uniforms.uTrackingConfidence.value = confidence; uniforms.uStateValid.value = valid; uniforms.uFullFrameArtworkTest.value = 0; }
      } else if (scanEllipse) {
        this.renderStructuredLightOutput(outputRenderer, scanEllipse, renderWidth, renderHeight, canvas.dataset.outputHeld !== "true");
      } else if (!blocked) {
        const aspect = outputCamera.aspect;
        const viewportWidth = Math.min(renderWidth, renderHeight * aspect);
        const viewportHeight = viewportWidth / aspect;
        outputRenderer.setViewport((renderWidth - viewportWidth) / 2, (renderHeight - viewportHeight) / 2, viewportWidth, viewportHeight);
        outputRenderer.render(this.projectorOutputScene, outputCamera);
        outputRenderer.setViewport(0, 0, renderWidth, renderHeight);
      }
      canvas.dataset.renderSource = "direct-webgl";
      canvas.dataset.colourPipeline = 'native-srgb';
      canvas.dataset.renderWidth = String(renderWidth);
      canvas.dataset.renderHeight = String(renderHeight);
      canvas.dataset.renderProjector = String(index + 1);
      canvas.dataset.renderMode = mode;
      canvas.dataset.renderFrameSequence = String(++this.projectorWindowOutputSequence);
      canvas.dataset.renderFrameTimeMs = performance.now().toFixed(1);
      canvas.dataset.renderShaderTimeS = this.shaderElapsedS.toFixed(3);
      this.container.dataset.projectorWindowFrameSequence = canvas.dataset.renderFrameSequence;
      this.container.dataset.projectorWindowFrameTimeMs = canvas.dataset.renderFrameTimeMs;
      this.container.dataset.projectorWindowShaderTimeS = canvas.dataset.renderShaderTimeS;
    } finally {
      outputCamera.aspect = previousAspect;
      outputCamera.updateProjectionMatrix();
      this.surfaceMaterial.uniforms.uTrackingFill.value = 0;
      restoreSurfaceState();
    }
  }

  /**
   * Draw the sphere so its silhouette is exactly the projector-space ellipse:
   * an orthographic camera in projector pixels, sphere squashed along the
   * ellipse axes, no projector warp (the homography already maps to raster).
   */
  private renderStructuredLightOutput(renderer: THREE.WebGLRenderer, ellipse: ImageEllipse, width: number, height: number, validMotion = true): void {
    const radius = this.testRigSetup ? this.testRigSetup.ballDiameterM / 2 : 0.25;
    const framing = orthoFramingForEllipse(ellipse, width, height, radius);
    const shapeUniforms=this.surfaceMaterial.uniforms;
    if(ellipse.outlinePx?.length===64) {
      const data=this.silhouetteTexture.image.data as Float32Array;
      data.set(silhouetteRadii(ellipse.outlinePx,ellipse.centerPx));
      this.silhouetteTexture.needsUpdate=true;
      shapeUniforms.uSilhouetteRadii.value=this.silhouetteTexture;
      (shapeUniforms.uSilhouetteCenter.value as THREE.Vector2).set(ellipse.centerPx[0],height-ellipse.centerPx[1]);
      shapeUniforms.uSilhouetteEnabled.value=1;
    } else shapeUniforms.uSilhouetteEnabled.value=0;
    const uniforms = this.surfaceMaterial.uniforms;
    const radii = uniforms.uRadii.value as THREE.Vector3;
    const previousContent = {
      enabled: uniforms.uContentMotionEnabled?.value,
      scale: uniforms.uContentMotionScale?.value,
      offset: (uniforms.uContentMotionOffset?.value as THREE.Vector3 | undefined)?.clone(),
    };
    const scanMotion = this.scanContentMotion.sample({
      center: { x: ellipse.centerPx[0], y: -ellipse.centerPx[1], z: 0 }, radius: ellipse.majorPx / 2,
      valid: validMotion, source: `structured-light:${width}x${height}`, sequence: this.outputWorld?.sequence ?? 0,
      timeS: this.outputWorld?.monotonicTimeS ?? performance.now() / 1000,
    });
    this.applyContentMotionUniforms(scanMotion, ellipse.majorPx / (2 * radius * scanMotion.referenceRadius));
    const previous = { radii: radii.clone(), angle: Number(uniforms.uShapeAngle.value), mode: Number(uniforms.uOutputPreviewMode.value), wobble: Number(uniforms.uWobble.value), rate: Number(uniforms.uDeformationRate.value), warp: (uniforms.uOutputWarp.value as THREE.Matrix4).clone() };
    const centre = this.projectorOutputSphere.position;
    const cam = this.structuredLightCamera;
    cam.left = framing.left; cam.right = framing.right; cam.top = framing.top; cam.bottom = framing.bottom;
    cam.near = 0.001; cam.far = radius * 40;
    cam.position.set(centre.x, centre.y, centre.z + radius * 20);
    cam.up.set(0, 1, 0); cam.lookAt(centre); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    try {
      radii.set(framing.radii[0], framing.radii[1], framing.radii[2]);
      // The shader's rotate2d(a) turns by -a, so the uniform is the negated world angle.
      uniforms.uShapeAngle.value = -framing.shapeAngleRad;
      uniforms.uOutputPreviewMode.value = 1;
      uniforms.uWobble.value = 0; uniforms.uDeformationRate.value = 0;
      (uniforms.uOutputWarp.value as THREE.Matrix4).identity();
      renderer.setViewport(0, 0, width, height);
      renderer.render(this.projectorOutputScene, cam);
    } finally {
      if (uniforms.uContentMotionEnabled && previousContent.offset) {
        uniforms.uContentMotionEnabled.value = previousContent.enabled;
        uniforms.uContentMotionScale.value = previousContent.scale;
        (uniforms.uContentMotionOffset.value as THREE.Vector3).copy(previousContent.offset);
      }
      uniforms.uSilhouetteEnabled.value=0;
      radii.copy(previous.radii); uniforms.uShapeAngle.value = previous.angle; uniforms.uOutputPreviewMode.value = previous.mode;
      uniforms.uWobble.value = previous.wobble; uniforms.uDeformationRate.value = previous.rate;
      (uniforms.uOutputWarp.value as THREE.Matrix4).copy(previous.warp);
    }
  }

  public disposeProjectorOutputWindow(canvas: HTMLCanvasElement): void {
    const outputRenderer = this.projectorWindowRenderers.get(canvas);
    if (!outputRenderer) return;
    outputRenderer.renderLists.dispose();
    outputRenderer.dispose();
    this.projectorWindowRenderers.delete(canvas);
    this.syncProjectorPreviewPauseState();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.thumbnailCache.clear();
    this.resizeObserver?.disconnect();
    this.controls.dispose();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry instanceof THREE.BufferGeometry) {
        geometries.add(renderable.geometry);
      }
      const objectMaterial = renderable.material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (Array.isArray(objectMaterial)) {
        objectMaterial.forEach((material) => materials.add(material));
      } else if (objectMaterial instanceof THREE.Material) {
        materials.add(objectMaterial);
      }
    });
    this.thumbnailScene.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
      if (renderable.material instanceof THREE.Material) materials.add(renderable.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());

    for (const outputRenderer of this.projectorWindowRenderers.values()) {
      outputRenderer.renderLists.dispose();
      outputRenderer.dispose();
    }
    this.projectorWindowRenderers.clear();

    this.renderer.renderLists.dispose();
    this.silhouetteTexture.dispose();
    this.projectorOutputTarget.dispose();
    this.thumbnailTarget.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.scene.clear();
    this.projectorOutputSphere.geometry.dispose();
    this.projectorOutputScene.clear();
    this.thumbnailScene.clear();
  }

  private buildLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0x31425e, 0x030405, 0.22);
    this.scene.add(hemisphere);

    const architecturalLight = new THREE.DirectionalLight(0x8da1bc, 0.36);
    architecturalLight.position.set(-5, 12, 8);
    architecturalLight.castShadow = true;
    architecturalLight.shadow.mapSize.set(1024, 1024);
    architecturalLight.shadow.camera.left = -11;
    architecturalLight.shadow.camera.right = 11;
    architecturalLight.shadow.camera.top = 11;
    architecturalLight.shadow.camera.bottom = -11;
    architecturalLight.shadow.camera.far = 40;
    this.scene.add(architecturalLight);

    const floorGlow = new THREE.PointLight(0x244e67, 3.5, 10, 2);
    floorGlow.position.set(0, 0.5, 0);
    this.scene.add(floorGlow);
  }

  private applyRenderQuality(): void {
    const profile = getRenderQualityProfile(this.renderQuality);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio),
    );
    this.renderer.shadowMap.enabled = profile.shadows;
  }

  private buildRoom(): void {
    this.roomGroup.name = "Scaled dark room";

    const roomMaterial = new THREE.MeshStandardMaterial({
      color: 0x05070a,
      roughness: 0.95,
      metalness: 0.02,
      side: THREE.BackSide,
    });
    const roomShell = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_WIDTH_M, ROOM_HEIGHT_M, ROOM_DEPTH_M),
      roomMaterial,
    );
    roomShell.position.y = ROOM_HEIGHT_M / 2;
    roomShell.receiveShadow = true;
    this.roomGroup.add(roomShell);

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x080a0d,
      roughness: 0.78,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_WIDTH_M - 0.12, ROOM_DEPTH_M - 0.12),
      floorMaterial,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.006;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    const grid = new THREE.GridHelper(
      ROOM_DEPTH_M - 2,
      34,
      0x18222c,
      0x0c1118,
    );
    grid.position.y = 0.018;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.24;
      material.depthWrite = false;
    });
    this.roomGroup.add(grid);

    const trussMaterial = new THREE.MeshStandardMaterial({
      color: 0x12171d,
      metalness: 0.78,
      roughness: 0.34,
    });
    for (const x of [-11, 11]) {
      for (const z of [-13, 0, 13]) {
        const column = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, ROOM_HEIGHT_M - 0.4, 0.13),
          trussMaterial,
        );
        column.position.set(x, ROOM_HEIGHT_M / 2, z);
        this.roomGroup.add(column);
      }
    }

    const stageMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b1015,
      metalness: 0.38,
      roughness: 0.46,
    });
    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.65, 0.14, 96),
      stageMaterial,
    );
    stage.position.y = 0.08;
    stage.receiveShadow = true;
    this.roomGroup.add(stage);

    const exclusionRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.25, 0.025, 8, 128),
      new THREE.MeshBasicMaterial({
        color: 0x274353,
        transparent: true,
        opacity: 0.36,
        toneMapped: false,
      }),
    );
    exclusionRing.rotation.x = Math.PI / 2;
    exclusionRing.position.y = 0.035;
    this.roomGroup.add(exclusionRing);
  }

  private buildWarehouse(): void {
    this.warehouseGroup.name = "Optional rustic warehouse laboratory";

    const warehouseHemisphere = new THREE.HemisphereLight(
      0xb9afa2,
      0x18110d,
      0.68,
    );
    this.warehouseFillLights.push(warehouseHemisphere);
    this.warehouseGroup.add(warehouseHemisphere);
    const warehouseKey = new THREE.DirectionalLight(0xffc896, 0.86);
    warehouseKey.position.set(-9, 12, 10);
    warehouseKey.castShadow = true;
    warehouseKey.shadow.mapSize.set(1536, 1536);
    warehouseKey.shadow.camera.left = -14;
    warehouseKey.shadow.camera.right = 14;
    warehouseKey.shadow.camera.top = 14;
    warehouseKey.shadow.camera.bottom = -14;
    warehouseKey.shadow.bias = -0.0004;
    this.warehouseFillLights.push(warehouseKey);
    this.warehouseGroup.add(warehouseKey);

    const concreteCanvas = document.createElement("canvas");
    concreteCanvas.width = 512;
    concreteCanvas.height = 512;
    const context = concreteCanvas.getContext("2d");
    if (context) {
      context.fillStyle = "#55514b";
      context.fillRect(0, 0, 512, 512);
      for (let index = 0; index < 5800; index += 1) {
        const x = (index * 197) % 512;
        const y = (index * 83 + Math.floor(index / 31) * 19) % 512;
        const shade = 55 + ((index * 29) % 58);
        const alpha = 0.025 + ((index * 11) % 17) / 500;
        context.fillStyle = `rgba(${shade + 10}, ${shade + 4}, ${shade}, ${alpha})`;
        const size = 1 + (index % 7 === 0 ? 3 : 0);
        context.fillRect(x, y, size, size);
      }
      context.strokeStyle = "rgba(28, 25, 22, 0.22)";
      context.lineWidth = 3;
      for (const y of [168, 340]) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(512, y);
        context.stroke();
      }
      for (const x of [172, 344]) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 512);
        context.stroke();
      }
      const gradient = context.createRadialGradient(380, 90, 5, 380, 90, 180);
      gradient.addColorStop(0, "rgba(114, 76, 43, .13)");
      gradient.addColorStop(1, "rgba(20, 28, 28, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 512, 512);
      for (let index = 0; index < 34; index += 1) {
        const x = (index * 149 + 27) % 512;
        const y = (index * 73 + 91) % 512;
        const radius = 8 + (index * 11) % 34;
        const stain = context.createRadialGradient(x, y, 0, x, y, radius);
        stain.addColorStop(0, `rgba(35, 29, 24, ${0.025 + (index % 5) * 0.008})`);
        stain.addColorStop(1, "rgba(35, 29, 24, 0)");
        context.fillStyle = stain;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
    const concreteTexture = new THREE.CanvasTexture(concreteCanvas);
    concreteTexture.colorSpace = THREE.SRGBColorSpace;
    concreteTexture.wrapS = THREE.RepeatWrapping;
    concreteTexture.wrapT = THREE.RepeatWrapping;
    concreteTexture.repeat.set(3.2, 1.6);

    const wallConcrete = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      bumpMap: concreteTexture,
      bumpScale: 0.06,
      color: 0x777069,
      roughness: 0.96,
      metalness: 0,
    });
    this.warehouseConcreteMaterials.push(wallConcrete);
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(27.4, 13.4),
      wallConcrete,
    );
    backWall.position.set(0, 6.8, -16.84);
    backWall.receiveShadow = true;
    this.warehouseGroup.add(backWall);

    for (const x of [-13.65, 13.65]) {
      const sideWall = new THREE.Mesh(
        new THREE.PlaneGeometry(33.5, 13.4),
        wallConcrete,
      );
      sideWall.position.set(x, 6.8, 0);
      sideWall.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      sideWall.receiveShadow = true;
      this.warehouseGroup.add(sideWall);
    }

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x25282a,
      roughness: 0.58,
      metalness: 0.09,
    });
    this.warehouseConcreteMaterials.push(concrete);
    const warehouseFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(27.5, 33.5),
      concrete,
    );
    warehouseFloor.rotation.x = -Math.PI / 2;
    warehouseFloor.position.y = 0.024;
    warehouseFloor.receiveShadow = true;
    this.warehouseGroup.add(warehouseFloor);

    const steel = new THREE.MeshStandardMaterial({
      color: 0x1b1d1d,
      roughness: 0.34,
      metalness: 0.82,
    });
    for (const z of [-14, -7, 0, 7, 14]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(27.5, 0.22, 0.28),
        steel,
      );
      beam.position.set(0, 12.5, z);
      beam.castShadow = true;
      this.warehouseGroup.add(beam);
    }
    for (const z of [-15.5, -10.3, -5.1, 0.1, 5.3, 10.5, 15.5]) {
      const roofRafter = new THREE.Mesh(
        new THREE.BoxGeometry(27.2, 0.18, 0.34),
        steel,
      );
      roofRafter.position.set(0, 13.15, z);
      roofRafter.castShadow = true;
      this.warehouseGroup.add(roofRafter);
    }
    for (const x of [-12.4, 12.4]) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 31, 18),
        new THREE.MeshStandardMaterial({
          color: 0x4a3830,
          roughness: 0.48,
          metalness: 0.72,
        }),
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, 10.8, 0);
      this.warehouseGroup.add(pipe);
    }

    const windowGlow = new THREE.MeshStandardMaterial({
      color: 0x8da9aa,
      emissive: 0x9fc8cf,
      emissiveIntensity: 0.85,
      roughness: 0.32,
      transparent: true,
      opacity: 0.72,
    });
    this.warehouseEmissiveMaterials.push(windowGlow);
    for (const x of [-8.5, 0, 8.5]) {
      const windowGroup = new THREE.Group();
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 5.6),
        windowGlow,
      );
      windowGroup.add(pane);
      for (const dividerX of [-2.15, 0, 2.15]) {
        const divider = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 5.8, 0.12),
          steel,
        );
        divider.position.x = dividerX;
        windowGroup.add(divider);
      }
      for (const dividerY of [-2.75, 0, 2.75]) {
        const divider = new THREE.Mesh(
          new THREE.BoxGeometry(4.5, 0.1, 0.12),
          steel,
        );
        divider.position.y = dividerY;
        windowGroup.add(divider);
      }
      windowGroup.position.set(x, 7.2, -16.72);
      this.warehouseGroup.add(windowGroup);
    }

    for (const [index, x] of [-7.5, 0, 7.5].entries()) {
      const light = new THREE.PointLight(0xffbd78, 30, 18, 1.65);
      light.position.set(x, 10.6, index === 1 ? 1.5 : -3.5);
      light.castShadow = false;
      if (index === 1) {
        light.castShadow = true;
        light.shadow.mapSize.set(768, 768);
        light.shadow.bias = -0.0005;
      }
      this.warehouseLights.push(light);
      this.warehouseGroup.add(light);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 0.7, 32, 1, true),
        steel,
      );
      shade.position.copy(light.position);
      shade.position.y += 0.2;
      this.warehouseGroup.add(shade);
    }
  }

  private buildPeople(): void {
    this.peopleGroup.name = "Human scale observers";
    const placements = [
      { x: -5.7, z: 3.2, height: 1.74, pose: "chin" },
      { x: 5.5, z: 2.4, height: 1.84, pose: "rest" },
      { x: -5.2, z: -3.8, height: 1.68, pose: "rest" },
      { x: 5.8, z: -3.5, height: 1.78, pose: "chin" },
      { x: -1.9, z: 6.8, height: 1.88, pose: "rest" },
      { x: 2.2, z: 6.6, height: 1.63, pose: "chin" },
    ] as const;
    const colours = [0x171819, 0x24221f, 0x1d2320, 0x292321, 0x1b2025, 0x25201d];
    placements.forEach((placement, index) => {
      const person = this.makePerson(
        placement.height,
        colours[index] ?? 0x202020,
        placement.pose === "chin",
      );
      person.position.set(placement.x, 0.04, placement.z);
      person.rotation.y = Math.atan2(-placement.x, -placement.z);
      this.peopleGroup.add(person);
    });
  }

  private makePerson(
    height: number,
    colour: number,
    chinStroking: boolean,
  ): THREE.Group {
    const person = new THREE.Group();
    const scale = height / 1.76;
    const clothing = new THREE.MeshStandardMaterial({
      color: colour,
      emissive: colour,
      emissiveIntensity: 0.12,
      roughness: 0.84,
      metalness: 0.02,
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x010101,
      roughness: 0.92,
    });
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24 * scale, 0.62 * scale, 6, 12),
      clothing,
    );
    torso.position.y = 1.16 * scale;
    torso.castShadow = true;
    person.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.145 * scale, 18, 14),
      headMaterial,
    );
    head.position.y = 1.66 * scale;
    head.castShadow = true;
    person.add(head);
    for (const x of [-0.11, 0.11]) {
      const leg = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.075 * scale, 0.56 * scale, 4, 8),
        clothing,
      );
      leg.position.set(x * scale, 0.39 * scale, 0);
      leg.castShadow = true;
      person.add(leg);
    }
    const armGeometry = new THREE.CapsuleGeometry(
      0.055 * scale,
      0.48 * scale,
      4,
      8,
    );
    const leftArm = new THREE.Mesh(armGeometry, clothing);
    leftArm.position.set(-0.31 * scale, 1.16 * scale, 0);
    leftArm.rotation.z = -0.13;
    person.add(leftArm);
    const rightArm = new THREE.Mesh(armGeometry.clone(), clothing);
    rightArm.position.set(
      0.29 * scale,
      (chinStroking ? 1.42 : 1.16) * scale,
      chinStroking ? 0.05 : 0,
    );
    rightArm.rotation.z = chinStroking ? -0.62 : 0.13;
    rightArm.rotation.x = chinStroking ? -0.25 : 0;
    person.add(rightArm);
    person.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return person;
  }

  private buildFan(): void {
    const fan = new THREE.Group();
    fan.name = "Simulated fan sculpture";
    fan.position.y = 0.15;

    const metal = new THREE.MeshStandardMaterial({
      color: 0x151b20,
      metalness: 0.9,
      roughness: 0.26,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x07090c,
      metalness: 0.72,
      roughness: 0.42,
    });
    this.fanCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0x18313b,
      emissive: 0x2c9ec4,
      emissiveIntensity: 0.1,
      metalness: 0.78,
      roughness: 0.28,
    });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.34, 1.52, 0.58, 64),
      darkMetal,
    );
    base.position.y = 0.3;
    base.castShadow = true;
    base.receiveShadow = true;
    fan.add(base);

    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(1.31, 0.09, 14, 96),
      metal,
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.63;
    fan.add(lip);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.31, 0.2, 32),
      this.fanCoreMaterial,
    );
    hub.position.y = 0.69;
    hub.castShadow = true;
    this.fanRotor.add(hub);

    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x26343b,
      metalness: 0.82,
      roughness: 0.3,
    });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.035, 0.33),
        bladeMaterial,
      );
      blade.position.set(Math.cos(angle) * 0.58, 0.69, Math.sin(angle) * 0.58);
      blade.rotation.y = -angle + 0.33;
      blade.castShadow = true;
      this.fanRotor.add(blade);
    }
    fan.add(this.fanRotor);

    for (const radius of [0.43, 0.76, 1.08]) {
      const grille = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.012, 6, 96),
        metal,
      );
      grille.rotation.x = Math.PI / 2;
      grille.position.y = 0.74;
      fan.add(grille);
    }

    this.fanAirMaterial = new THREE.MeshBasicMaterial({
      color: 0x12384e,
      transparent: true,
      opacity: 0.018,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const airColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 2.05, 4.6, 64, 1, true),
      this.fanAirMaterial,
    );
    airColumn.position.y = 2.95;
    airColumn.renderOrder = 1;
    fan.add(airColumn);

    this.fanAssemblyGroup.add(fan);
  }

  private buildProjectors(): void {
    this.projectorBodyGroup.name = "Five projectors";
    this.projectorDebugGroup.name = "Projector frustums and coverage";
    this.projectionRig.projectors.forEach((definition, index) => {
      const source = new THREE.Vector3(
        definition.positionM.x,
        definition.positionM.y,
        definition.positionM.z,
      );
      const targetPosition = new THREE.Vector3(
        definition.targetM.x,
        definition.targetM.y,
        definition.targetM.z,
      );
      const direction = targetPosition.clone().sub(source);
      const distance = direction.length();
      direction.normalize();

      const outputCamera = new THREE.PerspectiveCamera(
        definition.fovDeg,
        definition.raster.widthPx / definition.raster.heightPx,
        0.01,
        100,
      );
      outputCamera.position.copy(source);
      outputCamera.up.set(0, Math.abs(direction.y) > 0.94 ? 0 : 1, Math.abs(direction.y) > 0.94 ? 1 : 0);
      outputCamera.lookAt(targetPosition);
      if (Math.abs(definition.lensShift.x) > 0.0001 || Math.abs(definition.lensShift.y) > 0.0001) {
        outputCamera.setViewOffset(
          PROJECTOR_OUTPUT_WIDTH,
          PROJECTOR_OUTPUT_HEIGHT,
          -definition.lensShift.x * PROJECTOR_OUTPUT_WIDTH * 0.5,
          definition.lensShift.y * PROJECTOR_OUTPUT_HEIGHT * 0.5,
          PROJECTOR_OUTPUT_WIDTH,
          PROJECTOR_OUTPUT_HEIGHT,
        );
      }
      outputCamera.updateProjectionMatrix();
      outputCamera.updateMatrixWorld(true);
      this.projectorOutputCameras.push(outputCamera);

      const body = this.makeProjectorBody(definition.colorHex);
      body.position.copy(source);
      body.lookAt(targetPosition);
      body.rotateZ(THREE.MathUtils.degToRad(definition.rotationDeg));
      body.visible = definition.enabled;
      if (this.testRigSetup) body.scale.setScalar(0.3);
      this.projectorBodyGroup.add(body);
      if (this.testRigSetup && definition.enabled) {
        const label = this.makeTestLabel("P1 PROJECTOR", "#93cfff");
        label.position.copy(source).add(new THREE.Vector3(-0.2, 0.3, 0));
        this.projectorBodyGroup.add(label);
      }

      const target = new THREE.Object3D();
      target.position.copy(targetPosition);
      this.projectorTargetGroup.add(target);

      const light = new THREE.SpotLight(
        definition.colorHex,
        62,
        distance + 4,
        THREE.MathUtils.degToRad(definition.fovDeg / 2),
        0.72,
        1.5,
      );
      light.position.copy(source);
      light.target = target;
      light.castShadow = false;
      light.visible = definition.enabled;
      this.projectorLightGroup.add(light);

      const coneGeometry = this.makeProjectionVolumeGeometry(source, targetPosition, definition.fovDeg, definition.raster.widthPx / definition.raster.heightPx, definition.lensShift);
      const beamMaterial = createProjectionBeamMaterial(
        definition.colorHex,
        index * 1.71,
      );
      const cone = new THREE.Mesh(coneGeometry, beamMaterial);
      cone.name = `Projector ${index + 1} light volume`;
      cone.renderOrder = 1;
      cone.visible = definition.enabled;
      this.projectorLightGroup.add(cone);

      const frustum = this.makeFrustum(source, targetPosition, definition.colorHex, definition.fovDeg, definition.raster.widthPx / definition.raster.heightPx, definition.lensShift);
      frustum.name = `Projector ${index + 1} frustum`;
      frustum.visible = definition.enabled;
      this.projectorDebugGroup.add(frustum);

      this.projectorRigs.push({
        definition,
        light,
        beamMaterial,
      });
    });
  }

  private rebuildProjectors(): void {
    this.projectorRigs.length = 0;
    this.projectorOutputCameras.length = 0;
    this.projectorBodyGroup.clear();
    this.projectorDebugGroup.clear();
    this.projectorLightGroup.clear();
    this.projectorTargetGroup.clear();
    this.buildProjectors();
  }

  private makeProjectionVolumeGeometry(
    source: THREE.Vector3,
    target: THREE.Vector3,
    verticalFovDeg: number,
    aspect = PROJECTOR_RASTER_ASPECT,
    lensShift: { x: number; y: number } = { x: 0, y: 0 },
  ): THREE.BufferGeometry {
    const forward = target.clone().sub(source);
    const targetDistance = forward.length();
    forward.normalize();
    const distance = targetDistance + this.projectionRig.sphereDiameterM * 0.65;
    const farTarget = source.clone().addScaledVector(forward, distance);
    const worldUp = Math.abs(forward.y) > 0.94
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
    const right = forward.clone().cross(worldUp).normalize();
    const up = right.clone().cross(forward).normalize();
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(verticalFovDeg * 0.5)) * distance;
    const halfWidth = halfHeight * aspect;
    // Lens shift moves the picture off the aim line, as the output camera's view offset does.
    farTarget.addScaledVector(right, -lensShift.x * halfWidth).addScaledVector(up, -lensShift.y * halfHeight);
    const corners = [
      farTarget.clone().addScaledVector(right, -halfWidth).addScaledVector(up, halfHeight),
      farTarget.clone().addScaledVector(right, halfWidth).addScaledVector(up, halfHeight),
      farTarget.clone().addScaledVector(right, halfWidth).addScaledVector(up, -halfHeight),
      farTarget.clone().addScaledVector(right, -halfWidth).addScaledVector(up, -halfHeight),
    ];
    const positions: number[] = [];
    const uvs: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const a = corners[index]!;
      const b = corners[(index + 1) % 4]!;
      positions.push(source.x, source.y, source.z, a.x, a.y, a.z, b.x, b.y, b.z);
      uvs.push(0.5, 0, 0, 1, 1, 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  private makeTestLabel(text: string, colour: string): THREE.Sprite {
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(4,12,20,0.9)"; context.fillRect(0, 0, 512, 96);
    context.font = "600 44px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillStyle = colour; context.fillText(text, 256, 48);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, depthWrite: false, transparent: true }));
    sprite.scale.set(0.62, 0.116, 1); sprite.name = text; sprite.renderOrder = 10;
    return sprite;
  }

  private buildTestCamera(): void {
    const setup = this.testRigSetup!;
    const camera = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.10), new THREE.MeshBasicMaterial({ color: 0x49d9c7 }));
    camera.add(body);
    camera.position.set(setup.cameraPositionM.x, setup.cameraPositionM.y, setup.cameraPositionM.z);
    camera.lookAt(setup.ballCenterM.x, setup.ballCenterM.y, setup.ballCenterM.z);
    camera.name = "C1 independent manual camera position";
    this.installationCameraGroup.add(camera);
    const label = this.makeTestLabel("C1 CAMERA", "#49d9c7");
    label.position.copy(camera.position).add(new THREE.Vector3(0.25, 0.16, 0));
    this.installationCameraGroup.add(label);
    const optical = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(setup.cameraFovDeg / 2)) / (4 / 3))), 4 / 3, 0.02, camera.position.distanceTo(new THREE.Vector3(setup.ballCenterM.x, setup.ballCenterM.y, setup.ballCenterM.z)) + setup.ballDiameterM);
    optical.position.copy(camera.position); optical.lookAt(setup.ballCenterM.x, setup.ballCenterM.y, setup.ballCenterM.z); optical.updateMatrixWorld(true);
    const helper = new THREE.CameraHelper(optical); helper.name = "C1 generic field of view, uncalibrated";
    this.installationCameraGroup.add(helper);
  }

  private buildInstallationSupportRig(): void {
    this.installationTrussGroup.clear();
    this.installationCameraGroup.clear();
    this.installationNirGroup.clear();
    if (this.testRigSetup) { this.buildTestCamera(); return; }
    const plans = createInstallationHeadPlans(this.projectionRig, this.installationRigControls);
    const trussMaterial = new THREE.MeshStandardMaterial({ color: 0x727a7c, metalness: 0.92, roughness: 0.28 });
    const cameraMaterial = new THREE.MeshStandardMaterial({ color: 0x14191c, metalness: 0.68, roughness: 0.32 });
    const nirPreset = NIR_ILLUMINATOR_PRESETS.find((item) => item.id === this.installationRigControls.nirIlluminatorId)
      ?? NIR_ILLUMINATOR_PRESETS[1]!;
    const cameraLens = CAMERA_LENS_PRESETS.find((item) => item.id === this.installationRigControls.cameraLensId)
      ?? CAMERA_LENS_PRESETS[2]!;
    plans.filter((plan) => plan.active).forEach((plan) => {
      const projector = this.projectionRig.projectors[plan.projectorIndex]!;
      const tower = new THREE.Group();
      const height = Math.max(3.2, projector.positionM.y + 0.8);
      for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height, 10), trussMaterial);
        leg.position.set(x, height * 0.5, z);
        tower.add(leg);
      }
      for (let y = 0.5; y < height; y += 0.65) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.62), trussMaterial);
        ring.position.y = y;
        tower.add(ring);
      }
      tower.position.set(plan.trussBaseM.x, 0, plan.trussBaseM.z);
      tower.name = `P${plan.projectorIndex + 1} rated truss rehearsal tower`;
      this.installationTrussGroup.add(tower);

      if (plan.cameraActive) {
        const camera = new THREE.Group();
        camera.add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.42), cameraMaterial));
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 24), cameraMaterial);
        lens.rotation.x = Math.PI / 2;
        lens.position.z = 0.25;
        camera.add(lens);
        camera.position.set(plan.cameraPositionM.x, plan.cameraPositionM.y, plan.cameraPositionM.z);
        camera.lookAt(projector.targetM.x, projector.targetM.y, projector.targetM.z);
        camera.name = `C${plan.projectorIndex + 1} offset tracking camera`;
        this.installationCameraGroup.add(camera);

        const cameraSource = camera.position.clone();
        const cameraTarget = new THREE.Vector3(projector.targetM.x, projector.targetM.y, projector.targetM.z);
        const cameraDirection = cameraTarget.clone().sub(cameraSource);
        const cameraDistance = cameraDirection.length();
        cameraDirection.normalize();
        const cameraRadius = Math.tan(THREE.MathUtils.degToRad(cameraLens.horizontalFovDeg * 0.5)) * cameraDistance;
        const cameraConeGeometry = new THREE.ConeGeometry(cameraRadius, cameraDistance, 24, 1, true);
        const cameraGuide = new THREE.LineSegments(
          new THREE.EdgesGeometry(cameraConeGeometry, 18),
          new THREE.LineBasicMaterial({ color: 0x69d9c1, transparent: true, opacity: 0.2 }),
        );
        cameraGuide.position.copy(cameraSource).add(cameraTarget).multiplyScalar(0.5);
        cameraGuide.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), cameraDirection);
        cameraGuide.scale.x = 0.72;
        cameraGuide.name = `${cameraLens.label} camera field of view`;
        this.installationCameraGroup.add(cameraGuide);
      }

      if (plan.nirActive) {
        const nir = new THREE.Group();
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.2), cameraMaterial);
        nir.add(housing);
        const emitter = new THREE.Mesh(
          new THREE.PlaneGeometry(0.38, 0.22),
          new THREE.MeshBasicMaterial({ color: 0x6e244d, transparent: true, opacity: 0.68, toneMapped: false }),
        );
        emitter.position.z = 0.106;
        nir.add(emitter);
        nir.position.set(plan.nirPositionM.x, plan.nirPositionM.y, plan.nirPositionM.z);
        nir.lookAt(projector.targetM.x, projector.targetM.y, projector.targetM.z);
        nir.name = `${nirPreset.label} rehearsal illuminator`;
        this.installationNirGroup.add(nir);

        const nirSource = nir.position.clone();
        const nirTarget = new THREE.Vector3(projector.targetM.x, projector.targetM.y, projector.targetM.z);
        const nirDirection = nirTarget.clone().sub(nirSource);
        const nirDistance = nirDirection.length();
        nirDirection.normalize();
        const nirRadius = Math.tan(THREE.MathUtils.degToRad(nirPreset.beamAngleDeg * 0.5)) * nirDistance;
        const nirCone = new THREE.Mesh(
          new THREE.ConeGeometry(nirRadius, nirDistance, 40, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xa62c73,
            transparent: true,
            opacity: 0.035,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        nirCone.position.copy(nirSource).add(nirTarget).multiplyScalar(0.5);
        nirCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), nirDirection);
        nirCone.name = `${nirPreset.label} illumination volume`;
        this.installationNirGroup.add(nirCone);
      }
    });
  }

  private renderNextProjectorOutput(): void {
    if (this.projectorWindowRenderers.size > 0) return;
    if (this.projectorOutputCanvases.length === 0 || this.projectorOutputCameras.length === 0) return;
    const count = Math.min(
      this.projectorOutputCanvases.length,
      this.projectorOutputCameras.length,
    );
    // Disabled heads are skipped rather than rendered black every cycle. They
    // are blacked once so a stale frame never masquerades as a live tile.
    let index = -1;
    for (let attempt = 0; attempt < count; attempt += 1) {
      const candidate = (this.nextProjectorOutputIndex + attempt) % count;
      if (!this.visibleProjectorPreviewIndices.has(candidate)) continue;
      if (this.projectionRig.projectors[candidate]?.enabled !== false) { index = candidate; break; }
      const disabledCanvas = this.projectorOutputCanvases[candidate];
      if (disabledCanvas && disabledCanvas.dataset.outputBlockReason !== "PROJECTOR_DISABLED") {
        const disabledContext = disabledCanvas.getContext("2d", { alpha: false });
        if (disabledContext) { disabledContext.fillStyle = "#000"; disabledContext.fillRect(0, 0, disabledCanvas.width, disabledCanvas.height); }
        disabledCanvas.dataset.outputBlockReason = "PROJECTOR_DISABLED";
        this.onProjectorOutputFrame?.(candidate);
      }
    }
    if (index < 0) return;
    const canvas = this.projectorOutputCanvases[index];
    const outputCamera = this.projectorOutputCameras[index];
    if (!canvas || !outputCamera) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const blocked = this.outputBlockReason(index);
    canvas.dataset.outputBlockReason = blocked ?? "";
    if (blocked) {
      context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height);
      canvas.dataset.previewState = 'blocked';
      this.nextProjectorOutputIndex = (index + 1) % this.projectorOutputCameras.length;
      this.onProjectorOutputFrame?.(index);
      return;
    }
    const mode = canvas.dataset.outputMode === "pre" ? 1 : 2;
    const restoreSurfaceState = this.applyProjectorOutputState(index, mode);
    const previousClearColour = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = this.renderer.getClearAlpha();

    const previousViewport = this.renderer.getViewport(new THREE.Vector4());
    this.renderer.setRenderTarget(this.projectorOutputTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    const rasterAspect = outputCamera.aspect;
    const outputWidth = Math.min(PROJECTOR_OUTPUT_WIDTH, PROJECTOR_OUTPUT_HEIGHT * rasterAspect);
    const outputHeight = outputWidth / rasterAspect;
    this.renderer.setViewport((PROJECTOR_OUTPUT_WIDTH - outputWidth) / 2, (PROJECTOR_OUTPUT_HEIGHT - outputHeight) / 2, outputWidth, outputHeight);
    this.renderer.render(this.projectorOutputScene, outputCamera);
    this.renderer.readRenderTargetPixels(
      this.projectorOutputTarget,
      0,
      0,
      PROJECTOR_OUTPUT_WIDTH,
      PROJECTOR_OUTPUT_HEIGHT,
      this.projectorOutputPixels,
    );
    this.container.dataset.mappingPreviewReadbacks = String(++this.mappingReadbackCount);
    this.container.dataset.mappingPreviewReadbackAtMs = performance.now().toFixed(1);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(previousViewport);
    this.renderer.setClearColor(previousClearColour, previousClearAlpha);

    const destination = this.projectorOutputImage.data;
    const rowBytes = PROJECTOR_OUTPUT_WIDTH * 4;
    for (let y = 0; y < PROJECTOR_OUTPUT_HEIGHT; y += 1) {
      const sourceOffset = (PROJECTOR_OUTPUT_HEIGHT - 1 - y) * rowBytes;
      destination.set(
        this.projectorOutputPixels.subarray(sourceOffset, sourceOffset + rowBytes),
        y * rowBytes,
      );
    }
    context.putImageData(this.projectorOutputImage, 0, 0);
    canvas.dataset.frameSource = "three-render-target";
    canvas.dataset.previewState = 'diagnostic';
    canvas.dataset.frameProjector = String(index + 1);
    canvas.dataset.frameMode = mode === 1 ? "pre-mapping" : "post-mapping";
    canvas.dataset.frameShader = this.activeShaderId;
    canvas.dataset.frameTimeS = this.shaderElapsedS.toFixed(3);
    canvas.dataset.frameSequence = String(++this.projectorOutputSequence);

    restoreSurfaceState();
    this.onProjectorOutputFrame?.(index);
    this.nextProjectorOutputIndex = (index + 1) % this.projectorOutputCameras.length;
  }

  private applyProjectorOutputState(index: number, mode: 1 | 2): () => void {
    const uniforms = this.surfaceMaterial.uniforms;
    const previousWarp = (uniforms.uOutputWarp.value as THREE.Matrix4).clone();
    (uniforms.uOutputWarp.value as THREE.Matrix4).copy(mode === 2 ? projectorWarpMatrix(this.projectionRig.projectors[index].warpCorners) : new THREE.Matrix4());
    const previousMode = Number(uniforms.uOutputPreviewMode.value);
    const previousProjector = Number(uniforms.uOutputPreviewProjector.value);
    const radii = uniforms.uRadii.value as THREE.Vector3;
    const previousRadii = radii.clone();
    const previousWobble = Number(uniforms.uWobble.value);
    const previousDeformationRate = Number(uniforms.uDeformationRate.value);
    const previousPosition = this.projectorOutputSphere.position.clone();

    uniforms.uOutputPreviewMode.value = mode;
    uniforms.uOutputPreviewProjector.value = index;
    if (mode === 1) {
      this.testRigSetup ? radii.setScalar(this.testRigSetup.ballDiameterM / 2) : radii.copy(DEFAULT_RADII_M);
      uniforms.uWobble.value = 0;
      uniforms.uDeformationRate.value = 0;
      this.testRigSetup ? this.projectorOutputSphere.position.set(this.testRigSetup.ballCenterM.x, this.testRigSetup.ballCenterM.y, this.testRigSetup.ballCenterM.z) : this.projectorOutputSphere.position.copy(DEFAULT_CENTER_M);
    } else {
      if (this.outputWorld?.mode === "live") { uniforms.uWobble.value = 0; uniforms.uDeformationRate.value = 0; }
      this.projectorOutputSphere.position.copy(
        this.outputWorld?.mode === "live" && this.outputWorld.prediction?.model !== "disabled"
          ? this.predictedCenter : this.observedCenter,
      );
    }
    this.projectorOutputSphere.updateMatrixWorld(true);

    return () => {
      (uniforms.uOutputWarp.value as THREE.Matrix4).copy(previousWarp);
      radii.copy(previousRadii);
      uniforms.uWobble.value = previousWobble;
      uniforms.uDeformationRate.value = previousDeformationRate;
      uniforms.uOutputPreviewMode.value = previousMode;
      uniforms.uOutputPreviewProjector.value = previousProjector;
      this.projectorOutputSphere.position.copy(previousPosition);
      this.projectorOutputSphere.updateMatrixWorld(true);
    };
  }

  private advanceShaderClock(nowMs: number): void {
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : this.lastShaderClockAtMs;
    const deltaS = THREE.MathUtils.clamp(
      (safeNowMs - this.lastShaderClockAtMs) / 1_000,
      0,
      0.1,
    );
    this.lastShaderClockAtMs = safeNowMs;
    this.shaderElapsedS = advanceShaderAnimationTime(
      this.shaderElapsedS,
      this.reducedMotion ? 0 : deltaS,
      this.shaderAnimationSpeed,
    );
    this.surfaceMaterial.uniforms.uTime.value = this.shaderElapsedS;
    this.container.dataset.shaderAnimationTime = this.shaderElapsedS.toFixed(3);
    this.container.dataset.shaderAnimationSpeed = this.shaderAnimationSpeed.toFixed(2);
  }

  private makeProjectorBody(
    lensColour: THREE.ColorRepresentation,
  ): THREE.Group {
    const group = new THREE.Group();
    const caseMaterial = new THREE.MeshStandardMaterial({
      color: 0x161b22,
      metalness: 0.7,
      roughness: 0.34,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.48, 1.25),
      caseMaterial,
    );
    body.castShadow = true;
    group.add(body);

    const lensMaterial = new THREE.MeshStandardMaterial({
      color: lensColour,
      emissive: lensColour,
      emissiveIntensity: 1.9,
      metalness: 0.2,
      roughness: 0.08,
    });
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.19, 32),
      lensMaterial,
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.7;
    group.add(lens);

    const yoke = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.08, 0.24),
      caseMaterial,
    );
    yoke.position.y = -0.34;
    group.add(yoke);
    return group;
  }

  private makeFrustum(
    source: THREE.Vector3,
    target: THREE.Vector3,
    colour: THREE.ColorRepresentation,
    verticalFovDeg: number,
    aspect: number,
    lensShift: { x: number; y: number } = { x: 0, y: 0 },
  ): THREE.LineSegments {
    const forward = target.clone().sub(source).normalize();
    const worldUp = Math.abs(forward.y) > 0.94 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0);
    const right = forward.clone().cross(worldUp).normalize();
    const up = right.clone().cross(forward).normalize();
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(verticalFovDeg / 2)) * source.distanceTo(target);
    const halfWidth = halfHeight * aspect;
    // Lens shift moves the picture off the aim line, as the output camera's view offset does.
    target = target.clone().addScaledVector(right, -lensShift.x * halfWidth).addScaledVector(up, -lensShift.y * halfHeight);
    const corners = [
      target
        .clone()
        .addScaledVector(right, -halfWidth)
        .addScaledVector(up, -halfHeight),
      target
        .clone()
        .addScaledVector(right, halfWidth)
        .addScaledVector(up, -halfHeight),
      target
        .clone()
        .addScaledVector(right, halfWidth)
        .addScaledVector(up, halfHeight),
      target
        .clone()
        .addScaledVector(right, -halfWidth)
        .addScaledVector(up, halfHeight),
    ];
    const positions: number[] = [];
    corners.forEach((corner) => {
      positions.push(source.x, source.y, source.z, corner.x, corner.y, corner.z);
    });
    for (let index = 0; index < corners.length; index += 1) {
      const next = (index + 1) % corners.length;
      positions.push(
        corners[index].x,
        corners[index].y,
        corners[index].z,
        corners[next].x,
        corners[next].y,
        corners[next].z,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return new THREE.LineSegments(geometry, material);
  }

  private buildSpeakers(): void {
    this.speakerBodyGroup.name = "Quadraphonic speaker array";
    this.speakerMeterGroup.name = "Live quad level indicators";
    const positions = [
      new THREE.Vector3(-8.8, 1.55, 9.4),
      new THREE.Vector3(8.8, 1.55, 9.4),
      new THREE.Vector3(-8.8, 1.55, -9.4),
      new THREE.Vector3(8.8, 1.55, -9.4),
    ];
    const colours = [0x51c8ff, 0xd78cff, 0x68e4bb, 0xffb36b];

    positions.forEach((position, index) => {
      const cabinet = new THREE.Group();
      cabinet.position.copy(position);
      cabinet.lookAt(new THREE.Vector3(0, 2.2, 0));

      const cabinetMaterial = new THREE.MeshStandardMaterial({
        color: 0x090c10,
        metalness: 0.44,
        roughness: 0.54,
      });
      const enclosure = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 2.35, 0.72),
        cabinetMaterial,
      );
      enclosure.castShadow = true;
      cabinet.add(enclosure);

      const wooferMaterial = new THREE.MeshStandardMaterial({
        color: 0x10171c,
        emissive: colours[index],
        emissiveIntensity: 0.08,
        metalness: 0.28,
        roughness: 0.58,
      });
      for (const y of [-0.53, 0.45]) {
        const woofer = new THREE.Mesh(
          new THREE.CylinderGeometry(
            y < 0 ? 0.31 : 0.23,
            y < 0 ? 0.31 : 0.23,
            0.075,
            32,
          ),
          wooferMaterial,
        );
        woofer.rotation.x = Math.PI / 2;
        woofer.position.set(0, y, 0.395);
        cabinet.add(woofer);
      }
      this.speakerBodyGroup.add(cabinet);

      const meter = new THREE.Group();
      meter.position.copy(position);
      meter.quaternion.copy(cabinet.quaternion);
      meter.position.y += 1.46;
      const meterMaterials: THREE.MeshStandardMaterial[] = [];
      for (let segment = 0; segment < 10; segment += 1) {
        const material = new THREE.MeshStandardMaterial({
          color: 0x111820,
          emissive: colours[index],
          emissiveIntensity: 0.03,
          transparent: true,
          opacity: 0.24,
          roughness: 0.35,
          metalness: 0.3,
        });
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.055, 0.05),
          material,
        );
        bar.position.x = (segment - 4.5) * 0.075;
        meter.add(bar);
        meterMaterials.push(material);
      }
      this.speakerMeterGroup.add(meter);
      this.speakerRigs.push({
        meter,
        meterMaterials,
        wooferMaterial,
      });
    });
  }

  private updateResidualField(timeS: number): void {
    const linePositions = this.residualLineGeometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    linePositions.setXYZ(
      0,
      this.observedCenter.x,
      this.observedCenter.y,
      this.observedCenter.z,
    );
    linePositions.setXYZ(
      1,
      this.predictedCenter.x,
      this.predictedCenter.y,
      this.predictedCenter.z,
    );
    linePositions.needsUpdate = true;
    this.residualLine.computeLineDistances();

    this.workingVector.copy(this.predictedCenter).sub(this.observedCenter);
    const residualLength = this.workingVector.length();
    if (residualLength > 0.0001) {
      this.residualPerpendicular
        .copy(this.workingVector)
        .cross(new THREE.Vector3(0, 1, 0));
      if (this.residualPerpendicular.lengthSq() < 0.00001) {
        this.residualPerpendicular.set(1, 0, 0);
      } else {
        this.residualPerpendicular.normalize();
      }
    } else {
      this.residualPerpendicular.set(1, 0, 0);
    }

    for (let index = 0; index < RESIDUAL_PARTICLE_COUNT; index += 1) {
      const amount = index / (RESIDUAL_PARTICLE_COUNT - 1);
      this.workingVector
        .lerpVectors(this.observedCenter, this.predictedCenter, amount)
        .addScaledVector(
          this.residualPerpendicular,
          Math.sin(amount * Math.PI) *
            Math.sin(timeS * 2.1 + index * 1.73) *
            Math.min(0.11, residualLength * 0.3),
        );
      const positionIndex = index * 3;
      this.residualParticlePositions[positionIndex] = this.workingVector.x;
      this.residualParticlePositions[positionIndex + 1] = this.workingVector.y;
      this.residualParticlePositions[positionIndex + 2] = this.workingVector.z;
    }
    const particlePositions = this.residualParticleGeometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    particlePositions.needsUpdate = true;

    const lineMaterial = this.residualLine.material as THREE.LineDashedMaterial;
    lineMaterial.opacity = THREE.MathUtils.clamp(
      0.18 + residualLength * 1.8,
      0.18,
      0.92,
    );
    const pointMaterial = this.residualParticles
      .material as THREE.PointsMaterial;
    pointMaterial.opacity = THREE.MathUtils.clamp(
      0.1 + residualLength * 2.2,
      0.1,
      0.85,
    );
  }

  private updateProjectors(snapshot: RuntimeSnapshot, timeS: number): void {
    const brightness = clamp01(snapshot.audiovisual.brightness);
    const energy = clamp01(snapshot.audiovisual.energy);
    this.projectorRigs.forEach((rig, index) => {
      const channelLevel = clamp01(snapshot.projectorLevels[index]);
      const enabled = rig.definition.enabled;
      rig.light.intensity =
        enabled ? 18 + brightness * 58 + energy * 22 + channelLevel * 25 : 0;
      rig.light.power = enabled
        ? (18 + brightness * 58 + energy * 22 + channelLevel * 25) * 4
        : 0;
      updateProjectionBeamMaterial(
        rig.beamMaterial,
        timeS,
        enabled && this.projectionPattern !== "black"
          ? (0.004 + brightness * 0.018 + energy * 0.006 + channelLevel * 0.004) *
            (0.12 + this.installationRigControls.hazeDensity * 2.35)
          : 0,
      );
    });
  }

  private updateSpeakers(levels: [number, number, number, number]): void {
    this.speakerRigs.forEach((speaker, channelIndex) => {
      const level = clamp01(levels[channelIndex]);
      speaker.wooferMaterial.emissiveIntensity = 0.06 + level * 2.6;
      speaker.meterMaterials.forEach((material, segmentIndex) => {
        const active = level >= (segmentIndex + 1) / speaker.meterMaterials.length;
        material.emissiveIntensity = active ? 2.4 + level * 3.6 : 0.025;
        material.opacity = active ? 0.88 : 0.2;
      });
      speaker.meter.scale.y = 0.85 + level * 0.45;
    });
  }
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function safeRadius(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 2.5, 1.35, 3.7);
}
