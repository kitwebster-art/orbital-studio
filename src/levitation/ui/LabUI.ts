/**
 * Builds and lays out the whole interface around the canvas. It knows nothing
 * about three.js; the app wires it to the scene and the simulation.
 */
import type { DesignAnalysis, LevitationEnvelope, SimState, TrackedEllipse } from "../model";
import type { DesignPatch, LabState, ViewMode } from "../app/store";
import { formatLength } from "../format";
import { AirPanel } from "./AirPanel";
import { DesignPanel } from "./DesignPanel";
import { Dock } from "./Dock";
import { Guide } from "./Guide";
import { Segmented, iconButton, toggleChip } from "./controls";
import { el, setAttr, setText, svg, watchScrollEnd } from "./dom";
import { ICONS } from "./icons";
import { verdictTone, type EnvelopePick } from "./charts";
import { FORCE_STYLE } from "../scene/forces";
import { TRACKING_RASTER } from "../scene/tracking";

export interface LabActions {
  setDesign(patch: DesignPatch): void;
  applyPreset(id: string): void;
  setView(view: ViewMode): void;
  toggle(key: "showAir" | "showForces" | "showTracking"): void;
  setLook(id: string): void;
  setProjectorCount(count: number): void;
  setLatency(ms: number): void;
  setPrediction(on: boolean): void;
  togglePause(): void;
  resetFlight(): void;
  nudge(): void;
  snapshot(): void;
  pickEnvelope(pick: EnvelopePick): void;
  guideClosed(): void;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STATUS_TEXT: Record<SimState["status"], string> = {
  hovering: "Hovering",
  rising: "Lifting off",
  falling: "Falling",
  tumbling: "Tumbling",
  "on-fan": "Resting on the fan",
  "at-ceiling": "Pinned to the ceiling",
  escaped: "Escaped the jet",
  "buoyant-drift": "Floating away",
};

type SheetKey = "design" | "air" | "results";

export class LabUI {
  readonly root: HTMLDivElement;
  readonly labelLayer: HTMLDivElement;
  readonly design: DesignPanel;
  readonly air: AirPanel;
  readonly dock: Dock;
  readonly guide: Guide;
  readonly pip: HTMLDivElement;
  readonly pipCanvas: HTMLCanvasElement;
  private readonly views: Segmented<ViewMode>;
  private readonly chips: Record<"showAir" | "showForces" | "showTracking", HTMLButtonElement>;
  private readonly mobileToggles: Record<"showAir" | "showForces" | "showTracking", HTMLButtonElement>;
  private readonly topbar: HTMLElement;
  private readonly hud: HTMLDivElement;
  private readonly hudDot: HTMLSpanElement;
  private readonly hudStatus: HTMLSpanElement;
  private readonly hudValue: HTMLSpanElement;
  private readonly hudPaused: HTMLSpanElement;
  private readonly hudLive: HTMLSpanElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly legend: HTMLDivElement;
  private readonly pressureLegend: HTMLDivElement;
  private readonly forcesLegend: HTMLDivElement;
  private readonly spillLegend: HTMLDivElement;
  private readonly pipRec: HTMLSpanElement;
  private readonly pipReadout: Record<string, HTMLElement> = {};
  private readonly pipStatus: HTMLSpanElement;
  private readonly pipLag: HTMLSpanElement;
  private readonly tabs: Record<SheetKey, HTMLButtonElement>;
  private readonly tabVerdict: HTMLSpanElement;
  private readonly mobileVerdict: HTMLDivElement;
  private readonly mobileVerdictChip: HTMLSpanElement;
  private readonly mobileVerdictText: HTMLSpanElement;
  private openSheet: SheetKey | null = null;
  private spillVisible = false;
  private lastStatus = "";
  private analysisTone: "stable" | "wobbly" | "fail" | "buoyant" = "stable";

