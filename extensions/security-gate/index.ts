/**
 * security-gate/index.ts — 5-layer defense pipeline for pi.
 *
 * Layers: PLAN gate → threat scan → secret scan → shell-write detect → permission eval
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { SecurityConfig, SecurityLevel, SessionRule } from "./types";
import { loadConfig, DEFAULT_CONFIGS } from "./config";
import { initAuditLog, audit } from "./audit";
import { createSnapshot, listSnapshots, restoreSnapshot, restoreLastN, cleanSnapshots } from "./snapshots";
import { registerCommand as registerPhaseCommand, getMode } from "./phase";
import { applyPlanGate } from "./pipeline/plan-gate";
import { evaluateBashCommand } from "./pipeline/bash";
import { evaluateToolPermission } from "./pipeline/permission";

// ─── Main Extension ───

export default function securityGate(pi: ExtensionAPI) {
  let config: SecurityConfig = DEFAULT_CONFIGS.standard;
  const sessionRules: SessionRule[] = [];

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig(ctx.cwd);
    initAuditLog(config.audit.logPath);
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
          const count = parseInt(file, 10);
          const results = restoreLastN(ctx.cwd, count);
          if (results.length === 0) {
            ctx.ui.notify("No snapshots to restore.", "info");
            return;
          }
          ctx.ui.notify(`Restored ${results.length} file(s):\n${results.map((r) => `  ${r.file}`).join("\n")}`, "info");
        } else {
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
    const planInput = {
      surface,
      toolPath: undefined as string | undefined,
      bashCommand: undefined as string | undefined,
    };

    if (surface === "bash") {
      const input = event.input as { command?: string; path?: string };
      planInput.toolPath = input.path;
      planInput.bashCommand = input.command;
    } else if (["write", "edit"].includes(surface)) {
      const input = event.input as { path?: string };
      planInput.toolPath = input.path;
    }

    const planResult = applyPlanGate(planInput);
    if (planResult.blocked) return { block: true, reason: planResult.blocked };

    // Extract path for file tools
    if (["read", "write", "edit", "find", "grep", "ls"].includes(surface)) {
      const input = event.input as { path?: string };
      if (input.path) value = input.path;
    }

    // ── Snapshot: backup before write/edit ──
    if (["write", "edit"].includes(surface) && value !== "*") {
      createSnapshot(ctx.cwd, value, surface as "write" | "edit");
    }

    // ── Bash commands ──
    if (surface === "bash") {
      const input = event.input as { command?: string };
      const command = (input.command || "").trim();
      return evaluateBashCommand({
        command,
        ctx: ctx as ExtensionContext,
        config,
        sessionRules,
        planPreAuthorized: planResult.planPreAuthorized,
      });
    }

    // ── Non-bash tools ──
    return evaluateToolPermission({
      surface,
      value,
      ctx: ctx as ExtensionContext,
      config,
      sessionRules,
    });
  });
}
