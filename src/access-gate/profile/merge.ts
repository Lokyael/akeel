import type { Decision, PathDecisions, PathOperation, PathPolicy, PathRule, ShellPolicy } from "./types";

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

export function mergeShellPolicy(base: ShellPolicy, override: Partial<ShellPolicy>): ShellPolicy {
  return { ...base, ...override };
}

export function mergePathDefaults(base: Record<PathOperation, Decision>, override?: PathDecisions): Record<PathOperation, Decision> {
  return { ...base, ...(override ?? {}) };
}

export function mergePathRules(base: PathRule[], additions: readonly PathRule[]): PathRule[] {
  // Child rules prepended; they shadow parent rules with the same path+operation via first-match.
  return [
    ...additions.map((rule) => ({ ...rule })),
    ...base.map((rule) => ({ ...rule })),
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
