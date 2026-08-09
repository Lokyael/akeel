import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUILTIN_PROFILES_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "builtins.json");
export const DEFAULT_PROFILE_NAME = "keel-plan";
/** 全局配置损坏时的回退 profile 名（最受限的内置，T-047 #4 单点化）。 */
export const READ_FALLBACK_PROFILE_NAME = "keel-read";

export const PROFILE_PREFIX = "keel-";

/** Strip the keel- prefix for display. "keel-read" → "read", "custom" → "custom". */
export function displayName(name: string): string {
  return name.startsWith(PROFILE_PREFIX) ? name.slice(PROFILE_PREFIX.length) : name;
}
