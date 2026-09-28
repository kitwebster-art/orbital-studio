/** Right panel: the fan and its air, then projection and tracking latency. */
import { DESIGN_LIMITS, type DesignAnalysis, type FanDerived, type FanType } from "../model";
import type { DesignPatch, LabState } from "../app/store";
import { LAB_LOOKS } from "../looks";
import { formatFlow, formatPower, formatRpm, formatSpeed } from "../format";
import { Segmented, Slider, Switch, attachGridNavigation } from "./controls";
import { el, replaceValue, setAttr, setText, svg } from "./dom";
import { ICONS } from "./icons";

export interface AirPanelActions {
  setDesign(patch: DesignPatch): void;
  setLook(id: string): void;
  setProjectorCount(count: number): void;
  setLatency(ms: number): void;
  setPrediction(on: boolean): void;
}

const FAN_TYPE_TIPS: Record<FanType, string> = {
  axial: "A plain propeller fan. Cheap and strong, but the air leaves swirling and gusty.",
  "axial-straightened": "An axial fan with guide vanes after the blades that take out the swirl. Steadier air.",
  "plug-flowgrid": "A plug (centrifugal) fan with a honeycomb flow grid: the calmest, most even jet. Orbital's choice.",
};

export class AirPanel {
  readonly root: HTMLElement;
  readonly lookCanvases = new Map<string, HTMLCanvasElement>();
  private readonly speedSlider: Slider;
  private readonly diameterSlider: Slider;
  private readonly fanType: Segmented<FanType>;
  private readonly turbulenceSlider: Slider;
  private readonly flowValue: HTMLSpanElement;
  private readonly powerValue: HTMLSpanElement;
  private readonly rpmValue: HTMLSpanElement;
  private readonly diagram: SVGSVGElement;
  private readonly diagramRow: HTMLSpanElement;
  private readonly ratioText: HTMLSpanElement;
  private readonly lookButtons = new Map<string, HTMLButtonElement>();
  private readonly lookValue: HTMLSpanElement;
  private readonly projectors: Segmented<"1" | "2" | "3" | "4" | "5">;
  private readonly latencySlider: Slider;
  private readonly prediction: Switch;
  private readonly misregValue: HTMLSpanElement;
  private readonly misregFill: HTMLSpanElement;
  private readonly speedHint: HTMLDivElement;
  private minimumSpeed: number | null = null;

