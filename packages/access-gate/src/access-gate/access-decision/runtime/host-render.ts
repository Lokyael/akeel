import type { UnifiedDisplayView } from "../core/compilation/index";

export type HostFacingBlock = Readonly<{ readonly kind: "block"; readonly code: HostFacingBlockCode; readonly reason: string }>;

export type HostFacingDecision =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "confirm"; readonly executed: false; readonly summary: string }>
  | HostFacingBlock;

export type HostFacingDecisionInput =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "ask"; readonly executed: false }>
  | Readonly<{ readonly kind: "deny"; readonly code: HostFacingBlockCode }>;

export type HostFacingBlockCode =
  | "invalid-request"
  | "resource-limit"
  | "policy-denied"
  | "no-ui"
  | "hard-boundary"
  | "path-denied"
  | "invalid-admission"
  | "security-boundary"
  | "unsupported-syntax"
  | "dynamic-value"
  | "invalid-host-context"
  | "unsupported-surface"
  | "read-only-policy-switch-required";

const MAX_HOST_SUMMARY_CHARS = 160;
const DENY_REASONS: Readonly<Record<HostFacingBlockCode, string>> = Object.freeze({
  "invalid-request": "Blocked because the request is not supported.",
  "resource-limit": "Blocked because the request exceeds analysis limits.",
  "policy-denied": "Blocked by access policy.",
  "no-ui": "Blocked because approval UI is unavailable.",
  "hard-boundary": "Blocked by a security boundary.",
  "path-denied": "Blocked by path policy.",
  "invalid-admission": "Blocked because the authorization facts are invalid.",
  "security-boundary": "Blocked by a security boundary.",
  "unsupported-syntax": "Blocked because the shell syntax is unsupported.",
  "dynamic-value": "Blocked because the shell command contains dynamic values.",
  "invalid-host-context": "Blocked because the host context is invalid.",
  "unsupported-surface": "Blocked because this governed tool surface is unsupported.",
  "read-only-policy-switch-required": "The current session is read-only; switch policy with /policy before retrying this modification.",
});

export function renderHostBlock(code: HostFacingBlockCode): HostFacingBlock {
  return Object.freeze({ kind: "block", code, reason: DENY_REASONS[code] });
}

export function renderHostFacingDecision(
  decision: HostFacingDecisionInput,
  display?: UnifiedDisplayView,
): HostFacingDecision {
  if (decision.kind === "allow") return Object.freeze({ kind: "allow" });
  if (decision.kind === "ask") {
    const summary = display === undefined
      ? "Approval required."
      : display.kind === "shell"
        ? boundedSummary(shellSummary(display))
        : boundedSummary(`${display.operation} ${display.path}`);
    return Object.freeze({ kind: "confirm", executed: false, summary });
  }
  return renderHostBlock(decision.code);
}

function shellSummary(display: Extract<UnifiedDisplayView, { readonly kind: "shell" }>): string {
  const operations = display.operations
    .map((operation) => `${operation.commandClass}${operation.opaque ? " [opaque]" : ""} [${operation.effects.join(", ")}]`)
    .join("; ");
  return `shell ${operations} — literal form: ${display.command}`;
}

function boundedSummary(value: string): string {
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/gu, (character) =>
    `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
  if (sanitized.length <= MAX_HOST_SUMMARY_CHARS) return sanitized;
  return `${sanitized.slice(0, MAX_HOST_SUMMARY_CHARS - 1)}…`;
}