  constructor(host: HTMLElement, actions: LabActions) {
    this.labelLayer = el("div", { class: "force-labels", attrs: { "aria-hidden": "true" } });

    // Top bar
    this.views = new Segmented<ViewMode>(
      {
        label: "View",
        options: [
          { value: "projection", label: "Projection", icon: "projection", key: "1" },
          { value: "pressure", label: "Pressure", icon: "pressure", key: "2" },
          { value: "material", label: "Material", icon: "material", key: "3" },
        ],
        onChange: (value) => actions.setView(value),
      },
      "projection",
    );
    this.chips = {
      showAir: toggleChip("Air", "A", "Show the air: flow particles and the jet (particles are coloured by speed)", () => actions.toggle("showAir")),
      showForces: toggleChip("Forces", "F", "Show force arrows and the centres of pressure and mass", () => actions.toggle("showForces")),
      showTracking: toggleChip("Tracking", "T", "Show what the tracking camera sees", () => actions.toggle("showTracking")),
    };
    const mobileToggle = (key: "showAir" | "showForces" | "showTracking", icon: "air" | "forces" | "tracking", label: string) => {
      const button = iconButton(icon, label, () => actions.toggle(key));
      button.setAttribute("aria-pressed", "false");
      return button;
    };
    this.mobileToggles = {
      showAir: mobileToggle("showAir", "air", "Air"),
      showForces: mobileToggle("showForces", "forces", "Forces"),
      showTracking: mobileToggle("showTracking", "tracking", "Tracking"),
    };
    const brand = el("div", { class: "lab-brand glass" }, [
      el("span", { class: "lab-brand__mark" }, [svg(ICONS.mark)]),
      el("span", { class: "lab-brand__word", text: "ORBITAL" }),
      el("span", { class: "lab-brand__dot", text: "·", attrs: { "aria-hidden": "true" } }),
      el("span", { class: "lab-brand__name", text: "Levitation Lab" }),
    ]);
    const viewsWrap = el("div", { class: "lab-views glass" }, [
      this.views.root,
      el("div", { class: "mobile-toggles" }, [this.mobileToggles.showAir, this.mobileToggles.showForces, this.mobileToggles.showTracking]),
    ]);
    const actionsWrap = el("div", { class: "lab-actions glass" }, [
      this.chips.showAir,
      this.chips.showForces,
      this.chips.showTracking,
      el("span", { class: "lab-actions__divider", attrs: { "aria-hidden": "true" } }),
      iconButton("guide", "Guide (G)", () => this.guide.toggle()),
      iconButton("snapshot", "Save snapshot (PNG)", () => actions.snapshot()),
    ]);
    this.topbar = el("header", { class: "lab-topbar" }, [brand, viewsWrap, actionsWrap]);

    // Flight HUD
    this.hudDot = el("span", { class: "hud-dot", dataset: { tone: "stable" }, attrs: { "aria-hidden": "true" } });
    this.hudStatus = el("span", { class: "hud-status", text: "Starting" });
    this.hudValue = el("span", { class: "hud-value num" });
    this.hudPaused = el("span", { class: "hud-paused", text: "Paused" });
    this.hudPaused.hidden = true;
    this.hudLive = el("span", { class: "visually-hidden", attrs: { "aria-live": "polite" } });
    this.pauseButton = iconButton("pause", "Pause (Space)", () => actions.togglePause(), "icon-btn--sm");
    const nudge = iconButton("nudge", "Nudge it sideways (N)", () => actions.nudge(), "icon-btn--sm");
    const reset = el("button", { class: "btn hud-reset", attrs: { type: "button", "aria-label": "Reset flight (R)", "data-tip": "Drop it back on the fan and lift off again (R)", "data-tip-pos": "below" } }, [
      svg(ICONS.reset),
      el("span", { class: "hud-reset__label", text: "Reset flight" }),
    ]);
    reset.addEventListener("click", () => actions.resetFlight());
    this.hud = el("div", { class: "lab-hud glass", attrs: { role: "group", "aria-label": "Flight" } }, [
      this.hudDot,
      this.hudStatus,
      this.hudValue,
      this.hudPaused,
      el("span", { class: "hud-sep", attrs: { "aria-hidden": "true" } }),
      this.pauseButton,
      nudge,
      reset,
      this.hudLive,
    ]);

    // Panels
    this.design = new DesignPanel({ setDesign: actions.setDesign, applyPreset: actions.applyPreset });
    this.air = new AirPanel({
      setDesign: actions.setDesign,
      setLook: actions.setLook,
      setProjectorCount: actions.setProjectorCount,
      setLatency: actions.setLatency,
      setPrediction: actions.setPrediction,
    });
    this.dock = new Dock((pick) => actions.pickEnvelope(pick));

    // Stage legends
    this.pressureLegend = el("div", {}, [
      el("div", { class: "stage-legend__title", text: "Surface pressure" }),
      el("div", { class: "cp-bar", attrs: { role: "img", "aria-label": "Colour scale from suction in pale cyan to push in orange" } }),
      el("div", { class: "cp-scale" }, [el("span", { text: "Suction, fast air" }), el("span", { text: "0" }), el("span", { text: "Push" })]),
    ]);
    const forceItems: HTMLElement[] = [];
    for (const key of ["weight", "jet", "centering", "shedding"] as const) {
      forceItems.push(el("span", { class: "legend-swatch", style: { color: FORCE_STYLE[key].colour } }), el("span", { text: FORCE_STYLE[key].label }));
    }
    forceItems.push(el("span", { class: "legend-swatch legend-swatch--dot", style: { color: "#ffb45e", background: "transparent", border: "2px solid #ffb45e" } }), el("span", { text: "Centre of pressure (CP)" }));
    forceItems.push(el("span", { class: "legend-swatch legend-swatch--dot", style: { color: "#e8eef2" } }), el("span", { text: "Centre of mass (CM)" }));
    this.forcesLegend = el("div", {}, [
      el("div", { class: "stage-legend__title", text: "Forces (log scale)" }),
      el("div", { class: "legend-list" }, forceItems),
    ]);
    this.spillLegend = el("div", {}, [
      el("div", { class: "legend-list" }, [
        el("span", { class: "legend-swatch legend-swatch--dot", style: { color: "#ffb45e", opacity: "0.7" } }),
        el("span", { text: "Amber ghost: light that misses the shape" }),
      ]),
    ]);
    this.legend = el("div", { class: "stage-legend glass", attrs: { "aria-label": "Legend" } }, [this.pressureLegend, this.forcesLegend, this.spillLegend]);

    // Tracking picture-in-picture
    this.pipCanvas = el("canvas", { class: "pip-overlay", attrs: { "aria-hidden": "true" } });
    this.pipRec = el("span", { class: "pip-rec", attrs: { "aria-hidden": "true" } });
    const readout = el("dl", { class: "pip-readout", attrs: { "aria-label": "Tracking state, orbital.tracking-state/1.0 fields" } });
    const addReadout = (key: string, label: string) => {
      const value = el("dd", { text: "–" });
      readout.append(el("dt", { text: label }), value);
      this.pipReadout[key] = value;
    };
    addReadout("status", "status");
    addReadout("center", "center_norm");
    addReadout("major", "major_diameter_px");
    addReadout("minor", "minor_diameter_px");
    addReadout("angle", "angle_deg");
    this.pipStatus = this.pipReadout.status as HTMLSpanElement;
    this.pipLag = el("span", { class: "pip-lag" });
    this.pip = el("div", { class: "lab-pip", attrs: { role: "img", "aria-label": "Tracking camera view: the shape's silhouette with the detected ellipse" } }, [
      this.pipCanvas,
      el("div", { class: "pip-head" }, [
        el("span", { class: "pip-head__title" }, [this.pipRec, "Tracking camera"]),
        el("span", { class: "pip-meta", text: `Mono8 · ${TRACKING_RASTER.fps} fps`, attrs: { title: `${TRACKING_RASTER.width} × ${TRACKING_RASTER.height} px, monochrome, like Orbital's HuaTeng Stage A camera` } }),
      ]),
      readout,
      this.pipLag,
    ]);

    // Mobile: verdict bar and tabs
    this.mobileVerdictChip = el("span", { class: "verdict-chip" }, [el("span", { class: "verdict-chip__dot" }), el("span", { text: "…" })]);
    this.mobileVerdictText = el("span", { class: "mobile-verdict__text" });
    this.mobileVerdict = el("div", { class: "mobile-verdict glass", dataset: { tone: "stable" } }, [this.mobileVerdictChip, this.mobileVerdictText]);
    this.mobileVerdict.addEventListener("click", () => this.toggleSheet("results"));
    this.tabVerdict = el("span", { class: "lab-tab__verdict", attrs: { "aria-hidden": "true" } });
    const tab = (key: SheetKey, label: string, icon: keyof typeof ICONS, extra?: HTMLElement) => {
      const button = el("button", { class: "lab-tab", attrs: { type: "button", "aria-expanded": "false" } }, [
        extra ?? svg(ICONS[icon]),
        el("span", { text: label }),
      ]);
      button.addEventListener("click", () => this.toggleSheet(key));
      return button;
    };
    this.tabs = {
      design: tab("design", "Design", "design"),
      air: tab("air", "Air & light", "air"),
      results: tab("results", "Results", "results", this.tabVerdict),
    };
    const tabBar = el("nav", { class: "lab-tabs", attrs: { "aria-label": "Panels" } }, [this.tabs.design, this.tabs.air, this.tabs.results]);

    this.guide = new Guide(() => actions.guideClosed());

    this.root = el("div", { class: "lab-ui" }, [
      this.labelLayer,
      this.topbar,
      this.hud,
      this.design.root,
      this.air.root,
      this.legend,
      this.pip,
      this.dock.root,
      this.mobileVerdict,
      tabBar,
    ]);
    host.append(this.root, this.guide.root);
    this.root.querySelectorAll<HTMLElement>(".panel-scroll").forEach(watchScrollEnd);
  }

