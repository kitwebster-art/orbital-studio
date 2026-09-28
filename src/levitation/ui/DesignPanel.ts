/** Left panel: presets, shape gallery, size, material and helium. */
import {
  DESIGN_LIMITS,
  MATERIALS,
  PRESETS,
  SHAPES,
  canUseHelium,
  getShape,
  isMaterialCompatible,
  type DesignAnalysis,
  type MaterialDefinition,
  type MaterialId,
  type ShapeId,
} from "../model";
import type { DesignPatch, LabState } from "../app/store";
import { humanScale } from "../format";
import { Slider, attachGridNavigation } from "./controls";
import { el, setAttr, setText, svg } from "./dom";
import { ICONS } from "./icons";

export const PRESET_SHORT_NAMES: Record<string, string> = {
  "orbital-3m": "Orbital",
  "home-60cm": "Home test",
  halo: "Halo",
  shuttle: "Shuttle",
  medusa: "Medusa",
  geode: "Geode",
  twin: "Twin",
  ribbon: "Ribbon",
};

/** Presets that exist to show a failure. */
const FAILING_PRESETS = new Set(["ribbon"]);

export const MATERIAL_SHORT_NAMES: Record<MaterialId, string> = {
  pvc: "Matte PVC",
  latex: "Latex",
  "tpu-nylon": "TPU nylon",
  silnylon: "Silnylon",
  tyvek: "Tyvek",
  "washi-carbon": "Washi kite",
  mylar: "Mylar",
  "eps-shell": "EPS shell",
};

/** 0..1 projection suitability from the optical properties. */
export function projectionQuality(material: MaterialDefinition): number {
  return material.reflectance * (1 - 0.7 * material.gloss) * (1 - 0.8 * material.translucency);
}

function projectionPips(material: MaterialDefinition): number {
  const q = projectionQuality(material);
  return q >= 0.6 ? 3 : q >= 0.42 ? 2 : q >= 0.2 ? 1 : 0;
}

function trackingPips(material: MaterialDefinition): number {
  const n = material.nir850;
  return n >= 0.78 ? 3 : n >= 0.6 ? 2 : n >= 0.3 ? 1 : 0;
}

const QUALITY_WORDS = ["poor", "poor", "fair", "good"];

function badge(count: number, icon: keyof typeof ICONS, label: string): HTMLSpanElement {
  const tone = count >= 3 ? "good" : count === 2 ? "ok" : "poor";
  return el("span", {
    class: "mbadge",
    dataset: { tone },
    attrs: { role: "img", "aria-label": `${label}: ${QUALITY_WORDS[count]}` },
  }, [svg(ICONS[icon].replace('width="14" height="14"', 'width="10" height="10"'))]);
}

export interface DesignPanelActions {
  setDesign(patch: DesignPatch): void;
  applyPreset(id: string): void;
}

export class DesignPanel {
  readonly root: HTMLElement;
  readonly shapeCanvases = new Map<ShapeId, HTMLCanvasElement>();
  private readonly presetButtons = new Map<string, HTMLButtonElement>();
  private readonly shapeTiles = new Map<ShapeId, HTMLButtonElement>();
  private readonly materialCards = new Map<MaterialId, HTMLButtonElement>();
  private readonly caption: HTMLParagraphElement;
  private readonly shapeValue: HTMLSpanElement;
  private readonly materialValue: HTMLSpanElement;
  private readonly sizeSlider: Slider;
  private readonly heliumSection: HTMLElement;
  private readonly heliumSlider: Slider;
  private readonly heliumNote: HTMLParagraphElement;
  private state: LabState | null = null;
  private hoveredShape: ShapeId | null = null;

