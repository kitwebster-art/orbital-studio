/**
 * Orbital Levitation Lab: wires the store, the physics model, the scene and
 * the interface together, and runs the frame loop.
 */
import {
  LevitationSimulation,
  PRESETS,
  analyseDesign,
  buildShapeMesh,
  fanDerived,
  getMaterial,
  getShape,
  observeSilhouette,
  projectionPose,
  transformPoints,
  type DesignAnalysis,
  type DesignConfig,
  type LevitationEnvelope,
  type ProjectionPose,
  type ShapeMesh,
  type TrackedEllipse,
} from "../model";
import { findLook, LAB_LOOKS } from "../looks";
import { LabScene, QUALITY_TIERS } from "../scene/LabScene";
import { TrackingOverlay } from "../scene/tracking";
import { LabUI } from "../ui/LabUI";
import { installTooltips } from "../ui/tooltip";
import { AnalysisClient } from "./analysisClient";
import { QualityGovernor } from "./governor";
import { createJetSampler, type JetSampler } from "./jetSampler";
import {
  Store,
  guideSeen,
  loadInitialState,
  markGuideSeen,
  sanitiseUi,
  type DesignPatch,
  type LabState,
  type UiState,
  type ViewMode,
} from "./store";

export interface LabStats {
  fps: number;
  frameMs: number;
  tier: number;
  particles: number;
  pixelRatio: number;
  bloom: boolean;
  frames: number;
  status: string;
  heightM: number;
  errorMm: number;
}

declare global {
  interface Window {
    __levitationLab?: {
      stats: LabStats;
      state: () => LabState;
      analysis: () => DesignAnalysis | null;
      envelopeReady: () => boolean;
      setUi: (patch: Partial<UiState>) => void;
      applyPreset: (id: string) => void;
      reset: (atEquilibrium?: boolean) => void;
      setDesign: (patch: DesignPatch) => void;
      setCamera: (position: [number, number, number], target: [number, number, number]) => void;
    };
  }
}

interface UrlOverrides {
  quality: "auto" | "high" | "low";
  guide: boolean | null;
  preset: string | null;
  ui: Partial<UiState>;
  settle: boolean;
}

function readUrl(): UrlOverrides {
  const params = new URLSearchParams(window.location.search);
  const quality = params.get("quality");
  const ui: Partial<UiState> = {};
  const view = params.get("view");
  if (view === "projection" || view === "pressure" || view === "material") ui.view = view;
  const latency = params.get("latency");
  if (latency !== null && Number.isFinite(Number(latency))) ui.latencyMs = Number(latency);
  const prediction = params.get("prediction");
  if (prediction !== null) ui.prediction = prediction !== "0" && prediction !== "false";
  for (const key of ["air", "forces", "tracking"] as const) {
    const value = params.get(key);
    if (value === null) continue;
    const on = value !== "0" && value !== "false";
    if (key === "air") ui.showAir = on;
    if (key === "forces") ui.showForces = on;
    if (key === "tracking") ui.showTracking = on;
  }
  const look = params.get("look");
  if (look) ui.lookId = look;
  const projectors = params.get("projectors");
  if (projectors !== null && Number.isFinite(Number(projectors))) ui.projectorCount = Number(projectors);
  const guide = params.get("guide");
  return {
    quality: quality === "high" || quality === "low" ? quality : "auto",
    guide: guide === null ? null : guide !== "0" && guide !== "false",
    preset: params.get("preset"),
    ui,
    settle: params.get("settle") === "1",
  };
}

/** Everything the envelope depends on except its two axes (speed and size). */
function envelopeKey(design: DesignConfig): string {
  const { fan } = design;
  return [design.shapeId, design.materialId, design.heliumFraction, design.ceilingM, fan.diameterM, fan.type, fan.turbulence].join("|");
}

export class LevitationApp {
  private readonly store: Store;
  private readonly scene: LabScene;
  private readonly ui: LabUI;
  private readonly sim: LevitationSimulation;
  private readonly analysisClient: AnalysisClient;
  private readonly governor = new QualityGovernor({ tiers: QUALITY_TIERS.length });
  private readonly overlay: TrackingOverlay;
  private readonly url: UrlOverrides;
  private readonly reducedMotionQuery: MediaQueryList;
  private analysis: DesignAnalysis | null = null;
  private envelope: LevitationEnvelope | null = null;
  private jet: JetSampler;
  private shapeMesh: ShapeMesh;
  private trackLocal: Float32Array;
  private trackWorld: Float32Array;
  private trackContent: Float32Array;
  private raf = 0;
  private running = false;
  private lastMs = 0;
  private elapsedS = 0;
  private frames = 0;
  private liveClock = 0;
  private sparkClock = 0;
  private thumbnailsDone = false;
  private snapshotRequested = false;
  private framedFor = "";
  private nudgeAngle = 0.6;
  private envelopeKey = "";
  private readonly stats: LabStats = {
    fps: 0,
    frameMs: 0,
    tier: 0,
    particles: 0,
    pixelRatio: 1,
    bloom: true,
    frames: 0,
    status: "",
    heightM: 0,
    errorMm: 0,
  };
  private fpsWindowStart = 0;
  private fpsFrames = 0;
  private lastContent: ProjectionPose = { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, errorM: 0 };

