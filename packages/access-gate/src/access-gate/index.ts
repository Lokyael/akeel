import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installGlobalPiAccessDecision } from "./access-decision";
import { selectPlatformComposition } from "./platform";
import { installWindowsBootstrap } from "./windows";

export { selectPlatformComposition } from "./platform";
export type { PlatformComposition } from "./platform";
export * from "./windows";

export default function accessGate(pi: ExtensionAPI): void {
  // Platform selection is intentionally made once at extension load. The Linux
  // authorization core is never asked to interpret Windows native evidence.
  if (selectPlatformComposition() === "windows") {
    installWindowsBootstrap(pi);
    return;
  }
  installGlobalPiAccessDecision(pi, {});
}
