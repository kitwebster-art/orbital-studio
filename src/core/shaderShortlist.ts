export const SHADER_SHORTLIST_STORAGE_KEY = "orbital.shader-shortlist/1.0";

type ShortlistStorage = Pick<Storage, "getItem" | "setItem">;

/** Stored favourites contain catalogue IDs only, never unvalidated shader settings. */
export function normaliseShaderShortlist(value: unknown, validIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && validIds.has(id)))];
}

export function readShaderShortlist(storage: ShortlistStorage | null, validIds: ReadonlySet<string>): string[] {
  try {
    return normaliseShaderShortlist(JSON.parse(storage?.getItem(SHADER_SHORTLIST_STORAGE_KEY) ?? "[]"), validIds);
  } catch {
    return [];
  }
}

export function toggleShaderShortlist(ids: readonly string[], cardId: string, validIds: ReadonlySet<string>): string[] {
  const clean = normaliseShaderShortlist(ids, validIds);
  if (!validIds.has(cardId)) return clean;
  return clean.includes(cardId) ? clean.filter(id => id !== cardId) : [...clean, cardId];
}

/** Failed persistence leaves the current in-memory shortlist usable. */
export function saveShaderShortlist(storage: ShortlistStorage | null, ids: readonly string[]): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SHADER_SHORTLIST_STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}