  /** Reflect the store in every control. */
  update(state: LabState): void {
    const { ui } = state;
    if (this.views.current !== ui.view) this.views.set(ui.view);
    for (const key of ["showAir", "showForces", "showTracking"] as const) {
      setAttr(this.chips[key], "aria-pressed", String(ui[key]));
      setAttr(this.mobileToggles[key], "aria-pressed", String(ui[key]));
    }
    this.design.update(state);
    this.air.update(state);
    this.pip.hidden = !ui.showTracking;
    this.pressureLegend.hidden = ui.view !== "pressure";
    this.forcesLegend.hidden = !ui.showForces;
    this.spillLegend.hidden = !(ui.view === "projection" && this.spillVisible);
    this.refreshLegend();
    this.hudPaused.hidden = !ui.paused;
    const pauseIcon = ui.paused ? ICONS.play : ICONS.pause;
    if (this.pauseButton.dataset.icon !== (ui.paused ? "play" : "pause")) {
      this.pauseButton.dataset.icon = ui.paused ? "play" : "pause";
      this.pauseButton.replaceChildren(svg(pauseIcon));
      const label = ui.paused ? "Resume (Space)" : "Pause (Space)";
      this.pauseButton.setAttribute("aria-label", label);
      this.pauseButton.setAttribute("data-tip", label);
    }
  }

