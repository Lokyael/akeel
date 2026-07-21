import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { evaluateToolCall } from "./gate";
import { loadProfiles } from "./profile/load";
import type { ResolvedProfiles } from "./profile/types";
import { findProjectRoot, createProfileState, type ProfileState } from "./session/profile-state";
import { clearProfileStatus, updateProfileStatus } from "./ui/profile-status";

function profileStatus(state: ProfileState, profiles: ResolvedProfiles): string {
  const profile = state.getProfile();
  const pathRules = profile.pathPolicy.rules.length;
  return [
    `Profile: ${state.getName()}`,
    `Description: ${profile.description}`,
    `Shell: readOnly=${profile.shellPolicy.readOnly}, mutating=${profile.shellPolicy.mutating}, unclassified=${profile.shellPolicy.unclassified}`,
    `Path rules: ${pathRules}`,
    `Available profiles: ${Object.keys(profiles.profiles).join(", ")}`,
  ].join("\n");
}

export default function accessGate(pi: ExtensionAPI): void {
  let profiles: ResolvedProfiles | undefined;
  let state: ProfileState | undefined;
  let projectRoot = process.cwd();
  let stagingDir: string | undefined;

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

      const selected = value || await ctx.ui.select("Select access profile", Object.keys(current.profiles.profiles));
      if (!selected) return;
      if (!current.state.set(selected)) {
        ctx.ui.notify(`Unknown profile: ${selected}`, "error");
        return;
      }
      updateProfileStatus(ctx, selected);
      ctx.ui.notify(`Active profile: ${selected}`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    projectRoot = findProjectRoot(ctx.cwd);
    profiles = loadProfiles(projectRoot, undefined, ctx.isProjectTrusted?.() === true);
    state = createProfileState(profiles);
    if (stagingDir) rmSync(stagingDir, { recursive: true, force: true });
    stagingDir = mkdtempSync(join(tmpdir(), "pi-access-"));
    updateProfileStatus(ctx, state.getName());
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearProfileStatus(ctx);
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
