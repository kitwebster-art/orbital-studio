import { normaliseContentMotionSettings, type ContentMotionSettings } from "./contentMotion";
import { projectionStartingLook, type ShaderLookControls } from "./shaderLookControls";
import { createShaderPreset, type ShaderPreset } from "./shaderRegistry";

export interface CreativeRecipe {
  id: string;
  name: string;
  description: string;
  preset: ShaderPreset;
  look: ShaderLookControls;
  motion: ContentMotionSettings;
}

function recipe(value: CreativeRecipe): CreativeRecipe {
  Object.freeze(value.preset.parameters);
  Object.freeze(value.preset);
  Object.freeze(value.look);
  Object.freeze(value.motion);
  return Object.freeze(value);
}

/** Authored compositions using existing single-pass shaders and tracked translation. */
export const BALLOON_COMPOSITION_RECIPES: readonly CreativeRecipe[] = Object.freeze([
  recipe({
    id: "confetti-blasts",
    name: "Confetti blasts",
    description: "Rapid small paint bursts and fine droplets flash in six colours against black.",
    preset: createShaderPreset("paint-splatter", {
      size: 0.12, rate: 1, retention: 0.08, scatter: 0.95, pigment: 0.16,
    }, 740101),
    look: projectionStartingLook({ motion: 2.6, scale: 1.45, softness: 0.16, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
  recipe({
    id: "wet-paint-layers",
    name: "Wet paint layers",
    description: "Large ragged splashes overlap, with longer trails and lingering coloured paint over black.",
    preset: createShaderPreset("paint-splatter", {
      size: 0.94, rate: 0.58, retention: 0.98, scatter: 1, pigment: 0.5,
    }, 740102),
    look: projectionStartingLook({ motion: 1.55, scale: 0.9, softness: 0.26, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
  recipe({
    id: "suspended-crystal",
    name: "Suspended crystal",
    description: "A slowly turning virtual crystal appears inside the balloon, framed by a fine outer shell grid.",
    preset: createShaderPreset("interior-crystal", {
      radius: 0.64, speed: 0.12, light: 0.76, edge: 0.4, palette: 0.18,
    }, 740103),
    look: projectionStartingLook({
      motion: 0.55, shellGrid: 0.13, shellGridDensity: 14, shellGridWidth: 0.004,
    }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
  recipe({
    id: "orbital-mechanism",
    name: "Orbital mechanism",
    description: "Three tilted virtual rings and bright orbiting cores rotate inside a visible balloon cage.",
    preset: createShaderPreset("interior-orbits", {
      radius: 0.68, speed: 0.7, core: 0.65, lineWidth: 0.52, palette: 0.42,
    }, 740104),
    look: projectionStartingLook({
      motion: 1.4, shellGrid: 0.22, shellGridDensity: 12, shellGridWidth: 0.005,
    }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
  recipe({
    id: "anchored-grid",
    name: "Anchored grid",
    description: "A frozen geometric pattern appears fixed in the room as the tracked balloon moves through it.",
    preset: createShaderPreset("geometric-grid", {
      gridScale: 0.58, lineWidth: 0.22, rotation: 0.16, quantisation: 0, coverage: 0.75,
    }, 740105),
    look: projectionStartingLook({ motion: 0, scale: 1, softness: 0.1, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "world-locked", gain: 1 }),
  }),
  recipe({
    id: "counterflow-filaments",
    name: "Counterflow filaments",
    description: "Electric threads rush opposite the balloon's tracked travel at three times its speed, with pulsing sparks.",
    preset: createShaderPreset("electric-filaments", {
      scale: 0.68, speed: 0.7, branches: 0.76, glow: 0.85, sparks: 0.45,
    }, 740106),
    look: projectionStartingLook({ motion: 1.8, scale: 1.15, softness: 0.2, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "opposite", gain: 3 }),
  }),
]);

/** Line studies share the established Iridescent film / 01 flow and animation pace. */
export const IRIDESCENT_LINE_RECIPES: readonly CreativeRecipe[] = Object.freeze([
  recipe({
    id: "rainbow-filaments",
    name: "Rainbow filaments",
    description: "Fine flowing rainbow squiggles travel across a black balloon surface.",
    preset: createShaderPreset("rainbow-filaments", {
      scale: 0.7200517657632008, flow: 0.5239461614238098, density: 0.72, lineWidth: 0.25, colourShift: 0.515235665878281,
    }, 740107),
    look: projectionStartingLook({ motion: 1.75, hue: 0, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
  recipe({
    id: "chromatic-contours",
    name: "Chromatic contours",
    description: "Bold saturated colour contours flow through broad curves over black.",
    preset: createShaderPreset("chromatic-contours", {
      scale: 0.7200517657632008, flow: 0.5239461614238098, density: 0.46, lineWidth: 0.6, colourShift: 0.18,
    }, 740108),
    look: projectionStartingLook({ motion: 1.75, hue: 0, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
  recipe({
    id: "monochrome-squiggles",
    name: "Monochrome squiggles",
    description: "White fingerprint-like topographic squiggles flow across a black surface.",
    preset: createShaderPreset("monochrome-squiggles", {
      scale: 0.7200517657632008, flow: 0.5239461614238098, density: 0.64, lineWidth: 0.32, inversion: 0,
    }, 740109),
    look: projectionStartingLook({ motion: 1.75, hue: 0, shellGrid: 0 }),
    motion: normaliseContentMotionSettings({ mode: "surface", gain: 1 }),
  }),
]);

/** Every featured recipe remains available to the persistent favourite shortlist. */
export const CREATIVE_RECIPES: readonly CreativeRecipe[] = Object.freeze([
  ...BALLOON_COMPOSITION_RECIPES,
  ...IRIDESCENT_LINE_RECIPES,
]);
