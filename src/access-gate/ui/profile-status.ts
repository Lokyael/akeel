import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createProfileFooter, type ProfileFooterComponent, type ProfileFooterModel } from "./profile-footer";
import type { ResolvedProfile } from "../profile/types";

export interface ProfileFooterHandle {
  refresh(): void;
  dispose(): void;
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
