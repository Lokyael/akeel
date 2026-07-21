import type { Decision, PathDecisions, PathOperation, PathPolicy, PathRule, ResolvedProfile, ShellPolicy } from "./types";

const DEFAULT_SHELL_POLICY: ShellPolicy = {
  readOnly: "deny",
  mutating: "deny",
  unclassified: "deny",
};
const DEFAULT_PATH_DECISIONS = {
  read: "deny",
  list: "deny",
  search: "deny",
  write: "deny",
} as const;

export function cloneProfile(profile: ResolvedProfile): ResolvedProfile {
  return {
    name: profile.name,
    description: profile.description,
    shellPolicy: { ...profile.shellPolicy },
    pathPolicy: {
      default: { ...profile.pathPolicy.default },
      rules: profile.pathPolicy.rules.map((rule) => ({ ...rule })),
    },
  };
}

export function mergeShellPolicy(base: ShellPolicy, override: Partial<ShellPolicy>): ShellPolicy {
  return { ...base, ...override };
}

export function mergePathDefaults(base: Record<PathOperation, Decision>, override?: PathDecisions): Record<PathOperation, Decision> {
  return { ...base, ...(override ?? {}) };
}

export function mergePathRules(base: PathRule[], additions: readonly PathRule[]): PathRule[] {
  return [
    ...base.map((rule) => ({ ...rule })),
    ...additions.map((rule) => ({ ...rule })),
  ];
}

export function emptyShellPolicy(): ShellPolicy {
  return { ...DEFAULT_SHELL_POLICY };
}

export function emptyPathPolicy(): PathPolicy {
  return {
    default: { ...DEFAULT_PATH_DECISIONS },
    rules: [] as PathRule[],
  };
}
