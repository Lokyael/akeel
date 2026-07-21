import { emptyPathPolicy, emptyShellPolicy, mergePathDefaults, mergePathRules, mergeShellPolicy } from "./merge";
import { validateProfiles } from "./validate";
import type { PathRule, RawProfile, RawProfiles, ResolvedProfile, ResolvedProfiles, ShellPolicy, ValidationResult } from "./types";

const PATH_OPERATIONS = ["read", "list", "search", "write"] as const;

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
      default: Object.fromEntries(PATH_OPERATIONS.map((operation) => [operation, pathPolicy.default[operation]])) as ResolvedProfile["pathPolicy"]["default"],
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
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
