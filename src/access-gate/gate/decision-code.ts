import type { PathDecision } from "../path";
import type { HardDenyCode } from "./decision-types";

export function pathDecisionCode(decision: Pick<PathDecision, "hard" | "reason">): HardDenyCode | "path-denied" {
  if (!decision.hard) return "path-denied";
  if (decision.reason === "blocked path") return "blocked-path";
  if (decision.reason === "symlink escapes an allowed root") return "symlink-escape";
  if (decision.reason === "path cannot be classified") return "path-unclassifiable";
  return "path-denied";
}
