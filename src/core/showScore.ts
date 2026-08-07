import bundledShowScore from "../../content/show-score-v1.json";
import {
  SHOW_SCORE_SCHEMA_VERSION,
  type AudiovisualParameters,
  type ShowMovement,
  type ShowScore,
} from "./contracts";
import { clamp, interpolateParameters } from "./math";

const PARAMETER_KEYS = [
  "energy",
  "brightness",
  "visualDensity",
  "fluidity",
  "fracture",
  "glitch",
  "organic",
  "melody",
  "sub",
  "spatialMotion",
  "residualGain",
  "predictionVisibility",
  "fanCue",
] as const satisfies readonly (keyof AudiovisualParameters)[];

const TIME_EPSILON_S = 1e-6;

export interface ShowScoreSample {
  showTimeS: number;
  movement: ShowMovement;
  movementProgress: number;
  audiovisual: AudiovisualParameters;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
}

function assertUnitParameter(value: unknown, path: string): asserts value is number {
  assertFiniteNumber(value, path);
  if (value < 0 || value > 1) {
    throw new Error(`${path} must be between 0 and 1`);
  }
}

function assertParameters(
  value: unknown,
  path: string,
): asserts value is AudiovisualParameters {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  for (const key of PARAMETER_KEYS) {
    assertUnitParameter(value[key], `${path}.${key}`);
  }
}

function validateMovement(value: unknown, index: number): asserts value is ShowMovement {
  const path = `movements[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string`);
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new Error(`${path}.name must be a non-empty string`);
  }
  if (typeof value.description !== "string" || value.description.length === 0) {
    throw new Error(`${path}.description must be a non-empty string`);
  }
  assertFiniteNumber(value.startS, `${path}.startS`);
  assertFiniteNumber(value.durationS, `${path}.durationS`);
  if (value.startS < 0 || value.durationS <= 0) {
    throw new Error(`${path} must have a non-negative start and positive duration`);
  }
  if (typeof value.majorPeak !== "boolean") {
    throw new Error(`${path}.majorPeak must be a boolean`);
  }
  assertParameters(value.start, `${path}.start`);
  assertParameters(value.end, `${path}.end`);

  if (value.localPeak !== undefined) {
    if (!isRecord(value.localPeak)) {
      throw new Error(`${path}.localPeak must be an object`);
    }
    assertFiniteNumber(value.localPeak.at, `${path}.localPeak.at`);
    if (value.localPeak.at <= 0 || value.localPeak.at >= 1) {
      throw new Error(`${path}.localPeak.at must be between 0 and 1`);
    }
    for (const key of PARAMETER_KEYS) {
      if (value.localPeak[key] !== undefined) {
        assertUnitParameter(value.localPeak[key], `${path}.localPeak.${key}`);
      }
    }
  }
}

function validateShowScore(value: unknown): asserts value is ShowScore {
  if (!isRecord(value)) {
    throw new Error("Show score must be an object");
  }
  if (value.schemaVersion !== SHOW_SCORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported show score schema: ${String(value.schemaVersion)}`,
    );
  }
  if (typeof value.title !== "string" || value.title.length === 0) {
    throw new Error("Show score title must be a non-empty string");
  }
  assertFiniteNumber(value.durationS, "durationS");
  if (value.durationS <= 0) {
    throw new Error("durationS must be positive");
  }
  if (typeof value.loop !== "boolean") {
    throw new Error("loop must be a boolean");
  }
  if (!Array.isArray(value.movements) || value.movements.length === 0) {
    throw new Error("movements must be a non-empty array");
  }

  value.movements.forEach(validateMovement);
  const ids = new Set<string>();
  let expectedStartS = 0;
  for (const [index, movement] of value.movements.entries()) {
    if (ids.has(movement.id)) {
      throw new Error(`Duplicate movement id: ${movement.id}`);
    }
    ids.add(movement.id);
    if (Math.abs(movement.startS - expectedStartS) > TIME_EPSILON_S) {
      throw new Error(
        `movements[${index}] must start at ${expectedStartS}, received ${movement.startS}`,
      );
    }
    expectedStartS = movement.startS + movement.durationS;
  }
  if (Math.abs(expectedStartS - value.durationS) > TIME_EPSILON_S) {
    throw new Error(
      `Movements end at ${expectedStartS}, but durationS is ${value.durationS}`,
    );
  }
}

function cloneShowScore(score: ShowScore): ShowScore {
  return JSON.parse(JSON.stringify(score)) as ShowScore;
}

export function loadShowScore(source: unknown = bundledShowScore): ShowScore {
  validateShowScore(source);
  return cloneShowScore(source);
}

export function normaliseShowTime(score: ShowScore, timeS: number): number {
  assertFiniteNumber(timeS, "timeS");
  if (!score.loop) {
    return clamp(timeS, 0, score.durationS);
  }
  return ((timeS % score.durationS) + score.durationS) % score.durationS;
}

function parametersAtMovementProgress(
  movement: ShowMovement,
  progress: number,
): AudiovisualParameters {
  const amount = clamp(progress);
  if (!movement.localPeak) {
    return interpolateParameters(movement.start, movement.end, amount);
  }

  const { at, ...overrides } = movement.localPeak;
  const baselineAtPeak = interpolateParameters(movement.start, movement.end, at);
  const peak = {
    ...baselineAtPeak,
    ...overrides,
  } as AudiovisualParameters;

  if (amount <= at) {
    return interpolateParameters(movement.start, peak, amount / at);
  }
  return interpolateParameters(peak, movement.end, (amount - at) / (1 - at));
}

export function sampleShowScore(
  score: ShowScore,
  timeS: number,
): ShowScoreSample {
  const showTimeS = normaliseShowTime(score, timeS);
  const isNonLoopingEnd = !score.loop && showTimeS >= score.durationS;
  const movement =
    score.movements.find(
      (candidate) =>
        showTimeS >= candidate.startS &&
        showTimeS < candidate.startS + candidate.durationS,
    ) ?? score.movements[score.movements.length - 1];
  const movementProgress = isNonLoopingEnd
    ? 1
    : clamp((showTimeS - movement.startS) / movement.durationS);

  return {
    showTimeS,
    movement,
    movementProgress,
    audiovisual: parametersAtMovementProgress(
      movement,
      movementProgress,
    ),
  };
}

