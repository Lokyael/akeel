// profile 继承解析（D-017）：merge 函数是继承合并的内部实现，与解析概念同文件共存
import { validateProfiles } from "./validate";
import { PATH_OPERATION_VALUES } from "../domain";
import type { PathDecisions, PathOperation, PathPolicy, PathRule, ProfileDecision, RawProfiles, ResolvedProfile, ResolvedProfiles, ShellPolicy, ValidationResult } from "./types";

const DEFAULT_SHELL_POLICY: ShellPolicy = {
  inspect: "deny",
  modify: "deny",
  execute: "deny",
  destroy: "deny",
  unknown: "deny",
};
const DEFAULT_PATH_DECISIONS = {
  read: "deny",
  list: "deny",
  search: "deny",
  write: "deny",
} as const;

function mergeShellPolicy(base: ShellPolicy, override: Partial<ShellPolicy>): ShellPolicy {
  return { ...base, ...override };
}

function mergePathDefaults(base: Record<PathOperation, ProfileDecision>, override?: PathDecisions): Record<PathOperation, ProfileDecision> {
  return { ...base, ...(override ?? {}) };
}

function mergePathRules(base: PathRule[], additions: readonly PathRule[]): PathRule[] {
  // Child rules prepended; they shadow parent rules with the same path+operation via first-match.
  return [
    ...additions.map((rule) => ({ ...rule })),
    ...base.map((rule) => ({ ...rule })),
  ];
}

function emptyShellPolicy(): ShellPolicy {
  return { ...DEFAULT_SHELL_POLICY };
}

function emptyPathPolicy(): PathPolicy {
  return {
    default: { ...DEFAULT_PATH_DECISIONS },
    rules: [] as PathRule[],
  };
}

function resolveOne(name: string, raw: RawProfiles, cache: Map<string, ResolvedProfile>, stack: string[]): ResolvedProfile {
  const cached = cache.get(name);
  if (cached) return cached;
  if (stack.includes(name)) throw new Error(`profile inheritance cycle: ${[...stack, name].join(" -> ")}`);
  const source = raw.profiles[name];
  if (!source) throw new Error(`profile '${name}' extends an unknown profile`);

  let shellPolicy: ShellPolicy = emptyShellPolicy();
  let pathPolicy = emptyPathPolicy();
  let rules: PathRule[] = [];
  for (const parent of source.extends ?? []) {
    const resolved = resolveOne(parent, raw, cache, [...stack, name]);
    shellPolicy = mergeShellPolicy(shellPolicy, resolved.shellPolicy);
    pathPolicy = {
      default: mergePathDefaults(pathPolicy.default, resolved.pathPolicy.default),
      rules: mergePathRules(rules, resolved.pathPolicy.rules),
    };
    rules = pathPolicy.rules;
  }

  shellPolicy = mergeShellPolicy(shellPolicy, source.shellPolicy ?? {});
  pathPolicy = {
    default: mergePathDefaults(pathPolicy.default, source.pathPolicy?.default),
    rules: mergePathRules(rules, source.pathPolicy?.rules ?? []),
  };

  const profile: ResolvedProfile = {
    name,
    description: source.description,
    shellPolicy,
    pathPolicy: {
      default: Object.fromEntries(PATH_OPERATION_VALUES.map((operation) => [operation, pathPolicy.default[operation]])) as ResolvedProfile["pathPolicy"]["default"],
      rules: pathPolicy.rules.map((rule) => ({ ...rule })),
    },
  };
  cache.set(name, profile);
  return profile;
}

export function resolveProfiles(value: unknown): ValidationResult<ResolvedProfiles> {
  const validation = validateProfiles(value);
  if (!validation.ok) return validation;
  const raw = validation.value;
  const cache = new Map<string, ResolvedProfile>();
  try {
    const profiles = Object.fromEntries(Object.keys(raw.profiles).map((name) => [name, resolveOne(name, raw, cache, [])]));
    return {
      ok: true,
      value: {
        defaultProfile: raw.defaultProfile ?? Object.keys(profiles)[0]!,
        profiles,
        // subagentProfiles 值已在 validateProfiles 校验（窄化在安全位置，validate 后）
        ...(raw.subagentProfiles ? { subagentProfiles: raw.subagentProfiles as ResolvedProfiles["subagentProfiles"] } : {}),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
