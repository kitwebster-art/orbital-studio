import { describe, expect, it } from "vitest";
import { BALLOON_COMPOSITION_RECIPES, CREATIVE_RECIPES, IRIDESCENT_LINE_RECIPES } from "./creativeRecipes";
import { normaliseContentMotionSettings } from "./contentMotion";
import { DEFAULT_SHADER_LOOK_CONTROLS, normaliseShaderLookControls } from "./shaderLookControls";
import { SHADER_PRESET_CATALOG, createShaderPreset, getShaderDefinition, parseShaderPreset, serialiseShaderPreset } from "./shaderRegistry";

describe("creative compositions", () => {
  it("provides nine distinct validated recipes with separate line studies and original compositions", () => {
    expect(CREATIVE_RECIPES).toHaveLength(9);
    expect(BALLOON_COMPOSITION_RECIPES).toHaveLength(6);
    expect(IRIDESCENT_LINE_RECIPES).toHaveLength(3);
    expect(new Set(CREATIVE_RECIPES.map(({ id }) => id)).size).toBe(9);
    for (const recipe of CREATIVE_RECIPES) {
      expect(recipe.name.length).toBeGreaterThan(0);
      expect(recipe.description.length).toBeGreaterThan(0);
      expect(getShaderDefinition(recipe.preset.shaderId)?.gpuEstimate.passes).toBe(1);
      expect(parseShaderPreset(JSON.parse(serialiseShaderPreset(recipe.preset)))).toEqual(recipe.preset);
    }
  });

  it("reconstructs exactly from explicit seeds and preserves full projection starting levels", () => {
    for (const recipe of CREATIVE_RECIPES) {
      expect(createShaderPreset(recipe.preset.shaderId, recipe.preset.parameters, recipe.preset.seed))
        .toEqual(recipe.preset);
      expect(recipe.look).toEqual(normaliseShaderLookControls(recipe.look));
      expect(recipe.look).toMatchObject({ exposure: 0, brightness: 1, saturation: 1, contrast: 1, level: 1 });
      expect(recipe.motion).toEqual(normaliseContentMotionSettings(recipe.motion));
      expect(Object.isFrozen(recipe.preset.parameters)).toBe(true);
      expect(Object.isFrozen(recipe.look)).toBe(true);
    }
  });

  it("separates small rapid paint flashes from larger lingering splashes", () => {
    const confetti = CREATIVE_RECIPES.find(({ id }) => id === "confetti-blasts")!;
    const paint = CREATIVE_RECIPES.find(({ id }) => id === "wet-paint-layers")!;
    expect(confetti.preset.shaderId).toBe("paint-splatter");
    expect(paint.preset.shaderId).toBe("paint-splatter");
    expect(confetti.preset.parameters.size).toBeLessThan(paint.preset.parameters.size as number);
    expect(confetti.preset.parameters.retention).toBeLessThan(paint.preset.parameters.retention as number);
    expect(confetti.preset.parameters.rate).toBeGreaterThan(paint.preset.parameters.rate as number);
    expect(confetti.look.motion).toBeGreaterThan(paint.look.motion);
    expect(confetti.preset.seed).not.toBe(paint.preset.seed);
  });

  it("frames the virtual interiors with a shell and supports both translation illusions", () => {
    for (const id of ["suspended-crystal", "orbital-mechanism"]) {
      const recipe = CREATIVE_RECIPES.find((entry) => entry.id === id)!;
      expect(recipe.description).toContain("virtual");
      expect(recipe.look.shellGrid).toBeGreaterThan(0);
      expect(recipe.look.shellGrid).toBeLessThan(0.3);
    }
    const anchor = CREATIVE_RECIPES.find(({ id }) => id === "anchored-grid")!;
    expect(anchor.look.motion).toBe(0);
    expect(anchor.motion.mode).toBe("world-locked");
    const counterflow = CREATIVE_RECIPES.find(({ id }) => id === "counterflow-filaments")!;
    expect(counterflow.preset.shaderId).toBe("electric-filaments");
    expect(counterflow.motion).toEqual({ mode: "opposite", gain: 3 });
  });

  it("contains only artwork and content motion, without rig, output or audio state", () => {
    for (const recipe of CREATIVE_RECIPES) {
      expect(Object.keys(recipe).sort()).toEqual(["description", "id", "look", "motion", "name", "preset"]);
      expect(Object.keys(recipe.motion).sort()).toEqual(["gain", "mode"]);
      expect(Object.keys(recipe.preset).sort()).toEqual(["parameters", "schemaVersion", "seed", "shaderId"]);
    }
  });

  it("keeps all line studies at the established iridescent flow pace and full native signal", () => {
    const reference = SHADER_PRESET_CATALOG.find(card => card.id === "iridescent-film-01")!;
    for (const recipe of IRIDESCENT_LINE_RECIPES) {
      expect(recipe.preset.parameters.flow).toBe(reference.preset.parameters.flow);
      expect(recipe.preset.parameters.scale).toBe(reference.preset.parameters.scale);
      expect(recipe.look.motion).toBe(DEFAULT_SHADER_LOOK_CONTROLS.motion);
      expect(recipe.look).toMatchObject({ exposure: 0, brightness: 1, saturation: 1, hue: 0, level: 1 });
      expect(recipe.motion).toEqual({ mode: "surface", gain: 1 });
    }
  });

  it("distinguishes fine rainbow lines, bold colour contours and native monochrome", () => {
    const rainbow = IRIDESCENT_LINE_RECIPES.find(({ id }) => id === "rainbow-filaments")!;
    const contours = IRIDESCENT_LINE_RECIPES.find(({ id }) => id === "chromatic-contours")!;
    const monochrome = IRIDESCENT_LINE_RECIPES.find(({ id }) => id === "monochrome-squiggles")!;
    expect(rainbow.preset.parameters.lineWidth).toBeLessThan(contours.preset.parameters.lineWidth as number);
    expect(rainbow.preset.parameters.colourShift).not.toBe(contours.preset.parameters.colourShift);
    expect(monochrome.preset.shaderId).toBe("monochrome-squiggles");
    expect(monochrome.preset.parameters.inversion).toBe(0);
    expect(monochrome.preset.parameters).not.toHaveProperty("colourShift");
    expect(monochrome.look.hue).toBe(0);
    expect(monochrome.look.saturation).toBe(1);
  });
});
