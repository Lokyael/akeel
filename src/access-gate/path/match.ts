import type { PathOperation, PathRule } from "../profile/types";

function wildcardRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function pathMatches(pattern: string, value: string): boolean {
  if (pattern.endsWith("/**") && value === pattern.slice(0, -3)) return true;
  return wildcardRegex(pattern).test(value);
}

export function selectPathRule(rules: readonly PathRule[], path: string, operation: PathOperation): PathRule | undefined {
  return rules.find((rule) => rule[operation] !== undefined && pathMatches(rule.path, path));
}
