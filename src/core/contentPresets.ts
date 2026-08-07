import {
  SHOW_SCORE_SCHEMA_VERSION,
  type AudiovisualParameters,
  type ShowMovement,
  type ShowScore,
} from "./contracts";
import { clamp } from "./math";
import { loadShowScore } from "./showScore";

export const CONTENT_PRESET_SCHEMA_VERSION =
  "orbital.content-preset/1.0" as const;
export const CONTENT_PRESET_STORAGE_KEY = "orbital.content-preset.v1";

export interface ContentPreset {
  schemaVersion: typeof CONTENT_PRESET_SCHEMA_VERSION;
  title: string;
  savedAt: string;
  score: ShowScore;
}

export type CurveParameterKey = keyof AudiovisualParameters;

export interface CurveEdit {
  start?: number;
  peak?: number;
  end?: number;
  peakAt?: number;
  usePeak?: boolean;
}

export interface MovementMetadataEdit {
  name?: string;
  description?: string;
  majorPeak?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteUnit(value: number, path: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be finite`);
  }
  return clamp(value);
}

function movementIndex(score: ShowScore, movementId: string): number {
  const index = score.movements.findIndex(
    (movement) => movement.id === movementId,
  );
  if (index < 0) {
    throw new Error(`Unknown movement: ${movementId}`);
  }
  return index;
}

function cloneScore(score: ShowScore): ShowScore {
  return loadShowScore(score);
}

function baselineAt(
  movement: ShowMovement,
  key: CurveParameterKey,
  at: number,
): number {
  return movement.start[key] + (movement.end[key] - movement.start[key]) * at;
}

export function createContentPreset(
  score: ShowScore,
  savedAt = new Date().toISOString(),
): ContentPreset {
  const validated = cloneScore(score);
  return {
    schemaVersion: CONTENT_PRESET_SCHEMA_VERSION,
    title: validated.title,
    savedAt,
    score: validated,
  };
}

export function serialiseContentPreset(
  score: ShowScore,
  savedAt = new Date().toISOString(),
): string {
  return `${JSON.stringify(createContentPreset(score, savedAt), null, 2)}\n`;
}

export function parseContentPreset(source: unknown): ShowScore {
  if (!isRecord(source)) {
    throw new Error("Content preset must be an object");
  }
  if (source.schemaVersion !== CONTENT_PRESET_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported content preset schema: ${String(source.schemaVersion)}`,
    );
  }
  if (typeof source.title !== "string" || source.title.length === 0) {
    throw new Error("Content preset title must be a non-empty string");
  }
  if (typeof source.savedAt !== "string" || source.savedAt.length === 0) {
    throw new Error("Content preset savedAt must be a non-empty string");
  }
  return loadShowScore(source.score);
}

export function readStoredContentPreset(
  storage: Pick<Storage, "getItem">,
): ShowScore | null {
  try {
    const raw = storage.getItem(CONTENT_PRESET_STORAGE_KEY);
    return raw ? parseContentPreset(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeStoredContentPreset(
  storage: Pick<Storage, "setItem">,
  score: ShowScore,
  savedAt = new Date().toISOString(),
): void {
  storage.setItem(
    CONTENT_PRESET_STORAGE_KEY,
    serialiseContentPreset(score, savedAt),
  );
}

export function updateMovementCurve(
  score: ShowScore,
  movementId: string,
  key: CurveParameterKey,
  edit: CurveEdit,
): ShowScore {
  const next = cloneScore(score);
  const index = movementIndex(next, movementId);
  const current = next.movements[index];
  const movement: ShowMovement = {
    ...current,
    start: { ...current.start },
    end: { ...current.end },
    localPeak: current.localPeak ? { ...current.localPeak } : undefined,
  };

  if (edit.start !== undefined) {
    movement.start[key] = finiteUnit(edit.start, `${key}.start`);
  }
  if (edit.end !== undefined) {
    movement.end[key] = finiteUnit(edit.end, `${key}.end`);
  }

  const shouldUsePeak = edit.usePeak ?? edit.peak !== undefined;
  if (shouldUsePeak) {
    const at = clamp(edit.peakAt ?? movement.localPeak?.at ?? 0.5, 0.05, 0.95);
    const peak = finiteUnit(
      edit.peak ?? baselineAt(movement, key, at),
      `${key}.peak`,
    );
    movement.localPeak = {
      ...(movement.localPeak ?? {}),
      at,
      [key]: peak,
    };
  } else if (edit.usePeak === false && movement.localPeak) {
    const { at, [key]: _removed, ...overrides } = movement.localPeak;
    movement.localPeak = Object.keys(overrides).length > 0
      ? { at, ...overrides }
      : undefined;
  } else if (edit.peakAt !== undefined && movement.localPeak) {
    movement.localPeak.at = clamp(edit.peakAt, 0.05, 0.95);
  }

  next.movements[index] = movement;
  return loadShowScore(next);
}

export function updateMovementMetadata(
  score: ShowScore,
  movementId: string,
  edit: MovementMetadataEdit,
): ShowScore {
  const next = cloneScore(score);
  const index = movementIndex(next, movementId);
  const current = next.movements[index];
  next.movements[index] = {
    ...current,
    ...(edit.name !== undefined ? { name: edit.name } : {}),
    ...(edit.description !== undefined ? { description: edit.description } : {}),
    ...(edit.majorPeak !== undefined ? { majorPeak: edit.majorPeak } : {}),
  };
  return loadShowScore(next);
}

export function updateMovementDuration(
  score: ShowScore,
  movementId: string,
  durationS: number,
): ShowScore {
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new Error("Movement duration must be a positive finite number");
  }
  const next = cloneScore(score);
  const index = movementIndex(next, movementId);
  const delta = durationS - next.movements[index].durationS;
  next.movements = next.movements.map((movement, movementIndexValue) => ({
    ...movement,
    durationS: movementIndexValue === index ? durationS : movement.durationS,
    startS:
      movementIndexValue > index ? movement.startS + delta : movement.startS,
  }));
  next.durationS += delta;
  return loadShowScore(next);
}

export function assertContentPresetCompatible(score: ShowScore): void {
  if (score.schemaVersion !== SHOW_SCORE_SCHEMA_VERSION) {
    throw new Error("Content preset contains an unsupported show score");
  }
}
