/** Tiny observable store for the Levitation Lab, with safe local persistence. */
import type { DesignConfig, FanConfig } from "../model";
import { DEFAULT_DESIGN, normaliseDesign } from "../model";
import { DEFAULT_LOOK_ID, LAB_LOOKS } from "../looks";

export type ViewMode = "projection" | "pressure" | "material";

export interface UiState {
  view: ViewMode;
  showAir: boolean;
  showForces: boolean;
  showTracking: boolean;
  lookId: string;
  projectorCount: number;
  latencyMs: number;
  prediction: boolean;
  paused: boolean;
  /** The preset the design came from, until the user changes something. */
  presetId: string | null;
}

export interface LabState {
  design: DesignConfig;
  ui: UiState;
}

export type DesignPatch = Partial<Omit<DesignConfig, "fan">> & { fan?: Partial<FanConfig> };

export const DEFAULT_UI: UiState = {
  view: "projection",
  showAir: true,
  showForces: false,
  showTracking: true,
  lookId: DEFAULT_LOOK_ID,
  projectorCount: 3,
  latencyMs: 24,
  prediction: true,
  paused: false,
  presetId: "orbital-3m",
};

const STORAGE_KEY = "orbital.levitationLab.v1";
const GUIDE_KEY = "orbital.levitationLab.guideSeen";

type Listener = (state: LabState, previous: LabState) => void;

export class Store {
  private state: LabState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: LabState) {
    this.state = initial;
  }

  get(): LabState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setDesign(patch: DesignPatch, presetId: string | null = null): void {
    const current = this.state.design;
    const design = normaliseDesign({
      ...current,
      ...patch,
      fan: { ...current.fan, ...(patch.fan ?? {}) },
    });
    this.commit({ design, ui: { ...this.state.ui, presetId } });
  }

  replaceDesign(design: DesignConfig, presetId: string | null): void {
    this.commit({ design: normaliseDesign(design), ui: { ...this.state.ui, presetId } });
  }

  setUi(patch: Partial<UiState>): void {
    this.commit({ design: this.state.design, ui: { ...this.state.ui, ...patch } });
  }

  private commit(next: LabState): void {
    const previous = this.state;
    this.state = next;
    for (const listener of this.listeners) listener(next, previous);
    persist(next);
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function persist(state: LabState): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const { paused: _paused, ...ui } = state.ui;
    void _paused;
    storage.setItem(STORAGE_KEY, JSON.stringify({ design: state.design, ui }));
  } catch {
    // Private mode or quota: the lab still works, it just will not remember.
  }
}

export function loadInitialState(): LabState {
  const fallback: LabState = { design: normaliseDesign(DEFAULT_DESIGN), ui: { ...DEFAULT_UI } };
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { design?: Partial<DesignConfig>; ui?: Partial<UiState> };
    const design = normaliseDesign(parsed.design ?? {});
    return { design, ui: sanitiseUi(parsed.ui ?? {}) };
  } catch {
    return fallback;
  }
}

export function sanitiseUi(input: Partial<UiState>): UiState {
  const ui = { ...DEFAULT_UI };
  if (input.view === "projection" || input.view === "pressure" || input.view === "material") ui.view = input.view;
  if (typeof input.showAir === "boolean") ui.showAir = input.showAir;
  if (typeof input.showForces === "boolean") ui.showForces = input.showForces;
  if (typeof input.showTracking === "boolean") ui.showTracking = input.showTracking;
  if (typeof input.lookId === "string" && LAB_LOOKS.some((look) => look.id === input.lookId)) ui.lookId = input.lookId;
  if (typeof input.projectorCount === "number" && Number.isFinite(input.projectorCount)) {
    ui.projectorCount = Math.min(5, Math.max(1, Math.round(input.projectorCount)));
  }
  if (typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)) {
    ui.latencyMs = Math.min(120, Math.max(0, Math.round(input.latencyMs)));
  }
  if (typeof input.prediction === "boolean") ui.prediction = input.prediction;
  if (typeof input.presetId === "string" || input.presetId === null) ui.presetId = input.presetId ?? null;
  return ui;
}

export function guideSeen(): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    return storage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGuideSeen(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(GUIDE_KEY, "1");
  } catch {
    // ignore
  }
}
