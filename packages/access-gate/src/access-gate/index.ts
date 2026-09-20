import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installGlobalPiAccessDecision } from "./access-decision";

export default function accessGate(pi: ExtensionAPI): void {
  installGlobalPiAccessDecision(pi, {});
}
