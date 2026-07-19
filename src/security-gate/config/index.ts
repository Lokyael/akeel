/**
 * config/index.ts — Security configuration loading and composition.
 *
 * Loads presets (built-in), then overlays global config, then project config.
 * Each layer is validated and deep-merged. Invalid configs fall back gracefully.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "../shared/paths";
import type { SecurityConfig, SecurityLevel } from "../types";
import { cloneConfig, validateConfig } from "./validation";
import { deepMerge } from "./merge";

// Re-export for consumers that need validation/cloning directly
export { cloneConfig, validateConfig };

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PRESETS_PATH = resolve(MODULE_DIR, "./presets.json");
const LEVELS: SecurityLevel[] = ["strict", "standard", "permissive"];

function loadPresets(): Record<SecurityLevel, SecurityConfig> {
  const raw = readFileSync(PRESETS_PATH, "utf-8");
  const parsed = JSON.parse(raw) as { presets: Record<SecurityLevel, unknown> };
  const result: Partial<Record<SecurityLevel, SecurityConfig>> = {};
  for (const level of LEVELS) {
    const config = validateConfig(parsed.presets?.[level]);
    if (!config) throw new Error(`Invalid built-in preset: ${level}`);
    result[level] = config;
  }
  return result as Record<SecurityLevel, SecurityConfig>;
}

export const DEFAULT_CONFIGS: Record<SecurityLevel, SecurityConfig> = loadPresets();

/**
 * Load security configuration for a project at `cwd`.
 * Resolution order: built-in preset → global config → project config.
 */
export function loadConfig(cwd: string): SecurityConfig {
  const globalConfigPath = join(getAgentDir(), "extensions", "security-gate", "config.json");
  let merged = cloneConfig(DEFAULT_CONFIGS.standard);

  if (existsSync(globalConfigPath)) {
    try {
      const global = JSON.parse(readFileSync(globalConfigPath, "utf-8")) as Record<string, unknown>;
      const level = global.level as SecurityLevel;
      const base = DEFAULT_CONFIGS[level] ?? DEFAULT_CONFIGS.standard;
      const candidate = validateConfig(deepMerge(cloneConfig(base) as unknown as Record<string, unknown>, global));
      if (candidate) merged = candidate;
    } catch (error) {
      console.error(`security-gate: Failed to load ${globalConfigPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const projectConfigPath = join(cwd, ".pi", "extensions", "security-gate", "config.json");
  if (existsSync(projectConfigPath)) {
    try {
      const project = JSON.parse(readFileSync(projectConfigPath, "utf-8")) as Record<string, unknown>;
      const hasProjectLevel = Object.prototype.hasOwnProperty.call(project, "level");
      const projectLevel = project.level as SecurityLevel;
      const projectBase = hasProjectLevel
        ? (LEVELS.includes(projectLevel) ? DEFAULT_CONFIGS[projectLevel] : null)
        : merged;
      if (projectBase) {
        const { level: _projectLevel, ...projectOverrides } = project;
        const candidate = validateConfig(deepMerge(cloneConfig(projectBase) as unknown as Record<string, unknown>, projectOverrides));
        if (candidate) merged = candidate;
      }
    } catch (error) {
      console.error(`security-gate: Failed to load ${projectConfigPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return cloneConfig(merged);
}