  updateAnalysis(analysis: DesignAnalysis, outletSpeed: number): void {
    this.dock.updateAnalysis(analysis);
    this.design.updateAnalysis(analysis);
    this.air.updateAnalysis(analysis, outletSpeed);
    this.air.updateDerived(analysis.fan);
    const tone = verdictTone(analysis.verdict);
    this.analysisTone = tone;
    const toneColour = `var(--${tone})`;
    this.tabVerdict.style.background = toneColour;
    setAttr(this.mobileVerdict, "data-tone", tone);
    const label = this.mobileVerdictChip.lastElementChild;
    if (label) setText(label, analysis.verdictLabel);
    setText(this.mobileVerdictText, analysis.summary);
  }

  updateEnvelope(envelope: LevitationEnvelope | null): void {
    this.dock.setEnvelope(envelope);
  }

  /** Live flight readouts (called at ~10 Hz). */
  updateLive(state: SimState, paused: boolean): void {
    const statusText = STATUS_TEXT[state.status] ?? state.status;
    setText(this.hudStatus, statusText);
    const h = formatLength(state.heightM);
    let value = `${h.value} ${h.unit}`;
    if (state.tiltDeg > 3) value += ` · tilt ${state.tiltDeg.toFixed(0)}°`;
    if (Math.abs(state.spinRps) > 0.08) value += ` · ${Math.abs(state.spinRps).toFixed(1)} rev/s`;
    setText(this.hudValue, value);
    const tone =
      state.status === "hovering"
        ? this.analysisTone === "wobbly"
          ? "wobbly"
          : "stable"
        : state.status === "rising" || state.status === "falling"
          ? "idle"
          : state.status === "buoyant-drift"
            ? "buoyant"
            : "fail";
    setAttr(this.hudDot, "data-tone", tone);
    if (this.lastStatus !== state.status) {
      this.lastStatus = state.status;
      setText(this.hudLive, `${statusText}${paused ? ", paused" : ""}`);
    }
    this.dock.setLive(state.heightM, state.lateralOffsetM);
  }

