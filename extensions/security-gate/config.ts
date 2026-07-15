/**
 * security-gate/config.ts — Configuration loading with presets and deep merge.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "./utils";
import type { SecurityConfig, SecurityLevel } from "./types";

// ─── Load presets ───

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PRESETS_PATH = resolve(MODULE_DIR, "../../config/presets.json");

function loadPresets(): Record<SecurityLevel, SecurityConfig> {
  const raw = readFileSync(PRESETS_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.presets as Record<SecurityLevel, SecurityConfig>;
}

export const DEFAULT_CONFIGS: Record<SecurityLevel, SecurityConfig> = loadPresets();

// ─── Deep merge ───

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    const overrideVal = (overrides as Record<string, unknown>)[key];
    const baseVal = result[key];
    if (
      overrideVal !== null && typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null && typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else {
      result[key] = overrideVal;
    }
  }
  return result as T;
}

// ─── Config loading ───

/** Load merged security config: global → presets → project overrides. */
export function loadConfig(cwd: string): SecurityConfig {
  const globalConfigPath = join(getAgentDir(), "extensions", "security-gate", "config.json");
  let merged: SecurityConfig | null = null;

  if (existsSync(globalConfigPath)) {
    try {
      const global = JSON.parse(readFileSync(globalConfigPath, "utf-8")) as Partial<SecurityConfig>;
      if (global.level && DEFAULT_CONFIGS[global.level]) {
        merged = deepMerge(DEFAULT_CONFIGS[global.level], global);
      }
    } catch (e) {
      console.error(`security-gate: Failed to parse ${globalConfigPath}:`, e);
    }
  }

  if (!merged) {
    merged = DEFAULT_CONFIGS.standard;
  }

  const projectConfigPath = join(cwd, ".pi", "extensions", "security-gate", "config.json");
  if (existsSync(projectConfigPath)) {
    try {
      const project = JSON.parse(readFileSync(projectConfigPath, "utf-8")) as Partial<SecurityConfig>;
      merged = deepMerge(merged, project);
    } catch (e) {
      console.error(`security-gate: Failed to parse ${projectConfigPath}:`, e);
    }
  }

  return merged;
}
