/**
 * Levitation Lab scene: renderer, post-processing, camera and every visual
 * subsystem. The app hands it a design, the simulation state and the pose the
 * projector believes in; it draws the frame and the tracking picture-in-picture.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  updateOrbitalSurfaceMaterial,
  type OrbitalSurfaceState,
} from "../../scene/shaders/orbitalSurface";
import type {
  DesignConfig,
  FanDerived,
  MaterialDefinition,
  ProjectionPose,
  ShapeDefinition,
  ShapeMesh,
  SimState,
} from "../model/types";
import type { LabLook } from "../looks";
import { applyLabLook } from "./projectionSurface";
import { GalleryEnvironment, createGalleryEnvironment } from "./environment";
import { FanModel, fanHousingHeight } from "./fan";
import { BodyView, type LabView } from "./body";
import { AirParticles, type BodyObstacle, type JetFieldSampler } from "./airParticles";
import { JetEnvelope, type JetProfile } from "./jetEnvelope";
import { ProjectorRig } from "./projectors";
import { ForceOverlay } from "./forces";
import { TrackingView } from "./tracking";
import { renderThumbnails, type LookThumbnailJob, type ShapeThumbnailJob } from "./thumbnails";

export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SceneDesign {
  design: DesignConfig;
  shape: ShapeDefinition;
  material: MaterialDefinition;
  mesh: ShapeMesh;
  fan: FanDerived;
  jet: JetFieldSampler & JetProfile;
  /** Where the body is expected to hover (m above the outlet), if it does. */
  hoverHeightM: number | null;
  /** True when the analysis says the jet pins it to the ceiling. */
  pinnedToCeiling: boolean;
  swayM: number;
  cpOffsetM: number;
  cmOffsetM: number;
  shapeChanged: boolean;
}

export interface FrameInput {
  /** Wall-clock frame time (camera easing, projector easing). */
  dtS: number;
  /** Simulation time step this frame: zero while paused. */
  simDtS: number;
  timeS: number;
  simTimeS: number;
  state: SimState;
  content: ProjectionPose;
  latencyMs: number;
  view: LabView;
  showAir: boolean;
  showForces: boolean;
  showTracking: boolean;
  reducedMotion: boolean;
}

export interface QualityTier {
  particles: number;
  bloom: boolean;
  pixelRatio: number;
}

export const QUALITY_TIERS: readonly QualityTier[] = [
  { particles: 16384, bloom: true, pixelRatio: 1.5 },
  { particles: 12288, bloom: true, pixelRatio: 1.25 },
  { particles: 8192, bloom: true, pixelRatio: 1 },
  { particles: 8192, bloom: false, pixelRatio: 1 },
];

const DEFAULT_AZIMUTH = THREE.MathUtils.degToRad(24);
const DEFAULT_ELEVATION = THREE.MathUtils.degToRad(9);

