/**
 * Plain-language number formatting for the Levitation Lab UI. Pure functions,
 * no DOM, so they can be unit tested.
 */

export interface Formatted {
  value: string;
  unit: string;
}

function finite(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** Metres, switching to centimetres or millimetres for small values. */
export function formatLength(metres: number, digits = 2): Formatted {
  if (!finite(metres)) return { value: "–", unit: "" };
  const abs = Math.abs(metres);
  if (abs < 0.01) return { value: (metres * 1000).toFixed(abs < 0.001 ? 1 : 0), unit: "mm" };
  if (abs < 1) return { value: (metres * 100).toFixed(abs < 0.1 ? 1 : 0), unit: "cm" };
  return { value: metres.toFixed(digits), unit: "m" };
}

/** Mass in grams below a kilogram, kilograms above. */
export function formatMass(kg: number): Formatted {
  if (!finite(kg)) return { value: "–", unit: "" };
  const abs = Math.abs(kg);
  if (abs < 0.01) return { value: (kg * 1000).toFixed(1), unit: "g" };
  if (abs < 1) return { value: (kg * 1000).toFixed(0), unit: "g" };
  if (abs < 10) return { value: kg.toFixed(2), unit: "kg" };
  return { value: kg.toFixed(1), unit: "kg" };
}

export function formatForce(newtons: number): Formatted {
  if (!finite(newtons)) return { value: "–", unit: "" };
  const abs = Math.abs(newtons);
  if (abs < 0.01) return { value: (newtons * 1000).toFixed(1), unit: "mN" };
  if (abs < 1) return { value: (newtons * 1000).toFixed(0), unit: "mN" };
  if (abs < 100) return { value: newtons.toFixed(abs < 10 ? 2 : 1), unit: "N" };
  return { value: newtons.toFixed(0), unit: "N" };
}

export function formatSpeed(mps: number): Formatted {
  if (!finite(mps)) return { value: "–", unit: "" };
  return { value: mps.toFixed(mps < 10 ? 1 : 0), unit: "m/s" };
}

export function formatPower(watts: number): Formatted {
  if (!finite(watts)) return { value: "–", unit: "" };
  if (Math.abs(watts) < 1000) return { value: watts.toFixed(0), unit: "W" };
  return { value: (watts / 1000).toFixed(watts < 10000 ? 2 : 1), unit: "kW" };
}

export function formatFlow(m3s: number): Formatted {
  if (!finite(m3s)) return { value: "–", unit: "" };
  if (m3s < 0.1) return { value: (m3s * 1000).toFixed(0), unit: "L/s" };
  return { value: m3s.toFixed(m3s < 10 ? 2 : 1), unit: "m³/s" };
}

export function formatRpm(rpm: number): Formatted {
  if (!finite(rpm)) return { value: "–", unit: "" };
  const rounded = rpm >= 1000 ? Math.round(rpm / 10) * 10 : Math.round(rpm);
  return { value: `≈${rounded.toLocaleString("en-AU")}`, unit: "rpm" };
}

export function formatHz(hz: number | null): string {
  if (hz === null || !finite(hz)) return "–";
  return `${hz.toFixed(hz < 10 ? 1 : 0)} Hz`;
}

export function joinFormatted(formatted: Formatted): string {
  return formatted.unit ? `${formatted.value} ${formatted.unit}` : formatted.value;
}

/** A friendly real-world comparison for the design size (largest horizontal extent). */
export function humanScale(sizeM: number): string {
  const scale: Array<[number, string]> = [
    [0.14, "about a grapefruit"],
    [0.26, "about a football"],
    [0.45, "about a beach ball"],
    [0.8, "about an exercise ball"],
    [1.3, "about waist height on an adult"],
    [1.65, "about shoulder height"],
    [1.95, "about a person's height"],
    [2.6, "taller than a person"],
    [3.4, "Orbital's 3 m sphere scale"],
    [4.3, "about the length of a small car"],
  ];
  for (const [limit, label] of scale) {
    if (sizeM < limit) return label;
  }
  return "about the height of a double-decker bus";
}

// ---------------------------------------------------------------------------
// Slider mappings
// ---------------------------------------------------------------------------

export interface LogRange {
  min: number;
  max: number;
}

/** Map a 0..1 slider position onto a logarithmic range. */
export function fromLogPosition(position: number, range: LogRange): number {
  const t = Math.min(1, Math.max(0, position));
  return range.min * Math.pow(range.max / range.min, t);
}

/** Inverse of fromLogPosition. */
export function toLogPosition(value: number, range: LogRange): number {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  return Math.log(clamped / range.min) / Math.log(range.max / range.min);
}

/** Round to a pleasant step that grows with magnitude. */
export function snapNice(value: number): number {
  if (!finite(value)) return value;
  const abs = Math.abs(value);
  const step = abs < 0.5 ? 0.01 : abs < 2 ? 0.02 : abs < 5 ? 0.05 : abs < 20 ? 0.1 : 0.5;
  return Math.round(value / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 0..100 score to a three-level tone used by tiles and pips. */
export function scoreTone(score: number): "good" | "ok" | "poor" {
  if (score >= 70) return "good";
  if (score >= 45) return "ok";
  return "poor";
}

/** 0..1 quality to a 0..3 pip count. */
export function pipCount(quality: number): number {
  if (!finite(quality)) return 0;
  return clamp(Math.round(quality * 3), 0, 3);
}
