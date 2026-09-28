import { describe, expect, it } from "vitest";
import { getShaderDefinition } from "../core/shaderRegistry";
import { SHADER_RENDER_MODE_IDS } from "../core/mappingLab";
import { LAB_LOOKS, LAB_LOOK_IDS, findLook } from "./looks";

describe("Levitation Lab look shelf", () => {
  it("uses only registered Studio looks with real renderer slots", () => {
    expect(LAB_LOOKS).toHaveLength(LAB_LOOK_IDS.length);
    for (const look of LAB_LOOKS) {
      expect(getShaderDefinition(look.id)).not.toBeNull();
      expect((SHADER_RENDER_MODE_IDS as readonly string[]).includes(look.id)).toBe(true);
      expect(look.renderMode).toBeGreaterThan(0);
      expect(look.shaderSeed).toBeGreaterThanOrEqual(0);
      expect(look.shaderSeed).toBeLessThan(1);
      for (const param of look.params) {
        expect(param).toBeGreaterThanOrEqual(0);
        expect(param).toBeLessThanOrEqual(1);
      }
    }
  });

  it("offers between six and ten distinct looks", () => {
    const ids = new Set(LAB_LOOKS.map((look) => look.id));
    expect(ids.size).toBe(LAB_LOOKS.length);
    expect(LAB_LOOKS.length).toBeGreaterThanOrEqual(6);
    expect(LAB_LOOKS.length).toBeLessThanOrEqual(10);
  });

  it("falls back to the first look for unknown ids", () => {
    expect(findLook("does-not-exist").id).toBe(LAB_LOOKS[0].id);
    expect(findLook("aurora-ribbons").id).toBe("aurora-ribbons");
  });
});
