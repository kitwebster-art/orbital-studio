import { describe, expect, it } from "vitest";
import {
  CURATED_SHADER_REGISTRY,
  SHADER_PRESET_CATALOG,
  SHADER_PRESET_VARIANTS_PER_SHADER,
  SHADER_STARTER_VARIANTS_PER_SHADER,
  SHADER_PRESET_SCHEMA_VERSION,
  createDeterministicRandom,
  createShaderPreset,
  deriveDeterministicShaderSeed,
  getShaderDefinition,
  listShaders,
  shaderCardMatchesSearch,
  normaliseShaderSearch,
  parseShaderPreset,
  resolveShaderDefinition,
  resolveShaderPreset,
  serialiseShaderPreset,
  validateShaderParameters,
  validateShaderRegistry,
} from "./shaderRegistry";

describe("Orbital shader registry", () => {
  it("ships a small curated set covering the authored visual families", () => {
    const shaders = CURATED_SHADER_REGISTRY.shaders;
    const families = new Set(shaders.map((shader) => shader.family));

    expect(shaders.length).toBeGreaterThanOrEqual(12);
    expect(CURATED_SHADER_REGISTRY.fallbackShaderId).toBe("neutral");
    expect(families).toEqual(
      new Set([
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
      ]),
    );
    shaders.forEach((shader) => {
      expect(shader.parameterDefinitions.length).toBeGreaterThan(0);
      expect(shader.gpuEstimate.passes).toBeGreaterThan(0);
      expect(shader.projectorCompatibility.minimumProjectors).toBeGreaterThan(0);
      expect(shader.projectorCompatibility.maximumProjectors).toBeLessThanOrEqual(5);
      expect(shader.fallbackShaderId === null || getShaderDefinition(shader.fallbackShaderId)).toBeTruthy();
      shader.audioReactiveInputs.forEach((input) => {
        expect(shader.parameterDefinitions.some((parameter) => parameter.id === input.targetParameterId)).toBe(true);
      });
    });
  });

  it("uses a deterministic seed and random stream for repeatable shader output", () => {
    const seedA = deriveDeterministicShaderSeed("fluid-membrane", 42);
    const seedB = deriveDeterministicShaderSeed("fluid-membrane", 42);
    const first = createDeterministicRandom(seedA);
    const second = createDeterministicRandom(seedB);

    expect(seedA).toBe(seedB);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(seedA).not.toBe(deriveDeterministicShaderSeed("fluid-membrane", 43));
  });

  it("supports simple UI-oriented list, filter and parameter validation", () => {
    expect(listShaders({ family: "fluid" }).map((shader) => shader.id)).toEqual([
      "fluid-membrane",
      "liquid-metal",
      "reaction-diffusion",
      "ink-bloom",
      "coral-growth",
    ]);
    expect(listShaders({ gpuCost: "low", projectorCount: 5 }).length).toBeGreaterThan(0);
    expect(listShaders({ tag: "prediction" }).map((shader) => shader.id)).toEqual([
      "prediction-ghost",
    ]);

    const values = validateShaderParameters("contour-field", {
      lineDensity: 0.7,
    });
    expect(values.lineDensity).toBe(0.7);
    expect(values.lineContrast).toBe(0.46);
    expect(() => validateShaderParameters("contour-field", { lineDensity: 2 })).toThrow(
      /between 0 and 1|parameter range/u,
    );
  });

  it("covers the popularity-backed ISF generator gaps with animated surface algorithms", () => {
    const auditedShaders = listShaders({ tag: "isf-audit" });

    expect(auditedShaders.map((shader) => shader.id)).toEqual([
      "space-tunnel",
      "kaleidoscopic-warp",
      "fractal-circuits",
      "black-hole-lensing",
      "concentric-rings",
      "truchet-tiles",
    ]);
    auditedShaders.forEach((shader) => {
      expect(shader.tags).toEqual(
        expect.arrayContaining(["popular-study", "seamless", "new"]),
      );
      expect(shader.parameterDefinitions).toHaveLength(5);
      expect(shader.parameterDefinitions.some((parameter) => parameter.id === "speed")).toBe(true);
      expect(shader.source).toMatchObject({
        moduleId: "orbital-surface",
        kind: "surface",
      });
    });
  });

  it("round-trips a complete, validated shader preset", () => {
    const preset = createShaderPreset(
      "fluid-membrane",
      { scale: 0.73, turbulence: 0.61 },
      1234,
    );
    const parsed = parseShaderPreset(JSON.parse(serialiseShaderPreset(preset)));

    expect(preset.schemaVersion).toBe(SHADER_PRESET_SCHEMA_VERSION);
    expect(parsed).toEqual(preset);
    expect(Object.keys(parsed.parameters)).toEqual([
      "scale",
      "turbulence",
      "flow",
      "luminousBody",
      "residualTint",
    ]);
    expect(() => createShaderPreset("fluid-membrane", {}, -1)).toThrow(
      /unsigned 32-bit integer/u,
    );
  });

  it("rejects out-of-range and unknown preset parameters", () => {
    const preset = createShaderPreset("contour-field");
    expect(() =>
      parseShaderPreset({
        ...preset,
        parameters: { ...preset.parameters, lineDensity: 1.2 },
      }),
    ).toThrow(/within the parameter range|between 0 and 1/u);
    expect(() =>
      parseShaderPreset({
        ...preset,
        parameters: { ...preset.parameters, unsupported: 0.2 },
      }),
    ).toThrow(/unknown parameter/u);
  });

  it("falls back to the neutral shader for missing or malformed selections", () => {
    expect(resolveShaderDefinition("does-not-exist").id).toBe("neutral");

    const resolution = resolveShaderPreset({
      schemaVersion: SHADER_PRESET_SCHEMA_VERSION,
      shaderId: "does-not-exist",
      seed: 1,
      parameters: {},
    });
    expect(resolution.usedFallback).toBe(true);
    expect(resolution.shader.id).toBe("neutral");
    expect(resolution.preset.shaderId).toBe("neutral");
    expect(resolution.issues).toHaveLength(1);
  });

  it("protects the fallback boundary when a registry is malformed", () => {
    expect(() =>
      validateShaderRegistry({
        ...CURATED_SHADER_REGISTRY,
        fallbackShaderId: "missing",
      }),
    ).toThrow(/fallback .* is missing/u);
  });

  it("provides a deterministic large preset shelf without duplicate cards", () => {
    const expectedLooks =
      CURATED_SHADER_REGISTRY.shaders.length * SHADER_PRESET_VARIANTS_PER_SHADER;
    expect(SHADER_PRESET_CATALOG.length).toBe(expectedLooks);
    expect(new Set(SHADER_PRESET_CATALOG.map((card) => card.id)).size).toBe(expectedLooks);
    const grid = SHADER_PRESET_CATALOG.find(
      (card) => card.id === "geometric-grid-01",
    );
    const repeat = SHADER_PRESET_CATALOG.find(
      (card) => card.id === "geometric-grid-01",
    );
    expect(grid?.preset.shaderId).toBe("geometric-grid");
    expect(grid?.preset.seed).toBe(repeat?.preset.seed);
    expect(CURATED_SHADER_REGISTRY.shaders).toHaveLength(43);
    expect(SHADER_PRESET_CATALOG).toHaveLength(688);
  });

  it("matches human search phrases across punctuation and card metadata", () => {
    const matrix = SHADER_PRESET_CATALOG.find((card) => card.id === "matrix-rain-07");
    expect(matrix).toBeTruthy();
    expect(normaliseShaderSearch("Matrix rain / 07")).toBe("matrix rain 07");
    expect(shaderCardMatchesSearch(matrix!, "matrix rain 07")).toBe(true);
    expect(shaderCardMatchesSearch(matrix!, "numbers matrix")).toBe(true);
    expect(shaderCardMatchesSearch(matrix!, "water")).toBe(false);
    expect(shaderCardMatchesSearch(matrix!, "zz-no-match")).toBe(false);
  });

  it("marks the shape-readable starting set for the Phase One bench", () => {
    const phaseOneCards = SHADER_PRESET_CATALOG.filter((card) => card.tags.includes("phase-one"));
    const phaseOneAlgorithms = CURATED_SHADER_REGISTRY.shaders.filter(
      (shader) => shader.tags.includes("phase-one"),
    );
    expect(phaseOneAlgorithms.length).toBeGreaterThanOrEqual(6);
    expect(phaseOneCards).toHaveLength(
      phaseOneAlgorithms.length * SHADER_STARTER_VARIANTS_PER_SHADER,
    );
    expect(phaseOneCards.every((card) => card.tags.includes("start-here"))).toBe(true);
    expect(shaderCardMatchesSearch(phaseOneCards[0]!, "start here")).toBe(true);
  });
});
