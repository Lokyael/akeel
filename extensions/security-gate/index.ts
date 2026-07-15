/**
 * security-gate/index.ts — Unified security gate: 5-layer defense pipeline.
 *
 * Layers: PLAN gate → threat scan → secret scan → shell-write detect → permission eval
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { SecurityConfig, SecurityLevel, Rule, SessionRule, PermissionAction } from "./types";
import { DEFAULT_CONFIGS } from "./presets";
import { wildcardMatch, evaluatePermission } from "./rules";
import { scanThreats, scanSecrets, detectShellFileWrite } from "./detection";
import { initAuditLog, audit } from "./audit";
import { createSnapshot, listSnapshots, restoreSnapshot, restoreLastN, cleanSnapshots } from "./snapshots";
import { loadState, checkGate, registerCommand as registerPhaseCommand, getMode, isPlanMode } from "./phase";
import { splitCommand, findRule, isSkippableOutput, FULL_COMMAND_PATTERNS } from "./command-taxonomy";

// ─── Agent directory resolution ───

function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function resolveHome(path: string): string {
  if (path.startsWith("~")) return join(homedir(), path.slice(1));
  return path;
}

// ─── Config loading ───

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    const overrideVal = (overrides as Record<string, unknown>)[key];
    const baseVal = result[key];
    if (
      overrideVal !== null && typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null && typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else {
      result[key] = overrideVal;
    }
  }
  return result as T;
}

function loadConfig(cwd: string): SecurityConfig {
  const globalConfigPath = join(getAgentDir(), "extensions", "security-gate", "config.json");
  let merged: SecurityConfig | null = null;

  if (existsSync(globalConfigPath)) {
    try {
      const global = JSON.parse(readFileSync(globalConfigPath, "utf-8")) as Partial<SecurityConfig>;
      if (global.level && DEFAULT_CONFIGS[global.level]) {
        merged = deepMerge(DEFAULT_CONFIGS[global.level], global);
      }
    } catch (e) {
      console.error(`security-gate: Failed to parse ${globalConfigPath}:`, e);
    }
  }

  if (!merged) {
    merged = DEFAULT_CONFIGS.standard;
  }

  const projectConfigPath = join(cwd, ".pi", "extensions", "security-gate", "config.json");
  if (existsSync(projectConfigPath)) {
    try {
      const project = JSON.parse(readFileSync(projectConfigPath, "utf-8")) as Partial<SecurityConfig>;
      merged = deepMerge(merged, project);
    } catch (e) {
      console.error(`security-gate: Failed to parse ${projectConfigPath}:`, e);
    }
  }

  return merged;
}

// ─── Main Extension ───

export default function securityGate(pi: ExtensionAPI) {
  let config: SecurityConfig = DEFAULT_CONFIGS.standard;
  const sessionRules: SessionRule[] = [];

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig(ctx.cwd);
    initAuditLog(config.audit.logPath);
    loadState(ctx.cwd);
  });

  // ─── /security command ───

  pi.registerCommand("security", {
    description: "Show or set security configuration",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const sub = args.trim();

      if (sub === "status") {
        ctx.ui.notify([
          `Mode: ${getMode().toUpperCase()} (use /build and /plan to switch)`,
          `Security Level: ${config.level}`,
          `Sandbox: ${config.sandbox.enabled ? "enabled" : "disabled"}`,
          `Audit Log: ${config.audit.enabled ? "enabled" : "disabled"}`,
          `Protected Paths: ${Object.keys(config.permission.path).filter(k => config.permission.path[k] === "deny").length} deny rules`,
          `Bash Rules: ${Object.keys(config.permission.bash).length} patterns`,
        ].join("\n"), "info");
      } else if (sub.startsWith("level ")) {
        const level = sub.slice(6).trim() as SecurityLevel;
        if (DEFAULT_CONFIGS[level]) {
          config = { ...DEFAULT_CONFIGS[level] };
          ctx.ui.notify(`Security level set to: ${level}`, "info");
        } else {
          ctx.ui.notify(`Unknown level: ${level}. Use: strict, standard, permissive`, "error");
        }
      } else if (sub === "sandbox on") {
        config.sandbox.enabled = true;
        ctx.ui.notify("Sandbox enabled", "info");
      } else if (sub === "sandbox off") {
        config.sandbox.enabled = false;
        ctx.ui.notify("Sandbox disabled", "warning");
      } else {
        ctx.ui.notify([
          "/security status            — Show current security config",
          "/security level <name>      — Set level (strict/standard/permissive)",
          "/security sandbox on|off    — Toggle sandbox",
          "",
          "Recovery:",
          "/rollback                  — Manage file snapshots",
        ].join("\n"), "info");
      }
    },
  });

  // ─── /rollback command ───

  pi.registerCommand("rollback", {
    description: "Restore files from snapshots created before write/edit operations",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const sub = args.trim();

      if (!sub || sub === "list") {
        const snaps = listSnapshots(ctx.cwd);
        if (snaps.length === 0) {
          ctx.ui.notify("No snapshots available.", "info");
          return;
        }
        const lines = snaps.slice(0, 20).map((s) =>
          `  ${s.timestamp.slice(0, 19).replace("T", " ")}  ${s.tool.padEnd(5)}  ${s.file}  (${s.bytes} bytes)`
        );
        ctx.ui.notify(
          `Snapshots (newest first, showing ${Math.min(20, snaps.length)} of ${snaps.length}):\n${lines.join("\n")}`,
          "info"
        );

      } else if (sub.startsWith("list ")) {
        const file = sub.slice(5).trim();
        const snaps = listSnapshots(ctx.cwd, file);
        if (snaps.length === 0) {
          ctx.ui.notify(`No snapshots for: ${file}`, "info");
          return;
        }
        const lines = snaps.slice(0, 20).map((s) =>
          `  ${s.timestamp.slice(0, 19).replace("T", " ")}  ${s.tool}  ${s.bytes} bytes`
        );
        ctx.ui.notify(`Snapshots for ${file}:\n${lines.join("\n")}`, "info");

      } else if (sub === "undo") {
        const result = restoreSnapshot(ctx.cwd);
        if (!result) {
          ctx.ui.notify("No snapshots to restore.", "info");
          return;
        }
        ctx.ui.notify(`Restored: ${result.file} (from ${result.timestamp.slice(0, 19).replace("T", " ")})`, "info");

      } else if (sub.startsWith("undo ")) {
        const file = sub.slice(5).trim();
        if (/^\d+$/.test(file)) {
          // /rollback undo N — restore last N files
          const count = parseInt(file, 10);
          const results = restoreLastN(ctx.cwd, count);
          if (results.length === 0) {
            ctx.ui.notify("No snapshots to restore.", "info");
            return;
          }
          ctx.ui.notify(`Restored ${results.length} file(s):\n${results.map((r) => `  ${r.file}`).join("\n")}`, "info");
        } else {
          // /rollback undo <file>
          const result = restoreSnapshot(ctx.cwd, file);
          if (!result) {
            ctx.ui.notify(`No snapshot for: ${file}`, "info");
            return;
          }
          ctx.ui.notify(`Restored: ${result.file} (from ${result.timestamp.slice(0, 19).replace("T", " ")})`, "info");
        }

      } else if (sub === "clean") {
        const count = cleanSnapshots(ctx.cwd);
        ctx.ui.notify(`Removed ${count} snapshot(s).`, "info");

      } else {
        ctx.ui.notify([
          "/rollback                  — List all snapshots",
          "/rollback list <file>      — List snapshots for a file",
          "/rollback undo             — Restore most recent snapshot",
          "/rollback undo <file>      — Restore most recent for file",
          "/rollback undo <N>         — Restore last N files",
          "/rollback clean            — Remove all snapshots",
        ].join("\n"), "info");
      }
    },
  });

  registerPhaseCommand(pi);

  // ─── Security Gate — tool_call event ───

  pi.on("tool_call", async (event, ctx) => {
    const surface = event.toolName;
    let value = "*";

    // ── PLAN mode gate ──
    let planPreAuthorized = false;
    if (surface === "bash") {
      const input = event.input as { command?: string; path?: string };
      const block = checkGate(surface, input.path, input.command);
      if (block) { return { block: true, reason: block }; }
      planPreAuthorized = isPlanMode();
    } else if (["write", "edit"].includes(surface)) {
      const input = event.input as { path?: string };
      const block = checkGate(surface, input.path);
      if (block) { return { block: true, reason: block }; }
    } else {
      const block = checkGate(surface);
      if (block) { return { block: true, reason: block }; }
    }

    // Extract path for file tools
    if (["read", "write", "edit", "find", "grep", "ls"].includes(surface)) {
      const input = event.input as { path?: string };
      if (input.path) value = input.path;
    }

    // ── Snapshot: backup before write/edit ──
    if (["write", "edit"].includes(surface) && value !== "*") {
      createSnapshot(ctx.cwd, value, surface as "write" | "edit");
    }

    // ═══════════════════════════════════════════════════
    // Bash commands — segment-aware evaluation pipeline
    // ═══════════════════════════════════════════════════

    if (surface === "bash") {
      const input = event.input as { command?: string };
      const command = (input.command || "").trim();
      value = command;

      // Threat + full-command pattern scanning
      if (config.level !== "permissive") {
        const threatId = scanThreats(command);
        if (threatId) {
          audit(ctx, surface, value, "deny", `Threat: ${threatId}`);
          return { block: true, reason: `⛔ pi-keel security: command matches threat pattern '${threatId}'.` };
        }
        for (const p of FULL_COMMAND_PATTERNS) {
          if (p.match(command)) {
            audit(ctx, surface, value, "deny", p.rule.id);
            return { block: true, reason: `⛔ pi-keel security: '${p.rule.id}' blocked (${p.rule.description}).` };
          }
        }
        const secretIds = scanSecrets(command);
        if (secretIds.length > 0 && ctx.hasUI) {
          ctx.ui.notify(`⚠️ Command may contain secrets: ${secretIds.join(", ")}`, "warning");
        }
      }

      // Shell file-write bypass detection
      const fileWriteViolation = detectShellFileWrite(command, config.permission.path);
      if (fileWriteViolation) {
        audit(ctx, surface, value, "deny", `Shell bypass: ${fileWriteViolation.method} → ${fileWriteViolation.path}`);
        return { block: true, reason: `⛔ pi-keel security: '${fileWriteViolation.method}' would modify protected path '${fileWriteViolation.path}'. Use write/edit tool instead.` };
      }

      // PLAN mode: all segments passed checkGate, auto-allow
      if (planPreAuthorized) return undefined;

      // BUILD mode: segment-aware permission evaluation
      return await evaluateBashSegments(command, ctx);
    }

    // ═══════════════════════════════════════════════════
    // Non-bash tools — permission pipeline
    // ═══════════════════════════════════════════════════

    // Cross-cutting path gate
    if (["write", "edit"].includes(surface) && value !== "*") {
      for (const [pattern, action] of Object.entries(config.permission.path)) {
        if (action === "deny" && wildcardMatch(pattern, value)) {
          audit(ctx, surface, value, "deny", `Protected path: ${pattern}`);
          return { block: true, reason: `⛔ pi-keel security: path '${value}' is protected (matches '${pattern}').` };
        }
      }
    }

    // Build ruleset
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
    for (const sr of sessionRules) rules.push(sr);

    const decision = evaluatePermission(surface, value, rules);

    if (decision.action === "deny") {
      audit(ctx, surface, value, "deny", decision.source);
      return { block: true, reason: `⛔ pi-keel security: blocked by policy (${decision.source}).` };
    }

    if (decision.action === "ask") {
      if (!ctx.hasUI) {
        audit(ctx, surface, value, "deny", "non-interactive");
        return { block: true, reason: `⛔ pi-keel security: permission required but no UI available.` };
      }

      const displayValue = value.length > 80 ? value.slice(0, 77) + "..." : value;
      const choice = await ctx.ui.select(
        `Security Gate: ${surface}\n\n  ${displayValue}\n\nAllow?`,
        ["Allow once", `Allow "${surface}" for this session`, "Deny"]
      );

      if (choice === "Deny" || choice === undefined) {
        audit(ctx, surface, value, "deny", "user");
        return { block: true, reason: `⛔ pi-keel security: blocked by user.` };
      }
      if (choice?.startsWith("Allow \"")) {
        sessionRules.push({ surface, pattern: "*", action: "allow", source: "session" });
      }
      audit(ctx, surface, value, "allow", "user");
    }

    return undefined;
  });

  // ─── Segment-aware bash evaluation (BUILD mode) ───

  async function evaluateBashSegments(
    command: string,
    ctx: Parameters<typeof pi.on>[1] extends (event: any, ctx: infer C) => any ? C : never,
  ): Promise<{ block?: boolean; reason?: string } | undefined> {
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
        // Unknown command — ask in BUILD mode
        askRequired = true;
        askReason = askReason || `unknown command '${seg}'`;
        continue;
      }

      // Check config bash overrides (last match wins, same as evaluatePermission)
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
      if (configAction === "allow") continue; // config override: allow

      // No config override — use taxonomy default
      if (rule.build === "block") {
        blocking.push(`${seg} (${rule.description})`);
      } else if (rule.build === "ask") {
        askRequired = true;
        askReason = askReason || `${seg}: ${rule.description}`;
      }
    }

    if (blocking.length > 0) {
      const reason = `⛔ pi-keel security: blocked — ${blocking.join(", ")}.`;
      audit(ctx, "bash", command, "deny", reason);
      return { block: true, reason };
    }

    if (askRequired) {
      if (!(ctx as any).hasUI) {
        audit(ctx, "bash", command, "deny", "non-interactive");
        return { block: true, reason: `⛔ pi-keel security: permission required but no UI available.` };
      }

      const displayValue = command.length > 80 ? command.slice(0, 77) + "..." : command;
      const choice = await (ctx as any).ui.select(
        `Security Gate: bash\n\n  ${displayValue}\n\n${askReason}\n\nAllow?`,
        ["Allow once", "Allow bash for this session", "Deny"]
      );

      if (choice === "Deny" || choice === undefined) {
        audit(ctx, "bash", command, "deny", "user");
        return { block: true, reason: `⛔ pi-keel security: blocked by user.` };
      }
      if (choice?.startsWith("Allow bash")) {
        sessionRules.push({ surface: "bash", pattern: "*", action: "allow", source: "session" });
      }
      audit(ctx, "bash", command, "allow", "user");
    }

    return undefined;
  }
}
