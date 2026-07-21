import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUILTIN_PROFILES_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "builtins.json");
export const DEFAULT_PROFILE_NAME = "plan";