  constructor(private readonly host: HTMLElement) {
    this.url = readUrl();
    const initial = loadInitialState();
    let state: LabState = { design: initial.design, ui: sanitiseUi({ ...initial.ui, ...this.url.ui, paused: false }) };
    const preset = this.url.preset ? PRESETS.find((candidate) => candidate.id === this.url.preset) : null;
    if (preset) state = { design: { ...preset.design, fan: { ...preset.design.fan } }, ui: { ...state.ui, presetId: preset.id } };
    this.store = new Store(state);

    this.reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    installTooltips();

    this.ui = new LabUI(host, {
      setDesign: (patch) => this.setDesign(patch),
      applyPreset: (id) => this.applyPreset(id),
      setView: (view) => this.setView(view),
      toggle: (key) => this.store.setUi({ [key]: !this.store.get().ui[key] }),
      setLook: (id) => this.store.setUi({ lookId: id }),
      setProjectorCount: (count) => this.store.setUi({ projectorCount: count }),
      setLatency: (ms) => this.store.setUi({ latencyMs: ms }),
      setPrediction: (on) => this.store.setUi({ prediction: on }),
      togglePause: () => this.togglePause(),
      resetFlight: () => this.resetFlight(),
      nudge: () => this.nudge(),
      snapshot: () => {
        this.snapshotRequested = true;
      },
      pickEnvelope: (pick) =>
        this.setDesign({
          sizeM: pick.sizeM < 1 ? Math.round(pick.sizeM * 100) / 100 : Math.round(pick.sizeM * 20) / 20,
          fan: { outletSpeedMps: pick.speedMps < 10 ? Math.round(pick.speedMps * 10) / 10 : Math.round(pick.speedMps * 2) / 2 },
        }),
      guideClosed: () => markGuideSeen(),
    });
    this.overlay = new TrackingOverlay(this.ui.pipCanvas);

    this.scene = new LabScene(host, this.ui.labelLayer);
    if (this.url.quality === "high") this.governor.force(0);
    if (this.url.quality === "low") this.governor.force(QUALITY_TIERS.length - 1);
    this.scene.setQualityTier(this.governor.tier);
    this.scene.air.setCount(QUALITY_TIERS[this.governor.tier].particles);

    const design = this.store.get().design;
    this.sim = new LevitationSimulation(design, 7);
    this.shapeMesh = buildShapeMesh(design.shapeId, design.sizeM, "high");
    this.trackLocal = buildShapeMesh(design.shapeId, design.sizeM, "low").positions;
    this.trackWorld = new Float32Array(this.trackLocal.length);
    this.trackContent = new Float32Array(this.trackLocal.length);
    this.jet = createJetSampler(design.fan, design.ceilingM + 1);

    // First analysis runs synchronously so the first frame is framed correctly.
    this.analysis = analyseDesign(design);
    this.analysisClient = new AnalysisClient(
      (analysis) => this.receiveAnalysis(analysis),
      (envelope) => this.receiveEnvelope(envelope),
    );

    this.applySceneDesign(true);
    this.applyUi(this.store.get(), null);
    this.ui.update(this.store.get());
    this.ui.updateAnalysis(this.analysis, design.fan.outletSpeedMps);
    this.envelopeKey = envelopeKey(design);
    this.analysisClient.requestEnvelope(design, 30);
    if (this.url.settle) this.sim.reset({ atEquilibrium: true });

    this.store.subscribe((next, previous) => this.onStateChange(next, previous));
    this.installLayout();
    this.installKeyboard();
    this.installVisibility();
    this.installDebugHandle();
    host.setAttribute("aria-busy", "false");
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    this.fpsWindowStart = this.lastMs;
    this.raf = requestAnimationFrame(this.tick);
    const autoGuide = this.url.guide ?? !guideSeen();
    if (autoGuide) window.setTimeout(() => this.ui.guide.show("start"), 350);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // ------------------------------------------------------------------ actions

  private setDesign(patch: DesignPatch): void {
    this.store.setDesign(patch, null);
  }

  private applyPreset(id: string): void {
    const preset = PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    this.store.replaceDesign({ ...preset.design, fan: { ...preset.design.fan } }, id);
    this.sim.reset();
    this.ui.dock.sparkline.clear();
  }

  private setView(view: ViewMode): void {
    this.store.setUi({ view });
  }

  private togglePause(): void {
    this.store.setUi({ paused: !this.store.get().ui.paused });
  }

  /** A sideways push, so you can watch the jet pull it back (or lose it). */
  private nudge(): void {
    const analysis = this.analysis;
    if (!analysis) return;
    const size = this.store.get().design.sizeM;
    const deltaV = Math.min(1.2, Math.max(0.25, 0.55 * Math.sqrt(size)));
    const impulse = analysis.properties.inertialMassKg * deltaV;
    this.nudgeAngle += 2.39996;
    this.sim.applyImpulse({ x: Math.cos(this.nudgeAngle) * impulse, y: 0, z: Math.sin(this.nudgeAngle) * impulse });
    if (this.store.get().ui.paused) this.store.setUi({ paused: false });
  }

  private resetFlight(): void {
    this.sim.reset();
    this.ui.dock.sparkline.clear();
    if (this.store.get().ui.paused) this.store.setUi({ paused: false });
  }

  // ------------------------------------------------------------------ state

  private onStateChange(next: LabState, previous: LabState): void {
    if (next.design !== previous.design) {
      const shapeChanged =
        next.design.shapeId !== previous.design.shapeId || next.design.sizeM !== previous.design.sizeM;
      const fanChanged =
        next.design.fan.diameterM !== previous.design.fan.diameterM ||
        next.design.fan.outletSpeedMps !== previous.design.fan.outletSpeedMps ||
        next.design.fan.type !== previous.design.fan.type ||
        next.design.fan.turbulence !== previous.design.fan.turbulence ||
        next.design.ceilingM !== previous.design.ceilingM;
      this.sim.setDesign(next.design);
      if (shapeChanged) {
        this.shapeMesh = buildShapeMesh(next.design.shapeId, next.design.sizeM, "high");
        this.trackLocal = buildShapeMesh(next.design.shapeId, next.design.sizeM, "low").positions;
        if (this.trackWorld.length !== this.trackLocal.length) {
          this.trackWorld = new Float32Array(this.trackLocal.length);
          this.trackContent = new Float32Array(this.trackLocal.length);
        }
      }
      if (fanChanged) this.jet = createJetSampler(next.design.fan, next.design.ceilingM + 1);
      this.applySceneDesign(false, shapeChanged);
      this.analysisClient.requestAnalysis(next.design);
      // Speed and size are the envelope's own axes, so dragging them never
      // changes the map: only recompute when something else changed.
      const key = envelopeKey(next.design);
      if (key !== this.envelopeKey) {
        this.envelopeKey = key;
        this.analysisClient.requestEnvelope(next.design);
      }
      if (shapeChanged && next.design.shapeId !== previous.design.shapeId) this.ui.dock.sparkline.clear();
    }
    this.applyUi(next, previous);
    this.ui.update(next);
  }

  private applyUi(next: LabState, previous: LabState | null): void {
    const ui = next.ui;
    if (!previous || previous.ui.view !== ui.view) this.scene.setView(ui.view);
    if (!previous || previous.ui.lookId !== ui.lookId) this.scene.setLook(findLook(ui.lookId));
    if (!previous || previous.ui.projectorCount !== ui.projectorCount) this.scene.setProjectorCount(ui.projectorCount);
    if (!previous || previous.ui.showTracking !== ui.showTracking) {
      requestAnimationFrame(() => this.measureLayout());
    }
  }

  private receiveAnalysis(analysis: DesignAnalysis): void {
    this.analysis = analysis;
    const design = this.store.get().design;
    this.ui.updateAnalysis(analysis, design.fan.outletSpeedMps);
    this.applySceneDesign(false, false);
  }

  private receiveEnvelope(envelope: LevitationEnvelope): void {
    this.envelope = envelope;
    this.ui.updateEnvelope(envelope);
    const design = this.store.get().design;
    this.ui.dock.envelope.setCurrent({ speedMps: design.fan.outletSpeedMps, sizeM: design.sizeM });
  }

  private applySceneDesign(first: boolean, shapeChanged = false): void {
    const design: DesignConfig = this.store.get().design;
    const analysis = this.analysis;
    const hover = analysis?.equilibriumHeightM ?? null;
    this.scene.applyDesign({
      design,
      shape: getShape(design.shapeId),
      material: getMaterial(design.materialId),
      mesh: this.shapeMesh,
      fan: analysis?.fan ?? fanDerived(design.fan),
      jet: this.jet,
      hoverHeightM: hover,
      pinnedToCeiling: analysis?.verdict === "blown-to-ceiling",
      swayM: analysis?.swayAmplitudeM ?? 0,
      cpOffsetM: analysis?.properties.cpOffsetM ?? 0,
      cmOffsetM: analysis?.properties.cmOffsetM ?? 0,
      shapeChanged: first || shapeChanged,
    });
    // Reframe only when the stage really changed, so dragging stays calm.
    const key = `${design.shapeId}|${design.sizeM.toFixed(2)}|${design.fan.diameterM.toFixed(2)}|${analysis?.verdict ?? ""}|${hover === null ? "none" : (Math.round(hover * 5) / 5).toFixed(1)}`;
    if (first || key !== this.framedFor) {
      this.framedFor = key;
      this.scene.reframe(first);
    }
    this.ui.dock.envelope.setCurrent({ speedMps: design.fan.outletSpeedMps, sizeM: design.sizeM });
  }

  // ------------------------------------------------------------------ frame

  private readonly tick = (nowMs: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const frameMs = nowMs - this.lastMs;
    const dt = Math.min(0.1, Math.max(0, frameMs / 1000));
    this.lastMs = nowMs;
    this.elapsedS += dt;
    this.frames += 1;
    const { ui, design } = this.store.get();
    const reducedMotion = this.reducedMotionQuery.matches;

    if (!this.thumbnailsDone && this.frames === 3) {
      this.thumbnailsDone = true;
      // Off the critical path: a small separate renderer, once, when idle.
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => this.renderThumbnails(), { timeout: 800 });
      else window.setTimeout(() => this.renderThumbnails(), 200);
    }

    const simDt = ui.paused ? 0 : dt;
    if (simDt > 0) this.sim.step(simDt);
    const state = this.sim.state;
    const content = projectionPose(this.sim.history, state.timeS, ui.latencyMs, ui.prediction);
    this.lastContent = content;

    this.scene.frame({
      dtS: dt,
      simDtS: simDt,
      timeS: this.elapsedS,
      simTimeS: state.timeS,
      state,
      content,
      latencyMs: ui.latencyMs,
      view: ui.view,
      showAir: ui.showAir,
      showForces: ui.showForces,
      showTracking: ui.showTracking,
      reducedMotion,
    });

    let measured: TrackedEllipse | null = null;
    let projected: TrackedEllipse | null = null;
    if (ui.showTracking) {
      const camera = this.scene.trackingCamera;
      transformPoints(this.trackLocal, state.position, state.orientation, state.squash, this.trackWorld);
      measured = observeSilhouette(this.trackWorld, camera);
      if (ui.latencyMs > 0) {
        transformPoints(this.trackLocal, content.position, content.orientation, state.squash, this.trackContent);
        projected = observeSilhouette(this.trackContent, camera);
      }
      this.overlay.draw(measured, projected, ui.latencyMs > 0);
    }

    if (this.snapshotRequested) {
      this.snapshotRequested = false;
      this.saveSnapshot(ui.showTracking);
    }

    // Sparkline data every frame, drawing at ~30 Hz, text at ~10 Hz.
    if (!ui.paused) this.ui.dock.sparkline.push(state.timeS, state.heightM, state.lateralOffsetM);
    this.sparkClock += dt;
    if (this.sparkClock > 1 / 30) {
      this.sparkClock = 0;
      this.ui.dock.sparkline.draw(design.sizeM);
    }
    this.liveClock += dt;
    if (this.liveClock > 0.1) {
      this.liveClock = 0;
      this.ui.updateLive(state, ui.paused);
      this.ui.air.updateMisregistration(ui.latencyMs > 0 ? content.errorM : 0, design.sizeM);
      this.ui.setSpillVisible(ui.latencyMs > 0 && content.errorM > design.sizeM * 0.012, ui.view);
      if (ui.showTracking) this.ui.updateTrackingReadout(measured, projected);
    }

    // Performance.
    this.fpsFrames += 1;
    if (nowMs - this.fpsWindowStart > 1000) {
      this.stats.fps = (this.fpsFrames * 1000) / (nowMs - this.fpsWindowStart);
      this.fpsFrames = 0;
      this.fpsWindowStart = nowMs;
    }
    if (this.url.quality === "auto" && this.frames > 30) {
      const tier = this.governor.sample(frameMs);
      if (tier !== this.scene.qualityTier) {
        this.scene.setQualityTier(tier);
        this.measureLayout();
      }
    }
    this.stats.frameMs = this.governor.frameMs;
    this.stats.tier = this.scene.qualityTier;
    this.stats.particles = this.scene.air.count;
    this.stats.pixelRatio = this.scene.currentPixelRatio;
    this.stats.bloom = QUALITY_TIERS[this.scene.qualityTier].bloom;
    this.stats.frames = this.frames;
    this.stats.status = state.status;
    this.stats.heightM = state.heightM;
    this.stats.errorMm = content.errorM * 1000;
  };

