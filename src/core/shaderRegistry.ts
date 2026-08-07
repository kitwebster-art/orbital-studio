import type { AudiovisualParameters } from "./contracts";
import type { ProjectionPattern } from "./projectionRig";

/** Versioned metadata contract for authored and runtime shader modules. */
export const SHADER_REGISTRY_SCHEMA_VERSION =
  "orbital.shader-registry/1.0" as const;
export const SHADER_PRESET_SCHEMA_VERSION = "orbital.shader-preset/1.0" as const;

export const SHADER_FAMILIES = [
  "neutral",
  "contour",
  "fluid",
  "water",
  "turbulence",
  "fire",
  "matrix",
  "fracture",
  "particle",
  "geometric",
  "planetary",
  "residual",
] as const;
export type ShaderFamily = (typeof SHADER_FAMILIES)[number];

export const SHADER_GPU_COST_TIERS = ["low", "medium", "high"] as const;
export type ShaderGpuCostTier = (typeof SHADER_GPU_COST_TIERS)[number];

export const SHADER_PARAMETER_TYPES = [
  "unit",
  "number",
  "integer",
  "boolean",
  "colour",
  "enum",
] as const;
export type ShaderParameterType = (typeof SHADER_PARAMETER_TYPES)[number];

export type ShaderParameterValue = number | boolean | string;
export type ShaderAudioSource =
  | "score"
  | "audio-analysis"
  | "tracking-derived";
export type ShaderAudioResponse =
  | "linear"
  | "smoothstep"
  | "envelope"
  | "pulse";

export type ShaderAudioParameter = keyof Pick<
  AudiovisualParameters,
  | "energy"
  | "brightness"
  | "visualDensity"
  | "fluidity"
  | "fracture"
  | "glitch"
  | "organic"
  | "melody"
  | "sub"
  | "spatialMotion"
  | "residualGain"
  | "predictionVisibility"
>;

export interface ShaderParameterDefinition {
  id: string;
  label: string;
  type: ShaderParameterType;
  defaultValue: ShaderParameterValue;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  description: string;
}

export interface ShaderAudioInputDefinition {
  id: string;
  label: string;
  source: ShaderAudioSource;
  parameter: ShaderAudioParameter;
  targetParameterId: string;
  response: ShaderAudioResponse;
  depth: number;
  smoothingMs: number;
  description: string;
}

export interface ShaderProjectorCompatibility {
  minimumProjectors: number;
  maximumProjectors: number;
  supportedPatterns: readonly ProjectionPattern[];
  supportsShapeLockedWorld: boolean;
  supportsCoveragePreview: boolean;
  safeLuminanceCeiling: number;
  notes: string;
}

export interface ShaderGpuEstimate {
  /** Relative estimate where 0 is the fallback baseline and 1 is the heaviest entry. */
  score: number;
  passes: number;
  textureReads: number;
  notes: string;
}

export interface ShaderSourceDescriptor {
  moduleId: string;
  kind: "surface" | "overlay" | "postprocess";
  /** Optional path for a future renderer adapter. Core never imports the module. */
  implementationPath?: string;
}

export interface ShaderDefinition {
  id: string;
  name: string;
  family: ShaderFamily;
  version: string;
  description: string;
  tags: readonly string[];
  source: ShaderSourceDescriptor;
  /** Stable seed used when a preset does not provide an explicit seed. */
  defaultSeed: number;
  parameterDefinitions: readonly ShaderParameterDefinition[];
  audioReactiveInputs: readonly ShaderAudioInputDefinition[];
  gpuCost: ShaderGpuCostTier;
  gpuEstimate: ShaderGpuEstimate;
  projectorCompatibility: ShaderProjectorCompatibility;
  /** A renderer may use this when compilation or capability checks fail. */
  fallbackShaderId: string | null;
}

export interface ShaderRegistry {
  schemaVersion: typeof SHADER_REGISTRY_SCHEMA_VERSION;
  fallbackShaderId: string;
  shaders: readonly ShaderDefinition[];
}

export interface ShaderPreset {
  schemaVersion: typeof SHADER_PRESET_SCHEMA_VERSION;
  shaderId: string;
  seed: number;
  parameters: Record<string, ShaderParameterValue>;
}

export interface ShaderPresetResolution {
  preset: ShaderPreset;
  shader: ShaderDefinition;
  usedFallback: boolean;
  issues: readonly string[];
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PARAMETER_ID_PATTERN = /^[a-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/u;
const COLOUR_PATTERN = /^#[0-9a-f]{6}$/iu;
const SHADER_SEED_MAX = 0xffffffff;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function assertFinite(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be finite`);
  }
}

function assertUnit(value: unknown, path: string): asserts value is number {
  assertFinite(value, path);
  if (value < 0 || value > 1) {
    throw new Error(`${path} must be between 0 and 1`);
  }
}

function assertSeed(value: unknown, path: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > SHADER_SEED_MAX
  ) {
    throw new Error(`${path} must be an unsigned 32-bit integer`);
  }
}

function assertId(value: unknown, path: string): asserts value is string {
  assertString(value, path);
  if (!ID_PATTERN.test(value)) {
    throw new Error(`${path} must use lowercase kebab-case`);
  }
}

function assertParameterId(value: unknown, path: string): asserts value is string {
  assertString(value, path);
  if (!PARAMETER_ID_PATTERN.test(value)) {
    throw new Error(`${path} must use a stable parameter identifier`);
  }
}

function cloneParameterValue(value: ShaderParameterValue): ShaderParameterValue {
  return typeof value === "string" ? `${value}` : value;
}

function cloneDefinition(definition: ShaderDefinition): ShaderDefinition {
  return {
    ...definition,
    tags: [...definition.tags],
    source: { ...definition.source },
    parameterDefinitions: definition.parameterDefinitions.map((parameter) => ({
      ...parameter,
      options: parameter.options ? [...parameter.options] : undefined,
      defaultValue: cloneParameterValue(parameter.defaultValue),
    })),
    audioReactiveInputs: definition.audioReactiveInputs.map((input) => ({ ...input })),
    gpuEstimate: { ...definition.gpuEstimate },
    projectorCompatibility: {
      ...definition.projectorCompatibility,
      supportedPatterns: [...definition.projectorCompatibility.supportedPatterns],
    },
  };
}

function freezeDefinition(definition: ShaderDefinition): ShaderDefinition {
  const cloned = cloneDefinition(definition);
  cloned.tags = Object.freeze(cloned.tags);
  cloned.source = Object.freeze(cloned.source);
  cloned.parameterDefinitions = Object.freeze(
    cloned.parameterDefinitions.map((parameter) => {
      parameter.options = parameter.options
        ? Object.freeze(parameter.options)
        : undefined;
      return Object.freeze(parameter);
    }),
  );
  cloned.audioReactiveInputs = Object.freeze(
    cloned.audioReactiveInputs.map((input) => Object.freeze(input)),
  );
  cloned.gpuEstimate = Object.freeze(cloned.gpuEstimate);
  cloned.projectorCompatibility = Object.freeze({
    ...cloned.projectorCompatibility,
    supportedPatterns: Object.freeze([
      ...cloned.projectorCompatibility.supportedPatterns,
    ]),
  });
  return Object.freeze(cloned);
}

function validateParameterDefinition(
  value: unknown,
  path: string,
): ShaderParameterDefinition {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  assertParameterId(value.id, `${path}.id`);
  assertString(value.label, `${path}.label`);
  if (!hasValue(SHADER_PARAMETER_TYPES, value.type)) {
    throw new Error(`${path}.type is unsupported`);
  }
  assertString(value.description, `${path}.description`);
  const parameter: ShaderParameterDefinition = {
    id: value.id,
    label: value.label,
    type: value.type,
    defaultValue: value.defaultValue as ShaderParameterValue,
    description: value.description,
  };
  if (
    typeof parameter.defaultValue !== "number" &&
    typeof parameter.defaultValue !== "boolean" &&
    typeof parameter.defaultValue !== "string"
  ) {
    throw new Error(`${path}.defaultValue must be a scalar value`);
  }

  if (value.min !== undefined) {
    assertFinite(value.min, `${path}.min`);
    parameter.min = value.min;
  }
  if (value.max !== undefined) {
    assertFinite(value.max, `${path}.max`);
    parameter.max = value.max;
  }
  if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) {
    throw new Error(`${path}.min must not exceed max`);
  }
  if (value.step !== undefined) {
    assertFinite(value.step, `${path}.step`);
    if (value.step <= 0) {
      throw new Error(`${path}.step must be positive`);
    }
    parameter.step = value.step;
  }

  if (parameter.type === "unit") {
    if (parameter.min !== undefined && parameter.min < 0) {
      throw new Error(`${path}.min must be at least 0 for a unit parameter`);
    }
    if (parameter.max !== undefined && parameter.max > 1) {
      throw new Error(`${path}.max must be at most 1 for a unit parameter`);
    }
    assertUnit(parameter.defaultValue, `${path}.defaultValue`);
    parameter.min ??= 0;
    parameter.max ??= 1;
  } else if (parameter.type === "number") {
    assertFinite(parameter.defaultValue, `${path}.defaultValue`);
  } else if (parameter.type === "integer") {
    if (typeof parameter.defaultValue !== "number" || !Number.isInteger(parameter.defaultValue)) {
      throw new Error(`${path}.defaultValue must be an integer`);
    }
  } else if (parameter.type === "boolean") {
    if (typeof parameter.defaultValue !== "boolean") {
      throw new Error(`${path}.defaultValue must be boolean`);
    }
  } else if (parameter.type === "colour") {
    if (typeof parameter.defaultValue !== "string" || !COLOUR_PATTERN.test(parameter.defaultValue)) {
      throw new Error(`${path}.defaultValue must be a #RRGGBB colour`);
    }
  } else {
    if (
      typeof parameter.defaultValue !== "string" ||
      !Array.isArray(value.options) ||
      value.options.length === 0 ||
      value.options.some((option) => typeof option !== "string" || option.length === 0) ||
      !value.options.includes(parameter.defaultValue)
    ) {
      throw new Error(`${path}.options must include the enum defaultValue`);
    }
    parameter.options = [...value.options];
  }

  if (parameter.min !== undefined && parameter.max !== undefined) {
    if (typeof parameter.defaultValue === "number" &&
      (parameter.defaultValue < parameter.min || parameter.defaultValue > parameter.max)) {
      throw new Error(`${path}.defaultValue must be within min and max`);
    }
  }
  return parameter;
}

