import { guidanceFor, guidanceText } from "./guidance-catalog";
import type { GateDecision } from "./decision-types";
import type { GateResult } from "./types";

const MAX_RENDERED_REASON = 2_048;
const MAX_EVIDENCE_ITEMS = 32;
const SENSITIVE_PREFIXES = [
  "~/", "~\\", "/home/", "/root/",
  "/etc/passwd", "/etc/shadow",
  ".ssh", ".git", "id_rsa", "id_ed25519", "authorized_keys", "known_hosts",
  ".env", ".npmrc", ".pypirc", ".netrc",
  "token", "secret", "password", "credentials",
];

function redactSubject(subject: string): string {
  const lower = subject.toLowerCase();
  for (const prefix of SENSITIVE_PREFIXES) {
    const idx = lower.indexOf(prefix);
    if (idx === -1) continue;
    const before = idx === 0 || lower[idx-1] === "/" || lower[idx-1] === "\\";
    const after = idx + prefix.length >= lower.length || lower[idx+prefix.length] === "/" || lower[idx+prefix.length] === "\\";
    if (before && after) return subject.slice(0, 32).replace(/[^\/\s]{3,}/g, "***");
  }
  return subject.slice(0, 1_024);
}

export function renderDecision(decision: GateDecision): GateResult {
  if (decision.disposition === "allow") return { kind: "allow" };

  if (decision.disposition === "ask") {
    const items = decision.evidence.slice(0, MAX_EVIDENCE_ITEMS).map((e) => e.subject.slice(0, 1_024));
    const reason = items.length < decision.evidence.length
      ? items.join("; ") + " and " + (decision.evidence.length - items.length) + " additional items"
      : items.join("; ");
    return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
  }

  const head = decision.evidence[0];
  const subject = head ? redactSubject(head.subject) : "request denied";
  const g = decision.guidance ?? guidanceFor(decision.code);
  const enf = (decision as { enforcement?: string }).enforcement;
  let reason: string;

  if (enf === "hard") {
    reason = "HARD_BLOCK: " + decision.code + " - " + subject;
    if (g.length > 0) reason += " | Guidance: " + g.map((x) => x.id + ": " + guidanceText(x.id)).join("; ");
    reason += " | Permanently blocked for security reasons. Do not retry or work around.";
  } else if (enf === "profile") {
    reason = "PROFILE_BLOCK: " + decision.code + " - " + subject;
    if (g.length > 0) reason += " | Guidance: " + g.map((x) => x.id + ": " + guidanceText(x.id)).join("; ");
    reason += " | Not allowed by active Profile. Suggest /profile keel-code or /profile keel-develop.";
  } else {
    reason = "USER_BLOCK: " + decision.code + " - " + subject;
    reason += " | User declined. Wait for alternative instructions.";
  }
  return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
}
