/** Bottom dock: verdict, metric tiles, live sparkline and the envelope map. */
import type { DesignAnalysis, LevitationEnvelope } from "../model";
import { formatHz, formatLength, formatMass, formatForce, scoreTone } from "../format";
import { EnvelopeMap, Sparkline, verdictTone, type EnvelopePick } from "./charts";
import { el, replaceValue, setAttr, setText, svg } from "./dom";
import { ICONS, type IconName } from "./icons";

/** Short enough for the tile's sub-label at every layout width. */
const NO_HOVER_REASON: Partial<Record<DesignAnalysis["verdict"], string>> = {
  "too-heavy": "stays on the fan",
  "blown-to-ceiling": "hits the ceiling",
  "unstable-tumble": "never settles",
  "escapes-jet": "leaves the jet",
  buoyant: "floats away",
};

interface MetricTile {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  sub: HTMLSpanElement;
}

export class Dock {
  readonly root: HTMLElement;
  readonly sparkline: Sparkline;
  readonly envelope: EnvelopeMap;
  readonly envelopeTip: HTMLDivElement;
  private readonly verdictCell: HTMLDivElement;
  private readonly chip: HTMLSpanElement;
  private readonly chipLabel: HTMLSpanElement;
  private readonly summary: HTMLParagraphElement;
  private readonly metrics = new Map<string, MetricTile>();
  private readonly liveHeight: HTMLSpanElement;
  private readonly liveOffset: HTMLSpanElement;

  constructor(onPick: (pick: EnvelopePick) => void) {
    this.chipLabel = el("span", { text: "Analysing…" });
    this.chip = el("span", { class: "verdict-chip", attrs: { tabindex: 0, "data-tip-align": "start" } }, [
      el("span", { class: "verdict-chip__dot", attrs: { "aria-hidden": "true" } }),
      this.chipLabel,
    ]);
    this.summary = el("p", { class: "verdict-summary", attrs: { "aria-live": "polite" } });
    this.verdictCell = el("div", { class: "dock-cell dock-verdict", dataset: { tone: "stable" } }, [this.chip, this.summary]);

    const metricsCell = el("div", { class: "dock-cell dock-metrics", attrs: { role: "list", "aria-label": "Results" } });
    const addMetric = (id: string, label: string, icon: IconName, tip: string) => {
      const value = el("span", { class: "metric__value" });
      const sub = el("span", { class: "metric__sub" });
      const root = el("div", {
        class: "metric",
        attrs: { role: "listitem", "data-tip": tip, tabindex: 0 },
      }, [
        el("span", { class: "metric__label" }, [svg(ICONS[icon]), label]),
        value,
        sub,
      ]);
      this.metrics.set(id, { root, value, sub });
      metricsCell.append(root);
    };
    addMetric("height", "Hover height", "height", "Where the shape settles above the fan outlet: the height at which the slowing jet pushes up exactly its weight.");
    addMetric("mass", "Mass", "mass", "Skin, seams and any ballast. The net weight the jet must hold up is shown underneath.");
    addMetric("margin", "Lift margin", "margin", "Jet force just above the outlet divided by the net weight. Above 1 it lifts off; 1.5 or more is comfortable.");
    addMetric("sway", "Sway", "sway", "Typical sideways wander while hovering, and how fast it rocks.");
    addMetric("projection", "Projection", "light", "0 to 100: how good a projection screen this is (colour, gloss, translucency, smooth curvature, steadiness).");
    addMetric("tracking", "Tracking", "target", "0 to 100: how reliably a camera can find it (infrared reflectance, convex outline, steadiness).");
    const metricTiles = [...this.metrics.values()].map((tile) => tile.root);
    metricTiles[3].setAttribute("data-tip-align", "end");
    metricTiles[4].setAttribute("data-tip-align", "end");
    metricTiles[5].setAttribute("data-tip-align", "end");
    metricTiles[0].setAttribute("data-tip-align", "start");

    this.liveHeight = el("span", { class: "legend-dot", style: { color: "var(--air)" }, text: "Height", attrs: { "data-tip": "Height above the outlet, auto-scaled", "data-tip-align": "end" } });
    this.liveOffset = el("span", { class: "legend-dot", style: { color: "var(--light)" }, text: "Drift", attrs: { "data-tip": "Sideways distance from the jet's centre line", "data-tip-align": "end" } });
    const sparkCanvas = el("canvas", { class: "dock-canvas", attrs: { "aria-label": "Height and sideways offset over the last 10 seconds", role: "img" } });
    this.sparkline = new Sparkline(sparkCanvas);
    const sparkCell = el("div", { class: "dock-cell dock-mini" }, [
      el("div", { class: "dock-mini__head" }, [el("span", { class: "dock-mini__title", text: "Last 10 s" }), el("span", { class: "dock-mini__legend" }, [this.liveHeight, this.liveOffset])]),
      sparkCanvas,
    ]);

    const envelopeCanvas = el("canvas", {
      attrs: {
        tabindex: 0,
        role: "img",
        "aria-label": "Levitation envelope: verdict for every outlet speed and size. Arrow keys move the design, click to choose.",
      },
    });
    this.envelopeTip = el("div", { class: "envelope-tip", attrs: { role: "tooltip" } });
    this.envelope = new EnvelopeMap(envelopeCanvas, this.envelopeTip, onPick);
    const envelopeCell = el("div", { class: "dock-cell dock-mini" }, [
      el("div", { class: "dock-mini__head" }, [
        el("span", { text: "Envelope", attrs: { "data-tip": "Every combination of outlet air speed (across) and size (up) for this shape, material and fan. Green hovers steadily, yellow wobbles, red fails. The ring is your design.", "data-tip-align": "end" } }),
        el("span", { class: "dock-mini__axes", text: "air speed → · size ↑" }),
      ]),
      el("div", { class: "envelope-wrap" }, [envelopeCanvas]),
    ]);

    this.root = el("footer", { class: "lab-dock glass", attrs: { "aria-label": "Results" } }, [
      el("div", { class: "sheet-handle", attrs: { "aria-hidden": "true" } }),
      this.verdictCell,
      metricsCell,
      sparkCell,
      envelopeCell,
    ]);
    document.body.append(this.envelopeTip);
  }