  constructor(actions: AirPanelActions) {
    this.speedHint = el("div", { class: "field__hint" });
    this.speedSlider = new Slider(
      {
        label: "Outlet air speed",
        icon: "air",
        min: DESIGN_LIMITS.fan.outletSpeedMps[0],
        max: DESIGN_LIMITS.fan.outletSpeedMps[1],
        scale: "log",
        snap: (value) => (value < 10 ? Math.round(value * 10) / 10 : Math.round(value * 2) / 2),
        format: (value) => formatSpeed(value),
        tip: "Average speed of the air leaving the fan. Faster air holds heavier shapes and lifts them higher.",
        onInput: (value) => actions.setDesign({ fan: { outletSpeedMps: value } }),
      },
      8,
    );
    this.speedSlider.root.append(this.speedHint);

    this.diagram = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.diagram.setAttribute("class", "fan-diagram");
    this.diagram.setAttribute("width", "58");
    this.diagram.setAttribute("height", "30");
    this.diagram.setAttribute("viewBox", "0 0 76 40");
    this.diagram.setAttribute("aria-hidden", "true");
    this.ratioText = el("span");
    this.diagramRow = el("span", { class: "fan-hint" }, [this.diagram, this.ratioText]);

    this.diameterSlider = new Slider(
      {
        label: "Fan diameter",
        icon: "fan",
        min: DESIGN_LIMITS.fan.diameterM[0],
        max: DESIGN_LIMITS.fan.diameterM[1],
        scale: "log",
        snap: (value) => Math.round(value * 100) / 100,
        format: (value) => ({ value: value.toFixed(2), unit: "m" }),
        hint: () => this.diagramRow,
        tip: "Outlet diameter. The diagram compares the jet (cyan) with your shape (white): a shape much wider than the jet sits on it by turning the air aside.",
        onInput: (value) => actions.setDesign({ fan: { diameterM: value } }),
      },
      0.8,
    );

    this.fanType = new Segmented<FanType>(
      {
        label: "Fan type",
        block: true,
        compact: true,
        options: [
          { value: "axial", label: "Axial", tip: FAN_TYPE_TIPS.axial },
          { value: "axial-straightened", label: "Straightened", tip: FAN_TYPE_TIPS["axial-straightened"] },
          { value: "plug-flowgrid", label: "Plug fan", tip: FAN_TYPE_TIPS["plug-flowgrid"] },
        ],
        onChange: (value) => actions.setDesign({ fan: { type: value } }),
      },
      "plug-flowgrid",
    );

    this.turbulenceSlider = new Slider(
      {
        label: "Turbulence",
        icon: "sway",
        min: DESIGN_LIMITS.fan.turbulence[0],
        max: DESIGN_LIMITS.fan.turbulence[1],
        snap: (value) => Math.round(value * 100) / 100,
        format: (value) => ({ value: (value * 100).toFixed(0), unit: "%" }),
        tip: "Extra gustiness on top of what the fan type makes: room draughts, a nearby door, people walking past.",
        onInput: (value) => actions.setDesign({ fan: { turbulence: value } }),
      },
      0.3,
    );

    this.flowValue = el("span", { class: "derived__value" });
    this.powerValue = el("span", { class: "derived__value" });
    this.rpmValue = el("span", { class: "derived__value" });
    const derived = el("div", { class: "derived" }, [
      el("div", { class: "derived__cell", attrs: { "data-tip": "Volume of air the fan moves each second.", "data-tip-align": "start" } }, [
        el("span", { class: "derived__label", text: "Flow" }),
        this.flowValue,
      ]),
      el("div", { class: "derived__cell", attrs: { "data-tip": "Estimated electrical power at a typical fan efficiency." } }, [
        el("span", { class: "derived__label", text: "Power" }),
        this.powerValue,
      ]),
      el("div", { class: "derived__cell", attrs: { "data-tip": "Rough rotor speed for a fan of this size and air speed.", "data-tip-align": "end" } }, [
        el("span", { class: "derived__label", text: "Rotor" }),
        this.rpmValue,
      ]),
    ]);
    derived.setAttribute("aria-label", "Fan estimates");

    // Projection
    const lookGrid = el("div", { class: "look-grid", attrs: { role: "radiogroup", "aria-label": "Projection look" } });
    for (const look of LAB_LOOKS) {
      const canvas = el("canvas", { attrs: { width: 96, height: 66, "aria-hidden": "true" } });
      const button = el("button", {
        class: "look-swatch",
        attrs: {
          type: "button",
          role: "radio",
          "aria-checked": "false",
          "aria-label": look.name,
          "data-tip": `${look.name}. ${look.description}`,
        },
      }, [canvas]);
      button.addEventListener("click", () => actions.setLook(look.id));
      this.lookButtons.set(look.id, button);
      this.lookCanvases.set(look.id, canvas);
      lookGrid.append(button);
    }
    attachGridNavigation([...this.lookButtons.values()], 4, (index) => actions.setLook(LAB_LOOKS[index].id));
    this.lookValue = el("span", { class: "section-value" });

    this.projectors = new Segmented(
      {
        label: "Number of projectors",
        compact: true,
        block: true,
        variant: "amber",
        options: (["1", "2", "3", "4", "5"] as const).map((value) => ({ value, label: value })),
        onChange: (value) => actions.setProjectorCount(Number(value)),
      },
      "3",
    );

    this.misregValue = el("span", { class: "misreg__value", text: "0 mm" });
    this.misregFill = el("span", { class: "misreg__fill" });
    const misreg = el("span", {
      class: "misreg",
      attrs: { "data-tip": "How far the projected image sits from the real surface right now.", "data-tip-align": "start" },
    }, [
      el("span", { class: "misreg__label", text: "Misregistration" }),
      el("span", { class: "misreg__bar" }, [this.misregFill]),
      this.misregValue,
    ]);
    this.latencySlider = new Slider(
      {
        label: "Tracking latency",
        icon: "clock",
        min: 0,
        max: 120,
        accent: "light",
        snap: (value) => Math.round(value),
        format: (value) => ({ value: value.toFixed(0), unit: "ms" }),
        hint: () => misreg,
        tip: "Time from the camera exposure to light leaving the projector. The image is drawn where the shape was this long ago.",
        onInput: (value) => actions.setLatency(value),
      },
      24,
    );
    this.prediction = new Switch(
      "Prediction",
      "Extrapolate motion to hide the delay",
      true,
      (on) => actions.setPrediction(on),
    );

    this.root = el("aside", { class: "lab-panel lab-panel--right glass", attrs: { "aria-label": "Air and light" } }, [
      el("div", { class: "sheet-handle", attrs: { "aria-hidden": "true" } }),
      el("div", { class: "panel-head" }, [
        el("h2", { text: "Air & light" }),
        el("span", { class: "panel-head__sub", text: "Fan, projection, latency" }),
      ]),
      el("div", { class: "panel-scroll" }, [
        el("section", { class: "panel-section" }, [
          this.speedSlider.root,
          this.diameterSlider.root,
          el("div", { class: "field" }, [this.fanType.root]),
          this.turbulenceSlider.root,
          derived,
        ]),
        el("section", { class: "panel-section" }, [
          el("div", { class: "section-row" }, [el("h3", { class: "section-label" }, [svg(ICONS.projection), "Projection look"]), this.lookValue]),
          lookGrid,
          el("div", { class: "inline-field" }, [
            el("span", { class: "field__label", attrs: { "data-tip": "How many projectors surround the shape. With one, the far side stays dark and hollows fall into shadow.", "data-tip-align": "start" } }, [svg(ICONS.light), "Projectors"]),
            this.projectors.root,
          ]),
        ]),
        el("section", { class: "panel-section" }, [this.latencySlider.root, this.prediction.root]),
      ]),
    ]);
  }

