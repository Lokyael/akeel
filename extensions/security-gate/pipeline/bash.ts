/**
 * pipeline/bash.ts — Bash command evaluation pipeline.
 *
 * Layers: threat scan → secret scan → shell-write detect → BUILD permission eval.
 * Called after PLAN gate has already passed.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SecurityConfig, SessionRule } from "../types";
import { audit } from "../audit";
import { scanThreats, scanSecrets, detectShellFileWrite } from "../detection";
import { wildcardMatch } from "../rules";
import { splitCommand, findRule, isSkippableOutput, FULL_COMMAND_PATTERNS } from "../command-taxonomy";
import type { PermissionAction } from "../types";

export interface BashEvalInput {
  command: string;
  ctx: ExtensionContext;
  config: SecurityConfig;
  sessionRules: SessionRule[];
  /** If true, skip BUILD-mode segment evaluation (PLAN mode pre-authorized). */
  planPreAuthorized: boolean;
}

export interface BashEvalResult {
  block?: boolean;
  reason?: string;
}

/**
 * Full bash command evaluation: threat scan → secret scan → shell-write → segment eval.
 * Returns block result, or undefined to allow.
 */
export async function evaluateBashCommand(input: BashEvalInput): Promise<BashEvalResult | undefined> {
  const { command, ctx, config, sessionRules, planPreAuthorized } = input;

  // ── Layer 1 + 2: Threat + full-command pattern scanning ──
  if (config.level !== "permissive") {
    const threatId = scanThreats(command);
    if (threatId) {
      audit(ctx, "bash", command, "deny", `Threat: ${threatId}`);
      return { block: true, reason: `⛔ threat — ${threatId} detected. Known attack pattern — permanently blocked. Do not attempt similar commands.` };
    }
    for (const p of FULL_COMMAND_PATTERNS) {
      if (p.match(command)) {
        audit(ctx, "bash", command, "deny", p.rule.id);
        return { block: true, reason: `⛔ blocked — ${p.rule.id}: ${p.rule.description}. Blocked by security policy. Do not attempt workarounds.` };
      }
    }
    const secretIds = scanSecrets(command);
    if (secretIds.length > 0 && ctx.hasUI) {
      ctx.ui.notify(`⚠️ Command may contain secrets: ${secretIds.join(", ")}`, "warning");
    }
  }

  // ── Layer 3: Shell file-write bypass detection ──
  const fileWriteViolation = detectShellFileWrite(command, config.permission.path);
  if (fileWriteViolation) {
    audit(ctx, "bash", command, "deny", `Shell bypass: ${fileWriteViolation.method} → ${fileWriteViolation.path}`);
    return { block: true, reason: `⛔ shell — ${fileWriteViolation.method} would write to ${fileWriteViolation.path}. Protected path — use write or edit tool instead.` };
  }

  // ── PLAN mode: all segments passed checkGate, auto-allow ──
  if (planPreAuthorized) return undefined;

  // ── BUILD mode: segment-aware permission evaluation ──
  return evaluateBashSegments(command, ctx, config, sessionRules);
}

// ─── Segment-aware evaluation ───

async function evaluateBashSegments(
  command: string,
  ctx: ExtensionContext,
  config: SecurityConfig,
  sessionRules: SessionRule[],
): Promise<BashEvalResult | undefined> {
  const segments = splitCommand(command);
  const blocking: string[] = [];
  let askRequired = false;
  let askReason = "";

  // Check session rules first
  if (sessionRules.some((r) => r.surface === "bash" && r.action === "allow")) {
    return undefined;
  }

  for (const seg of segments) {
    if (isSkippableOutput(seg)) continue;

    const rule = findRule(seg);

    if (!rule) {
      askRequired = true;
      askReason = askReason || `unknown command '${seg}'`;
      continue;
    }

    // Check config bash overrides (last match wins)
    let configAction: PermissionAction | null = null;
    const bashEntries = Object.entries(config.permission.bash || {}).reverse();
    for (const [pattern, action] of bashEntries) {
      if (wildcardMatch(pattern, seg)) {
        configAction = action;
        break;
      }
    }

    if (configAction === "deny") {
      blocking.push(`${seg} (config: deny)`);
      continue;
    }
    if (configAction === "allow") continue;

    if (rule.build === "block") {
      blocking.push(`${seg} (${rule.description})`);
    } else if (rule.build === "ask") {
      askRequired = true;
      askReason = askReason || `${seg}: ${rule.description}`;
    }
  }

  if (blocking.length > 0) {
    const reason = `⛔ blocked — ${blocking.join("; ")}. Blocked by security policy. Do not attempt workarounds.`;
    audit(ctx, "bash", command, "deny", reason);
    return { block: true, reason };
  }

  if (askRequired) {
    if (!ctx.hasUI) {
      audit(ctx, "bash", command, "deny", "non-interactive");
      return { block: true, reason: `⛔ permission — approval required but no interactive UI is available in this mode.` };
    }

    const displayValue = (command.length > 80 ? command.slice(0, 77) + "..." : command).replace(/[\n\r\t]/g, " ");
    const choice = await ctx.ui.select(
      `Security Gate: bash\n\n  ${displayValue}\n\n${askReason}\n\nAllow?`,
      ["Allow once", "Allow bash for this session", "Deny"]
    );

    if (choice === "Deny" || choice === undefined) {
      audit(ctx, "bash", command, "deny", "user");
      return { block: true, reason: `⛔ denied — user declined this operation.` };
    }
    if (choice?.startsWith("Allow bash")) {
      sessionRules.push({ surface: "bash", pattern: "*", action: "allow", source: "session" });
    }
    audit(ctx, "bash", command, "allow", "user");
  }

  return undefined;
}
