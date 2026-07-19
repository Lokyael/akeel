/**
 * config/merge.ts — Deep merge utility for layered configuration.
 */

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Deep-merge two plain objects. Arrays are concatenated (unique). 
 * Throws on reserved prototype-pollution keys.
 */
export function deepMerge(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    if (RESERVED_KEYS.has(key)) throw new Error("reserved configuration key");
    const overrideVal = overrides[key];
    const baseVal = result[key];
    if (Array.isArray(overrideVal) && Array.isArray(baseVal)) {
      result[key] = [...new Set([...baseVal, ...overrideVal])];
    } else {
      const overrideObject = objectRecord(overrideVal);
      const baseObject = objectRecord(baseVal);
      if (overrideObject && baseObject) {
        result[key] = deepMerge(baseObject, overrideObject);
        continue;
      }
      result[key] = overrideVal;
    }
  }
  return result;
}
