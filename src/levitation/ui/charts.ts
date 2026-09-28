/** Small canvas charts for the dock: live sparkline and the levitation envelope. */
import type { LevitationEnvelope, Verdict } from "../model";

export const VERDICT_LABELS: Record<Verdict, string> = {
  "stable-hover": "Hovers steadily",
  "wobbly-hover": "Hovers, but wobbles",
  "too-heavy": "Too heavy to lift",
  "blown-to-ceiling": "Blown to the ceiling",
  "unstable-tumble": "Tumbles over",
  "escapes-jet": "Escapes the jet",
  buoyant: "Floats on its own",
};

export type VerdictTone = "stable" | "wobbly" | "fail" | "buoyant";

export function verdictTone(verdict: Verdict): VerdictTone {
  if (verdict === "stable-hover") return "stable";
  if (verdict === "wobbly-hover") return "wobbly";
  if (verdict === "buoyant") return "buoyant";
  return "fail";
}

const TONE_RGB: Record<VerdictTone, [number, number, number]> = {
  stable: [124, 243, 198],
  wobbly: [255, 209, 102],
  fail: [255, 107, 107],
  buoyant: [182, 156, 255],
};

function fitCanvas(canvas: HTMLCanvasElement): { width: number; height: number; ratio: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  return { width, height, ratio };
}

// ---------------------------------------------------------------------------
// Sparkline: height and lateral offset over the last ten seconds
// ---------------------------------------------------------------------------

export class Sparkline {
  private readonly capacity = 720;
  private readonly times = new Float32Array(this.capacity);
  private readonly heights = new Float32Array(this.capacity);
  private readonly offsets = new Float32Array(this.capacity);
  private head = 0;
  private count = 0;
  private readonly ctx: CanvasRenderingContext2D | null;
  private lastPush = -1;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly windowS = 10) {
    this.ctx = canvas.getContext("2d");
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.lastPush = -1;
  }

  push(timeS: number, heightM: number, offsetM: number): void {
    if (this.lastPush >= 0 && timeS < this.lastPush) this.clear();
    if (this.lastPush >= 0 && timeS - this.lastPush < 1 / 60) return;
    this.lastPush = timeS;
    this.times[this.head] = timeS;
    this.heights[this.head] = heightM;
    this.offsets[this.head] = offsetM;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  draw(scaleM: number): void {
    const ctx = this.ctx;
    if (!ctx || this.canvas.clientWidth === 0) return;
    const { width, height, ratio } = fitCanvas(this.canvas);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Frame and midline.
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(height / 2) + 0.5);
    ctx.lineTo(width, Math.round(height / 2) + 0.5);
    ctx.stroke();
    if (this.count < 2) return;
    const newest = this.times[(this.head - 1 + this.capacity) % this.capacity];
    const start = newest - this.windowS;
    let minH = Infinity;
    let maxH = -Infinity;
    let maxO = 0;
    for (let i = 0; i < this.count; i += 1) {
      const index = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.times[index] < start) break;
      minH = Math.min(minH, this.heights[index]);
      maxH = Math.max(maxH, this.heights[index]);
      maxO = Math.max(maxO, this.offsets[index]);
    }
    const span = Math.max(maxH - minH, scaleM * 0.25, 0.05);
    const mid = (maxH + minH) / 2;
    const lowH = mid - span * 0.62;
    const highH = mid + span * 0.62;
    const topO = Math.max(maxO * 1.25, scaleM * 0.05, 0.01);
    const pad = 4;
    const plot = (values: Float32Array, map: (v: number) => number, colour: string, widthPx: number) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = widthPx;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let first = true;
      for (let i = this.count - 1; i >= 0; i -= 1) {
        const index = (this.head - 1 - i + this.capacity) % this.capacity;
        const t = this.times[index];
        if (t < start) continue;
        const x = ((t - start) / this.windowS) * width;
        const y = pad + (1 - map(values[index])) * (height - pad * 2);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };
    plot(this.offsets, (v) => Math.min(1, v / topO), "rgba(255,180,94,0.85)", 1.25);
    plot(this.heights, (v) => (v - lowH) / (highH - lowH), "rgba(94,231,255,0.95)", 1.6);
  }
}