function validateAudioInput(
  value: unknown,
  path: string,
): ShaderAudioInputDefinition {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  assertParameterId(value.id, `${path}.id`);
  assertString(value.label, `${path}.label`);
  assertParameterId(value.targetParameterId, `${path}.targetParameterId`);
  if (!hasValue(["score", "audio-analysis", "tracking-derived"] as const, value.source)) {
    throw new Error(`${path}.source is unsupported`);
  }
  if (!hasValue([
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
  ] as const, value.parameter)) {
    throw new Error(`${path}.parameter is unsupported`);
  }
  if (!hasValue(["linear", "smoothstep", "envelope", "pulse"] as const, value.response)) {
    throw new Error(`${path}.response is unsupported`);
  }
  assertUnit(value.depth, `${path}.depth`);
  assertFinite(value.smoothingMs, `${path}.smoothingMs`);
  if (value.smoothingMs < 0) {
    throw new Error(`${path}.smoothingMs must not be negative`);
  }
  assertString(value.description, `${path}.description`);
  return {
    id: value.id,
    label: value.label,
    source: value.source,
    parameter: value.parameter,
    targetParameterId: value.targetParameterId,
    response: value.response,
    depth: value.depth,
    smoothingMs: value.smoothingMs,
    description: value.description,
  };
}

function validateProjectorCompatibility(
  value: unknown,
  path: string,
): ShaderProjectorCompatibility {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (
    typeof value.minimumProjectors !== "number" ||
    !Number.isInteger(value.minimumProjectors) ||
    value.minimumProjectors < 1
  ) {
    throw new Error(`${path}.minimumProjectors must be a positive integer`);
  }
  if (
    typeof value.maximumProjectors !== "number" ||
    !Number.isInteger(value.maximumProjectors) ||
    value.maximumProjectors < value.minimumProjectors ||
    value.maximumProjectors > 5
  ) {
    throw new Error(`${path}.maximumProjectors must be between minimumProjectors and 5`);
  }
  if (!Array.isArray(value.supportedPatterns) || value.supportedPatterns.length === 0) {
    throw new Error(`${path}.supportedPatterns must not be empty`);
  }
  const projectionPatterns: ProjectionPattern[] = [];
  value.supportedPatterns.forEach((pattern, index) => {
    if (!hasValue(["authored", "coverage", "grid", "seam", "black"] as const, pattern)) {
      throw new Error(`${path}.supportedPatterns[${index}] is unsupported`);
    }
    if (!projectionPatterns.includes(pattern)) {
      projectionPatterns.push(pattern);
    }
  });
  if (typeof value.supportsShapeLockedWorld !== "boolean") {
    throw new Error(`${path}.supportsShapeLockedWorld must be boolean`);
  }
  if (typeof value.supportsCoveragePreview !== "boolean") {
    throw new Error(`${path}.supportsCoveragePreview must be boolean`);
  }
  assertUnit(value.safeLuminanceCeiling, `${path}.safeLuminanceCeiling`);
  assertString(value.notes, `${path}.notes`);
  return {
    minimumProjectors: value.minimumProjectors,
    maximumProjectors: value.maximumProjectors,
    supportedPatterns: projectionPatterns,
    supportsShapeLockedWorld: value.supportsShapeLockedWorld,
    supportsCoveragePreview: value.supportsCoveragePreview,
    safeLuminanceCeiling: value.safeLuminanceCeiling,
    notes: value.notes,
  };
}

function validateDefinition(value: unknown, path: string): ShaderDefinition {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  assertId(value.id, `${path}.id`);
  assertString(value.name, `${path}.name`);
  if (!hasValue(SHADER_FAMILIES, value.family)) {
    throw new Error(`${path}.family is unsupported`);
  }
  assertString(value.version, `${path}.version`);
  assertString(value.description, `${path}.description`);
  if (!Array.isArray(value.tags) || value.tags.length === 0 ||
    value.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)) {
    throw new Error(`${path}.tags must contain non-empty strings`);
  }
  if (!isRecord(value.source)) {
    throw new Error(`${path}.source must be an object`);
  }
  assertId(value.source.moduleId, `${path}.source.moduleId`);
  if (!hasValue(["surface", "overlay", "postprocess"] as const, value.source.kind)) {
    throw new Error(`${path}.source.kind is unsupported`);
  }
  const source: ShaderSourceDescriptor = {
    moduleId: value.source.moduleId,
    kind: value.source.kind,
  };
  if (value.source.implementationPath !== undefined) {
    assertString(value.source.implementationPath, `${path}.source.implementationPath`);
    source.implementationPath = value.source.implementationPath;
  }
  assertSeed(value.defaultSeed, `${path}.defaultSeed`);
  if (!Array.isArray(value.parameterDefinitions)) {
    throw new Error(`${path}.parameterDefinitions must be an array`);
  }
  const parameterDefinitions = value.parameterDefinitions.map((parameter, index) =>
    validateParameterDefinition(parameter, `${path}.parameterDefinitions[${index}]`),
  );
  const parameterIds = new Set<string>();
  parameterDefinitions.forEach((parameter) => {
    if (parameterIds.has(parameter.id)) {
      throw new Error(`${path}.parameterDefinitions contains duplicate id ${parameter.id}`);
    }
    parameterIds.add(parameter.id);
  });
  if (!Array.isArray(value.audioReactiveInputs)) {
    throw new Error(`${path}.audioReactiveInputs must be an array`);
  }
  const audioReactiveInputs = value.audioReactiveInputs.map((input, index) =>
    validateAudioInput(input, `${path}.audioReactiveInputs[${index}]`),
  );
  const audioInputIds = new Set<string>();
  audioReactiveInputs.forEach((input) => {
    if (audioInputIds.has(input.id)) {
      throw new Error(`${path}.audioReactiveInputs contains duplicate id ${input.id}`);
    }
    audioInputIds.add(input.id);
  });
  audioReactiveInputs.forEach((input) => {
    if (!parameterIds.has(input.targetParameterId)) {
      throw new Error(
        `Shader ${value.id} audio input ${input.id} targets missing parameter ${input.targetParameterId}`,
      );
    }
  });
  if (!hasValue(SHADER_GPU_COST_TIERS, value.gpuCost)) {
    throw new Error(`${path}.gpuCost is unsupported`);
  }
  if (!isRecord(value.gpuEstimate)) {
    throw new Error(`${path}.gpuEstimate must be an object`);
  }
  assertUnit(value.gpuEstimate.score, `${path}.gpuEstimate.score`);
  if (
    typeof value.gpuEstimate.passes !== "number" ||
    !Number.isInteger(value.gpuEstimate.passes) ||
    value.gpuEstimate.passes < 1
  ) {
    throw new Error(`${path}.gpuEstimate.passes must be a positive integer`);
  }
  if (
    typeof value.gpuEstimate.textureReads !== "number" ||
    !Number.isInteger(value.gpuEstimate.textureReads) ||
    value.gpuEstimate.textureReads < 0
  ) {
    throw new Error(`${path}.gpuEstimate.textureReads must be a non-negative integer`);
  }
  assertString(value.gpuEstimate.notes, `${path}.gpuEstimate.notes`);
  const projectorCompatibility = validateProjectorCompatibility(
    value.projectorCompatibility,
    `${path}.projectorCompatibility`,
  );
  if (value.fallbackShaderId !== null) {
    assertId(value.fallbackShaderId, `${path}.fallbackShaderId`);
  }
  return {
    id: value.id,
    name: value.name,
    family: value.family,
    version: value.version,
    description: value.description,
    tags: [...value.tags],
    source,
    defaultSeed: value.defaultSeed,
    parameterDefinitions,
    audioReactiveInputs,
    gpuCost: value.gpuCost,
    gpuEstimate: {
      score: value.gpuEstimate.score,
      passes: value.gpuEstimate.passes,
      textureReads: value.gpuEstimate.textureReads,
      notes: value.gpuEstimate.notes,
    },
    projectorCompatibility,
    fallbackShaderId: value.fallbackShaderId,
  };
}

/** Validate and return a copy of a shader definition. */
export function validateShaderDefinition(value: unknown): ShaderDefinition {
  return validateDefinition(value, "shader");
}

/** Validate a registry and its fallback graph before exposing it to a renderer. */
export function validateShaderRegistry(value: unknown): ShaderRegistry {
  if (!isRecord(value)) {
    throw new Error("Shader registry must be an object");
  }
  if (value.schemaVersion !== SHADER_REGISTRY_SCHEMA_VERSION) {
    throw new Error("Shader registry schemaVersion is unsupported");
  }
  assertId(value.fallbackShaderId, "Shader registry fallbackShaderId");
  if (!Array.isArray(value.shaders) || value.shaders.length === 0) {
    throw new Error("Shader registry must contain at least one shader");
  }
  const shaders = value.shaders.map((shader, index) =>
    validateDefinition(shader, `shaders[${index}]`),
  );
  const ids = new Set<string>();
  shaders.forEach((shader) => {
    if (ids.has(shader.id)) {
      throw new Error(`Shader registry contains duplicate shader id ${shader.id}`);
    }
    ids.add(shader.id);
  });
  if (!ids.has(value.fallbackShaderId)) {
    throw new Error(`Shader registry fallback ${value.fallbackShaderId} is missing`);
  }
  const fallback = shaders.find((shader) => shader.id === value.fallbackShaderId);
  if (!fallback || fallback.family !== "neutral") {
    throw new Error("Shader registry fallback must be a neutral shader");
  }
  shaders.forEach((shader) => {
    if (shader.fallbackShaderId !== null && !ids.has(shader.fallbackShaderId)) {
      throw new Error(`Shader ${shader.id} references missing fallback ${shader.fallbackShaderId}`);
    }
  });
  return {
    schemaVersion: SHADER_REGISTRY_SCHEMA_VERSION,
    fallbackShaderId: value.fallbackShaderId,
    shaders: Object.freeze(shaders.map(freezeDefinition)),
  };
}

export function createShaderRegistry(
  shaders: readonly ShaderDefinition[],
  fallbackShaderId = "neutral",
): ShaderRegistry {
  return validateShaderRegistry({
    schemaVersion: SHADER_REGISTRY_SCHEMA_VERSION,
    fallbackShaderId,
    shaders,
  });
}

