/**
 * security-gate/rules.ts — Permission evaluation engine.
 * Unified Rule model inspired by @gotgenes/pi-permission-system.
 */

import type { PermissionAction, Rule } from "./types";

/**
 * Glob-to-regex matching. Supports * (any chars) and ? (single char).
 */
export function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(value);
}

/**
 * Evaluate permission for a (surface, value) pair against the composed ruleset.
 * Last matching rule wins. Semantic IDs are checked as a fallback dimension.
 */
export function evaluatePermission(
  surface: string,
  value: string,
  rules: Rule[]
): Rule {
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (
      (rule.surface === surface || rule.surface === "*") &&
      wildcardMatch(rule.pattern, value)
    ) {
      return rule;
    }
  }

  const universal = rules.find((r) => r.surface === "*" && r.pattern === "*");
  if (universal) return universal;

  return { surface, pattern: value, action: "ask" as PermissionAction, source: "default" };
}
