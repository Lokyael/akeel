import { homedir } from "node:os";
import { relative } from "node:path";
import { DEFAULT_BLOCKED_PATHS } from "./blocked-paths";
import { pathMatches, selectPathRule } from "./match";
import type { ProfileDecision, PathOperation, PathRule, PathPolicy, ResolvedProfile } from "../profile/types";
import type { ResolvedPath } from "./resolve";

export { resolvePath } from "./resolve";
export type { ResolvedPath } from "./resolve";
export type { PathOperation } from "../profile/types";

/** Path 硬拒 reason 常量；reason → DecisionCode 的类型化映射在 evaluate-request.ts（T-046 R8）。 */
export const PATH_DENY_REASONS = {
  blocked: "blocked path",
  unclassifiable: "path cannot be classified",
  symlinkEscape: "symlink escapes an allowed root",
} as const;
export type PathDenyReason = (typeof PATH_DENY_REASONS)[keyof typeof PATH_DENY_REASONS];

export interface PathDecision {
  decision: ProfileDecision;
  hard: boolean;
  reason: string;
  pattern?: string;
}

function candidates(path: ResolvedPath): string[] {
  const values = [path.virtualPath, path.absolute, path.input.replace(/\\/g, "/")];
  const home = homedir().replace(/\\/g, "/");
  if (path.absolute.startsWith(home + "/")) values.push(`~/${relative(home, path.absolute).replace(/\\/g, "/")}`);
  return [...new Set(values)];
}

function blockedPattern(path: ResolvedPath, blockedPaths: readonly string[]): string | undefined {
  return blockedPaths.find((pattern) => candidates(path).some((candidate) => pathMatches(pattern, candidate)));
}

function selectedRule(policy: PathPolicy, path: ResolvedPath, operation: PathOperation): PathRule | undefined {
  return selectPathRule(policy.rules, path.virtualPath, operation);
}

export function decidePath(
  path: ResolvedPath,
  profile: ResolvedProfile,
  operation: PathOperation,
  blockedPaths: readonly string[] = DEFAULT_BLOCKED_PATHS,
): PathDecision {
  const blocked = blockedPattern(path, blockedPaths);
  if (blocked) return { decision: "deny", hard: true, reason: PATH_DENY_REASONS.blocked, pattern: blocked };
  if (!path.classifiable) return { decision: "deny", hard: true, reason: PATH_DENY_REASONS.unclassifiable };
  if (path.symlinkEscape) return { decision: "deny", hard: true, reason: PATH_DENY_REASONS.symlinkEscape };

  const rule = selectedRule(profile.pathPolicy, path, operation);
  const decision = rule?.[operation] ?? profile.pathPolicy.default[operation];
  return {
    decision,
    hard: false,
    reason: rule ? "profile path rule" : "profile path default",
    pattern: rule?.path,
  };
}
