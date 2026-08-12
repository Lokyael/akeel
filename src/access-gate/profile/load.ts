import { readFileSync } from "node:fs";
import { BUILTIN_PROFILES_PATH, DEFAULT_PROFILE_NAME, READ_FALLBACK_PROFILE_NAME } from "./defaults";
import { resolveProfiles } from "./resolve";
import type { RawProfiles, ResolvedProfiles } from "./types";
import { getAgentDir } from "../agent-dir";
import { loadConfig } from "../config";

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

/** 全局配置损坏或语义非法时的 fail-closed 回退：内置集中最受限的 profile（keel-read），不存在则回退默认。 */
function failClosed(builtin: ResolvedProfiles): ResolvedProfiles {
  const fallback = Object.keys(builtin.profiles).includes(READ_FALLBACK_PROFILE_NAME)
    ? READ_FALLBACK_PROFILE_NAME
    : builtin.defaultProfile;
  return { ...builtin, defaultProfile: fallback };
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

  const loaded = loadConfig(options.agentDir ?? getAgentDir());
  if (loaded.kind === "none") return { ...builtin.value, defaultProfile: base.defaultProfile };
  if (loaded.kind === "error") {
    options.onError?.(loaded.message);
    return failClosed(builtin.value);
  }

  // 集中配置的 profile 段：merge 内置后 resolve；失败 → 报错 + fail-closed 回退（与旧 profiles.json 行为一致）
  const candidate = mergeSources(base, loaded.value);
  const resolved = resolveProfiles(candidate);
  if (!resolved.ok) {
    const message = `access-gate: invalid active profiles: ${resolved.error}`;
    console.error(message);
    options.onError?.(message);
    return failClosed(builtin.value);
  }
  return resolved.value;
}
