import type { PathDecision } from "../path";
import { PATH_DENY_REASONS } from "../path/policy";
import type { HardDenyCode } from "./decision-types";

export function pathDecisionCode(decision: Pick<PathDecision, "hard" | "reason">): HardDenyCode | "path-denied" {
  if (!decision.hard) return "path-denied";
  if (decision.reason === PATH_DENY_REASONS.blocked) return "blocked-path";
  if (decision.reason === PATH_DENY_REASONS.symlinkEscape) return "symlink-escape";
  if (decision.reason === PATH_DENY_REASONS.unclassifiable) return "path-unclassifiable";
  return "path-denied";
}
