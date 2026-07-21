import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "access-profile";

export function updateProfileStatus(ctx: ExtensionContext, profileName: string): void {
  if (ctx.hasUI) ctx.ui.setStatus(STATUS_ID, profileName);
}

export function clearProfileStatus(ctx: ExtensionContext): void {
  if (ctx.hasUI) ctx.ui.setStatus(STATUS_ID, undefined);
}