export function getShaderDefinition(
  shaderId: string,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderDefinition | null {
  return registry.shaders.find((shader) => shader.id === shaderId) ?? null;
}

export interface ShaderListFilter {
  family?: ShaderFamily;
  gpuCost?: ShaderGpuCostTier;
  tag?: string;
  projectorCount?: number;
}

/** Return immutable registry entries suitable for a picker or authoring panel. */
export function listShaderDefinitions(
  filter: ShaderListFilter = {},
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): readonly ShaderDefinition[] {
  return registry.shaders.filter((shader) => {
    if (filter.family !== undefined && shader.family !== filter.family) {
      return false;
    }
    if (filter.gpuCost !== undefined && shader.gpuCost !== filter.gpuCost) {
      return false;
    }
    if (filter.tag !== undefined && !shader.tags.includes(filter.tag)) {
      return false;
    }
    if (
      filter.projectorCount !== undefined &&
      (filter.projectorCount < shader.projectorCompatibility.minimumProjectors ||
        filter.projectorCount > shader.projectorCompatibility.maximumProjectors)
    ) {
      return false;
    }
    return true;
  });
}

/** Alias kept short for UI adapters that only need to list picker options. */
export function listShaders(
  filter: ShaderListFilter = {},
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): readonly ShaderDefinition[] {
  return listShaderDefinitions(filter, registry);
}

/** Alias for a direct registry lookup. Unknown ids return null. */
export function getShader(
  shaderId: string,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderDefinition | null {
  return getShaderDefinition(shaderId, registry);
}

/** Resolve a requested shader without ever returning an unregistered implementation. */
export function resolveShaderDefinition(
  shaderId: string | null | undefined,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderDefinition {
  const selected = shaderId ? getShaderDefinition(shaderId, registry) : null;
  if (selected) {
    return selected;
  }
  const fallback = getShaderDefinition(registry.fallbackShaderId, registry);
  if (!fallback) {
    throw new Error(`Shader registry fallback ${registry.fallbackShaderId} is unavailable`);
  }
  return fallback;
}

/** Select a shader for rendering, falling back to the neutral entry if needed. */
export function selectShader(
  shaderId: string | null | undefined,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderDefinition {
  return resolveShaderDefinition(shaderId, registry);
}

export function normaliseShaderSeed(seed: number): number {
  if (
    !Number.isFinite(seed) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > SHADER_SEED_MAX
  ) {
    throw new Error("Shader seed must be an unsigned 32-bit integer");
  }
  return seed;
}

/** Stable FNV-1a plus seed mixing, independent of JS engine hash behaviour. */
export function deriveDeterministicShaderSeed(shaderId: string, seed = 0): number {
  let hash = 2166136261;
  for (let index = 0; index < shaderId.length; index += 1) {
    hash ^= shaderId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ normaliseShaderSeed(seed)) >>> 0;
}

export function createDeterministicRandom(seed: number): () => number {
  let state = normaliseShaderSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function validatePresetParameter(
  definition: ShaderParameterDefinition,
  value: unknown,
  path: string,
): ShaderParameterValue {
  if (
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "string"
  ) {
    throw new Error(`${path} must be a scalar value`);
  }
  if (definition.type === "unit") {
    assertUnit(value, path);
  } else if (definition.type === "number") {
    assertFinite(value, path);
  } else if (definition.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`${path} must be an integer`);
    }
  } else if (definition.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${path} must be boolean`);
    }
  } else if (definition.type === "colour") {
    if (typeof value !== "string" || !COLOUR_PATTERN.test(value)) {
      throw new Error(`${path} must be a #RRGGBB colour`);
    }
  } else if (typeof value !== "string" || !definition.options?.includes(value)) {
    throw new Error(`${path} must be one of the enum options`);
  }
  if (
    typeof value === "number" &&
    ((definition.min !== undefined && value < definition.min) ||
      (definition.max !== undefined && value > definition.max))
  ) {
    throw new Error(`${path} must be within the parameter range`);
  }
  return cloneParameterValue(value);
}

function normalisePresetParameters(
  shader: ShaderDefinition,
  values: Record<string, ShaderParameterValue>,
): Record<string, ShaderParameterValue> {
  const known = new Set(shader.parameterDefinitions.map((parameter) => parameter.id));
  Object.keys(values).forEach((id) => {
    if (!known.has(id)) {
      throw new Error(`Unknown parameter ${id} for shader ${shader.id}`);
    }
  });
  return Object.fromEntries(
    shader.parameterDefinitions.map((definition) => [
      definition.id,
      validatePresetParameter(
        definition,
        values[definition.id] ?? definition.defaultValue,
        `parameters.${definition.id}`,
      ),
    ]),
  );
}

/** Validate UI or transport values and fill omitted fields from the shader defaults. */
export function validateShaderParameters(
  shaderId: string,
  values: Record<string, ShaderParameterValue> = {},
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): Record<string, ShaderParameterValue> {
  const shader = getShaderDefinition(shaderId, registry);
  if (!shader) {
    throw new Error(`Unknown shader: ${shaderId}`);
  }
  return normalisePresetParameters(shader, values);
}

export function createShaderPreset(
  shaderId: string,
  parameterOverrides: Record<string, ShaderParameterValue> = {},
  seed?: number,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderPreset {
  const shader = getShaderDefinition(shaderId, registry);
  if (!shader) {
    throw new Error(`Unknown shader: ${shaderId}`);
  }
  return {
    schemaVersion: SHADER_PRESET_SCHEMA_VERSION,
    shaderId: shader.id,
    seed: normaliseShaderSeed(seed ?? shader.defaultSeed),
    parameters: normalisePresetParameters(shader, parameterOverrides),
  };
}

export function serialiseShaderPreset(preset: ShaderPreset): string {
  return `${JSON.stringify(preset, null, 2)}\n`;
}

export function parseShaderPreset(
  source: unknown,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderPreset {
  if (!isRecord(source)) {
    throw new Error("Shader preset must be an object");
  }
  if (source.schemaVersion !== SHADER_PRESET_SCHEMA_VERSION) {
    throw new Error("Shader preset schemaVersion is unsupported");
  }
  assertId(source.shaderId, "Shader preset shaderId");
  const shader = getShaderDefinition(source.shaderId, registry);
  if (!shader) {
    throw new Error(`Shader preset references unknown shader ${source.shaderId}`);
  }
  assertSeed(source.seed, "Shader preset seed");
  if (!isRecord(source.parameters)) {
    throw new Error("Shader preset parameters must be an object");
  }
  const values = source.parameters as Record<string, ShaderParameterValue>;
  const expected = new Set(shader.parameterDefinitions.map((parameter) => parameter.id));
  Object.keys(values).forEach((id) => {
    if (!expected.has(id)) {
      throw new Error(`Shader preset contains unknown parameter ${id}`);
    }
  });
  shader.parameterDefinitions.forEach((definition) => {
    if (!(definition.id in values)) {
      throw new Error(`Shader preset is missing parameter ${definition.id}`);
    }
  });
  return {
    schemaVersion: SHADER_PRESET_SCHEMA_VERSION,
    shaderId: shader.id,
    seed: source.seed,
    parameters: normalisePresetParameters(shader, values),
  };
}

/** Parse user or transport data, falling back to the neutral authored state. */
export function resolveShaderPreset(
  source: unknown,
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
): ShaderPresetResolution {
  try {
    const preset = parseShaderPreset(source, registry);
    return {
      preset,
      shader: resolveShaderDefinition(preset.shaderId, registry),
      usedFallback: false,
      issues: [],
    };
  } catch (error) {
    const issue = error instanceof Error ? error.message : "Invalid shader preset";
    const shader = resolveShaderDefinition(null, registry);
    return {
      preset: createShaderPreset(shader.id, {}, shader.defaultSeed, registry),
      shader,
      usedFallback: true,
      issues: [issue],
    };
  }
}

const COMMON_PROJECTOR_COMPATIBILITY: ShaderProjectorCompatibility = {
  minimumProjectors: 1,
  maximumProjectors: 5,
  supportedPatterns: ["authored", "coverage", "grid", "seam", "black"],
  supportsShapeLockedWorld: true,
  supportsCoveragePreview: true,
  safeLuminanceCeiling: 0.84,
  notes: "Preview metadata only. Physical projector lock and luminance remain unvalidated.",
};

const MULTI_PROJECTOR_COMPATIBILITY: ShaderProjectorCompatibility = {
  minimumProjectors: 2,
  maximumProjectors: 5,
  supportedPatterns: ["authored", "coverage", "grid", "seam", "black"],
  supportsShapeLockedWorld: true,
  supportsCoveragePreview: true,
  safeLuminanceCeiling: 0.72,
  notes: "Designed for overlap-aware content; validate edge blends and black level on the physical rig.",
};

const NEUTRAL_SHADER: ShaderDefinition = {
  id: "neutral",
  name: "Neutral membrane",
  family: "neutral",
  version: "1.0.0",
  description: "A dark, low-cost authored state used when content or tracking is unavailable.",
  tags: ["fallback", "safe", "rest", "black-level"],
  source: { moduleId: "neutral-membrane", kind: "surface" },
  defaultSeed: 0,
  parameterDefinitions: [
    {
      id: "intensity",
      label: "Intensity",
      type: "unit",
      defaultValue: 0.06,
      description: "Conservative output level for a neutral surface.",
    },
    {
      id: "grain",
      label: "Grain",
      type: "unit",
      defaultValue: 0,
      description: "Optional low-amplitude membrane grain.",
    },
  ],
  audioReactiveInputs: [],
  gpuCost: "low",
  gpuEstimate: {
    score: 0.08,
    passes: 1,
    textureReads: 0,
    notes: "Single surface pass with no texture or iterative noise reads.",
  },
  projectorCompatibility: {
    ...COMMON_PROJECTOR_COMPATIBILITY,
    safeLuminanceCeiling: 0.18,
    notes: "Safe fallback for tracking loss, shader compile failure or unsupported capabilities.",
  },
  fallbackShaderId: null,
};

function unitParameter(
  id: string,
  label: string,
  defaultValue: number,
  description: string,
): ShaderParameterDefinition {
  return { id, label, type: "unit", defaultValue, description };
}

function audioInput(
  id: string,
  label: string,
  source: ShaderAudioSource,
  parameter: ShaderAudioParameter,
  response: ShaderAudioResponse,
  depth: number,
  targetParameterId: string,
  description: string,
): ShaderAudioInputDefinition {
  return {
    id,
    label,
    source,
    parameter,
    targetParameterId,
    response,
    depth,
    smoothingMs: response === "pulse" ? 35 : 90,
    description,
  };
}

function curatedSurfaceShader(
  definition: Omit<
    ShaderDefinition,
    | "version"
    | "source"
    | "gpuEstimate"
    | "projectorCompatibility"
    | "fallbackShaderId"
  > & {
    gpuScore: number;
    gpuNotes: string;
  },
): ShaderDefinition {
  const { gpuScore, gpuNotes, ...shader } = definition;
  return {
    ...shader,
    version: "1.0.0",
    source: {
      moduleId: "orbital-surface",
      kind: "surface",
      implementationPath: "scene/shaders/orbitalSurface",
    },
    gpuEstimate: {
      score: gpuScore,
      passes: 1,
      textureReads: 0,
      notes: gpuNotes,
    },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  };
}

export const CURATED_SHADER_DEFINITIONS: readonly ShaderDefinition[] = [
  NEUTRAL_SHADER,
  {
    id: "contour-field",
    name: "Contour field",
    family: "contour",
    version: "1.0.0",
    description: "Restrained measured contours that make the observed envelope legible.",
    tags: ["observation", "contour", "sparse", "shape-locked", "phase-one", "start-here"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 17431,
    parameterDefinitions: [
      unitParameter("lineDensity", "Line density", 0.28, "Density of contour bands."),
      unitParameter("lineContrast", "Line contrast", 0.46, "Contrast against the dark membrane."),
      unitParameter("motion", "Motion", 0.18, "Slow authored surface drift."),
      unitParameter("residualTrace", "Residual trace", 0.1, "Visibility of prediction error in the contour field."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.35, "lineContrast", "Raises contour contrast at movement peaks."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.3, "motion", "Moves the contour phase around the room-oriented axis."),
    ],
    gpuCost: "low",
    gpuEstimate: { score: 0.26, passes: 1, textureReads: 0, notes: "Analytic bands and one low-order field." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "fluid-membrane",
    name: "Fluid membrane",
    family: "fluid",
    version: "1.0.0",
    description: "A continuous membrane that moves between microscopic and planetary scale.",
    tags: ["fluid", "organic", "skin", "bloom"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 28517,
    parameterDefinitions: [
      unitParameter("scale", "Field scale", 0.54, "Spatial scale of the membrane field."),
      unitParameter("turbulence", "Turbulence", 0.38, "Amplitude of layered flow."),
      unitParameter("flow", "Flow", 0.42, "Speed of the authored field drift."),
      unitParameter("luminousBody", "Luminous body", 0.32, "Amount of surface body above black level."),
      unitParameter("residualTint", "Residual tint", 0.2, "Warm separation when observed and predicted states diverge."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.38, "luminousBody", "Expands the low-frequency body without opening the whole surface."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.48, "flow", "Accelerates flow in authored rises."),
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.32, "scale", "Moves field scale toward a softer topology."),
    ],
    gpuCost: "medium",
    gpuEstimate: { score: 0.54, passes: 1, textureReads: 0, notes: "Four-octave analytic noise and layered banding." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "water-caustics",
    name: "Water caustics",
    family: "water",
    version: "1.0.0",
    description: "Layered caustic bands that make the sphere read like a moving body of water.",
    tags: ["water", "caustics", "liquid", "readable", "projection", "phase-one", "start-here"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 33671,
    parameterDefinitions: [
      unitParameter("scale", "Wave scale", 0.48, "Spatial scale of the caustic field."),
      unitParameter("turbulence", "Turbulence", 0.34, "Distortion of the crossing waves."),
      unitParameter("flow", "Flow", 0.36, "Speed of the water drift."),
      unitParameter("caustic", "Caustic contrast", 0.62, "Brightness of the intersecting light bands."),
      unitParameter("depth", "Depth", 0.42, "Dark body between the caustic highlights."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.32, "depth", "Deepens the water body on low frequencies."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.44, "flow", "Moves the caustic field with authored fluidity."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.3, "caustic", "Opens the caustic highlights at peaks."),
    ],
    gpuCost: "medium",
    gpuEstimate: { score: 0.52, passes: 1, textureReads: 0, notes: "Analytic crossing waves with bounded field distortion." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "turbulence-smoke",
    name: "Turbulence smoke",
    family: "turbulence",
    version: "1.0.0",
    description: "Slow volumetric-looking turbulence for a soft, drifting sphere surface.",
    tags: ["turbulence", "smoke", "cloud", "organic", "slow"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 40817,
    parameterDefinitions: [
      unitParameter("scale", "Cloud scale", 0.58, "Scale of the turbulence field."),
      unitParameter("turbulence", "Turbulence", 0.56, "Amount of layered distortion."),
      unitParameter("flow", "Flow", 0.24, "Drift speed of the smoke."),
      unitParameter("density", "Density", 0.46, "Amount of visible body."),
      unitParameter("contrast", "Contrast", 0.34, "Separation between cloud layers."),
    ],
    audioReactiveInputs: [
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.42, "scale", "Softens the turbulence scale."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.28, "flow", "Drives the drift rate."),
      audioInput("energy", "Energy", "score", "energy", "envelope", 0.25, "contrast", "Raises cloud separation on peaks."),
    ],
    gpuCost: "medium",
    gpuEstimate: { score: 0.6, passes: 1, textureReads: 0, notes: "Four-octave procedural noise with a single surface pass." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "fire-ember",
    name: "Fire and ember",
    family: "fire",
    version: "1.0.0",
    description: "A rising ember field with a dark body, hot core and restrained spark detail.",
    tags: ["fire", "ember", "heat", "crescendos", "warm"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 48113,
    parameterDefinitions: [
      unitParameter("scale", "Flame scale", 0.44, "Spatial scale of the flame field."),
      unitParameter("turbulence", "Turbulence", 0.42, "Distortion of the rising flame."),
      unitParameter("rise", "Rise", 0.58, "Vertical travel of the fire field."),
      unitParameter("heat", "Heat", 0.64, "Hot core intensity."),
      unitParameter("sparks", "Sparks", 0.22, "Sparse high-frequency ember marks."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.5, "heat", "Raises heat at authored peaks."),
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.24, "turbulence", "Adds weight to the flame motion."),
      audioInput("melody", "Melody", "score", "melody", "linear", 0.22, "rise", "Moves the flame phase with the melodic field."),
    ],
    gpuCost: "medium",
    gpuEstimate: { score: 0.62, passes: 1, textureReads: 0, notes: "Procedural rising field with a bounded ember layer." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "matrix-rain",
    name: "Matrix rain",
    family: "matrix",
    version: "1.0.0",
    description: "Vertical digital rain and glyph-like interruptions that remain clear on a sphere.",
    tags: ["matrix", "rain", "digital", "numbers", "green", "phase-one", "start-here"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 55391,
    parameterDefinitions: [
      unitParameter("columns", "Columns", 0.54, "Number of digital rain columns."),
      unitParameter("speed", "Speed", 0.46, "Downward speed of the rain."),
      unitParameter("trail", "Trail", 0.62, "Length of the luminous trail."),
      unitParameter("glyphs", "Glyph density", 0.48, "Density of glyph-like interruptions."),
      unitParameter("glow", "Green glow", 0.36, "Brightness of the digital green."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "linear", 0.3, "speed", "Moves the rain with the melodic field."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.3, "glow", "Raises digital glow at peaks."),
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.26, "trail", "Shortens or breaks rain trails on transients."),
    ],
    gpuCost: "low",
    gpuEstimate: { score: 0.38, passes: 1, textureReads: 0, notes: "Analytic columns and hash-based glyph interruptions." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "fracture-residual",
    name: "Fracture residual",
    family: "fracture",
    version: "1.0.0",
    description: "A bounded split and reorganisation state for prediction error and true crescendos.",
    tags: ["fracture", "glitch", "residual", "crescendos"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 39103,
    parameterDefinitions: [
      unitParameter("threshold", "Break threshold", 0.58, "Amount of residual required before fracture appears."),
      unitParameter("separation", "Separation", 0.36, "Distance between predicted and observed visual strata."),
      unitParameter("shardScale", "Shard scale", 0.32, "Scale of fractured bands."),
      unitParameter("glitch", "Glitch", 0.28, "Temporal stepping and controlled discontinuity."),
      unitParameter("recovery", "Recovery", 0.62, "Rate at which the field reorganises after a peak."),
    ],
    audioReactiveInputs: [
      audioInput("fracture", "Fracture", "score", "fracture", "smoothstep", 0.6, "separation", "Opens the split state at authored peaks."),
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.42, "glitch", "Adds bounded temporal stepping to transients."),
      audioInput("residualGain", "Residual gain", "tracking-derived", "residualGain", "linear", 0.74, "separation", "Makes machine prediction error visible without controlling geometry."),
    ],
    gpuCost: "high",
    gpuEstimate: { score: 0.8, passes: 1, textureReads: 0, notes: "Multiple analytic fields, slices and residual masking." },
    projectorCompatibility: MULTI_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "particle-interference",
    name: "Particle interference",
    family: "particle",
    version: "1.0.0",
    description: "Sparse particle and interference structures for traces, listening and spatial motion.",
    tags: ["particles", "interference", "traces", "spatial"],
    source: { moduleId: "particle-field", kind: "surface" },
    defaultSeed: 44729,
    parameterDefinitions: [
      unitParameter("density", "Particle density", 0.24, "Number of active traces."),
      unitParameter("size", "Particle size", 0.2, "Screen-space particle scale."),
      unitParameter("drift", "Drift", 0.35, "Motion of traces around the observed envelope."),
      unitParameter("interference", "Interference", 0.46, "Strength of crossing-field structure."),
      unitParameter("fade", "Fade", 0.7, "Decay of old traces."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "audio-analysis", "energy", "envelope", 0.32, "density", "Adds particles at broad energy rises."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.55, "drift", "Moves traces between projector zones."),
      audioInput("residualGain", "Residual gain", "tracking-derived", "residualGain", "pulse", 0.32, "interference", "Adds a bounded residual trace when prediction diverges."),
    ],
    gpuCost: "medium",
    gpuEstimate: { score: 0.58, passes: 1, textureReads: 0, notes: "Point field with a single interference evaluation." },
    projectorCompatibility: MULTI_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "geometric-grid",
    name: "Geometric grid",
    family: "geometric",
    version: "1.0.0",
    description: "Machine-like geometry and calibration-adjacent order for the observation-to-prediction arc.",
    tags: ["geometry", "grid", "machine", "calibration", "phase-one", "start-here"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 52061,
    parameterDefinitions: [
      unitParameter("gridScale", "Grid scale", 0.44, "Frequency of geometric lines."),
      unitParameter("lineWidth", "Line width", 0.14, "Width of the geometric trace."),
      unitParameter("rotation", "Rotation", 0.32, "Room-oriented rotation of the grid."),
      unitParameter("quantisation", "Quantisation", 0.25, "Amount of discrete step behaviour."),
      unitParameter("coverage", "Coverage", 0.3, "Fraction of surface carrying the grid."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "linear", 0.44, "rotation", "Shifts grid phase with the harmonic field."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.26, "lineWidth", "Raises line contrast at movement peaks."),
    ],
    gpuCost: "low",
    gpuEstimate: { score: 0.3, passes: 1, textureReads: 0, notes: "Analytic longitude and latitude lines." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "planetary-atmosphere",
    name: "Planetary atmosphere",
    family: "planetary",
    version: "1.0.0",
    description: "A slow atmospheric field that opens the visual language toward planetary and cosmic scale.",
    tags: ["planetary", "cosmic", "atmosphere", "bloom"],
    source: { moduleId: "orbital-surface", kind: "surface", implementationPath: "scene/shaders/orbitalSurface" },
    defaultSeed: 61297,
    parameterDefinitions: [
      unitParameter("cloudScale", "Cloud scale", 0.62, "Scale of the atmospheric field."),
      unitParameter("atmosphere", "Atmosphere", 0.48, "Rim and horizon atmosphere."),
      unitParameter("rotation", "Rotation", 0.22, "Slow room-oriented atmospheric drift."),
      unitParameter("storm", "Storm", 0.24, "Large-scale field variation."),
      unitParameter("nightSide", "Night side", 0.58, "Dark-side contrast and rest."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "score", "energy", "envelope", 0.26, "atmosphere", "Opens atmospheric luminance slowly."),
      audioInput("melody", "Melody", "score", "melody", "smoothstep", 0.35, "cloudScale", "Moves the cloud field toward harmonic colour."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.26, "rotation", "Sets the drift rate of the atmosphere."),
    ],
    gpuCost: "high",
    gpuEstimate: { score: 0.76, passes: 1, textureReads: 0, notes: "Layered atmosphere, cloud field and rim treatment." },
    projectorCompatibility: COMMON_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  {
    id: "prediction-ghost",
    name: "Prediction ghost",
    family: "residual",
    version: "1.0.0",
    description: "A translucent predicted body that exposes the gap between anticipated and observed motion.",
    tags: ["prediction", "residual", "ghost", "confidence"],
    source: { moduleId: "prediction-ghost", kind: "overlay", implementationPath: "scene/shaders/predictionGhost" },
    defaultSeed: 72853,
    parameterDefinitions: [
      unitParameter("opacity", "Opacity", 0.3, "Maximum ghost visibility."),
      unitParameter("scan", "Scan", 0.18, "Moving scan detail across the predicted body."),
      unitParameter("offset", "Offset", 0.36, "Visual separation from the observed body."),
      unitParameter("confidenceGate", "Confidence gate", 0.42, "Minimum prediction confidence before visibility."),
    ],
    audioReactiveInputs: [
      audioInput("predictionVisibility", "Prediction visibility", "tracking-derived", "predictionVisibility", "linear", 0.82, "opacity", "Fades the ghost with the authored prediction visibility."),
      audioInput("residualGain", "Residual gain", "tracking-derived", "residualGain", "smoothstep", 0.56, "offset", "Raises ghost separation when residual error grows."),
    ],
    gpuCost: "low",
    gpuEstimate: { score: 0.22, passes: 1, textureReads: 0, notes: "Single translucent overlay pass." },
    projectorCompatibility: MULTI_PROJECTOR_COMPATIBILITY,
    fallbackShaderId: "neutral",
  },
  curatedSurfaceShader({
    id: "geodesic-wireframe",
    name: "Geodesic wireframe",
    family: "geometric",
    description: "Great-circle lattice lines that expose envelope wobble without a longitude join.",
    tags: ["grid", "geodesic", "wireframe", "calibration", "seamless", "shape-lock", "phase-one", "start-here"],
    defaultSeed: 81401,
    parameterDefinitions: [
      unitParameter("density", "Lattice density", 0.48, "Number of crossing great-circle bands."),
      unitParameter("lineWidth", "Line width", 0.18, "Width of the diagnostic wire lines."),
      unitParameter("rotation", "Rotation", 0.28, "Slow world-space lattice rotation."),
      unitParameter("glow", "Glow", 0.54, "Luminance around the wire lines."),
      unitParameter("subdivisions", "Subdivisions", 0.42, "Secondary structural detail."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.24, "glow", "Raises wire luminance at peaks."),
      audioInput("melody", "Melody", "score", "melody", "linear", 0.2, "rotation", "Moves the lattice through slow harmonic turns."),
    ],
    gpuCost: "low",
    gpuScore: 0.28,
    gpuNotes: "Analytic great-circle planes and a single surface pass.",
  }),
  curatedSurfaceShader({
    id: "hex-lattice",
    name: "Hex lattice",
    family: "geometric",
    description: "A blended tri-planar honeycomb that stays continuous across the deforming sphere.",
    tags: ["grid", "hex", "honeycomb", "technical", "seamless", "phase-one", "start-here"],
    defaultSeed: 82613,
    parameterDefinitions: [
      unitParameter("spacing", "Cell spacing", 0.5, "Scale of the hexagonal cells."),
      unitParameter("lineWidth", "Line width", 0.2, "Width of each cell boundary."),
      unitParameter("drift", "Drift", 0.18, "Movement through the world-space lattice."),
      unitParameter("distortion", "Distortion", 0.22, "Organic displacement of the regular cells."),
      unitParameter("fill", "Cell fill", 0.26, "Brightness inside alternate cells."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.2, "lineWidth", "Thickens the lattice with low-frequency pressure."),
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.18, "distortion", "Briefly displaces cells on transients."),
    ],
    gpuCost: "medium",
    gpuScore: 0.48,
    gpuNotes: "Three analytic hex projections blended by surface normal.",
  }),
  curatedSurfaceShader({
    id: "liquid-metal",
    name: "Liquid metal",
    family: "fluid",
    description: "Slow chrome-like folds with a dark body and concentrated moving highlights.",
    tags: ["liquid", "metal", "chrome", "melting", "reflective", "seamless", "popular-study"],
    defaultSeed: 83939,
    parameterDefinitions: [
      unitParameter("scale", "Fold scale", 0.46, "Scale of the metallic folds."),
      unitParameter("flow", "Flow", 0.32, "Speed of the liquid movement."),
      unitParameter("reflection", "Reflection", 0.7, "Strength of sharp metallic highlights."),
      unitParameter("viscosity", "Viscosity", 0.62, "Roundness and drag of each fold."),
      unitParameter("highlights", "Highlight density", 0.38, "Amount of bright silver detail."),
    ],
    audioReactiveInputs: [
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.44, "flow", "Moves the metallic folds with authored fluidity."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.3, "reflection", "Opens the highlights at peaks."),
    ],
    gpuCost: "medium",
    gpuScore: 0.62,
    gpuNotes: "Domain-warped 3D noise with analytic metallic bands.",
  }),
  curatedSurfaceShader({
    id: "molten-lava",
    name: "Molten lava",
    family: "fire",
    description: "A dark cooling crust split by hot, slowly flowing molten channels.",
    tags: ["lava", "molten", "melting", "fire", "crust", "heat", "seamless", "popular-study"],
    defaultSeed: 85247,
    parameterDefinitions: [
      unitParameter("scale", "Crust scale", 0.44, "Size of the cooling plates."),
      unitParameter("flow", "Molten flow", 0.28, "Speed below the crust."),
      unitParameter("crust", "Crust", 0.64, "Amount of dark cooled material."),
      unitParameter("heat", "Heat", 0.7, "Brightness of the molten channels."),
      unitParameter("cracks", "Crack density", 0.48, "Density of glowing fault lines."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.34, "heat", "Pushes heat through the cracks."),
      audioInput("fracture", "Fracture", "score", "fracture", "smoothstep", 0.4, "cracks", "Opens more channels during fracture states."),
    ],
    gpuCost: "high",
    gpuScore: 0.76,
    gpuNotes: "3D cellular distance and layered flow fields.",
  }),
  curatedSurfaceShader({
    id: "reaction-diffusion",
    name: "Reaction diffusion",
    family: "fluid",
    description: "Cell-like spots and ribbons inspired by activator-inhibitor patterns.",
    tags: ["reaction", "diffusion", "cells", "organic", "melting", "seamless", "popular-study"],
    defaultSeed: 86543,
    parameterDefinitions: [
      unitParameter("scale", "Pattern scale", 0.5, "Scale of the cell network."),
      unitParameter("speed", "Evolution", 0.24, "Rate at which cells reorganise."),
      unitParameter("threshold", "Threshold", 0.52, "Balance between spots and ribbons."),
      unitParameter("contrast", "Contrast", 0.68, "Separation of active and resting cells."),
      unitParameter("morph", "Morph", 0.4, "Amount of domain warping."),
    ],
    audioReactiveInputs: [
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.38, "morph", "Softens and branches the cell structure."),
      audioInput("energy", "Energy", "score", "energy", "envelope", 0.24, "contrast", "Sharpens the pattern at peaks."),
    ],
    gpuCost: "high",
    gpuScore: 0.78,
    gpuNotes: "Two warped 3D fields approximate reaction-diffusion in one pass.",
  }),
  curatedSurfaceShader({
    id: "cellular-voronoi",
    name: "Cellular Voronoi",
    family: "geometric",
    description: "Animated 3D cells with crisp walls that reveal sphere deformation clearly.",
    tags: ["voronoi", "cellular", "cells", "grid", "organic", "seamless", "phase-one", "start-here"],
    defaultSeed: 87853,
    parameterDefinitions: [
      unitParameter("scale", "Cell scale", 0.46, "Number of cells across the sphere."),
      unitParameter("drift", "Cell drift", 0.2, "Speed of internal cell motion."),
      unitParameter("borders", "Borders", 0.7, "Strength of cell walls."),
      unitParameter("fill", "Fill", 0.38, "Brightness of cell interiors."),
      unitParameter("jitter", "Jitter", 0.52, "Irregularity of cell centres."),
    ],
    audioReactiveInputs: [
      audioInput("fracture", "Fracture", "score", "fracture", "smoothstep", 0.34, "borders", "Strengthens cell walls during fracture states."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.24, "drift", "Moves the cells through the room-oriented field."),
    ],
    gpuCost: "high",
    gpuScore: 0.82,
    gpuNotes: "Nearest and second-nearest 3D cellular distances.",
  }),
  curatedSurfaceShader({
    id: "marble-veins",
    name: "Marble veins",
    family: "contour",
    description: "Layered mineral veins that fold continuously through the sphere volume.",
    tags: ["marble", "veins", "mineral", "stone", "organic", "textural", "seamless"],
    defaultSeed: 89153,
    parameterDefinitions: [
      unitParameter("scale", "Vein scale", 0.42, "Spacing of mineral layers."),
      unitParameter("flow", "Flow", 0.18, "Slow movement through the stone."),
      unitParameter("veinWidth", "Vein width", 0.26, "Width of bright mineral seams."),
      unitParameter("contrast", "Contrast", 0.62, "Separation between stone and veins."),
      unitParameter("tint", "Mineral tint", 0.46, "Warm-to-cool mineral colour balance."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "smoothstep", 0.28, "tint", "Shifts the mineral tint with the melodic field."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.18, "flow", "Moves the veins very slowly."),
    ],
    gpuCost: "medium",
    gpuScore: 0.58,
    gpuNotes: "Warped 3D strata with analytic vein shaping.",
  }),
  curatedSurfaceShader({
    id: "crystal-facets",
    name: "Crystal facets",
    family: "geometric",
    description: "Angular cellular planes, hard edges and restrained prismatic light.",
    tags: ["crystal", "facets", "prismatic", "geometry", "ice", "seamless"],
    defaultSeed: 90469,
    parameterDefinitions: [
      unitParameter("scale", "Facet scale", 0.42, "Size of the crystal planes."),
      unitParameter("rotation", "Rotation", 0.16, "Slow turn of the internal facet field."),
      unitParameter("facets", "Facet contrast", 0.72, "Difference between adjacent planes."),
      unitParameter("edgeGlow", "Edge glow", 0.46, "Brightness on crystal boundaries."),
      unitParameter("refraction", "Refraction", 0.48, "Prismatic colour separation."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "linear", 0.34, "refraction", "Adds prismatic colour with melodic content."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.26, "edgeGlow", "Brightens crystal edges at peaks."),
    ],
    gpuCost: "high",
    gpuScore: 0.8,
    gpuNotes: "3D cellular planes plus analytic prismatic edge treatment.",
  }),
  curatedSurfaceShader({
    id: "aurora-ribbons",
    name: "Aurora ribbons",
    family: "planetary",
    description: "Luminous folded ribbons that drift through a near-black atmospheric field.",
    tags: ["aurora", "ribbons", "atmosphere", "lush", "melodic", "seamless", "popular-study"],
    defaultSeed: 91771,
    parameterDefinitions: [
      unitParameter("scale", "Ribbon scale", 0.48, "Spacing of the aurora curtains."),
      unitParameter("drift", "Drift", 0.22, "Speed of the atmospheric movement."),
      unitParameter("ribbons", "Ribbon density", 0.44, "Number of visible folds."),
      unitParameter("glow", "Glow", 0.66, "Brightness of the aurora body."),
      unitParameter("colourShift", "Colour shift", 0.52, "Green-to-violet palette balance."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "smoothstep", 0.5, "colourShift", "Moves the ribbons toward violet with melodic content."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.34, "drift", "Moves the curtains around the room-oriented sphere."),
    ],
    gpuCost: "medium",
    gpuScore: 0.62,
    gpuNotes: "Warped 3D ribbon bands in a single surface pass.",
  }),
  curatedSurfaceShader({
    id: "iridescent-film",
    name: "Iridescent film",
    family: "planetary",
    description: "Oil-film colour bands that flow across the sphere without an equirectangular join.",
    tags: ["iridescent", "oil", "film", "rainbow", "soap", "fluid", "seamless"],
    defaultSeed: 93083,
    parameterDefinitions: [
      unitParameter("scale", "Band scale", 0.5, "Frequency of the interference bands."),
      unitParameter("flow", "Flow", 0.24, "Speed of the film movement."),
      unitParameter("bands", "Bands", 0.6, "Strength of colour interference."),
      unitParameter("sheen", "Sheen", 0.56, "View-facing highlight intensity."),
      unitParameter("colourShift", "Colour shift", 0.5, "Rotation through the spectral palette."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "linear", 0.48, "colourShift", "Rotates the colour field with melody."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "smoothstep", 0.32, "flow", "Moves the interference bands."),
    ],
    gpuCost: "medium",
    gpuScore: 0.56,
    gpuNotes: "Continuous 3D phase field with cosine palette bands.",
  }),
  curatedSurfaceShader({
    id: "electric-filaments",
    name: "Electric filaments",
    family: "particle",
    description: "Branching high-voltage threads over a dark surface, suited to sharp crescendos.",
    tags: ["electric", "lightning", "filaments", "plasma", "energy", "seamless", "popular-study"],
    defaultSeed: 94397,
    parameterDefinitions: [
      unitParameter("scale", "Branch scale", 0.5, "Scale of the electric network."),
      unitParameter("speed", "Pulse speed", 0.46, "Travel speed along the filaments."),
      unitParameter("branches", "Branches", 0.54, "Density of secondary threads."),
      unitParameter("glow", "Glow", 0.72, "Brightness around each filament."),
      unitParameter("sparks", "Sparks", 0.28, "Amount of isolated transient detail."),
    ],
    audioReactiveInputs: [
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.52, "sparks", "Fires isolated sparks on transients."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.44, "glow", "Raises filament glow at peaks."),
    ],
    gpuCost: "high",
    gpuScore: 0.78,
    gpuNotes: "Multiple warped distance fields and pulse shaping.",
  }),
  curatedSurfaceShader({
    id: "cloud-vortex",
    name: "Cloud vortex",
    family: "turbulence",
    description: "A rotating storm-eye structure with layered soft cloud detail.",
    tags: ["cloud", "vortex", "storm", "smoke", "turbulence", "seamless", "popular-study"],
    defaultSeed: 95707,
    parameterDefinitions: [
      unitParameter("scale", "Cloud scale", 0.5, "Size of the cloud layers."),
      unitParameter("rotation", "Rotation", 0.32, "Speed of the vortex turn."),
      unitParameter("density", "Density", 0.56, "Amount of cloud body."),
      unitParameter("contrast", "Contrast", 0.48, "Separation of cloud strata."),
      unitParameter("eye", "Storm eye", 0.38, "Definition of the quiet centre."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.3, "density", "Adds cloud mass with low-frequency pressure."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.3, "rotation", "Turns the vortex through the room-oriented field."),
    ],
    gpuCost: "high",
    gpuScore: 0.8,
    gpuNotes: "Rotated domain-warped 3D fBm with a shaped storm eye.",
  }),
  curatedSurfaceShader({
    id: "mycelium-network",
    name: "Mycelium network",
    family: "contour",
    description: "Fine organic branches that appear to grow through the spherical membrane.",
    tags: ["mycelium", "network", "organic", "branches", "growth", "textural", "seamless"],
    defaultSeed: 97021,
    parameterDefinitions: [
      unitParameter("scale", "Network scale", 0.54, "Spacing of the primary branches."),
      unitParameter("growth", "Growth", 0.24, "Rate at which the field opens."),
      unitParameter("branching", "Branching", 0.58, "Density of secondary strands."),
      unitParameter("glow", "Glow", 0.5, "Brightness of the living edge."),
      unitParameter("organic", "Organic", 0.66, "Irregularity of the network."),
    ],
    audioReactiveInputs: [
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.46, "organic", "Makes the network less regular."),
      audioInput("melody", "Melody", "score", "melody", "linear", 0.28, "growth", "Opens the network with the melodic field."),
    ],
    gpuCost: "high",
    gpuScore: 0.74,
    gpuNotes: "Layered 3D ridge fields and cellular branch masks.",
  }),
  curatedSurfaceShader({
    id: "ocean-swell",
    name: "Ocean swell",
    family: "water",
    description: "Layered rolling wave fronts, dark troughs and fine foam moving around the sphere.",
    tags: ["ocean", "waves", "water", "foam", "fluid", "seamless", "new"],
    defaultSeed: 98317,
    parameterDefinitions: [
      unitParameter("scale", "Wave scale", 0.44, "Spacing of the primary swell."),
      unitParameter("speed", "Wave speed", 0.28, "Travel speed of the wave fronts."),
      unitParameter("swell", "Swell height", 0.62, "Strength of the rolling body."),
      unitParameter("foam", "Foam detail", 0.38, "Amount of fine crest breakup."),
      unitParameter("depth", "Ocean depth", 0.66, "Darkness and colour depth between crests."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.34, "swell", "Expands the wave body with low frequencies."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.32, "speed", "Moves the swell with authored fluidity."),
    ],
    gpuCost: "medium",
    gpuScore: 0.64,
    gpuNotes: "Crossed analytic wave fields with domain-warped crest detail.",
  }),
  curatedSurfaceShader({
    id: "ink-bloom",
    name: "Ink bloom",
    family: "fluid",
    description: "Dark pigment blooms spread and fold like ink dispersing through water.",
    tags: ["ink", "bloom", "fluid", "diffusion", "organic", "melting", "seamless", "new"],
    defaultSeed: 99623,
    parameterDefinitions: [
      unitParameter("scale", "Bloom scale", 0.48, "Size of the pigment clouds."),
      unitParameter("flow", "Diffusion speed", 0.22, "Rate of ink dispersal."),
      unitParameter("bloom", "Bloom body", 0.58, "Amount of dense pigment."),
      unitParameter("diffusion", "Diffusion", 0.64, "Soft branching at bloom edges."),
      unitParameter("pigment", "Pigment colour", 0.52, "Blue-to-magenta pigment balance."),
    ],
    audioReactiveInputs: [
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.38, "diffusion", "Branches the bloom edges."),
      audioInput("melody", "Melody", "score", "melody", "linear", 0.3, "pigment", "Shifts pigment colour with melody."),
    ],
    gpuCost: "high",
    gpuScore: 0.76,
    gpuNotes: "Layered 3D domain warping and soft pigment thresholds.",
  }),
  curatedSurfaceShader({
    id: "magnetic-field",
    name: "Magnetic field",
    family: "contour",
    description: "Flowing field lines bend between invisible poles and expose sphere deformation.",
    tags: ["magnetic", "field", "lines", "contour", "technical", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 100931,
    parameterDefinitions: [
      unitParameter("density", "Line density", 0.48, "Number of magnetic field lines."),
      unitParameter("motion", "Field motion", 0.18, "Slow precession of the poles."),
      unitParameter("strength", "Field strength", 0.72, "Contrast and reach of each line."),
      unitParameter("arcs", "Arc complexity", 0.44, "Secondary bends in the field."),
      unitParameter("polarity", "Polarity colour", 0.5, "Colour separation between opposing poles."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.3, "strength", "Brightens field lines at peaks."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.26, "motion", "Precesses the magnetic axis."),
    ],
    gpuCost: "medium",
    gpuScore: 0.58,
    gpuNotes: "Analytic pole field with layered line bands.",
  }),
  curatedSurfaceShader({
    id: "moire-interference",
    name: "Moiré interference",
    family: "geometric",
    description: "Two continuous line fields interfere to create precise breathing moiré structures.",
    tags: ["moire", "interference", "grid", "lines", "optical", "calibration", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 102241,
    parameterDefinitions: [
      unitParameter("frequency", "Line frequency", 0.52, "Density of the two line fields."),
      unitParameter("rotation", "Field rotation", 0.2, "Relative rotation of the interference layers."),
      unitParameter("contrast", "Contrast", 0.72, "Definition of the moiré bands."),
      unitParameter("interference", "Interference", 0.58, "Separation between primary and secondary fields."),
      unitParameter("phase", "Phase colour", 0.38, "Colour applied at opposing phases."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "linear", 0.28, "rotation", "Turns the interference phase with melody."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.22, "contrast", "Sharpens moiré bands at peaks."),
    ],
    gpuCost: "low",
    gpuScore: 0.34,
    gpuNotes: "Two analytic spherical line fields and phase shaping.",
  }),
  curatedSurfaceShader({
    id: "bioluminescent-plankton",
    name: "Bioluminescent plankton",
    family: "particle",
    description: "Tiny drifting organisms flare in clustered blue-green constellations.",
    tags: ["bioluminescent", "plankton", "particles", "ocean", "organic", "glow", "seamless", "new"],
    defaultSeed: 103553,
    parameterDefinitions: [
      unitParameter("density", "Organism density", 0.42, "Number of visible plankton points."),
      unitParameter("drift", "Drift", 0.24, "Speed of the underwater current."),
      unitParameter("glow", "Glow", 0.68, "Luminous body around each organism."),
      unitParameter("pulse", "Pulse", 0.46, "Rhythm of individual flares."),
      unitParameter("clusters", "Clustering", 0.58, "Amount of group behaviour."),
    ],
    audioReactiveInputs: [
      audioInput("glitch", "Transient", "audio-analysis", "glitch", "pulse", 0.4, "pulse", "Fires local flashes on transients."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.3, "drift", "Moves clusters around the sphere."),
    ],
    gpuCost: "high",
    gpuScore: 0.78,
    gpuNotes: "3D cellular point fields with clustered temporal pulses.",
  }),
  curatedSurfaceShader({
    id: "foam-bubbles",
    name: "Foam bubbles",
    family: "water",
    description: "Translucent cellular bubbles collect into shifting banks of sea foam.",
    tags: ["foam", "bubbles", "water", "cells", "translucent", "seamless", "new"],
    defaultSeed: 104869,
    parameterDefinitions: [
      unitParameter("scale", "Bubble scale", 0.48, "Size of the bubbles."),
      unitParameter("drift", "Foam drift", 0.2, "Speed of the foam bank."),
      unitParameter("borders", "Bubble borders", 0.7, "Definition of bubble rims."),
      unitParameter("fill", "Bubble fill", 0.24, "Brightness inside the bubbles."),
      unitParameter("clumping", "Clumping", 0.56, "Density variation across the foam."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.24, "scale", "Expands bubbles with low-frequency pressure."),
      audioInput("fluidity", "Fluidity", "score", "fluidity", "linear", 0.28, "drift", "Moves foam with the fluid field."),
    ],
    gpuCost: "high",
    gpuScore: 0.8,
    gpuNotes: "Nearest-neighbour 3D cells with shaped translucent rims.",
  }),
  curatedSurfaceShader({
    id: "frost-crystals",
    name: "Frost crystals",
    family: "geometric",
    description: "Angular ice blooms spread into bright crystalline branches over a dark surface.",
    tags: ["frost", "ice", "crystal", "branches", "winter", "textural", "seamless", "new"],
    defaultSeed: 106187,
    parameterDefinitions: [
      unitParameter("scale", "Crystal scale", 0.46, "Size of the frost blooms."),
      unitParameter("growth", "Growth", 0.18, "Rate at which frost spreads."),
      unitParameter("facets", "Facets", 0.62, "Angular structure inside the ice."),
      unitParameter("edgeGlow", "Edge glow", 0.58, "Brightness of crystal edges."),
      unitParameter("coverage", "Frost coverage", 0.46, "Amount of surface overtaken by frost."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "linear", 0.24, "growth", "Opens frost branches with melody."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.24, "edgeGlow", "Brightens frozen edges at peaks."),
    ],
    gpuCost: "high",
    gpuScore: 0.82,
    gpuNotes: "Angular cellular ridges and layered branch masks.",
  }),
  curatedSurfaceShader({
    id: "woven-fibres",
    name: "Woven fibres",
    family: "contour",
    description: "Fine crossing threads reveal a tactile woven skin over the moving envelope.",
    tags: ["woven", "fibres", "fabric", "threads", "textural", "grid", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 107507,
    parameterDefinitions: [
      unitParameter("scale", "Weave scale", 0.54, "Density of the fabric threads."),
      unitParameter("motion", "Thread drift", 0.12, "Subtle motion through the weave."),
      unitParameter("contrast", "Thread contrast", 0.68, "Separation of fibres from the dark body."),
      unitParameter("crossThreads", "Cross threads", 0.52, "Balance between warp and weft."),
      unitParameter("fray", "Fray", 0.26, "Irregular broken fibres."),
    ],
    audioReactiveInputs: [
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.3, "fray", "Makes the weave less regular."),
      audioInput("energy", "Energy", "score", "energy", "linear", 0.2, "contrast", "Raises fibre visibility at peaks."),
    ],
    gpuCost: "medium",
    gpuScore: 0.5,
    gpuNotes: "Blended tri-planar thread fields with bounded fibre breakup.",
  }),
  curatedSurfaceShader({
    id: "topographic-erosion",
    name: "Topographic erosion",
    family: "contour",
    description: "Dense terrain contours split, pool and erode across the spherical landscape.",
    tags: ["topographic", "erosion", "contours", "terrain", "map", "grid", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 108829,
    parameterDefinitions: [
      unitParameter("density", "Contour density", 0.56, "Number of terrain levels."),
      unitParameter("drift", "Terrain drift", 0.14, "Slow movement of the landscape."),
      unitParameter("lineContrast", "Line contrast", 0.72, "Definition of the contour lines."),
      unitParameter("erosion", "Erosion", 0.52, "Breakup and pooling along the levels."),
      unitParameter("relief", "Relief colour", 0.42, "Colour separation between elevations."),
    ],
    audioReactiveInputs: [
      audioInput("fracture", "Fracture", "score", "fracture", "smoothstep", 0.34, "erosion", "Breaks contours during fracture states."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.2, "drift", "Moves the terrain field around the sphere."),
    ],
    gpuCost: "medium",
    gpuScore: 0.6,
    gpuNotes: "Quantised 3D height field with erosion masking.",
  }),
  curatedSurfaceShader({
    id: "cosmic-nebula",
    name: "Cosmic nebula",
    family: "planetary",
    description: "Deep coloured gas clouds open around sparse stellar points and dark voids.",
    tags: ["cosmic", "nebula", "space", "cloud", "stars", "lush", "seamless", "new"],
    defaultSeed: 110153,
    parameterDefinitions: [
      unitParameter("scale", "Cloud scale", 0.46, "Size of the nebula structures."),
      unitParameter("drift", "Cosmic drift", 0.16, "Movement through the gas field."),
      unitParameter("density", "Gas density", 0.62, "Amount of luminous cloud."),
      unitParameter("stars", "Stars", 0.24, "Density of bright stellar points."),
      unitParameter("colour", "Nebula colour", 0.62, "Blue-to-magenta cosmic palette."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.24, "density", "Adds gas body with low frequencies."),
      audioInput("melody", "Melody", "score", "melody", "smoothstep", 0.34, "colour", "Opens the nebula palette with melody."),
    ],
    gpuCost: "high",
    gpuScore: 0.78,
    gpuNotes: "Multi-scale 3D cloud fields and sparse cellular stars.",
  }),
  curatedSurfaceShader({
    id: "holographic-scan",
    name: "Holographic scan",
    family: "matrix",
    description: "Fine scanning planes, spectral breaks and digital depth reveal the tracked volume.",
    tags: ["holographic", "scan", "digital", "matrix", "spectral", "technical", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 111481,
    parameterDefinitions: [
      unitParameter("frequency", "Scan frequency", 0.58, "Density of the scan planes."),
      unitParameter("speed", "Scan speed", 0.28, "Travel speed of the holographic scan."),
      unitParameter("brightness", "Scan brightness", 0.68, "Luminance of the active lines."),
      unitParameter("glitch", "Signal breakup", 0.26, "Amount of controlled digital tearing."),
      unitParameter("spectrum", "Spectrum", 0.54, "Cyan-to-rainbow colour separation."),
    ],
    audioReactiveInputs: [
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.42, "glitch", "Breaks scan planes on transients."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.28, "brightness", "Raises scan luminance at peaks."),
    ],
    gpuCost: "medium",
    gpuScore: 0.54,
    gpuNotes: "Analytic scan planes, hash breakup and spectral edge treatment.",
  }),
  curatedSurfaceShader({
    id: "coral-growth",
    name: "Coral growth",
    family: "fluid",
    description: "Rounded living branches expand into a dense luminous reef-like network.",
    tags: ["coral", "growth", "organic", "branches", "reef", "living", "seamless", "new"],
    defaultSeed: 112811,
    parameterDefinitions: [
      unitParameter("scale", "Colony scale", 0.48, "Size of the coral colonies."),
      unitParameter("growth", "Growth", 0.2, "Rate at which branches open."),
      unitParameter("branching", "Branching", 0.58, "Density of secondary branches."),
      unitParameter("glow", "Living glow", 0.54, "Luminance along new growth."),
      unitParameter("density", "Reef density", 0.52, "Amount of connected coral body."),
    ],
    audioReactiveInputs: [
      audioInput("organic", "Organic", "score", "organic", "smoothstep", 0.42, "branching", "Adds irregular secondary growth."),
      audioInput("melody", "Melody", "score", "melody", "linear", 0.28, "growth", "Opens the colony with melody."),
    ],
    gpuCost: "high",
    gpuScore: 0.8,
    gpuNotes: "Layered cellular ridges and rounded growth masks.",
  }),
  curatedSurfaceShader({
    id: "space-tunnel",
    name: "Space tunnel",
    family: "planetary",
    description: "Rushing stellar rings form a deep room-oriented tunnel through the moving sphere.",
    tags: ["space", "tunnel", "hyperspace", "rings", "stars", "isf-audit", "popular-study", "seamless", "new"],
    defaultSeed: 114149,
    parameterDefinitions: [
      unitParameter("scale", "Tunnel scale", 0.48, "Spacing of the rushing tunnel rings."),
      unitParameter("speed", "Flight speed", 0.34, "Rate at which the tunnel advances."),
      unitParameter("depth", "Depth", 0.68, "Contrast between the tunnel mouth and outer field."),
      unitParameter("streaks", "Star streaks", 0.42, "Density of small luminous streaks."),
      unitParameter("colour", "Spectrum", 0.56, "Blue-to-magenta tunnel colour."),
    ],
    audioReactiveInputs: [
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.34, "depth", "Deepens the tunnel at authored peaks."),
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.32, "speed", "Accelerates the room-oriented flight field."),
    ],
    gpuCost: "medium",
    gpuScore: 0.66,
    gpuNotes: "Analytic 3D rings, a bounded noise warp and sparse cellular streaks.",
  }),
  curatedSurfaceShader({
    id: "kaleidoscopic-warp",
    name: "Kaleidoscopic warp",
    family: "geometric",
    description: "Mirrored spectral folds pulse through the volume without a flat-image join.",
    tags: ["kaleidoscope", "candy", "warp", "symmetry", "spectral", "isf-audit", "popular-study", "seamless", "new"],
    defaultSeed: 115483,
    parameterDefinitions: [
      unitParameter("symmetry", "Symmetry", 0.58, "Density of repeated mirrored folds."),
      unitParameter("speed", "Fold speed", 0.26, "Rate at which the symmetry field evolves."),
      unitParameter("sharpness", "Fold sharpness", 0.66, "Definition of the mirrored edges."),
      unitParameter("warp", "Warp", 0.48, "Distortion applied before the symmetry fold."),
      unitParameter("spectrum", "Spectrum", 0.7, "Amount of spectral colour separation."),
    ],
    audioReactiveInputs: [
      audioInput("melody", "Melody", "score", "melody", "smoothstep", 0.36, "spectrum", "Opens the spectrum with melodic material."),
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.3, "warp", "Snaps the fold field on transients."),
    ],
    gpuCost: "medium",
    gpuScore: 0.62,
    gpuNotes: "Repeated 3D absolute folds with one bounded fBm warp.",
  }),
  curatedSurfaceShader({
    id: "fractal-circuits",
    name: "Fractal circuits",
    family: "matrix",
    description: "Recursive luminous traces split into dense machine-like circuit paths.",
    tags: ["fractal", "circuits", "kali", "recursive", "digital", "matrix", "isf-audit", "popular-study", "seamless", "new"],
    defaultSeed: 116819,
    parameterDefinitions: [
      unitParameter("scale", "Circuit scale", 0.46, "Scale of the recursive circuit field."),
      unitParameter("speed", "Circuit speed", 0.22, "Rate at which traces reorganise."),
      unitParameter("lineWidth", "Line width", 0.34, "Width of the luminous circuit paths."),
      unitParameter("recursion", "Recursion", 0.68, "Weight of deeper folded detail."),
      unitParameter("glow", "Glow", 0.58, "Luminance around the circuit traces."),
    ],
    audioReactiveInputs: [
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.34, "recursion", "Adds recursive detail on sharp transients."),
      audioInput("energy", "Energy", "score", "energy", "envelope", 0.3, "glow", "Raises circuit luminance at peaks."),
    ],
    gpuCost: "high",
    gpuScore: 0.76,
    gpuNotes: "Five fixed 3D inversion folds and analytic line extraction.",
  }),
  curatedSurfaceShader({
    id: "black-hole-lensing",
    name: "Black-hole lensing",
    family: "planetary",
    description: "A dark gravitational core bends a thin animated accretion halo across the sphere.",
    tags: ["black hole", "lensing", "singularity", "accretion", "space", "isf-audit", "popular-study", "seamless", "new"],
    defaultSeed: 118163,
    parameterDefinitions: [
      unitParameter("size", "Core size", 0.42, "Angular size of the dark core."),
      unitParameter("speed", "Spin", 0.28, "Speed of the accretion flow."),
      unitParameter("ringWidth", "Ring width", 0.34, "Thickness of the luminous lensing ring."),
      unitParameter("distortion", "Lensing", 0.7, "Amount of warped structure around the core."),
      unitParameter("colour", "Accretion colour", 0.54, "Warm-to-violet halo colour."),
    ],
    audioReactiveInputs: [
      audioInput("sub", "Sub pressure", "audio-analysis", "sub", "envelope", 0.38, "size", "Expands the gravitational core with low-frequency pressure."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.3, "ringWidth", "Opens the accretion halo at peaks."),
    ],
    gpuCost: "medium",
    gpuScore: 0.64,
    gpuNotes: "Analytic tangent-frame distance field with one animated noise lens.",
  }),
  curatedSurfaceShader({
    id: "concentric-rings",
    name: "Concentric rings",
    family: "geometric",
    description: "Crossing room-oriented hoops expose tracking drift, squash and projection attachment.",
    tags: ["rings", "circles", "hoops", "diagnostic", "grid", "isf-audit", "popular-study", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 119503,
    parameterDefinitions: [
      unitParameter("density", "Ring density", 0.5, "Number of hoops crossing the sphere."),
      unitParameter("speed", "Ring speed", 0.18, "Rate at which the hoops travel."),
      unitParameter("lineWidth", "Line width", 0.24, "Width of each diagnostic ring."),
      unitParameter("crossing", "Crossing set", 0.58, "Strength of the second ring axis."),
      unitParameter("glow", "Glow", 0.48, "Luminance around the hoop lines."),
    ],
    audioReactiveInputs: [
      audioInput("spatialMotion", "Spatial motion", "score", "spatialMotion", "linear", 0.26, "speed", "Moves hoops with authored spatial motion."),
      audioInput("energy", "Energy", "score", "energy", "smoothstep", 0.22, "glow", "Raises ring visibility at peaks."),
    ],
    gpuCost: "low",
    gpuScore: 0.3,
    gpuNotes: "Two analytic great-circle band sets with no texture reads.",
  }),
  curatedSurfaceShader({
    id: "truchet-tiles",
    name: "Truchet tiles",
    family: "geometric",
    description: "Alternating curved tiles form a continuous tri-planar mapping diagnostic.",
    tags: ["truchet", "tiles", "grid", "arcs", "diagnostic", "isf-audit", "popular-study", "seamless", "phase-one", "start-here", "new"],
    defaultSeed: 120847,
    parameterDefinitions: [
      unitParameter("scale", "Tile scale", 0.5, "Number of curved tiles across the surface."),
      unitParameter("speed", "Tile drift", 0.16, "Rate at which the tile field moves."),
      unitParameter("lineWidth", "Arc width", 0.26, "Width of the curved tile paths."),
      unitParameter("twist", "Twist", 0.36, "Rotation and irregularity of each projection."),
      unitParameter("fill", "Tile fill", 0.3, "Subtle brightness inside alternating tiles."),
    ],
    audioReactiveInputs: [
      audioInput("glitch", "Glitch", "audio-analysis", "glitch", "pulse", 0.24, "twist", "Flips tile orientation on transients."),
      audioInput("energy", "Energy", "score", "energy", "linear", 0.2, "lineWidth", "Thickens arcs at peaks."),
    ],
    gpuCost: "medium",
    gpuScore: 0.46,
    gpuNotes: "Three analytic Truchet projections blended by surface normal.",
  }),
] as const;

export const CURATED_SHADER_REGISTRY = createShaderRegistry(
  CURATED_SHADER_DEFINITIONS,
  "neutral",
);

/** A deterministic, renderer-neutral variant shown in the Phase One browser lab. */
export interface ShaderPresetCard {
  id: string;
  name: string;
  shader: ShaderDefinition;
  preset: ShaderPreset;
  variant: number;
  tags: readonly string[];
}

/** Normalise human search text so punctuation and variant separators do not block a match. */
export function normaliseShaderSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Match every query word against the searchable shader-card metadata. */
export function shaderCardMatchesSearch(card: ShaderPresetCard, query: string): boolean {
  const normalisedQuery = normaliseShaderSearch(query);
  if (!normalisedQuery) {
    return true;
  }
  const searchable = normaliseShaderSearch(
    [card.id, card.name, card.shader.family, ...card.tags].join(" "),
  );
  return normalisedQuery
    .split(/\s+/u)
    .every((token) => searchable.includes(token));
}

export const SHADER_PRESET_VARIANTS_PER_SHADER = 16 as const;
export const SHADER_STARTER_VARIANTS_PER_SHADER = 4 as const;

function quantiseVariantValue(
  value: number,
  minimum: number,
  maximum: number,
  step: number | undefined,
): number {
  const bounded = Math.min(maximum, Math.max(minimum, value));
  if (!step || step <= 0) {
    return bounded;
  }
  return Math.min(
    maximum,
    Math.max(minimum, Math.round((bounded - minimum) / step) * step + minimum),
  );
}

function variantParameters(
  shader: ShaderDefinition,
  random: () => number,
): Record<string, ShaderParameterValue> {
  return Object.fromEntries(
    shader.parameterDefinitions.map((parameter) => {
      if (parameter.type === "boolean") {
        return [parameter.id, random() > 0.62];
      }
      if (parameter.type === "enum") {
        const options = parameter.options ?? [];
        return [
          parameter.id,
          options.length > 0
            ? options[Math.floor(random() * options.length)]
            : parameter.defaultValue,
        ];
      }
      if (parameter.type === "colour") {
        return [parameter.id, parameter.defaultValue];
      }
      const minimum = parameter.min ?? (parameter.type === "unit" ? 0 : -1);
      const maximum = parameter.max ?? (parameter.type === "unit" ? 1 : 1);
      const value = minimum + (maximum - minimum) * (0.18 + random() * 0.7);
      return [
        parameter.id,
        parameter.type === "integer"
          ? Math.round(value)
          : quantiseVariantValue(value, minimum, maximum, parameter.step),
      ];
    }),
  );
}

/**
 * Build a large but bounded preset shelf without pretending every card is a
 * separately compiled GPU module. Cards share a validated base definition and
 * carry deterministic parameter values and seeds for renderer adapters.
 */
export function createShaderPresetCatalog(
  registry: ShaderRegistry = CURATED_SHADER_REGISTRY,
  variantsPerShader = SHADER_PRESET_VARIANTS_PER_SHADER,
): readonly ShaderPresetCard[] {
  if (!Number.isInteger(variantsPerShader) || variantsPerShader < 1 || variantsPerShader > 64) {
    throw new Error("variantsPerShader must be an integer between 1 and 64");
  }
  const cards: ShaderPresetCard[] = [];
  registry.shaders.forEach((shader) => {
    for (let variant = 1; variant <= variantsPerShader; variant += 1) {
      const seed = deriveDeterministicShaderSeed(shader.id, variant * 7919);
      const preset = createShaderPreset(
        shader.id,
        variantParameters(shader, createDeterministicRandom(seed)),
        seed,
        registry,
      );
      const suffix = variant.toString().padStart(2, "0");
      const cardTags = variant <= SHADER_STARTER_VARIANTS_PER_SHADER
        ? shader.tags
        : shader.tags.filter((tag) => tag !== "phase-one" && tag !== "start-here");
      cards.push({
        id: `${shader.id}-${suffix}`,
        name: `${shader.name} / ${suffix}`,
        shader,
        preset,
        variant,
        tags: Object.freeze([...cardTags, `variant-${suffix}`]),
      });
    }
  });
  return Object.freeze(cards);
}

export const SHADER_PRESET_CATALOG = createShaderPresetCatalog();
