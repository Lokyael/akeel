import { guidanceFor, guidanceText } from "./guidance-catalog";
import type { GateDecision } from "./decision-types";
import type { GateResult } from "./types";

const MAX_RENDERED_REASON = 2_048;
const MAX_EVIDENCE_ITEMS = 32;
const SENSITIVE_PREFIXES = ["~/", "~\\", "/home/", "/root/", "/etc/passwd", "/etc/shadow", ".ssh", ".env", "token", "secret", "password"];

function redactSubject(subject: string): string {
  const lower = subject.toLowerCase();
  for (const prefix of SENSITIVE_PREFIXES) {
    if (lower.includes(prefix)) return subject.slice(0, 32).replace(/[^/\s]{3,}/g, "***");
  }
  return subject.slice(0, 1_024);
}

export function renderDecision(decision: GateDecision): GateResult {
  if (decision.disposition === "allow") return { kind: "allow" };

  if (decision.disposition === "ask") {
    const items = decision.evidence.slice(0, MAX_EVIDENCE_ITEMS).map((evidence) => evidence.subject.slice(0, 1_024));
    const reason = items.length < decision.evidence.length
      ? `${items.join("; ")} and ${decision.evidence.length - items.length} additional evidence items`
      : items.join("; ");
    return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
  }

  const headEvidence = decision.evidence[0];
  const headSubject = headEvidence ? redactSubject(headEvidence.subject) : "request denied";
  const guidance = decision.guidance ?? guidanceFor(decision.code);

  let reason = `${decision.code}: ${headSubject}`;
  if (guidance.length > 0) {
    const guidanceLine = guidance.map((g) => `${g.id}: ${guidanceText(g.id)}`).join(" | ");
    reason += ` (${guidanceLine})`;
  }
  if (decision.evidence.length > 1) {
    reason += `; ${decision.evidence.length - 1} additional evidence items`;
  }
  return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
}
