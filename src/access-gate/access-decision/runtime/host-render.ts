import type { DirectDisplayView, ShellDisplayView } from "../core/index";
import type { ShellDecision } from "../core/index";
import type { Decision } from "../core/index";

export type HostFacingDecision =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "confirm"; readonly executed: false; readonly summary: string }>
  | Readonly<{ readonly kind: "block"; readonly code: HostFacingBlockCode; readonly reason: string }>;

type HostFacingDecisionInput = Decision | ShellDecision;
type HostFacingDenyCode = Extract<HostFacingDecisionInput, { kind: "deny" }>['code'];
export type HostFacingBlockCode =
  | HostFacingDenyCode
  | "security-boundary"
  | "unsupported-syntax"
  | "dynamic-value"
  | "invalid-host-context"
  | "unsupported-surface"
  | "read-only-policy-switch-required";

type DisplayView = DirectDisplayView | ShellDisplayView;

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

export function renderHostBlock(code: HostFacingBlockCode): HostFacingDecision {
  return Object.freeze({ kind: "block", code, reason: DENY_REASONS[code] });
}

export function renderHostFacingDecision(
  decision: HostFacingDecisionInput,
  display?: DisplayView,
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

function shellSummary(display: ShellDisplayView): string {
  const operations = display.operations
    .map((operation) => `${operation.commandClass} [${operation.effects.join(", ")}]`)
    .join("; ");
  return `shell ${operations} — literal form: ${display.command}`;
}

function boundedSummary(value: string): string {
  if (value.length <= MAX_HOST_SUMMARY_CHARS) return value;
  return `${value.slice(0, MAX_HOST_SUMMARY_CHARS - 1)}…`;
}
