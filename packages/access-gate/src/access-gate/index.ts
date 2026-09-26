import type { ExtensionAPI, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { installGlobalPiAccessDecision } from "./access-decision";
import { selectPlatformComposition, type PlatformComposition } from "./platform";
import { installWindowsBootstrap } from "./windows";

export { selectPlatformComposition } from "./platform";
export type { PlatformComposition } from "./platform";
export * from "./windows";

export const UNSUPPORTED_PLATFORM_BLOCK_REASON =
  "Blocked because AKeel has no verified platform composition for this host.";

export function installUnsupportedPlatformBoundary(pi: Pick<ExtensionAPI, "on">): void {
  pi.on("tool_call", (): ToolCallEventResult => ({
    block: true,
    reason: UNSUPPORTED_PLATFORM_BLOCK_REASON,
  }));
}

export default function accessGate(pi: ExtensionAPI): void {
  // Platform selection is intentionally made once at extension load. The Linux
  // authorization core is never asked to interpret Windows native evidence or
  // run on an unsupported host.
  const composition: PlatformComposition = selectPlatformComposition();
  if (composition === "windows") {
    installWindowsBootstrap(pi);
    return;
  }
  if (composition === "linux") {
    installGlobalPiAccessDecision(pi, {});
    return;
  }
  installUnsupportedPlatformBoundary(pi);
}
