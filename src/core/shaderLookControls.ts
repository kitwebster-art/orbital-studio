export interface ShaderLookControls {
  exposure: number;
  brightness: number;
  shellGrid: number;
  shellGridDensity: number;
  shellGridWidth: number;
  motion: number;
  scale: number;
  rotation: number;
  hue: number;
  saturation: number;
  contrast: number;
  softness: number;
  level: number;
}

export type ShaderLookControlId = keyof ShaderLookControls;

export interface ShaderLookControlDefinition {
  id: ShaderLookControlId;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description: string;
}

/**
 * Renderer-level controls shared by every procedural look. These stay outside
 * individual presets so an artist can compare different algorithms with the
 * same motion, scale and colour treatment.
 */
export const SHADER_LOOK_CONTROL_DEFINITIONS: readonly ShaderLookControlDefinition[] =
  Object.freeze([
    { id: "exposure", label: "Projection exposure", min: -3, max: 3, step: 0.05, defaultValue: 0, description: "Optional exposure adjustment in stops. Zero keeps the native shader signal; +1 doubles it. Camera exposure is separate." },
    { id: "brightness", label: "Brightness", min: 0, max: 2, step: 0.01, defaultValue: 1, description: "Native shader light level. 100% uses the full authored colour; zero makes artwork black." },
    { id: "shellGrid", label: "Outer grid strength", min: 0, max: 1, step: 0.01, defaultValue: 0.25, description: "Outer balloon shell grid on virtual interior and rear-mesh looks. Zero hides it." },
    { id: "shellGridDensity", label: "Outer grid density", min: 6, max: 40, step: 1, defaultValue: 16, description: "Number of longitude divisions on the virtual balloon shell." },
    { id: "shellGridWidth", label: "Outer grid thickness", min: 0.002, max: 0.04, step: 0.001, defaultValue: 0.008, description: "Grid line width. The shell stays on the mapped balloon independently of content movement." },
    {
      id: "motion",
      label: "Animation speed",
      min: 0,
      max: 4,
      step: 0.01,
      defaultValue: 1.75,
      description: "Global shader clock. The installation default is 1.75×, zero freezes the look and four is fastest.",
    },
    {
      id: "scale",
      label: "Global scale",
      min: 0.35,
      max: 2.5,
      step: 0.01,
      defaultValue: 1,
      description: "Zooms the procedural field without changing the sphere geometry.",
    },
    {
      id: "rotation",
      label: "Surface rotation",
      min: -1,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      description: "Rotates the authored field around the sphere while remaining seam-free.",
    },
    {
      id: "hue",
      label: "Hue shift",
      min: -0.5,
      max: 0.5,
      step: 0.01,
      defaultValue: 0,
      description: "Rotates the final shader palette through the colour spectrum.",
    },
    {
      id: "saturation",
      label: "Saturation",
      min: 0,
      max: 3,
      step: 0.01,
      defaultValue: 1,
      description: "Moves from monochrome through to strongly saturated colour.",
    },
    {
      id: "contrast",
      label: "Contrast",
      min: 0.4,
      max: 2,
      step: 0.01,
      defaultValue: 1,
      description: "Expands or compresses tonal separation within the shader.",
    },
    {
      id: "softness",
      label: "Edge softness",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      description: "Changes the balance between hard graphic masks and soft luminous fields.",
    },
    {
      id: "level",
      label: "Shader level",
      min: 0,
      max: 1.5,
      step: 0.01,
      defaultValue: 1,
      description: "Fine adjustment to authored colour intensity. One preserves the preset level.",
    },
  ]);

export const DEFAULT_SHADER_LOOK_CONTROLS: Readonly<ShaderLookControls> =
  Object.freeze(
    Object.fromEntries(
      SHADER_LOOK_CONTROL_DEFINITIONS.map((definition) => [
        definition.id,
        definition.defaultValue,
      ]),
    ) as unknown as ShaderLookControls,
  );

export function normaliseShaderLookControls(
  values: Partial<ShaderLookControls> = {},
): ShaderLookControls {
  return Object.fromEntries(
    SHADER_LOOK_CONTROL_DEFINITIONS.map((definition) => {
      const candidate = values?.[definition.id];
      const finite = typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : definition.defaultValue;
      return [
        definition.id,
        Math.min(definition.max, Math.max(definition.min, finite)),
      ];
    }),
  ) as unknown as ShaderLookControls;
}

/** Advance an independent shader clock without tying it to show transport. */
export function advanceShaderAnimationTime(
  currentTimeS: number,
  deltaS: number,
  speed: number,
): number {
  const safeCurrent = Number.isFinite(currentTimeS) ? Math.max(0, currentTimeS) : 0;
  const safeDelta = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
  const safeSpeed = normaliseShaderLookControls({ motion: speed }).motion;
  return safeCurrent + safeDelta * safeSpeed;
}

/** Every preset starts at its full native signal with neutral exposure, irrespective of saved grading. */
export function projectionStartingLook(values: Partial<ShaderLookControls> = {}): ShaderLookControls {
  return normaliseShaderLookControls({ ...values, exposure: 0, brightness: 1, saturation: 1, contrast: 1, level: 1 });
}
