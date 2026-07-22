import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BUILTIN_PROFILES_PATH, DEFAULT_PROFILE_NAME } from "./defaults";
import { resolveProfiles } from "./resolve";
import type { RawProfiles, ResolvedProfiles } from "./types";

function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function mergeSources(base: RawProfiles, override: unknown): RawProfiles {
  const layer = override as { defaultProfile?: string; profiles?: Record<string, unknown> };
  return {
    defaultProfile: layer.defaultProfile ?? base.defaultProfile,
    profiles: {
      ...base.profiles,
      ...(layer.profiles ?? {}),
    } as RawProfiles["profiles"],
  };
}

function loadLayer(base: RawProfiles, path: string): RawProfiles {
  if (!existsSync(path)) return base;
  try {
    const parsed = readJson(path);
    const candidate = mergeSources(base, parsed);
    const resolved = resolveProfiles(candidate);
    if (!resolved.ok) throw new Error(resolved.error);
    return candidate;
  } catch (error) {
    console.error(`access-gate: failed to load ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return base;
  }
}

export function loadProfiles(projectRoot: string, agentDir = getAgentDir(), includeProject = true): ResolvedProfiles {
  const builtinRaw = readJson(BUILTIN_PROFILES_PATH);
  const builtin = resolveProfiles(builtinRaw);
  if (!builtin.ok) throw new Error(`invalid built-in profiles: ${builtin.error}`);

  let raw = structuredClone(builtinRaw) as RawProfiles;
  raw.defaultProfile ||= builtin.value.defaultProfile || DEFAULT_PROFILE_NAME;
  raw = loadLayer(raw, join(agentDir, "extensions", "access-gate", "profiles.json"));
  if (includeProject) raw = loadLayer(raw, join(projectRoot, ".pi", "extensions", "access-gate", "profiles.json"));

  const resolved = resolveProfiles(raw);
  if (!resolved.ok) throw new Error(`invalid active profiles: ${resolved.error}`);
  return resolved.value;
}