  constructor(actions: DesignPanelActions) {
    // Presets
    const presetRow = el("div", { class: "preset-row", attrs: { role: "group", "aria-label": "Presets" } });
    for (const preset of PRESETS) {
      const button = el("button", {
        class: FAILING_PRESETS.has(preset.id) ? "preset-chip preset-chip--fail" : "preset-chip",
        text: PRESET_SHORT_NAMES[preset.id] ?? preset.name,
        attrs: {
          type: "button",
          "aria-pressed": "false",
          "data-tip": `${preset.name}. ${preset.description}`,
          "data-tip-align": "start",
        },
      });
      button.addEventListener("click", () => actions.applyPreset(preset.id));
      this.presetButtons.set(preset.id, button);
      presetRow.append(button);
    }

    // Shapes
    const grid = el("div", { class: "shape-grid", attrs: { role: "radiogroup", "aria-label": "Shape" } });
    for (const shape of SHAPES) {
      const canvas = el("canvas", { class: "shape-tile__thumb", attrs: { width: 76, height: 76, "aria-hidden": "true" } });
      const tile = el("button", {
        class: "shape-tile",
        attrs: {
          type: "button",
          role: "radio",
          "aria-checked": "false",
          "aria-label": `${shape.name}: ${shape.tagline}`,
        },
      }, [canvas, el("span", { class: "shape-tile__name", text: shape.name })]);
      tile.addEventListener("click", () => actions.setDesign({ shapeId: shape.id }));
      tile.addEventListener("pointerenter", () => this.previewShape(shape.id));
      tile.addEventListener("pointerleave", () => this.previewShape(null));
      tile.addEventListener("focus", () => this.previewShape(shape.id));
      tile.addEventListener("blur", () => this.previewShape(null));
      this.shapeTiles.set(shape.id, tile);
      this.shapeCanvases.set(shape.id, canvas);
      grid.append(tile);
    }
    attachGridNavigation([...this.shapeTiles.values()], 5, (index) => actions.setDesign({ shapeId: SHAPES[index].id }));
    this.caption = el("p", { class: "shape-caption", attrs: { "aria-live": "polite" } });
    this.shapeValue = el("span", { class: "section-value" });

    // Size
    this.sizeSlider = new Slider(
      {
        label: "Size",
        icon: "ruler",
        min: DESIGN_LIMITS.sizeM[0],
        max: DESIGN_LIMITS.sizeM[1],
        scale: "log",
        snap: (value) => (value < 1 ? Math.round(value * 100) / 100 : Math.round(value * 20) / 20),
        format: (value) => ({ value: value.toFixed(2), unit: "m" }),
        hint: (value) => `Widest point, ${humanScale(value)}`,
        tip: "The shape's largest horizontal width. Drag for a log scale: fine control for small shapes.",
        onInput: (value) => actions.setDesign({ sizeM: value }),
      },
      1,
    );

    // Materials
    const materialGrid = el("div", { class: "material-grid", attrs: { role: "radiogroup", "aria-label": "Material" } });
    for (const material of MATERIALS) {
      const metal = material.swatch.metalness > 0.5;
      const card = el("button", {
        class: "material-card",
        attrs: { type: "button", role: "radio", "aria-checked": "false", "data-tip-align": "start" },
      }, [
        el("span", {
          class: "material-card__swatch",
          dataset: { metal: String(metal) },
          style: { "--swatch": material.swatch.color, "--hi": String(0.25 + (1 - material.swatch.roughness) * 0.55) },
        }),
        el("span", { class: "material-card__text" }, [
          el("span", { class: "material-card__name", text: MATERIAL_SHORT_NAMES[material.id] ?? material.name }),
          el("span", { class: "material-card__meta num", text: `${material.arealDensityGsm} gsm` }),
        ]),
        el("span", { class: "material-card__badges" }, [
          badge(projectionPips(material), "light", "Projection"),
          badge(trackingPips(material), "target", "Infrared tracking"),
        ]),
      ]);
      card.addEventListener("click", () => {
        if (card.getAttribute("aria-disabled") === "true") return;
        actions.setDesign({ materialId: material.id });
      });
      this.materialCards.set(material.id, card);
      materialGrid.append(card);
    }
    attachGridNavigation([...this.materialCards.values()], 4, (index) => actions.setDesign({ materialId: MATERIALS[index].id }));
    this.materialValue = el("span", { class: "section-value" });

    // Helium
    this.heliumSlider = new Slider(
      {
        label: "Helium fill",
        icon: "helium",
        min: DESIGN_LIMITS.heliumFraction[0],
        max: DESIGN_LIMITS.heliumFraction[1],
        snap: (value) => Math.round(value * 100) / 100,
        format: (value) => ({ value: (value * 100).toFixed(0), unit: "%" }),
        tip: "Share of the gas inside the envelope that is helium. Helium lifts, so the jet has less to hold up.",
        onInput: (value) => actions.setDesign({ heliumFraction: value }),
      },
      0,
    );
    this.heliumNote = el("p", { class: "section-note" });
    this.heliumSection = el("section", { class: "panel-section" }, [this.heliumSlider.root, this.heliumNote]);

    this.root = el("aside", { class: "lab-panel lab-panel--left glass", attrs: { "aria-label": "Design" } }, [
      el("div", { class: "sheet-handle", attrs: { "aria-hidden": "true" } }),
      el("div", { class: "panel-head" }, [
        el("h2", { text: "Design" }),
        el("span", { class: "panel-head__sub", text: "Start from a preset" }),
      ]),
      el("div", { class: "panel-scroll" }, [
        el("section", { class: "panel-section panel-section--presets" }, [presetRow]),
        el("section", { class: "panel-section" }, [
          el("div", { class: "section-row" }, [el("h3", { class: "section-label" }, [svg(ICONS.shape), "Shape"]), this.shapeValue]),
          grid,
          this.caption,
        ]),
        el("section", { class: "panel-section" }, [this.sizeSlider.root]),
        el("section", { class: "panel-section" }, [
          el("div", { class: "section-row" }, [el("h3", { class: "section-label" }, [svg(ICONS.swatch), "Material"]), this.materialValue]),
          materialGrid,
        ]),
        this.heliumSection,
      ]),
    ]);
  }