  updateTrackingReadout(measured: TrackedEllipse | null, projected: TrackedEllipse | null): void {
    const r = this.pipReadout;
    setAttr(this.pipRec, "data-lost", String(measured === null));
    if (!measured) {
      setText(r.center, "–");
      setText(r.major, "–");
      setText(r.minor, "–");
      setText(r.angle, "–");
      setText(this.pipStatus, "lost");
      setText(this.pipLag, "");
      return;
    }
    setText(this.pipStatus, "tracking");
    setText(r.center, `[${measured.centerNorm[0].toFixed(3)}, ${measured.centerNorm[1].toFixed(3)}]`);
    setText(r.major, measured.majorPx.toFixed(1));
    setText(r.minor, measured.minorPx.toFixed(1));
    setText(r.angle, measured.angleDeg.toFixed(1));
    const lagPx = projected ? Math.hypot(projected.centerPx[0] - measured.centerPx[0], projected.centerPx[1] - measured.centerPx[1]) : 0;
    if (lagPx >= 0.3) {
      setText(this.pipLag, `projection lag ${lagPx.toFixed(1)} px`);
    } else {
      setText(this.pipLag, "");
    }
  }

  /** The clear area between panels, where the hero sits (CSS px). */
  stageRect(): Rect {
    const root = this.root.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 899px)").matches;
    const hud = this.hud.getBoundingClientRect();
    if (mobile) {
      const verdict = this.mobileVerdict.getBoundingClientRect();
      const top = hud.bottom - root.top + 8;
      const bottom = verdict.top - root.top - 8;
      return { x: 0, y: top, width: root.width, height: Math.max(80, bottom - top) };
    }
    const left = this.design.root.getBoundingClientRect();
    const right = this.air.root.getBoundingClientRect();
    const dock = this.dock.root.getBoundingClientRect();
    const x = left.right - root.left + 8;
    const y = hud.bottom - root.top + 4;
    const width = right.left - root.left - 8 - x;
    const height = dock.top - root.top - 8 - y;
    return { x, y, width: Math.max(80, width), height: Math.max(80, height) };
  }

  pipRect(): Rect {
    if (this.pip.hidden) return { x: 0, y: 0, width: 0, height: 0 };
    const root = this.root.getBoundingClientRect();
    const rect = this.pip.getBoundingClientRect();
    // Inside the 1px border.
    return { x: rect.left - root.left + 1, y: rect.top - root.top + 1, width: rect.width - 2, height: rect.height - 2 };
  }

  /** Show the amber-ghost key only while the ghost is actually visible. */
  setSpillVisible(visible: boolean, view: ViewMode): void {
    const show = visible && view === "projection";
    if (this.spillVisible === visible && this.spillLegend.hidden === !show) return;
    this.spillVisible = visible;
    this.spillLegend.hidden = !show;
    this.refreshLegend();
  }

  private refreshLegend(): void {
    this.legend.hidden = this.pressureLegend.hidden && this.forcesLegend.hidden && this.spillLegend.hidden;
  }

  closeSheets(): void {
    this.toggleSheet(null);
  }

  private toggleSheet(key: SheetKey | null): void {
    this.openSheet = key !== null && this.openSheet === key ? null : key;
    const map: Record<SheetKey, HTMLElement> = { design: this.design.root, air: this.air.root, results: this.dock.root };
    for (const sheet of Object.keys(map) as SheetKey[]) {
      const open = this.openSheet === sheet;
      map[sheet].dataset.sheetOpen = String(open);
      setAttr(this.tabs[sheet], "aria-expanded", String(open));
    }
  }
}