  updateAnalysis(analysis: DesignAnalysis): void {
    const tone = verdictTone(analysis.verdict);
    setAttr(this.verdictCell, "data-tone", tone);
    setText(this.chipLabel, analysis.verdictLabel);
    setText(this.summary, analysis.summary);
    const reasons = analysis.reasons.slice(0, 4).map((reason) => `• ${reason}`).join("\n");
    setAttr(this.chip, "data-tip", reasons || analysis.summary);

    const height = this.metrics.get("height");
    if (height) {
      const hovers = analysis.verdict === "stable-hover" || analysis.verdict === "wobbly-hover";
      if (hovers && analysis.equilibriumHeightM !== null) {
        const f = formatLength(analysis.equilibriumHeightM);
        replaceValue(height.value, f.value, f.unit);
        setText(height.sub, "above the outlet");
      } else {
        // A balance height the body never holds is not a hover height.
        replaceValue(height.value, "–", "");
        setText(height.sub, NO_HOVER_REASON[analysis.verdict] ?? "no steady hover");
      }
    }
    const mass = this.metrics.get("mass");
    if (mass) {
      const f = formatMass(analysis.properties.massKg);
      replaceValue(mass.value, f.value, f.unit);
      const weight = formatForce(analysis.properties.netWeightN);
      setText(mass.sub, analysis.properties.netWeightN > 0 ? `net ${weight.value} ${weight.unit}` : "lighter than air");
    }
    const margin = this.metrics.get("margin");
    if (margin) {
      const value = analysis.liftMargin;
      replaceValue(margin.value, Number.isFinite(value) ? value.toFixed(value < 10 ? 2 : 0) : "∞", "×");
      margin.root.dataset.tone = value >= 1.5 ? "good" : value >= 1 ? "ok" : "poor";
      setText(margin.sub, analysis.minimumOutletSpeedMps !== null ? `lifts at ${analysis.minimumOutletSpeedMps.toFixed(1)} m/s` : "never lifts");
    }
    const sway = this.metrics.get("sway");
    if (sway) {
      if (analysis.swayAmplitudeM !== null) {
        const f = formatLength(analysis.swayAmplitudeM);
        replaceValue(sway.value, `±${f.value}`, f.unit);
        setText(sway.sub, analysis.swayHz !== null ? `rocks at ${formatHz(analysis.swayHz)}` : "");
      } else {
        replaceValue(sway.value, "–", "");
        setText(sway.sub, "not hovering");
      }
    }
    const projection = this.metrics.get("projection");
    if (projection) {
      replaceValue(projection.value, Math.round(analysis.projectionScore).toString(), "/100");
      projection.root.dataset.tone = scoreTone(analysis.projectionScore);
      setText(projection.sub, scoreWord(analysis.projectionScore));
    }
    const tracking = this.metrics.get("tracking");
    if (tracking) {
      replaceValue(tracking.value, Math.round(analysis.trackingScore).toString(), "/100");
      tracking.root.dataset.tone = scoreTone(analysis.trackingScore);
      setText(tracking.sub, scoreWord(analysis.trackingScore));
    }
  }

  setEnvelope(envelope: LevitationEnvelope | null): void {
    this.envelope.setEnvelope(envelope);
  }

  setLive(heightM: number, offsetM: number): void {
    const h = formatLength(heightM);
    const o = formatLength(offsetM);
    setAttr(this.liveHeight, "aria-label", `Height ${h.value} ${h.unit}`);
    setAttr(this.liveOffset, "aria-label", `Drift ${o.value} ${o.unit}`);
  }
}

function scoreWord(score: number): string {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 45) return "workable";
  if (score >= 25) return "poor";
  return "very poor";
}
