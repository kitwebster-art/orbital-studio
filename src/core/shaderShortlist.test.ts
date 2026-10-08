import { describe, expect, it } from "vitest";
import { normaliseShaderShortlist, readShaderShortlist, saveShaderShortlist, toggleShaderShortlist, SHADER_SHORTLIST_STORAGE_KEY } from "./shaderShortlist";

const validIds = new Set(["paint-splatter-16", "interior-orbits-03", "geometric-grid-01", "recipe:anchored-grid"]);

describe("shader shortlist", () => {
  it("retains exact variants and order, removing invalid and duplicated stored entries", () => {
    expect(normaliseShaderShortlist(["paint-splatter-16", 3, "unknown-01", "paint-splatter-16", "interior-orbits-03"], validIds))
      .toEqual(["paint-splatter-16", "interior-orbits-03"]);
    expect(normaliseShaderShortlist({ ids: ["paint-splatter-16"] }, validIds)).toEqual([]);
  });

  it("loads safely when browser storage is corrupt or inaccessible", () => {
    expect(readShaderShortlist({ getItem: () => "{", setItem: () => {} }, validIds)).toEqual([]);
    expect(readShaderShortlist({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }, validIds)).toEqual([]);
    expect(readShaderShortlist(null, validIds)).toEqual([]);
  });

  it("adds and removes a selected variant without changing existing entries", () => {
    const existing = ["interior-orbits-03"];
    const added = toggleShaderShortlist(existing, "paint-splatter-16", validIds);
    expect(added).toEqual(["interior-orbits-03", "paint-splatter-16"]);
    expect(existing).toEqual(["interior-orbits-03"]);
    expect(toggleShaderShortlist(added, "paint-splatter-16", validIds)).toEqual(existing);
    expect(toggleShaderShortlist(existing, "missing", validIds)).toEqual(existing);
  });

  it("persists a reusable shortlist and reports storage failure without throwing", () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
    expect(saveShaderShortlist(storage, ["paint-splatter-16", "interior-orbits-03"])).toBe(true);
    expect(entries.has(SHADER_SHORTLIST_STORAGE_KEY)).toBe(true);
    expect(readShaderShortlist(storage, validIds)).toEqual(["paint-splatter-16", "interior-orbits-03"]);
    expect(saveShaderShortlist(null, [])).toBe(false);
    expect(saveShaderShortlist({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, [])).toBe(false);
  });

  it("keeps authored compositions distinct from their underlying catalogue variant", () => {
    const favourites = toggleShaderShortlist(["geometric-grid-01"], "recipe:anchored-grid", validIds);
    expect(favourites).toEqual(["geometric-grid-01", "recipe:anchored-grid"]);
    expect(toggleShaderShortlist(favourites, "geometric-grid-01", validIds)).toEqual(["recipe:anchored-grid"]);
  });
});
