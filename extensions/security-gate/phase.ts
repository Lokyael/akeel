/**
 * security-gate/phase.ts — Plan/Build mode toggle. State persists to .pi-keel/state.json.
 * Command classification delegated to command-taxonomy.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { findRule, splitCommand, isSkippableOutput } from "./command-taxonomy";

// ─── State ───

let planMode = true;
let statePath = "";

// Write paths allowed even in PLAN mode
const PLAN_WRITE_PREFIXES = [
  "docs/", "specs/", ".pi-keel/",
  "README.md", "CONTEXT.md", "AGENTS.md", "CLAUDE.md", "CONVENTIONS.md",
];

// ─── Public API ───

export function isPlanMode(): boolean {
  return planMode;
}

export function setPlanMode(): void {
  planMode = true;
  saveState();
}

export function setBuildMode(): void {
  planMode = false;
  saveState();
}

export function getMode(): string {
  return planMode ? "plan" : "build";
}

export function getLabel(): string {
  return planMode
    ? "PLAN — write blocked (except docs/), bash restricted to read-only"
    : "BUILD — full access within normal security rules";
}

/** Load state from .pi-keel/state.json. Called on session start. */
export function loadState(cwd: string): void {
  statePath = join(cwd, ".pi-keel", "state.json");
  try {
    if (existsSync(statePath)) {
      const raw = readFileSync(statePath, "utf-8");
      const saved = JSON.parse(raw);
      if (typeof saved.planMode === "boolean") {
        planMode = saved.planMode;
        return;
      }
    }
  } catch { /* corrupt — default to plan */ }
  planMode = true;
}

function saveState(): void {
  if (!statePath) return;
  try {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ planMode }, null, 2));
  } catch { /* best effort */ }
}

/**
 * Check if a tool call is blocked by PLAN mode.
 * Returns a reason string if blocked, null if allowed.
 *
 * Uses command-taxonomy as the single source of truth for
 * command classification. Each segment of a compound command
 * is checked independently against the taxonomy.
 */
export function checkGate(
  toolName: string,
  toolPath?: string,
  bashCommand?: string,
): string | null {
  if (!planMode) return null;

  // ── Write/edit tool gate ──
  if (toolName === "write" || toolName === "edit") {
    if (toolPath && PLAN_WRITE_PREFIXES.some((p) => toolPath.startsWith(p))) {
      return null; // allowed: docs, specs, config
    }
    return `⛔ PLAN MODE — write/edit blocked. Do not retry. Available: read · ls · grep · find · bash(read-only). To switch: ask user to run /build.`;
  }

  // ── Bash command gate ──
  if (toolName === "bash" && bashCommand) {
    const segments = splitCommand(bashCommand);

    for (const seg of segments) {
      // Skip pure-output display commands (echo/cat/printf without redirect)
      if (isSkippableOutput(seg)) continue;

      // Find the rule for this segment
      const rule = findRule(seg);

      if (!rule) {
        // Fail-closed: unknown commands are blocked in PLAN mode
        return `⛔ PLAN MODE — unknown command '${seg}' blocked. Only read-only commands allowed (ls, cat, git log, find, grep...). To switch: ask user to run /build.`;
      }

      if (rule.plan === "block") {
        return `⛔ PLAN MODE — '${seg}' is a write operation (${rule.description}). Do not retry. Only read-only commands allowed. To switch: ask user to run /build.`;
      }
      // rule.plan === "allow" → continue to next segment
    }

    return null; // all segments allowed
  }

  return null;
}

/**
 * Register /build and /plan commands.
 */
export function registerCommand(
  pi: {
    registerCommand: (
      name: string,
      opts: { description: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> },
    ) => void;
  },
): void {
  pi.registerCommand("build", {
    description: "Switch to BUILD mode — full access for implementation",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      setBuildMode();
      ctx.ui.notify("BUILD MODE — write/edit/bash 全部可用。Run /plan to switch back.", "info");
    },
  });

  pi.registerCommand("plan", {
    description: "Switch to PLAN mode — write blocked, bash restricted to read-only (default)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      setPlanMode();
      ctx.ui.notify("PLAN MODE — write/edit 禁用，bash 仅限只读。Run /build to switch to BUILD.", "info");
    },
  });
}