// ---------------------------------------------------------------------------
// Envelope map: verdict over outlet speed x size, with the current design
// ---------------------------------------------------------------------------

export interface EnvelopePick {
  speedMps: number;
  sizeM: number;
}

export class EnvelopeMap {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly cells = document.createElement("canvas");
  private envelope: LevitationEnvelope | null = null;
  private current: EnvelopePick = { speedMps: 8, sizeM: 1 };
  private hover: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tip: HTMLElement,
    private readonly onPick: (pick: EnvelopePick) => void,
  ) {
    this.ctx = canvas.getContext("2d");
    canvas.addEventListener("pointermove", (event) => {
      this.hover = { x: event.offsetX, y: event.offsetY };
      this.showTip(event.clientX, event.clientY);
      this.draw();
    });
    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      this.tip.dataset.visible = "false";
      this.draw();
    });
    canvas.addEventListener("click", (event) => {
      const pick = this.pickAt(event.offsetX, event.offsetY);
      if (pick) this.onPick(pick);
    });
    canvas.addEventListener("keydown", (event) => this.onKey(event));
  }

  setEnvelope(envelope: LevitationEnvelope | null): void {
    this.envelope = envelope;
    this.paintCells();
    this.draw();
  }

  setCurrent(current: EnvelopePick): void {
    this.current = current;
    this.draw();
  }

  draw(): void {
    const ctx = this.ctx;
    if (!ctx || this.canvas.clientWidth === 0) return;
    const { width, height, ratio } = fitCanvas(this.canvas);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(0, 0, width, height);
    if (this.envelope && this.cells.width > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.cells, 0, 0, width, height);
    } else {
      ctx.fillStyle = "rgba(138,151,163,0.7)";
      ctx.font = "500 10.5px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Mapping…", width / 2, height / 2 + 3);
      ctx.textAlign = "left";
    }
    // Axis hints.
    ctx.font = "500 9.5px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(232,238,242,0.55)";
    if (this.envelope) {
      const speeds = this.envelope.speedsMps;
      const sizes = this.envelope.sizesM;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 3;
      ctx.textBaseline = "top";
      ctx.fillText(`${trim(sizes[sizes.length - 1])} m`, 4, 3);
      ctx.textBaseline = "bottom";
      ctx.fillText(`${trim(sizes[0])} m`, 4, height - 2);
      ctx.textAlign = "right";
      ctx.fillText(`${trim(speeds[speeds.length - 1])} m/s`, width - 4, height - 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.shadowBlur = 0;
    }
    // Current design crosshair.
    const point = this.toCanvas(this.current, width, height);
    if (point) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(point.x, 0);
      ctx.lineTo(point.x, height);
      ctx.moveTo(0, point.y);
      ctx.lineTo(width, point.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#05070a";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (this.hover) {
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.hover.x, this.hover.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private paintCells(): void {
    const envelope = this.envelope;
    if (!envelope) return;
    const columns = envelope.speedsMps.length;
    const rows = envelope.sizesM.length;
    this.cells.width = columns;
    this.cells.height = rows;
    const ctx = this.cells.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(columns, rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cell = envelope.cells[row]?.[column];
        const index = ((rows - 1 - row) * columns + column) * 4;
        if (!cell) continue;
        const tone = verdictTone(cell.verdict);
        const [r, g, b] = TONE_RGB[tone];
        const strength = tone === "fail" ? 0.13 : 0.4 + 0.5 * Math.min(1, Math.max(0, cell.score / 100));
        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] = Math.round(strength * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  private toCanvas(pick: EnvelopePick, width: number, height: number): { x: number; y: number } | null {
    const envelope = this.envelope;
    if (!envelope) return null;
    const speeds = envelope.speedsMps;
    const sizes = envelope.sizesM;
    const fx = logFraction(pick.speedMps, speeds[0], speeds[speeds.length - 1]);
    const fy = logFraction(pick.sizeM, sizes[0], sizes[sizes.length - 1]);
    // Cells are drawn as texels: centre of the first texel maps to the first sample.
    const x = ((fx * (speeds.length - 1) + 0.5) / speeds.length) * width;
    const y = height - ((fy * (sizes.length - 1) + 0.5) / sizes.length) * height;
    return { x: clampNumber(x, 0, width), y: clampNumber(y, 0, height) };
  }

  private pickAt(x: number, y: number): EnvelopePick | null {
    const envelope = this.envelope;
    if (!envelope) return null;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const speeds = envelope.speedsMps;
    const sizes = envelope.sizesM;
    const fx = clampNumber(((x / width) * speeds.length - 0.5) / (speeds.length - 1), 0, 1);
    const fy = clampNumber((((height - y) / height) * sizes.length - 0.5) / (sizes.length - 1), 0, 1);
    return {
      speedMps: speeds[0] * Math.pow(speeds[speeds.length - 1] / speeds[0], fx),
      sizeM: sizes[0] * Math.pow(sizes[sizes.length - 1] / sizes[0], fy),
    };
  }

  private cellAt(x: number, y: number) {
    const envelope = this.envelope;
    if (!envelope) return null;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const column = clampNumber(Math.floor((x / width) * envelope.speedsMps.length), 0, envelope.speedsMps.length - 1);
    const row = clampNumber(Math.floor(((height - y) / height) * envelope.sizesM.length), 0, envelope.sizesM.length - 1);
    return envelope.cells[row]?.[column] ?? null;
  }

  private showTip(clientX: number, clientY: number): void {
    if (!this.hover) return;
    const pick = this.pickAt(this.hover.x, this.hover.y);
    const cell = this.cellAt(this.hover.x, this.hover.y);
    if (!pick || !cell) {
      this.tip.dataset.visible = "false";
      return;
    }
    const tone = verdictTone(cell.verdict);
    const colour = tone === "stable" ? "var(--stable)" : tone === "wobbly" ? "var(--wobbly)" : tone === "buoyant" ? "var(--buoyant)" : "var(--fail)";
    this.tip.innerHTML = "";
    const title = document.createElement("b");
    title.textContent = VERDICT_LABELS[cell.verdict];
    title.style.color = colour;
    const detail = document.createElement("div");
    detail.textContent = `${pick.speedMps.toFixed(pick.speedMps < 10 ? 1 : 0)} m/s air, ${pick.sizeM.toFixed(2)} m wide. Click to try it.`;
    detail.style.color = "var(--muted)";
    this.tip.append(title, detail);
    this.tip.style.left = `${clientX}px`;
    this.tip.style.top = `${clientY}px`;
    this.tip.dataset.visible = "true";
  }

  private onKey(event: KeyboardEvent): void {
    const envelope = this.envelope;
    if (!envelope) return;
    const speeds = envelope.speedsMps;
    const sizes = envelope.sizesM;
    const speedStep = Math.pow(speeds[speeds.length - 1] / speeds[0], 1 / (speeds.length - 1));
    const sizeStep = Math.pow(sizes[sizes.length - 1] / sizes[0], 1 / (sizes.length - 1));
    let { speedMps, sizeM } = this.current;
    if (event.key === "ArrowRight") speedMps *= speedStep;
    else if (event.key === "ArrowLeft") speedMps /= speedStep;
    else if (event.key === "ArrowUp") sizeM *= sizeStep;
    else if (event.key === "ArrowDown") sizeM /= sizeStep;
    else return;
    event.preventDefault();
    this.onPick({
      speedMps: clampNumber(speedMps, speeds[0], speeds[speeds.length - 1]),
      sizeM: clampNumber(sizeM, sizes[0], sizes[sizes.length - 1]),
    });
  }
}

function logFraction(value: number, min: number, max: number): number {
  if (!(max > min) || !(value > 0)) return 0;
  return clampNumber(Math.log(value / min) / Math.log(max / min), 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function trim(value: number): string {
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return Number(value.toFixed(1)).toString();
  return Number(value.toFixed(2)).toString();
}
