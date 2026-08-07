import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type {
  RuntimeMode,
  RuntimeSnapshot,
  TrackingStatus,
} from "../core/contracts";
import {
  DEFAULT_ENVIRONMENT_PREVIEW_CONTROLS,
  fanSpeedToHoverOffsetM,
  normaliseEnvironmentPreviewControls,
  type EnvironmentPreviewControls,
} from "../core/environmentPreview";
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
  toProjectorShaderInputs,
  validateProjectionRig,
  type ProjectionPattern,
  type ProjectionRigConfig,
} from "../core/projectionRig";
import { sampleMotion } from "../core/motionPreference";
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
    nominalSphereDiameterM: 5;
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

  private readonly surfaceMaterial = createOrbitalSurfaceMaterial();
  private readonly predictionMaterial = createPredictionGhostMaterial();
  private readonly sphereMesh: THREE.Mesh;
  private readonly projectorOutputSphere: THREE.Mesh;
  private readonly projectorOutputCameras: THREE.PerspectiveCamera[] = [];
  private readonly projectorOutputTarget = new THREE.WebGLRenderTarget(640, 400, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  private readonly projectorOutputPixels = new Uint8Array(640 * 400 * 4);
  private readonly projectorOutputImage = new ImageData(640, 400);
  private readonly projectorOutputCanvases: readonly HTMLCanvasElement[];
  private readonly onProjectorOutputFrame?: (index: number) => void;
  private nextProjectorOutputIndex = 0;
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
  private fanAirMaterial!: THREE.MeshBasicMaterial;
  private fanCoreMaterial!: THREE.MeshStandardMaterial;
  private readonly observedCenter = DEFAULT_CENTER_M.clone();
  private readonly predictedCenter = DEFAULT_CENTER_M.clone();
  private readonly currentRadii = DEFAULT_RADII_M.clone();
  private readonly currentResidual = new THREE.Vector3();
  private readonly residualPerpendicular = new THREE.Vector3();
  private readonly workingVector = new THREE.Vector3();

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

  public constructor(container: HTMLElement, options: OrbitalSceneOptions = {}) {
    this.container = container;
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
    this.projectorOutputScene.background = new THREE.Color(0x000000);
    this.projectorOutputSphere = new THREE.Mesh(sphereGeometry, this.surfaceMaterial);
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
      this.speakerBodyGroup,
      this.speakerMeterGroup,
    );
    this.buildProjectors();
    this.buildSpeakers();
    this.setSurfaceRegions(this.surfaceRegions);
    this.setDebugOptions(this.debugOptions);
    this.setEnvironmentControls(this.environmentControls);

    this.resize();
    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.container);
    this.renderer.render(this.scene, this.camera);
  }

  public update(snapshot: RuntimeSnapshot, deltaS: number): void {
    if (this.disposed) {
      return;
    }

    const safeDeltaS = THREE.MathUtils.clamp(deltaS, 0, 0.1);
    const motion = sampleMotion(snapshot.showTimeS, safeDeltaS, this.reducedMotion);
    // Shader audition has its own clock so procedural looks remain animated
    // while the long-form show transport is stopped. Reduced-motion still
    // freezes this clock through sampleMotion's zero delta.
    this.shaderElapsedS = advanceShaderAnimationTime(
      this.shaderElapsedS,
      motion.deltaS,
      this.shaderAnimationSpeed,
    );
    this.container.dataset.shaderAnimationTime = this.shaderElapsedS.toFixed(3);
    this.container.dataset.shaderAnimationSpeed = this.shaderAnimationSpeed.toFixed(2);
    this.lastRuntimeMode = snapshot.world.mode;
    this.lastTrackingStatus = snapshot.world.status;
    this.lastSequence = snapshot.world.sequence;
    const fanSpeed = clamp01(snapshot.fan.actualNormalized);
    const syntheticLiftM =
      snapshot.world.mode === "simulation"
        ? fanSpeedToHoverOffsetM(fanSpeed)
        : 0;

    if (snapshot.world.centerM !== null) {
      this.observedCenter.set(
        snapshot.world.centerM.x,
        snapshot.world.centerM.y + syntheticLiftM,
        snapshot.world.centerM.z,
      );
    }
    this.predictedCenter.copy(this.observedCenter);
    if (snapshot.world.prediction !== null) {
      this.predictedCenter.set(
        snapshot.world.prediction.predictedCenterM.x,
        snapshot.world.prediction.predictedCenterM.y + syntheticLiftM,
        snapshot.world.prediction.predictedCenterM.z,
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
      this.currentRadii.set(
        safeRadius(snapshot.world.shape.radiiM.x),
        safeRadius(snapshot.world.shape.radiiM.y),
        safeRadius(snapshot.world.shape.radiiM.z),
      );
    } else {
      this.currentRadii.copy(DEFAULT_RADII_M);
    }

    const shape = snapshot.world.shape;
    const prediction = snapshot.world.prediction;
    const principalAxisRad = THREE.MathUtils.degToRad(
      shape?.principalAxisDeg ?? 0,
    );
    const confidence = THREE.MathUtils.clamp(snapshot.world.confidence, 0, 1);

    this.sphereMesh.position.copy(this.observedCenter);
    updateOrbitalSurfaceMaterial(this.surfaceMaterial, {
      timeS: this.shaderElapsedS,
      centerM: this.observedCenter,
      radiiM: this.currentRadii,
      principalAxisRad,
      wobble: THREE.MathUtils.clamp(shape?.wobble ?? 0, 0, 1),
      deformationRate: THREE.MathUtils.clamp(
        Math.abs(shape?.deformationRate ?? 0),
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
    // The registry is renderer-neutral, but its bounded controls still shape
    // the active preview until a native shader compiler is attached.
    this.surfaceMaterial.uniforms.uBrightness.value = clamp01(
      snapshot.audiovisual.brightness * 0.82 + this.shaderControl * 0.18,
    );
    this.surfaceMaterial.uniforms.uGlitch.value = clamp01(
      snapshot.audiovisual.glitch * 0.82 + this.shaderControl * 0.18,
    );

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
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.renderNextProjectorOutput();
  }

  public setDebugOptions(options: Partial<OrbitalDebugOptions>): void {
    this.debugOptions = {
      ...this.debugOptions,
      ...options,
    };
    this.projectorDebugGroup.visible =
      this.mappingView === "sphere" && this.debugOptions.projectors;
    this.predictionGroup.visible =
      this.debugOptions.prediction && this.predictionAvailable;
    this.speakerMeterGroup.visible = this.debugOptions.speakers;
    this.roomGroup.visible = this.debugOptions.room;
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  public setEnvironmentControls(
    controls: Partial<EnvironmentPreviewControls>,
  ): void {
    this.environmentControls = normaliseEnvironmentPreviewControls({
      ...this.environmentControls,
      ...controls,
    });
    this.warehouseGroup.visible = this.environmentControls.warehouseEnabled;
    this.peopleGroup.visible =
      this.environmentControls.warehouseEnabled &&
      this.environmentControls.peopleEnabled;
    const light = this.environmentControls.lighting;
    this.warehouseLights.forEach((source, index) => {
      source.intensity = (index === 1 ? 78 : 62) * (0.22 + light * 0.78);
    });
    this.warehouseFillLights.forEach((source, index) => {
      source.intensity = (index === 0 ? 0.36 : 0.48) + light * 0.66;
    });
    this.warehouseEmissiveMaterials.forEach((material) => {
      material.emissiveIntensity = 0.25 + light * 1.35;
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
      this.camera.position.set(0, 3.35, 15.8);
      this.controls.target.set(0, 3.35, 0);
      this.camera.fov = 34;
    } else {
      this.camera.position.set(10.8, 7.1, 14.1);
      this.controls.target.set(0, 3.5, 0);
      this.camera.fov = 42;
    }
    this.camera.updateProjectionMatrix();
    const outputInspection = view !== "sphere";
    this.projectorBodyGroup.visible = !outputInspection;
    this.projectorDebugGroup.visible =
      !outputInspection && this.debugOptions.projectors;
    this.projectorLightGroup.visible = !outputInspection;
    this.projectorTargetGroup.visible = !outputInspection;
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

  public setProjectionRig(config: ProjectionRigConfig): void {
    const validated = validateProjectionRig(config);
    this.projectionRig = validated;
    this.projectionPattern = validated.calibration.pattern;
    this.rebuildProjectors();
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
        nominalSphereDiameterM: 5 as const,
      }),
      limitations: DIGITAL_TWIN_LIMITATIONS,
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
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
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
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());

    this.renderer.renderLists.dispose();
    this.projectorOutputTarget.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.scene.clear();
    this.projectorOutputScene.clear();
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
    warehouseKey.castShadow = false;
    this.warehouseFillLights.push(warehouseKey);
    this.warehouseGroup.add(warehouseKey);

    const brickCanvas = document.createElement("canvas");
    brickCanvas.width = 512;
    brickCanvas.height = 512;
    const context = brickCanvas.getContext("2d");
    if (context) {
      context.fillStyle = "#34231e";
      context.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 16; row += 1) {
        const y = row * 32;
        const offset = row % 2 === 0 ? 0 : -32;
        for (let column = offset; column < 512; column += 64) {
          const warmth = (row * 17 + column * 7 + 512) % 19;
          context.fillStyle = `rgb(${69 + warmth}, ${43 + Math.floor(warmth * 0.55)}, ${35 + Math.floor(warmth * 0.35)})`;
          context.fillRect(column + 2, y + 2, 60, 28);
        }
      }
      context.strokeStyle = "rgba(185, 151, 121, 0.26)";
      context.lineWidth = 2;
      for (let y = 0; y <= 512; y += 32) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(512, y);
        context.stroke();
      }
    }
    const brickTexture = new THREE.CanvasTexture(brickCanvas);
    brickTexture.colorSpace = THREE.SRGBColorSpace;
    brickTexture.wrapS = THREE.RepeatWrapping;
    brickTexture.wrapT = THREE.RepeatWrapping;
    brickTexture.repeat.set(4.4, 2.2);

    const brickMaterial = new THREE.MeshStandardMaterial({
      map: brickTexture,
      color: 0x8a6657,
      roughness: 0.96,
      metalness: 0,
    });
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(27.4, 13.4),
      brickMaterial,
    );
    backWall.position.set(0, 6.8, -16.84);
    backWall.receiveShadow = true;
    this.warehouseGroup.add(backWall);

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x25282a,
      roughness: 0.58,
      metalness: 0.09,
    });
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

    this.scene.add(fan);
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
        640 / 400,
        0.08,
        100,
      );
      outputCamera.position.copy(source);
      outputCamera.lookAt(targetPosition);
      outputCamera.updateProjectionMatrix();
      outputCamera.updateMatrixWorld(true);
      this.projectorOutputCameras.push(outputCamera);

      const body = this.makeProjectorBody(definition.colorHex);
      body.position.copy(source);
      body.lookAt(targetPosition);
      this.projectorBodyGroup.add(body);

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
      this.projectorLightGroup.add(light);

      const coneGeometry = new THREE.ConeGeometry(
        3.3,
        distance,
        48,
        1,
        true,
      );
      const beamMaterial = createProjectionBeamMaterial(
        definition.colorHex,
        index * 1.71,
      );
      const cone = new THREE.Mesh(coneGeometry, beamMaterial);
      cone.name = `Projector ${index + 1} light volume`;
      cone.position.copy(source).add(targetPosition).multiplyScalar(0.5);
      cone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        direction,
      );
      cone.renderOrder = 1;
      this.projectorDebugGroup.add(cone);

      const frustum = this.makeFrustum(source, targetPosition, definition.colorHex);
      frustum.name = `Projector ${index + 1} frustum`;
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

  private renderNextProjectorOutput(): void {
    if (this.projectorOutputCanvases.length === 0) return;
    const index = this.nextProjectorOutputIndex % Math.min(
      this.projectorOutputCanvases.length,
      this.projectorOutputCameras.length,
    );
    const canvas = this.projectorOutputCanvases[index];
    const outputCamera = this.projectorOutputCameras[index];
    if (!canvas || !outputCamera) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const mode = canvas.dataset.outputMode === "pre" ? 1 : 2;
    const uniforms = this.surfaceMaterial.uniforms;
    const previousMode = Number(uniforms.uOutputPreviewMode.value);
    const previousProjector = Number(uniforms.uOutputPreviewProjector.value);
    const radii = uniforms.uRadii.value as THREE.Vector3;
    const previousRadii = radii.clone();
    const previousWobble = Number(uniforms.uWobble.value);
    const previousDeformationRate = Number(uniforms.uDeformationRate.value);
    const previousClearColour = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = this.renderer.getClearAlpha();

    uniforms.uOutputPreviewMode.value = mode;
    uniforms.uOutputPreviewProjector.value = index;
    if (mode === 1) {
      radii.copy(DEFAULT_RADII_M);
      uniforms.uWobble.value = 0;
      uniforms.uDeformationRate.value = 0;
      this.projectorOutputSphere.position.copy(DEFAULT_CENTER_M);
    } else {
      this.projectorOutputSphere.position.copy(this.observedCenter);
    }
    this.projectorOutputSphere.updateMatrixWorld(true);
    this.renderer.setRenderTarget(this.projectorOutputTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.projectorOutputScene, outputCamera);
    this.renderer.readRenderTargetPixels(
      this.projectorOutputTarget,
      0,
      0,
      640,
      400,
      this.projectorOutputPixels,
    );
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(previousClearColour, previousClearAlpha);

    const destination = this.projectorOutputImage.data;
    const rowBytes = 640 * 4;
    for (let y = 0; y < 400; y += 1) {
      const sourceOffset = (399 - y) * rowBytes;
      destination.set(
        this.projectorOutputPixels.subarray(sourceOffset, sourceOffset + rowBytes),
        y * rowBytes,
      );
    }
    context.putImageData(this.projectorOutputImage, 0, 0);
    canvas.dataset.frameSource = "three-render-target";
    canvas.dataset.frameProjector = String(index + 1);
    canvas.dataset.frameMode = mode === 1 ? "pre-mapping" : "post-mapping";

    radii.copy(previousRadii);
    uniforms.uWobble.value = previousWobble;
    uniforms.uDeformationRate.value = previousDeformationRate;
    uniforms.uOutputPreviewMode.value = previousMode;
    uniforms.uOutputPreviewProjector.value = previousProjector;
    this.onProjectorOutputFrame?.(index);
    this.nextProjectorOutputIndex = (index + 1) % this.projectorOutputCameras.length;
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
  ): THREE.LineSegments {
    const forward = target.clone().sub(source).normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = right.clone().cross(forward).normalize();
    const halfWidth = 3.2;
    const halfHeight = 3.0;
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
          ? 0.006 + brightness * 0.018 + energy * 0.006 + channelLevel * 0.004
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
