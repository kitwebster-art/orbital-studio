/**
 * A curated shelf of Orbital Studio's projection looks for the Levitation Lab.
 * Everything comes from the Studio shader registry, so a look chosen here is
 * the same algorithm, seed and parameters the Studio projects on the sphere.
 */
import {
  createShaderPreset,
  deriveDeterministicShaderSeed,
  listShaderDefinitions,
  type ShaderPreset,
} from "../core/shaderRegistry";
import { shaderRenderModeIndex } from "../core/mappingLab";

/** Ordered for the picker: calm and legible first, then richer fields. */
export const LAB_LOOK_IDS = [
  "geometric-grid",
  "fluid-membrane",
  "contour-field",
  "water-caustics",
  "aurora-ribbons",
  "reaction-diffusion",
  "holographic-scan",
  "iridescent-film",
] as const;

export type LabLookId = (typeof LAB_LOOK_IDS)[number];

export interface LabLook {
  id: string;
  name: string;
  description: string;
  preset: ShaderPreset;
  /** Renderer slot in the Studio surface shader. */
  renderMode: number;
  /** uShaderSeed value, as OrbitalScene.setShaderPreset derives it. */
  shaderSeed: number;
  /** uShaderParamA..E, in parameter-definition order. */
  params: [number, number, number, number, number];
}

export function buildLabLooks(): LabLook[] {
  const definitions = listShaderDefinitions();
  const looks: LabLook[] = [];
  for (const id of LAB_LOOK_IDS) {
    const definition = definitions.find((shader) => shader.id === id);
    if (!definition) continue;
    const preset = createShaderPreset(definition.id);
    const numeric = Object.values(preset.parameters).filter(
      (value): value is number => typeof value === "number",
    );
    looks.push({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      preset,
      renderMode: shaderRenderModeIndex(definition.id),
      shaderSeed: deriveDeterministicShaderSeed(preset.shaderId, preset.seed) / 4294967296,
      params: [
        numeric[0] ?? 0.5,
        numeric[1] ?? 0.5,
        numeric[2] ?? 0.5,
        numeric[3] ?? 0.5,
        numeric[4] ?? 0.5,
      ],
    });
  }
  return looks;
}

export const LAB_LOOKS: readonly LabLook[] = buildLabLooks();
export const DEFAULT_LOOK_ID: string = LAB_LOOKS[1]?.id ?? LAB_LOOKS[0]?.id ?? "neutral";

export function findLook(id: string): LabLook {
  return LAB_LOOKS.find((look) => look.id === id) ?? LAB_LOOKS[0];
}