  update(state: LabState): void {
    this.state = state;
    const { design, ui } = state;
    for (const [id, button] of this.presetButtons) {
      setAttr(button, "aria-pressed", String(ui.presetId === id));
    }
    for (const [id, tile] of this.shapeTiles) {
      const active = id === design.shapeId;
      setAttr(tile, "aria-checked", String(active));
      tile.tabIndex = active ? 0 : -1;
    }
    const shape = getShape(design.shapeId);
    setText(this.shapeValue, shape.name);
    this.renderCaption();
    if (Math.abs(this.sizeSlider.current - design.sizeM) > 1e-6) this.sizeSlider.set(design.sizeM);

    for (const material of MATERIALS) {
      const card = this.materialCards.get(material.id);
      if (!card) continue;
      const compatible = isMaterialCompatible(material.id, design.shapeId);
      const active = material.id === design.materialId;
      setAttr(card, "aria-checked", String(active));
      setAttr(card, "aria-disabled", String(!compatible));
      card.tabIndex = active ? 0 : -1;
      const quality = `Projection ${QUALITY_WORDS[projectionPips(material)]}, infrared tracking ${QUALITY_WORDS[trackingPips(material)]}.`;
      const tip = compatible
        ? `${material.name}, ${material.arealDensityGsm} gsm. ${quality} ${material.projectionNotes}`
        : `Not suited to the ${shape.name}. ${material.fabricationNotes}`;
      setAttr(card, "data-tip", tip);
      setAttr(card, "aria-label", `${material.name}, ${material.arealDensityGsm} grams per square metre${compatible ? "" : ", not available for this shape"}`);
    }
    const material = MATERIALS.find((candidate) => candidate.id === design.materialId);
    setText(this.materialValue, material ? MATERIAL_SHORT_NAMES[material.id] : "");

    const helium = canUseHelium(design.shapeId, design.materialId);
    this.heliumSection.hidden = !helium;
    if (Math.abs(this.heliumSlider.current - design.heliumFraction) > 1e-6) this.heliumSlider.set(design.heliumFraction);
  }

  updateAnalysis(analysis: DesignAnalysis | null): void {
    if (!analysis || this.heliumSection.hidden) return;
    const p = analysis.properties;
    // Air inside weighs the same as the air it displaces; only helium lifts.
    const skinWeight = p.massKg * 9.81;
    const heliumLift = skinWeight - p.netWeightN;
    const share = skinWeight > 0 ? Math.round((heliumLift / skinWeight) * 100) : 0;
    setText(
      this.heliumNote,
      p.netWeightN <= 0
        ? "Lighter than air: it floats away without the jet."
        : share >= 1
          ? `Helium carries about ${share}% of the skin's weight.`
          : "Filled with air, which weighs nothing in air: the jet holds up the skin.",
    );
  }

  private previewShape(id: ShapeId | null): void {
    this.hoveredShape = id;
    this.renderCaption();
  }

  private renderCaption(): void {
    if (!this.state) return;
    const id = this.hoveredShape ?? this.state.design.shapeId;
    const shape = getShape(id);
    const key = `${shape.id}`;
    if (this.caption.dataset.shape === key) return;
    this.caption.dataset.shape = key;
    this.caption.replaceChildren(el("strong", { text: shape.name }), ` · ${shape.tagline}`);
  }
}
