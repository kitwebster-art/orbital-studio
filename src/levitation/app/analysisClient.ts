/**
 * Debounced, latest-wins analysis requests. Uses a module worker when the
 * browser allows it, and falls back to the main thread otherwise.
 */
import { analyseDesign, levitationEnvelope } from "../model";
import type { DesignAnalysis, DesignConfig, LevitationEnvelope } from "../model";

export type AnalysisRequest =
  | { id: number; type: "analyse"; design: DesignConfig }
  | { id: number; type: "envelope"; design: DesignConfig; speeds: number[]; sizes: number[] };

export type AnalysisResponse =
  | { id: number; type: "analyse"; analysis: DesignAnalysis }
  | { id: number; type: "envelope"; envelope: LevitationEnvelope }
  | { id: number; type: "error"; message: string };

export function logSpace(min: number, max: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => min * Math.pow(max / min, index / (count - 1)));
}

export const ENVELOPE_SPEEDS = logSpace(0.8, 30, 36);
export const ENVELOPE_SIZES = logSpace(0.1, 5, 26);

export class AnalysisClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private latestAnalyse = 0;
  private latestEnvelope = 0;
  private analyseTimer = 0;
  private envelopeTimer = 0;

  constructor(
    private readonly onAnalysis: (analysis: DesignAnalysis) => void,
    private readonly onEnvelope: (envelope: LevitationEnvelope) => void,
  ) {
    try {
      this.worker = new Worker(new URL("./analysisWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<AnalysisResponse>) => this.receive(event.data);
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  /** Debounced analysis of the latest design (default 120 ms). */
  requestAnalysis(design: DesignConfig, delayMs = 120): void {
    window.clearTimeout(this.analyseTimer);
    this.analyseTimer = window.setTimeout(() => this.send({ id: this.nextId++, type: "analyse", design }), delayMs);
  }

  /** Debounced envelope (it is the heaviest job, so it waits a little longer). */
  requestEnvelope(design: DesignConfig, delayMs = 150): void {
    window.clearTimeout(this.envelopeTimer);
    this.envelopeTimer = window.setTimeout(
      () => this.send({ id: this.nextId++, type: "envelope", design, speeds: ENVELOPE_SPEEDS, sizes: ENVELOPE_SIZES }),
      delayMs,
    );
  }

  dispose(): void {
    window.clearTimeout(this.analyseTimer);
    window.clearTimeout(this.envelopeTimer);
    this.worker?.terminate();
    this.worker = null;
  }

  private send(request: AnalysisRequest): void {
    if (request.type === "analyse") this.latestAnalyse = request.id;
    else this.latestEnvelope = request.id;
    if (this.worker) {
      this.worker.postMessage(request);
      return;
    }
    // Main-thread fallback, deferred so input handlers return first.
    window.setTimeout(() => {
      try {
        if (request.type === "analyse") {
          this.receive({ id: request.id, type: "analyse", analysis: analyseDesign(request.design) });
        } else {
          this.receive({
            id: request.id,
            type: "envelope",
            envelope: levitationEnvelope(request.design, request.speeds, request.sizes),
          });
        }
      } catch (error) {
        console.warn("Levitation analysis failed", error);
      }
    }, 0);
  }

  private receive(response: AnalysisResponse): void {
    if (response.type === "analyse") {
      if (response.id === this.latestAnalyse) this.onAnalysis(response.analysis);
    } else if (response.type === "envelope") {
      if (response.id === this.latestEnvelope) this.onEnvelope(response.envelope);
    } else {
      console.warn("Levitation analysis failed:", response.message);
    }
  }
}
