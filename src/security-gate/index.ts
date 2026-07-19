/**
 * security-gate/index.ts — Security gate pipeline for pi.
 *
 * Pipeline: PLAN gate → bash analysis/threat scan → permission evaluation
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { SecurityConfig, SecurityLevel } from "./types";
import { cloneConfig, loadConfig, DEFAULT_CONFIGS } from "./config";
import { createPhaseController } from "./phase";
import { applyPlanGate } from "./pipeline/plan-gate";
import { evaluateBashCommand } from "./pipeline/bash";
import { evaluateToolPermission } from "./pipeline/permission";

// ─── Main Extension ───

export default function securityGate(pi: ExtensionAPI) {
  const phaseController = createPhaseController();
  let config: SecurityConfig = cloneConfig(DEFAULT_CONFIGS.standard);
  pi.on("session_start", async (_event, ctx) => {
    phaseController.reset();
    config = loadConfig(ctx.cwd);
  });

  // ─── /build and /plan commands ───

  pi.registerCommand("build", {
    description: "Switch to BUILD mode — full access for implementation",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      phaseController.setBuild();
      ctx.ui.notify("BUILD MODE — write/edit/bash 全部可用。Run /plan to switch back.", "info");
    },
  });

  pi.registerCommand("plan", {
    description: "Switch to PLAN mode — write blocked, bash restricted to read-only (default)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      phaseController.setPlan();
      ctx.ui.notify("PLAN MODE — write/edit 禁用，bash 仅限只读。Run /build to switch to BUILD.", "info");
    },
  });

  // ─── /security command ───

  pi.registerCommand("security", {
    description: "Show or set security configuration",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const sub = args.trim();

      if (sub === "status") {
        ctx.ui.notify([
          `Mode: ${phaseController.getMode().toUpperCase()} (use /build and /plan to switch)`,
          `Security Level: ${config.level}`,
          `Protected Paths: ${Object.keys(config.permission.path).filter(k => config.permission.path[k] === "deny").length} deny rules`,
          `Bash Rules: ${Object.keys(config.permission.bash).length} patterns`,
        ].join("\n"), "info");
      } else if (sub.startsWith("level ")) {
        const level = sub.slice(6).trim() as SecurityLevel;
        if (DEFAULT_CONFIGS[level]) {
          config = cloneConfig(DEFAULT_CONFIGS[level]);
          ctx.ui.notify(`Security level set to: ${level}`, "info");
        } else {
          ctx.ui.notify(`Unknown level: ${level}. Use: strict, standard, permissive`, "error");
        }
      } else {
        ctx.ui.notify([
          "/security status            — Show current security config",
          "/security level <name>      — Set level (strict/standard/permissive)",
        ].join("\n"), "info");
      }
    },
  });

  // ─── Security Gate — tool_call event ───

  pi.on("tool_call", async (event, ctx) => {
    const surface = event.toolName;
    let value = "*";

    // Step 1: Extract path early for the gate
    if (["read", "write", "edit", "find", "grep", "ls"].includes(surface)) {
      const input = event.input as { path?: string };
      if (input.path) value = input.path;
    }

    // Step 2: PLAN mode gate — decides whether the tool may proceed
    const planInput = {
      surface,
      toolPath: undefined as string | undefined,
      bashCommand: undefined as string | undefined,
      cwd: ctx.cwd,
      config,
    };

    if (surface === "bash") {
      const input = event.input as { command?: string; path?: string };
      planInput.toolPath = input.path;
      planInput.bashCommand = input.command;
    } else if (["write", "edit"].includes(surface)) {
      planInput.toolPath = value !== "*" ? value : undefined;
    }

    const planResult = applyPlanGate(phaseController, planInput);
    if (planResult.kind === "block") return { block: true, reason: planResult.reason };

    // Step 3: Bash command evaluation (threat → shell-write → segment eval)
    if (surface === "bash") {
      const input = event.input as { command?: string };
      const command = (input.command || "").trim();
      const result = await evaluateBashCommand({ command, ctx: ctx as ExtensionContext, config, cwd: ctx.cwd });
      if (result.kind === "block") return { block: true, reason: result.reason };
      return undefined;
    }

    // Step 4: Permission evaluation for non-bash tools
    const permissionResult = await evaluateToolPermission({
      surface, value, cwd: ctx.cwd, ctx: ctx as ExtensionContext, config,
    });
    if (permissionResult?.kind === "block") return { block: true, reason: permissionResult.reason };
    return undefined;
  });
}
