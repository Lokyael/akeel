import { guidanceFor } from "./guidance-catalog";
import type {
  GateDecision,
  GateEvidence,
  HardDenyCode,
  ProfileDenyCode,
} from "./decision-types";
import { evidenceKind } from "./access-request";

export function hardDeny(
  code: HardDenyCode,
  subject: string,
  span?: { start: number; end: number },
): GateDecision {
  return {
    disposition: "deny",
    code,
    enforcement: "hard",
    evidence: [{ kind: evidenceKind(code), subject, span }],
    guidance: guidanceFor(code),
  };
}

export function profileDeny(code: ProfileDenyCode, subject: string): GateDecision {
  return {
    disposition: "deny",
    code,
    enforcement: "profile",
    evidence: [{ kind: "path", subject }],
    guidance: guidanceFor(code),
  };
}

export function requireApproval(evidence: readonly GateEvidence[]): GateDecision {
  return {
    disposition: "ask",
    code: "approval-required",
    evidence,
    approval: {
      code: "approval-required",
      scope: "tool-call",
      evidence,
      options: ["Allow once", "Deny"],
    },
  };
}