  private renderThumbnails(): void {
    const shapes = [...this.ui.design.shapeCanvases.entries()].map(([id, canvas]) => ({
      mesh: buildShapeMesh(id, 1, "low"),
      canvas,
    }));
    const looks = LAB_LOOKS.map((look) => ({ look, canvas: this.ui.air.lookCanvases.get(look.id) }))
      .filter((job): job is { look: (typeof LAB_LOOKS)[number]; canvas: HTMLCanvasElement } => job.canvas !== undefined);
    try {
      this.scene.renderThumbnails(shapes, looks);
    } catch (error) {
      console.warn("Thumbnail rendering failed", error);
    }
  }

  private saveSnapshot(includeTracking: boolean): void {
    const overlays = includeTracking ? [{ canvas: this.ui.pipCanvas, rect: this.ui.pipRect() }] : [];
    const canvas = this.scene.capture(overlays);
    const design = this.store.get().design;
    const stamp = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const name = `orbital-levitation-${design.shapeId}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  // ------------------------------------------------------------------ plumbing

  private measureLayout(): void {
    const rect = this.host.getBoundingClientRect();
    this.scene.resize(rect.width, rect.height);
    this.scene.setStage(this.stageFromUi());
    const pip = this.ui.pipRect();
    this.scene.setPipRect(pip);
    this.overlay.resize(pip.width, pip.height, Math.min(window.devicePixelRatio || 1, 2));
    this.scene.reframe(false);
  }

  private stageFromUi() {
    const stage = this.ui.stageRect();
    return { left: stage.x, top: stage.y, width: stage.width, height: stage.height };
  }

  private installLayout(): void {
    const observer = new ResizeObserver(() => this.measureLayout());
    observer.observe(this.host);
    this.measureLayout();
    // Web fonts change widths; re-measure when they arrive.
    void document.fonts?.ready.then(() => this.measureLayout());
    this.scene.reframe(true);
  }

  private installKeyboard(): void {
    window.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input[type='text'], textarea, select, [contenteditable='true']")) return;
      if (this.ui.guide.isOpen) {
        if (event.key === "g" || event.key === "G" || event.key === "?" || event.key === "Escape") {
          event.preventDefault();
          this.ui.guide.hide();
        }
        return;
      }
      switch (event.key) {
        case " ":
          if (target && (target.tagName === "BUTTON" || target.getAttribute("role") === "radio")) return;
          event.preventDefault();
          this.togglePause();
          break;
        case "r":
        case "R":
          this.resetFlight();
          break;
        case "n":
        case "N":
          this.nudge();
          break;
        case "g":
        case "G":
        case "?":
          event.preventDefault();
          this.ui.guide.show("start");
          break;
        case "1":
          this.setView("projection");
          break;
        case "2":
          this.setView("pressure");
          break;
        case "3":
          this.setView("material");
          break;
        default:
          break;
      }
    });
  }

  private installVisibility(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(this.raf);
        this.running = false;
      } else if (!this.running) {
        this.running = true;
        this.lastMs = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      }
    });
  }

  private installDebugHandle(): void {
    window.__levitationLab = {
      stats: this.stats,
      state: () => this.store.get(),
      analysis: () => this.analysis,
      envelopeReady: () => this.envelope !== null,
      setUi: (patch) => this.store.setUi(patch),
      applyPreset: (id) => this.applyPreset(id),
      reset: (atEquilibrium = false) => {
        this.sim.reset({ atEquilibrium });
        this.ui.dock.sparkline.clear();
      },
      setDesign: (patch) => this.setDesign(patch),
      setCamera: (position, target) => this.scene.setCamera(position, target),
    };
  }

  get content(): ProjectionPose {
    return this.lastContent;
  }
}
