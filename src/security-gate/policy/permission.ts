/**
 * policy/permission.ts — Permission rule evaluation engine.
 *
 * Owns permission ruleset construction and evaluation.
 * Responsibilities:
 *   1. buildRuleset — Compose a ruleset from SecurityConfig for a given tool surface.
 *   2. evaluatePermission — Evaluate a (surface, value) pair against a ruleset.
 *
 * Shared dependency: wildcardMatch from shared/wildcard.ts.
 */

import type { PermissionAction, Rule, SecurityConfig } from "../types";
import { wildcardMatch } from "../shared/wildcard";

/**
 * Evaluate permission for a (surface, value) pair against the composed ruleset.
 * Last matching rule wins. Semantic IDs are checked as a fallback dimension.
 */

/** Build composed ruleset: default → path → tool-specific. */
export function buildRuleset(
  surface: string,
  config: SecurityConfig,
): Rule[] {
  const rules: Rule[] = [];
  rules.push({ surface: "*", pattern: "*", action: config.permission["*"], source: "default" });
  for (const [pattern, action] of Object.entries(config.permission.path)) {
    rules.push({ surface: "path", pattern, action, source: "config" });
  }
  if (["read", "write", "edit"].includes(surface)) {
    const toolRules = config.permission[surface as "read" | "write" | "edit"];
    if (typeof toolRules === "object" && !Array.isArray(toolRules)) {
      for (const [pattern, action] of Object.entries(toolRules as Record<string, PermissionAction>)) {
        rules.push({ surface, pattern, action, source: "config" });
      }
    } else if (typeof toolRules === "string") {
      rules.push({ surface, pattern: "*", action: toolRules as PermissionAction, source: "config" });
    }
  }
  return rules;
}

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
