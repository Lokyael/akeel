import { denyResponseKindFor, guidanceFor, guidanceText } from "./guidance-catalog";
import type { CompileResult } from "./access-request";
import type { GateDecision, Guidance } from "./decision-types";
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

function renderGuidance(guidance: readonly Guidance[]): string {
  return guidance.map((item) => guidanceText(item.id)).join("; ");
}

export function renderCompilationFailure(result: Extract<CompileResult, { kind: "reject" }>): GateResult {
  const head = result.evidence[0];
  const subject = head ? redactSubject(head.subject) : "request denied";
  const guidance = result.category === "unsupported-form" ? guidanceFor(result.code) : [];
  let reason: string;

  if (result.category === "security-block") {
    reason = "This operation is blocked by a non-overridable security boundary. Do not retry or bypass it.";
  } else if (result.category === "unsupported-form") {
    reason = "This Shell form cannot be approved as written.";
    if (guidance.length > 0) reason += " " + renderGuidance(guidance);
  } else {
    reason = "This tool request could not be analyzed in its current form. Correct the input and try again.";
    if (guidance.length > 0) reason += " " + renderGuidance(guidance);
  }

  if (subject !== "request denied") reason += " Affected operation: " + subject + ".";
  return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: result.code };
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

  const subject = decision.evidence[0] ? redactSubject(decision.evidence[0].subject) : "request denied";
  const guidance = decision.guidance ?? guidanceFor(decision.code);
  let reason: string;

  if (decision.enforcement === "hard") {
    const responseKind = denyResponseKindFor(decision.code);
    reason = responseKind === "security-boundary"
      ? "This operation is blocked by a non-overridable security boundary."
      : responseKind === "shell-form"
        ? "This Shell form cannot be approved as written."
        : "This request cannot be approved in its current form.";
    if (guidance.length > 0) reason += " " + renderGuidance(guidance);
    reason += responseKind === "security-boundary"
      ? " Do not retry or bypass it."
      : responseKind === "shell-form"
        ? " Use a different entry point or a simpler literal command."
        : " Correct the request and try again.";
  } else if (decision.enforcement === "profile") {
    reason = "This request is not allowed by the active Profile.";
    if (guidance.length > 0) reason += " " + renderGuidance(guidance);
    else reason += " Use an allowed Profile or wait for approval.";
  } else {
    reason = "The user declined this operation. Wait for alternative instructions.";
  }
  if (subject !== "request denied" && decision.enforcement !== "user") reason += " Affected operation: " + subject + ".";
  return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
}