  update(state: LabState): void {
    const { design, ui } = state;
    const fan = design.fan;
    if (Math.abs(this.speedSlider.current - fan.outletSpeedMps) > 1e-6) this.speedSlider.set(fan.outletSpeedMps);
    if (Math.abs(this.diameterSlider.current - fan.diameterM) > 1e-6) this.diameterSlider.set(fan.diameterM);
    if (this.fanType.current !== fan.type) this.fanType.set(fan.type);
    if (Math.abs(this.turbulenceSlider.current - fan.turbulence) > 1e-6) this.turbulenceSlider.set(fan.turbulence);
    for (const [id, button] of this.lookButtons) {
      const active = id === ui.lookId;
      setAttr(button, "aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    setText(this.lookValue, LAB_LOOKS.find((look) => look.id === ui.lookId)?.name ?? "");
    const count = String(ui.projectorCount) as "1" | "2" | "3" | "4" | "5";
    if (this.projectors.current !== count) this.projectors.set(count);
    if (Math.abs(this.latencySlider.current - ui.latencyMs) > 1e-6) this.latencySlider.set(ui.latencyMs);
    this.prediction.set(ui.prediction);
    this.drawDiagram(fan.diameterM, design.sizeM);
    this.renderSpeedHint(fan.outletSpeedMps);
  }

  updateDerived(fan: FanDerived): void {
    const flow = formatFlow(fan.flowM3s);
    const power = formatPower(fan.electricalPowerW);
    const rpm = formatRpm(fan.approxRpm);
    replaceValue(this.flowValue, flow.value, flow.unit);
    replaceValue(this.powerValue, power.value, power.unit);
    replaceValue(this.rpmValue, rpm.value, rpm.unit);
  }

  updateAnalysis(analysis: DesignAnalysis | null, outletSpeed: number): void {
    this.minimumSpeed = analysis?.minimumOutletSpeedMps ?? null;
    this.renderSpeedHint(outletSpeed);
  }

  /** Live misregistration readout, called at ~10 Hz. */
  updateMisregistration(errorM: number, sizeM: number): void {
    const mm = errorM * 1000;
    const text = mm < 10 ? `${mm.toFixed(1)} mm` : `${mm.toFixed(0)} mm`;
    setText(this.misregValue, text);
    const relative = errorM / Math.max(sizeM, 0.05);
    const width = Math.min(100, (relative / 0.1) * 100);
    this.misregFill.style.width = `${width.toFixed(1)}%`;
    this.misregFill.style.background = relative < 0.01 ? "var(--stable)" : relative < 0.03 ? "var(--wobbly)" : "var(--fail)";
  }

  private renderSpeedHint(outletSpeed: number): void {
    const minimum = this.minimumSpeed;
    let text: string;
    if (minimum === null) text = "No outlet speed on this fan lifts it";
    else if (outletSpeed < minimum) text = `Needs at least ${minimum.toFixed(1)} m/s to lift off`;
    else text = `Lifts off from ${minimum.toFixed(1)} m/s`;
    setText(this.speedHint, text);
  }

  private drawDiagram(diameterM: number, sizeM: number): void {
    // Side view to scale: floor, fan housing with its cyan outlet, the jet plume,
    // and the shape (white) sitting on the jet. The fan keeps a 3 px minimum so
    // it never disappears next to a very large shape.
    const floorY = 38;
    const fanTop = floorY - 6;
    const gap = 5;
    const scale = Math.min(44 / Math.max(diameterM, sizeM), (fanTop - gap - 2) / sizeM);
    const fanW = Math.max(3, diameterM * scale);
    const bodyD = Math.max(3, sizeM * scale);
    const cx = 38;
    const bodyCy = fanTop - gap - bodyD / 2;
    const bodyBottom = bodyCy + bodyD / 2;
    const plumeTop = Math.min(bodyD * 0.9, fanW * 1.9);
    const ratio = sizeM / Math.max(diameterM, 1e-3);
    const text = ratio >= 1.15
      ? `Shape is ${ratio.toFixed(1)}× the outlet width`
      : ratio <= 0.87
        ? `Outlet is ${(1 / ratio).toFixed(1)}× the shape width`
        : "Shape about as wide as the outlet";
    if (this.ratioText.textContent !== text) this.ratioText.textContent = text;
    const f = (v: number) => v.toFixed(1);
    const markup = `
      <defs><linearGradient id="fan-plume" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="currentColor" stop-opacity=".55"/>
        <stop offset="1" stop-color="currentColor" stop-opacity=".08"/>
      </linearGradient></defs>
      <line x1="4" y1="${floorY}" x2="72" y2="${floorY}" stroke="#e8eef2" stroke-opacity=".14" stroke-width="1"/>
      <path d="M${f(cx - fanW / 2)} ${fanTop} L${f(cx + fanW / 2)} ${fanTop} L${f(cx + plumeTop / 2)} ${f(bodyBottom)} L${f(cx - plumeTop / 2)} ${f(bodyBottom)} Z" fill="url(#fan-plume)"/>
      <rect x="${f(cx - fanW / 2 - 1)}" y="${fanTop}" width="${f(fanW + 2)}" height="${floorY - fanTop}" rx="1.2" fill="#1b2630" stroke="#e8eef2" stroke-opacity=".18" stroke-width=".6"/>
      <rect x="${f(cx - fanW / 2)}" y="${fanTop - 0.6}" width="${f(fanW)}" height="1.6" rx=".8" fill="currentColor"/>
      <circle cx="${cx}" cy="${f(bodyCy)}" r="${f(bodyD / 2)}" fill="#e8eef2" fill-opacity=".92"/>`;
    if (this.diagram.dataset.key !== `${diameterM}|${sizeM}`) {
      this.diagram.dataset.key = `${diameterM}|${sizeM}`;
      this.diagram.innerHTML = markup;
    }
  }
}
