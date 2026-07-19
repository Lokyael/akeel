/**
 * pipeline/plan-gate.ts — PLAN mode gate for all tool calls.
 *
 * Merged from phase.ts (checkGate) + pipeline/plan-gate.ts (applyPlanGate).
 * checkGate was moved here because it is gate logic, not mode state.
 * PhaseController (phase.ts) now tracks only the plan/build state machine.
 */

import type { PhaseController } from "../phase";
import { posix as posixPath } from "node:path";
import type { PlanGateResult, SecurityConfig } from "../types";
import { analyzeShellCommand, extractLiteralReadPaths, findRule } from "../taxonomy";
import { decidePath, resolveToolPath } from "../policy/path";

export interface PlanGateInput {
  surface: string;
  toolPath?: string;
  bashCommand?: string;
  cwd?: string;
  config?: SecurityConfig;
}

// ─── PLAN-mode write path whitelist ───

function planWriteAllowed(input: string | undefined): boolean {
  if (!input) return false;
  const normalizedInput = input.startsWith("@") ? input.slice(1) : input;
  if (normalizedInput.includes("\0") || /[\r\n]/.test(normalizedInput)) return false;
  if (normalizedInput.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalizedInput)) return false;
  const normalized = posixPath.normalize(normalizedInput);
  if (normalized === "CONTEXT.md") return true;
  return normalized === "docs" || normalized.startsWith("docs/") ||
    normalized === "specs" || normalized.startsWith("specs/") ||
    normalized === ".pi-keel" || normalized.startsWith(".pi-keel/");
}

const interpreterEvaluationRules = new Set(["node-eval", "python-eval", "python3-eval"]);

// ─── checkGate — core PLAN mode constraint logic ───

export function checkGate(
  controller: PhaseController,
  toolName: string,
  toolPath?: string,
  bashCommand?: string,
  cwd?: string,
  config?: SecurityConfig,
): string | null {
  if (controller.getMode() !== "plan") return null;

  if (toolName === "write" || toolName === "edit") {
    if (!planWriteAllowed(toolPath)) {
      return "⛔ PLAN — write/edit blocked. Only canonical docs/, specs/, .pi-keel/ and root CONTEXT.md are writable in PLAN.";
    }
    if (cwd && config && toolPath) {
      const decision = decidePath(resolveToolPath(cwd, toolPath), config, toolName);
      if (decision.hard && decision.action === "deny") return `⛔ PLAN — path denied: ${decision.reason}.`;
    }
    return null;
  }

  if (["read", "find", "grep", "ls"].includes(toolName)) {
    if (!toolPath || toolPath === "*") {
      return ["find", "grep", "ls"].includes(toolName)
        ? "⛔ PLAN — broad or missing directory read cannot be proved safe."
        : "⛔ PLAN — read target is missing.";
    }
    if (cwd && config) {
      const resolved = resolveToolPath(cwd, toolPath);
      const operation = toolName === "read" ? "read" : toolName === "ls" ? "list" : "search";
      const decision = decidePath(resolved, config, operation);
      if (decision.action !== "allow") return `⛔ PLAN — path is not provably readable: ${decision.reason}.`;
      if (["find", "grep", "ls"].includes(toolName) && resolved.existingRealPath && resolved.existingRealPath !== resolved.absolute) {
        return "⛔ PLAN — directory or symlink read cannot be proved safe.";
      }
    }
    return null;
  }

  if (toolName !== "bash") return null;

  const analysis = analyzeShellCommand(bashCommand ?? "");
  if (analysis.unsafeSyntax) {
    return `⛔ PLAN — unsafe shell syntax: ${analysis.unsafeSyntax}.`;
  }
  if (analysis.hasAmbiguousRead) {
    return "⛔ PLAN — recursive or ambiguous read cannot be proved safe.";
  }

  for (const literal of extractLiteralReadPaths(bashCommand ?? "")) {
    if (cwd && config) {
      const decision = decidePath(resolveToolPath(cwd, literal.path), config, "read");
      if (decision.action !== "allow") return `⛔ PLAN — literal read path '${literal.path}' is not allowed: ${decision.reason}.`;
    }
  }

  for (const segment of analysis.segments) {
    for (const redirect of segment.redirections) {
      if (redirect.kind === "file-read" && redirect.target && cwd && config) {
        const decision = decidePath(resolveToolPath(cwd, redirect.target), config, "read");
        if (decision.action !== "allow") return `⛔ PLAN — redirected read path '${redirect.target}' is not allowed: ${decision.reason}.`;
      }
    }
    if (segment.hasCommandSubstitution || segment.hasDynamicExecution) {
      return `⛔ PLAN — dynamic shell expansion in '${segment.text}' is not provably read-only.`;
    }
    const unsafeRedirect = segment.redirections.find((redirect) =>
      redirect.kind !== "fd-duplicate" && redirect.kind !== "fd-close" &&
      !(redirect.kind === "fd-write" && redirect.target === "/dev/null") &&
      redirect.kind !== "file-read",
    );
    if (unsafeRedirect) {
      return `⛔ PLAN — shell redirection in '${segment.text}' is not provably read-only.`;
    }

    const rule = findRule(segment.text);
    if (!rule) {
      return `⛔ PLAN — unknown command '${segment.text}' is blocked.`;
    }
    if (interpreterEvaluationRules.has(rule.id) || rule.plan === "block") {
      return `⛔ PLAN — '${segment.text}' is not a proven read-only operation.`;
    }
  }

  return null;
}

// ─── applyPlanGate — thin adapter for pipeline ───

export function applyPlanGate(controller: PhaseController, input: PlanGateInput): PlanGateResult {
  const blocked = checkGate(controller, input.surface, input.toolPath, input.bashCommand, input.cwd, input.config);
  return blocked ? { kind: "block", reason: blocked } : { kind: "allow" };
}
