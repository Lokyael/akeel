import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PROFILES_PATH, DEFAULT_PROFILE_NAME, READ_FALLBACK_PROFILE_NAME } from "./defaults";
import { resolveProfiles } from "./resolve";
import type { RawProfiles, ResolvedProfiles } from "./types";
import { getAgentDir } from "../agent-dir";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function mergeSources(base: RawProfiles, override: unknown): RawProfiles {
  const layer = override as { defaultProfile?: string; profiles?: Record<string, unknown>; subagentProfiles?: Record<string, string> };
  return {
    defaultProfile: layer.defaultProfile ?? base.defaultProfile,
    profiles: {
      ...base.profiles,
      ...(layer.profiles ?? {}),
    } as RawProfiles["profiles"],
    ...(layer.subagentProfiles !== undefined ? { subagentProfiles: { ...layer.subagentProfiles } } : {}),
  };
}

interface LayerResult {
  raw: RawProfiles;
  error?: string;
}

function loadLayer(base: RawProfiles, path: string): LayerResult {
  if (!existsSync(path)) return { raw: base };
  try {
    const parsed = readJson(path);
    const candidate = mergeSources(base, parsed);
    const resolved = resolveProfiles(candidate);
    if (!resolved.ok) throw new Error(resolved.error);
    return { raw: candidate };
  } catch (error) {
    const message = `access-gate: failed to load ${path}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    return { raw: base, error: message };
  }
}

export interface ProfileLoadOptions {
  agentDir?: string;
  onError?: (message: string) => void;
}

export function loadProfiles(options: ProfileLoadOptions = {}): ResolvedProfiles {
  const builtinRaw = readJson(BUILTIN_PROFILES_PATH);
  const builtin = resolveProfiles(builtinRaw);
  if (!builtin.ok) throw new Error(`invalid built-in profiles: ${builtin.error}`);

  const base = structuredClone(builtinRaw) as RawProfiles;
  base.defaultProfile ||= builtin.value.defaultProfile || DEFAULT_PROFILE_NAME;
  const global = loadLayer(base, join(options.agentDir ?? getAgentDir(), "pi-keel", "profiles.json"));
  if (global.error) {
    options.onError?.(global.error);
    // 全局配置损坏 → 回退到内置集中最受限的 profile（keel-read），不存在则回退默认
    const fallback = Object.keys(builtin.value.profiles).includes(READ_FALLBACK_PROFILE_NAME)
      ? READ_FALLBACK_PROFILE_NAME
      : builtin.value.defaultProfile;
    return { ...builtin.value, defaultProfile: fallback };
  }

  const resolved = resolveProfiles(global.raw);
  if (!resolved.ok) throw new Error(`invalid active profiles: ${resolved.error}`);
  return resolved.value;
}
