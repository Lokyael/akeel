/**
 * security-gate/presets.ts — Default security configurations.
 * Single source of truth: imported from config/presets.json.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SecurityConfig, SecurityLevel } from "./types";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PRESETS_PATH = resolve(MODULE_DIR, "../../config/presets.json");

function loadPresets(): Record<SecurityLevel, SecurityConfig> {
  const raw = readFileSync(PRESETS_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.presets as Record<SecurityLevel, SecurityConfig>;
}

export const DEFAULT_CONFIGS: Record<SecurityLevel, SecurityConfig> = loadPresets();
