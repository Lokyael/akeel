/**
 * pipeline/permission.ts — Permission evaluation for non-bash tool calls.
 *
 * Layers: path protection → ruleset build → evaluatePermission → ask/deny/allow.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { statSync } from "node:fs";
import type { PipelineResult, SecurityConfig } from "../types";
import { evaluatePermission, buildRuleset } from "../policy/permission";
import { decidePath, resolveToolPath, type PathOperation } from "../policy/path";

export interface PermissionEvalInput {
  surface: string;
  value: string;
  cwd: string;
  ctx: ExtensionContext;
  config: SecurityConfig;
}

/**
 * Evaluate non-bash tool permission: path protection → ruleset → decision.
 */
export async function evaluateToolPermission(
  input: PermissionEvalInput,
): Promise<PipelineResult | null> {
  const { surface, value, ctx, config, cwd } = input;

  if (["read", "write", "edit", "find", "grep", "ls"].includes(surface) && value !== "*") {
    const operation: PathOperation = surface === "write" || surface === "edit" ? surface : surface === "read" ? "read" : surface === "ls" ? "list" : "search";
    const resolved = resolveToolPath(cwd, value);
    const pathDecision = decidePath(resolved, config, operation);
    const broadRead = ["find", "grep", "ls"].includes(surface) && (() => {
      if (value === "." || value === ".." || value === "*") return true;
      if (!resolved.existingRealPath) return false;
      try { return statSync(resolved.existingRealPath).isDirectory(); } catch { return true; }
    })();
    if (pathDecision.action === "deny") {
      return { kind: "block", reason: `⛔ path — ${value} is denied: ${pathDecision.reason}.` };
    }
    if (pathDecision.action === "ask" || broadRead) {
      if (!ctx.hasUI) {
        return { kind: "block", reason: "⛔ permission — path approval required but no interactive UI is available." };
      }
      const choice = await ctx.ui.select(
        `Security Gate: ${surface}\n\n  ${value}\n\n${broadRead ? "recursive or ambiguous read" : pathDecision.reason}\n\nAllow?`,
        ["Allow once", "Deny"],
      );
      if (choice !== "Allow once") {
        return { kind: "block", reason: "⛔ denied — user declined this path operation." };
      }
      return null;
    }
  }

  // ── Build ruleset and evaluate ──
  const rules = buildRuleset(surface, config);
  const decision = evaluatePermission(surface, value, rules);

  // ── Deny ──
  if (decision.action === "deny") {
    return { kind: "block", reason: `⛔ policy — denied by ${decision.source} policy. Blocked by security configuration.` };
  }

  // ── Ask ──
  if (decision.action === "ask") {
    if (!ctx.hasUI) {
      return { kind: "block", reason: "⛔ permission — approval required but no interactive UI is available in this mode." };
    }

    const displayValue = (value.length > 80 ? value.slice(0, 77) + "..." : value).replace(/[\n\r\t]/g, " ");
    const choice = await ctx.ui.select(
      `Security Gate: ${surface}\n\n  ${displayValue}\n\nAllow?`,
      ["Allow once", "Deny"]
    );

    if (choice === "Deny" || choice === undefined) {
      return { kind: "block", reason: "⛔ denied — user declined this operation." };
    }
    if (choice !== "Allow once") {
      return { kind: "block", reason: "⛔ denied — invalid approval response." };
    }
  }

  return null;
}
