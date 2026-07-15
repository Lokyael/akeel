/**
 * pipeline/permission.ts — Permission evaluation for non-bash tool calls.
 *
 * Layers: path protection → ruleset build → evaluatePermission → ask/deny/allow.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SecurityConfig, SessionRule } from "../types";
import { wildcardMatch, evaluatePermission, buildRuleset } from "../rules";
import { audit } from "../audit";

export interface PermissionEvalInput {
  surface: string;
  value: string;
  ctx: ExtensionContext;
  config: SecurityConfig;
  sessionRules: SessionRule[];
}

export interface PermissionEvalResult {
  block?: boolean;
  reason?: string;
}

/**
 * Evaluate non-bash tool permission: path protection → ruleset → decision.
 * Modifies sessionRules in-place when user grants session-wide allow.
 */
export async function evaluateToolPermission(
  input: PermissionEvalInput,
): Promise<PermissionEvalResult | undefined> {
  const { surface, value, ctx, config, sessionRules } = input;

  // ── Path protection for write/edit ──
  if (["write", "edit"].includes(surface) && value !== "*") {
    for (const [pattern, action] of Object.entries(config.permission.path)) {
      if (action === "deny" && wildcardMatch(pattern, value)) {
        audit(ctx, surface, value, "deny", `Protected path: ${pattern}`);
        return { block: true, reason: `⛔ path — ${value} is protected (pattern: ${pattern}). Blocked by path policy.` };
      }
    }
  }

  // ── Build ruleset and evaluate ──
  const rules = buildRuleset(surface, config, sessionRules);
  const decision = evaluatePermission(surface, value, rules);

  // ── Deny ──
  if (decision.action === "deny") {
    audit(ctx, surface, value, "deny", decision.source);
    return { block: true, reason: `⛔ policy — denied by ${decision.source} policy. Blocked by security configuration.` };
  }

  // ── Ask ──
  if (decision.action === "ask") {
    if (!ctx.hasUI) {
      audit(ctx, surface, value, "deny", "non-interactive");
      return { block: true, reason: `⛔ permission — approval required but no interactive UI is available in this mode.` };
    }

    const displayValue = (value.length > 80 ? value.slice(0, 77) + "..." : value).replace(/[\n\r\t]/g, " ");
    const choice = await ctx.ui.select(
      `Security Gate: ${surface}\n\n  ${displayValue}\n\nAllow?`,
      ["Allow once", `Allow "${surface}" for this session`, "Deny"]
    );

    if (choice === "Deny" || choice === undefined) {
      audit(ctx, surface, value, "deny", "user");
      return { block: true, reason: `⛔ denied — user declined this operation.` };
    }
    if (choice?.startsWith("Allow \"")) {
      sessionRules.push({ surface, pattern: "*", action: "allow", source: "session" });
    }
    audit(ctx, surface, value, "allow", "user");
  }

  return undefined;
}
