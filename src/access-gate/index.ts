import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { evaluateToolCall } from "./gate";
import { loadProfiles } from "./profile";
import type { ResolvedProfiles } from "./profile";
import { displayName, PROFILE_PREFIX } from "./profile";
import { findProjectRoot, createProfileState, type ProfileState } from "./session";
import { applySubagentProfile, publishParentTier } from "./session";
import { disposeProfileFooter, installProfileFooter, profileStatus, type ProfileFooterHandle } from "./ui";

export default function accessGate(pi: ExtensionAPI): void {
  let profiles: ResolvedProfiles | undefined;
  let state: ProfileState | undefined;
  let projectRoot = process.cwd();
  let stagingDir: string | undefined;
  let footer: ProfileFooterHandle | undefined;

  const requireState = (): { profiles: ResolvedProfiles; state: ProfileState } => {
    if (!profiles || !state) throw new Error("access profile is not initialized");
    return { profiles, state };
  };

  pi.registerCommand("profile", {
    description: "Select or inspect the active access profile",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const current = requireState();
      const value = args.trim();
      if (value === "status") {
        ctx.ui.notify(profileStatus(current.state, current.profiles), "info");
        return;
      }

      const storageNames = Object.keys(current.profiles.profiles);
      const selected = value
        ? (storageNames.includes(value) ? value : (storageNames.includes(`${PROFILE_PREFIX}${value}`) ? `${PROFILE_PREFIX}${value}` : value))
        : await ctx.ui.select("Select access profile", storageNames.map(displayName)).then(
            (display) => display ? storageNames.find((s) => displayName(s) === display) : undefined
          );
      if (!selected) return;
      if (!current.state.set(selected)) {
        ctx.ui.notify(`Unknown profile: ${selected}`, "error");
        return;
      }
      // 父档位号随 /profile 切换更新，供后续 spawn 的子代理钳制（D-039）
      publishParentTier(current.state);
      footer?.refresh();
      ctx.ui.notify(`Active profile: ${displayName(selected)}`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    projectRoot = findProjectRoot(ctx.cwd);
    profiles = loadProfiles({
      onError: (message) => {
        if (ctx.hasUI) ctx.ui.notify(message, "error");
      },
    });
    state = createProfileState(profiles);
    // 子代理会话（D-039）：映射档位 + 钳制；父档位号传播（孙代理继承，链单调）
    applySubagentProfile(profiles, state);
    publishParentTier(state);
    footer?.dispose();
    footer = installProfileFooter(
      ctx,
      () => requireState().state.getProfile(),
      () => ctx.model,
      () => {
        const entries = ctx.sessionManager?.buildContextEntries() ?? [];
        for (let index = entries.length - 1; index >= 0; index--) {
          const entry = entries[index];
          if (entry && typeof entry === "object" && (entry as { type?: unknown }).type === "thinking_level_change") {
            const level = (entry as { thinkingLevel?: unknown }).thinkingLevel;
            if (typeof level === "string") return level;
          }
        }
        return "off";
      },
      () => ctx.getContextUsage?.(),
    );
    if (stagingDir) rmSync(stagingDir, { recursive: true, force: true });
    stagingDir = mkdtempSync(join(tmpdir(), "pi-access-"));
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    disposeProfileFooter(footer);
    footer = undefined;
    if (stagingDir) rmSync(stagingDir, { recursive: true, force: true });
    stagingDir = undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    const current = requireState();
    const result = await evaluateToolCall({
      surface: event.toolName,
      args: (event.input ?? {}) as Record<string, unknown>,
      cwd: ctx.cwd,
      projectRoot,
      stagingDir: stagingDir ?? ctx.cwd,
      profile: current.state.getProfile(),
    }, {
      hasUI: ctx.hasUI,
      select: ctx.hasUI ? (prompt, options) => ctx.ui.select(prompt, options) : undefined,
    });
    if (result.kind === "block") return { block: true, reason: result.reason };
    return undefined;
  });
}