export class LabScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.02, 600);
  readonly controls: OrbitControls;
  readonly environment = new GalleryEnvironment();
  readonly fan = new FanModel();
  readonly body = new BodyView();
  readonly air = new AirParticles();
  readonly jet = new JetEnvelope();
  readonly projectors = new ProjectorRig();
  readonly tracking = new TrackingView();
  readonly forces: ForceOverlay;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly envMap: THREE.Texture;
  private readonly keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
  private readonly fillLight = new THREE.DirectionalLight(0x9ecfff, 0.45);
  private readonly rimLight = new THREE.DirectionalLight(0x5ee7ff, 0.9);
  private readonly hemiLight = new THREE.HemisphereLight(0x3a4a5c, 0x05070a, 0.35);
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private tier = 0;
  private stage: StageRect = { left: 0, top: 0, width: 1, height: 1 };
  private design: SceneDesign | null = null;
  private floorY = -0.3;
  private readonly aim = new THREE.Vector3(0, 1.5, 0);
  private coverRadius = 0.6;
  /** The projectors cover the whole rise, from resting on the fan to the hover point. */
  private readonly rigAim = new THREE.Vector3(0, 1.5, 0);
  private rigCover = 0.8;
  private framingFrom = { target: new THREE.Vector3(0, 1.5, 0), distance: 8 };
  private framingTo = { target: new THREE.Vector3(0, 1.5, 0), distance: 8 };
  private framingT = 1;
  private userInteracting = false;
  private view: LabView = "projection";
  private readonly surfaceState: OrbitalSurfaceState;
  private readonly obstacle: BodyObstacle;
  private readonly truePosition = new THREE.Vector3();
  private readonly trueQuaternion = new THREE.Quaternion();
  private readonly contentPosition = new THREE.Vector3();
  private readonly contentQuaternion = new THREE.Quaternion();
  private readonly flowScratch = { x: 0, y: 0, z: 0 };
  private readonly flowDirection = new THREE.Vector3(0, 1, 0);
  private readonly scratch = new THREE.Vector3();
  private readonly scratchB = new THREE.Vector3();
  private pipRect = { x: 0, y: 0, width: 0, height: 0 };
  private bodyGlowColour = new THREE.Color(0x2c3a46);
  private projectorCount = 3;

  constructor(container: HTMLElement, labelLayer: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x020304, 1);
    const canvas = this.renderer.domElement;
    canvas.className = "lab-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "3D view of a lightweight shape hovering in a fan's air jet. Drag to orbit, scroll to zoom, double-click to reframe.",
    );
    canvas.tabIndex = 0;
    container.prepend(canvas);

    this.envMap = createGalleryEnvironment(this.renderer);
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.9;
    this.scene.background = new THREE.Color(0x020304);

    this.forces = new ForceOverlay(labelLayer);

    this.scene.add(
      this.environment.group,
      this.fan.group,
      this.body.group,
      this.body.ghost,
      this.projectors.group,
      this.air.mesh,
      this.jet.mesh,
      this.forces.group,
      this.tracking.marker,
      this.keyLight,
      this.keyLight.target,
      this.fillLight,
      this.fillLight.target,
      this.rimLight,
      this.rimLight.target,
      this.hemiLight,
    );

    this.camera.position.set(4, 2, 6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.addEventListener("start", () => {
      this.userInteracting = true;
      this.framingT = 1;
    });
    this.controls.addEventListener("end", () => {
      this.userInteracting = false;
    });
    canvas.addEventListener("dblclick", () => this.reframe(true));

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.55, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.surfaceState = {
      timeS: 0,
      centerM: new THREE.Vector3(),
      radiiM: new THREE.Vector3(1, 1, 1),
      principalAxisRad: 0,
      wobble: 0,
      deformationRate: 0,
      energy: 0.58,
      brightness: 0.72,
      visualDensity: 0.45,
      fluidity: 0.55,
      fracture: 0.06,
      glitch: 0.02,
      organic: 0.58,
      melody: 0.3,
      residualGain: 0.6,
      residualM: new THREE.Vector3(),
      trackingConfidence: 1,
      stateValid: true,
      projectors: [],
      projectionPattern: "authored",
      regionCenters: new Float32Array(4),
      regionWidths: new Float32Array(4).fill(0.25),
      regionStyles: new Float32Array(4),
      regionIntensities: new Float32Array(4),
    };
    this.obstacle = {
      centre: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      radii: new THREE.Vector3(0.5, 0.5, 0.5),
      ring: null,
      potentialFlow: false,
      enabled: true,
    };
    this.setView("projection");
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get qualityTier(): number {
    return this.tier;
  }

  get currentPixelRatio(): number {
    return this.pixelRatio;
  }

  // ---------------------------------------------------------------- layout

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.applyPixelRatio();
    this.camera.aspect = this.width / this.height;
    this.applyViewOffset();
    this.air.setViewport(this.width, this.height, this.pixelRatio);
  }

  setStage(stage: StageRect): void {
    this.stage = stage;
    this.applyViewOffset();
  }

  setPipRect(rect: { x: number; y: number; width: number; height: number }): void {
    this.pipRect = rect;
  }

  setQualityTier(tier: number): void {
    const next = THREE.MathUtils.clamp(tier, 0, QUALITY_TIERS.length - 1);
    if (next === this.tier) return;
    this.tier = next;
    this.applyPixelRatio();
    this.air.setCount(QUALITY_TIERS[next].particles);
    this.air.setViewport(this.width, this.height, this.pixelRatio);
    this.bloom.enabled = QUALITY_TIERS[next].bloom;
  }

  private applyPixelRatio(): void {
    const device = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.pixelRatio = Math.min(device, QUALITY_TIERS[this.tier].pixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
  }

  private applyViewOffset(): void {
    const centreX = this.stage.left + this.stage.width / 2;
    const centreY = this.stage.top + this.stage.height / 2;
    this.camera.setViewOffset(
      this.width,
      this.height,
      this.width / 2 - centreX,
      this.height / 2 - centreY,
      this.width,
      this.height,
    );
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- design

  applyDesign(input: SceneDesign): void {
    const previous = this.design;
    this.design = input;
    const { design, mesh, material, shape } = input;
    const fanRadius = design.fan.diameterM / 2;
    this.fan.configure(design.fan.diameterM, design.fan.type);
    this.floorY = -fanHousingHeight(design.fan.diameterM);

    if (input.shapeChanged || !previous) {
      this.body.setShape(mesh, design.sizeM);
      this.projectors.setGeometry(this.body.geometry);
      this.tracking.setGeometry(this.body.geometry);
    }
    this.body.setMaterial(material);

    // Obstacle for the air: bounding ellipsoid, or a ring for halo and ribbon.
    const s = design.sizeM;
    if (shape.geometry.kind === "torus") {
      this.obstacle.ring = { majorRadius: shape.geometry.majorRadius * s, tubeRadius: shape.geometry.tubeRadius * s };
    } else if (shape.geometry.kind === "ribbon") {
      this.obstacle.ring = { majorRadius: shape.geometry.radius * s, tubeRadius: shape.geometry.width * s * 0.5 };
    } else {
      this.obstacle.ring = null;
    }

    // Stage: where the body should hover, and how much room it needs.
    const bodyRadius = this.body.boundingRadius;
    const hover = input.hoverHeightM;
    const restAim = Math.max(bodyRadius + 0.05, this.body.halfExtents.y + 0.02);
    const ceilingAim = Math.max(restAim, design.ceilingM - this.body.halfExtents.y - 0.05);
    const aimY = hover !== null ? hover : input.pinnedToCeiling ? ceilingAim : restAim;
    this.aim.set(0, aimY, 0);
    this.coverRadius = bodyRadius * 1.15 + Math.min(input.swayM * 2.2, bodyRadius * 1.2);
    const restY = this.body.halfExtents.y;
    const rise = hover !== null ? Math.max(0, hover - restY) : 0;
    this.rigAim.set(0, aimY - rise * 0.38, 0);
    this.rigCover = this.coverRadius + rise * 0.42;

    const top = Math.max(aimY + bodyRadius * 1.9, 1);
    this.environment.placePerson(this.floorY, Math.max(fanRadius * 1.6, bodyRadius * 1.3), top - this.floorY);

    const visibleTop = Math.min(design.ceilingM, Math.max(aimY + bodyRadius * 2.3, fanRadius * 6, 1.2));
    this.air.configure(fanRadius, design.fan.outletSpeedMps, visibleTop, design.fan.turbulence);
    const jetKey = `${design.fan.diameterM.toFixed(3)}|${design.fan.outletSpeedMps.toFixed(2)}|${design.fan.type}|${visibleTop.toFixed(2)}`;
    this.jet.rebuild(input.jet, fanRadius, visibleTop, jetKey);

    this.projectors.layout({
      count: this.projectorCount,
      aim: this.rigAim,
      coverRadiusM: this.rigCover,
      floorY: this.floorY,
      minDistanceM: Math.max(1.4, fanRadius * 2 + bodyRadius * 1.6),
      azimuthRad: DEFAULT_AZIMUTH,
    }, !previous);
    this.tracking.place(this.aim, this.coverRadius, fanRadius, this.floorY);

    this.updateLights();
    this.reframe(!previous);
  }

  setProjectorCount(count: number): void {
    this.projectorCount = count;
    if (!this.design) return;
    const fanRadius = this.design.design.fan.diameterM / 2;
    this.projectors.layout({
      count,
      aim: this.rigAim,
      coverRadiusM: this.rigCover,
      floorY: this.floorY,
      minDistanceM: Math.max(1.4, fanRadius * 2 + this.body.boundingRadius * 1.6),
      azimuthRad: DEFAULT_AZIMUTH,
    });
  }

  setLook(look: LabLook): void {
    applyLabLook(this.body.surfaceMaterial, look);
  }

  setView(view: LabView): void {
    this.view = view;
    this.body.setView(view);
    this.updateLights();
  }

  /** Put the camera somewhere specific (used by tests and deep links). */
  setCamera(position: [number, number, number], target: [number, number, number]): void {
    this.framingT = 1;
    this.controls.target.set(target[0], target[1], target[2]);
    this.camera.position.set(position[0], position[1], position[2]);
    this.controls.update();
  }

  /** Frame the fan and the hover point inside the clear stage area. */
  reframe(immediate: boolean): void {
    if (!this.design) return;
    const bodyRadius = this.body.boundingRadius;
    const fanRadius = this.design.design.fan.diameterM / 2;
    const bottom = this.floorY + (this.floorY < -0.4 ? 0.2 : 0);
    const top = Math.max(this.aim.y + bodyRadius * 1.25, bottom + 0.6);
    const radius = Math.max(bodyRadius * 1.25, fanRadius * 1.5);
    const height = top - bottom;
    const target = new THREE.Vector3(0, bottom + height * 0.5, 0);
    const fov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const stageFractionH = Math.max(0.3, this.stage.height / this.height);
    const stageFractionW = Math.max(0.3, this.stage.width / this.width);
    const tanV = Math.tan(fov) * stageFractionH;
    const tanH = Math.tan(fov) * (this.width / this.height) * stageFractionW;
    const distance = Math.max((height * 0.5) / (tanV * 0.9), radius / (tanH * 0.82)) + radius * 0.35;
    this.framingFrom.target.copy(this.controls.target);
    this.framingFrom.distance = this.camera.position.distanceTo(this.controls.target);
    this.framingTo.target.copy(target);
    this.framingTo.distance = distance;
    this.controls.minDistance = Math.max(0.25, bodyRadius * 1.4);
    this.controls.maxDistance = Math.max(distance * 4, 6);
    if (immediate) {
      this.framingT = 1;
      this.controls.target.copy(target);
      this.camera.position.set(
        target.x + Math.sin(DEFAULT_AZIMUTH) * Math.cos(DEFAULT_ELEVATION) * distance,
        target.y + Math.sin(DEFAULT_ELEVATION) * distance,
        target.z + Math.cos(DEFAULT_AZIMUTH) * Math.cos(DEFAULT_ELEVATION) * distance,
      );
      this.controls.update();
    } else if (!this.userInteracting) {
      this.framingT = 0;
    }
  }

  private advanceFraming(dtS: number, reducedMotion: boolean): void {
    if (this.framingT >= 1) return;
    this.framingT = reducedMotion ? 1 : Math.min(1, this.framingT + dtS / 0.7);
    const t = 1 - Math.pow(1 - this.framingT, 3);
    const direction = this.scratch.copy(this.camera.position).sub(this.controls.target).normalize();
    this.controls.target.lerpVectors(this.framingFrom.target, this.framingTo.target, t);
    const distance = THREE.MathUtils.lerp(this.framingFrom.distance, this.framingTo.distance, t);
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
  }

  private updateLights(): void {
    const target = this.aim;
    const reach = Math.max(4, this.coverRadius * 6);
    this.keyLight.position.set(target.x - reach * 0.5, target.y + reach * 0.8, target.z + reach * 0.6);
    this.fillLight.position.set(target.x + reach * 0.8, target.y + reach * 0.1, target.z + reach * 0.3);
    this.rimLight.position.set(target.x + reach * 0.2, target.y + reach * 0.5, target.z - reach);
    this.keyLight.target.position.copy(target);
    this.fillLight.target.position.copy(target);
    this.rimLight.target.position.copy(target);
    const material = this.view === "material";
    this.keyLight.intensity = material ? 2.4 : this.view === "pressure" ? 1.1 : 0.55;
    this.fillLight.intensity = material ? 0.5 : 0.3;
    this.rimLight.intensity = material ? 1.1 : 0.7;
    this.hemiLight.intensity = material ? 0.35 : 0.25;
    this.scene.environmentIntensity = material ? 1 : 0.55;
    this.scratchB.copy(this.keyLight.position).sub(target).normalize();
    this.body.setPressureLight(this.scratchB);
  }

  // ---------------------------------------------------------------- thumbnails

  renderThumbnails(shapes: ShapeThumbnailJob[], looks: LookThumbnailJob[]): void {
    renderThumbnails(shapes, looks);
  }

  // ---------------------------------------------------------------- frame

  /** Measure the silhouette the tracking camera would see: true and projected. */
  get trackingCamera() {
    return this.tracking.virtualCamera;
  }

  frame(input: FrameInput): void {
    const design = this.design;
    if (!design) return;
    const { state, content } = input;
    const dt = input.dtS;
    const simDt = input.simDtS;
    const motionTime = input.reducedMotion ? 0 : input.timeS;

    this.advanceFraming(dt, input.reducedMotion);
    this.controls.update();

    // Poses.
    this.truePosition.set(state.position.x, state.position.y, state.position.z);
    this.trueQuaternion.set(state.orientation.x, state.orientation.y, state.orientation.z, state.orientation.w);
    this.contentPosition.set(content.position.x, content.position.y, content.position.z);
    this.contentQuaternion.set(content.orientation.x, content.orientation.y, content.orientation.z, content.orientation.w);
    this.body.setPose(this.truePosition, this.trueQuaternion, state.squash);
    const projection = input.view === "projection";
    const errorM = content.errorM;
    const bodyRadius = this.body.boundingRadius;
    const ghostStrength = projection
      ? THREE.MathUtils.smoothstep(errorM, bodyRadius * 0.01, bodyRadius * 0.12) * 0.55
      : 0;
    this.body.setContentPose(this.contentPosition, this.contentQuaternion, state.squash, ghostStrength);
    this.body.animate(motionTime, state.wobble, state.effectiveSpeedMps / Math.max(design.design.fan.outletSpeedMps, 0.1), input.reducedMotion);

    // Air relative to the body, for the pressure map and ribbons.
    design.jet.sample(state.position, input.simTimeS, this.flowScratch);
    this.flowDirection.set(
      this.flowScratch.x - state.velocity.x,
      this.flowScratch.y - state.velocity.y,
      this.flowScratch.z - state.velocity.z,
    );
    const relativeSpeed = this.flowDirection.length();
    if (relativeSpeed > 1e-4) this.flowDirection.divideScalar(relativeSpeed);
    else this.flowDirection.set(0, 1, 0);
    const outletSpeed = Math.max(design.design.fan.outletSpeedMps, 0.1);
    this.body.setFlow({
      direction: this.flowDirection,
      strength: THREE.MathUtils.clamp(Math.pow(relativeSpeed / (outletSpeed * 0.6), 2), 0.08, 1.2),
      jetHalfWidth: Math.max(design.jet.halfWidth(Math.max(0, state.position.y)), 0.02),
    });

    // Fan and floor.
    this.fan.update(simDt, design.design.fan.outletSpeedMps, design.fan.approxRpm, input.reducedMotion);
    this.bodyGlowColour.set(projection ? 0x22303a : input.view === "pressure" ? 0x1a3440 : 0x262e36);
    this.environment.setFloor({
      floorY: this.floorY,
      fanRadius: design.design.fan.diameterM / 2,
      glow: THREE.MathUtils.clamp(0.08 + design.design.fan.outletSpeedMps / 40, 0.08, 0.6) * (input.showAir ? 1 : 0.6),
      scale: Math.max(this.aim.y - this.floorY, 1),
      bodyPosition: this.truePosition,
      bodyRadius,
      bodyGlow: projection ? 0.34 : 0.24,
      bodyColour: this.bodyGlowColour,
    });

    // Air.
    this.air.mesh.visible = input.showAir;
    this.jet.mesh.visible = input.showAir;
    if (input.showAir) {
      this.obstacle.centre.copy(this.truePosition);
      this.obstacle.quaternion.copy(this.trueQuaternion);
      this.obstacle.radii.copy(this.body.halfExtents).multiply(this.body.mesh.scale).multiplyScalar(1.04);
      this.obstacle.enabled = state.status !== "escaped";
      const jetWidth = design.jet.halfWidth(Math.max(0, state.position.y));
      this.obstacle.potentialFlow = Math.max(this.obstacle.radii.x, this.obstacle.radii.z) < jetWidth * 1.1;
      if (simDt > 0) this.air.update(simDt, input.simTimeS, design.jet, this.obstacle);
      this.air.setIntensity(input.view === "pressure" ? 0.3 : input.view === "material" ? 0.4 : 0.42);
      this.jet.update(motionTime, design.design.fan.outletSpeedMps, design.design.fan.diameterM / 2, 0.1);
    }

    // Projection rig and the Studio surface uniforms.
    this.projectors.update(dt, motionTime, projection ? 0.011 : 0);
    if (projection) {
      const surface = this.body.surfaceMaterial;
      const s = this.surfaceState;
      s.timeS = motionTime * 1.2;
      s.centerM.copy(this.contentPosition);
      s.wobble = state.wobble;
      s.residualM.subVectors(this.truePosition, this.contentPosition);
      s.projectors = this.projectors.shaderInputs;
      updateOrbitalSurfaceMaterial(surface, s);
      // The Lab reads the look's own animation clock at a calm rate.
      surface.uniforms.uLabAtlasEnabled.value = 1;
      surface.uniforms.uLabLatencyMask.value = input.latencyMs > 0.5 ? 1 : 0;
      surface.uniforms.uLabRigLighting.value = 1;
      this.projectors.trueProxy.matrixWorld.copy(this.body.mesh.matrixWorld);
      this.projectors.laggedProxy.matrixWorld.copy(this.body.ghost.matrixWorld);
      this.projectors.applyAtlasUniforms(surface);
      this.projectors.renderAtlas(this.renderer, this.truePosition, bodyRadius);
    }

    // Forces.
    this.forces.setVisible(input.showForces);
    if (input.showForces) {
      this.forces.update(state.forces, this.truePosition, this.trueQuaternion, design.cpOffsetM, design.cmOffsetM, design.design.sizeM);
    }

    // Tracking marker.
    this.tracking.setMarkerVisible(input.showTracking);

    // Render.
    this.composer.render(dt);
    if (input.showForces) {
      this.forces.updateLabels(this.camera, this.width, this.height, performance.now(), this.stage);
    }
    if (input.showTracking) {
      this.tracking.syncBody(this.body.mesh);
      this.tracking.render(this.renderer, this.pipRect, this.width, this.height);
    }
  }

  /**
   * Copy the canvas right after a frame was drawn (same task, so the drawing
   * buffer is still valid) and composite 2D overlays on top.
   */
  capture(overlays: Array<{ canvas: HTMLCanvasElement; rect: { x: number; y: number; width: number; height: number } }>): HTMLCanvasElement {
    const source = this.renderer.domElement;
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const ctx = output.getContext("2d");
    if (!ctx) return output;
    ctx.drawImage(source, 0, 0);
    const scale = source.width / this.width;
    for (const overlay of overlays) {
      if (overlay.rect.width < 1 || overlay.rect.height < 1) continue;
      ctx.drawImage(
        overlay.canvas,
        overlay.rect.x * scale,
        overlay.rect.y * scale,
        overlay.rect.width * scale,
        overlay.rect.height * scale,
      );
    }
    return output;
  }

  dispose(): void {
    this.controls.dispose();
    this.composer.dispose();
    this.fan.dispose();
    this.body.dispose();
    this.air.dispose();
    this.jet.dispose();
    this.projectors.dispose();
    this.forces.dispose();
    this.tracking.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
  }
}
