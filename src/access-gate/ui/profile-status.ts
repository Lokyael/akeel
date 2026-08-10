import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createProfileFooter, type ProfileFooterComponent, type ProfileFooterModel } from "./profile-footer";
import { displayName } from "../profile/defaults";
import { COMMAND_CLASS_VALUES, PATH_OPERATION_VALUES } from "../domain";
import type { ResolvedProfile, ResolvedProfiles } from "../profile/types";
import type { ProfileState } from "../session/profile-state";

export interface ProfileFooterHandle {
  refresh(): void;
  dispose(): void;
}

/** /profile status 的完整解析策略文本渲染（T-053 C3：从 index.ts 迁入）。 */
export function profileStatus(state: ProfileState, profiles: ResolvedProfiles): string {
  const profile = state.getProfile();
  const pathRules = profile.pathPolicy.rules.length > 0
    ? profile.pathPolicy.rules.map((rule) => `  ${rule.path}: ${formatDecisions(PATH_OPERATION_VALUES, rule)}`)
    : ["  (none)"];
  return [
    `Profile: ${displayName(state.getName())}`,
    `Description: ${profile.description}`,
    "Shell:",
    `  ${formatDecisions(COMMAND_CLASS_VALUES, profile.shellPolicy)}`,
    "Path defaults:",
    `  ${formatDecisions(PATH_OPERATION_VALUES, profile.pathPolicy.default)}`,
    "Path rules:",
    ...pathRules,
    `Available profiles: ${Object.keys(profiles.profiles).map(displayName).join(", ")}`,
  ].join("\n");
}

function formatDecisions<T extends string>(keys: readonly T[], values: Partial<Record<T, string>>): string {
  return keys.flatMap((key) => values[key] ? [`${key}=${values[key]}`] : []).join(" ");
}

export function installProfileFooter(
  ctx: ExtensionContext,
  profile: () => ResolvedProfile,
  model: () => ProfileFooterModel | undefined,
  thinkingLevel: () => string,
  contextUsage: () => { percent: number | null; contextWindow: number } | undefined,
): ProfileFooterHandle | undefined {
  if (!ctx.hasUI || !ctx.sessionManager || (ctx.mode && ctx.mode !== "tui")) return undefined;

  let tui: { requestRender(): void } | undefined;
  let component: ProfileFooterComponent | undefined;
  const session = ctx.sessionManager;
  ctx.ui.setFooter((nextTui, theme, footerData) => {
    tui = nextTui;
    component = createProfileFooter(session, profile, model, thinkingLevel, contextUsage, footerData, theme);
    return component;
  });

  return {
    refresh() {
      component?.invalidate();
      tui?.requestRender();
    },
    dispose() {
      ctx.ui.setFooter(undefined);
      component = undefined;
      tui = undefined;
    },
  };
}

export function clearProfileStatus(footer: ProfileFooterHandle | undefined): void {
  footer?.dispose();
}
