export type EvidenceSource = "pi-host" | "bash-manual" | "linux-manual" | "new-policy";
export type ReferenceStatus = "externally-proven" | "independently-observed" | "newly-adopted";

export interface ContractProbe {
  readonly id: string;
  readonly source: EvidenceSource;
  readonly referenceStatus: ReferenceStatus;
  readonly statement: string;
}

export const MANAGED_SURFACES = Object.freeze(["read", "write", "edit", "find", "grep", "ls", "bash"] as const);
export const PASSTHROUGH_SURFACES = Object.freeze(["unknown-tool", "extension-tool"] as const);
export const REQUEST_FIELDS = Object.freeze(["surface", "arguments", "cwd", "hasUI"] as const);

export const CANONICAL_OUTCOMES = Object.freeze(["complete", "reject"] as const);
export const REJECT_CODES = Object.freeze([
  "invalid-request",
  "unsupported-surface",
  "unsupported-syntax",
  "dynamic-value",
  "security-boundary",
  "resource-limit",
] as const);
export const REJECT_PRIORITIES = Object.freeze([
  "invalid-request",
  "security-boundary",
  "unsupported-syntax",
  "dynamic-value",
  "resource-limit",
] as const);

export const ADMISSION_FACTS = Object.freeze([
  "command",
  "path",
  "resolved-candidate",
  "source-anchor",
  "confidence",
] as const);
export const FORBIDDEN_ADMISSION_FACTS = Object.freeze([
  "raw-shell",
  "config-shape",
  "display-coordinate",
  "natural-language-reason",
  "flow-data",
] as const);
export const DISPLAY_FACTS = Object.freeze(["source-coordinate", "bounded-text", "decision-code"] as const);

export const POLICY_DECISIONS = Object.freeze(["hard-deny", "policy-deny", "ask", "allow"] as const);
export const POLICY_OPERATIONS = Object.freeze(["read", "write", "execute", "inspect"] as const);
export const POLICY_CLASSES = Object.freeze(["file", "directory", "command", "path"] as const);
export const POLICY_MONOTONICITY_CASES = Object.freeze([
  { name: "hard-boundary", narrow: "hard-deny", wide: "hard-deny" },
  { name: "policy-rule", narrow: "policy-deny", wide: "allow" },
] as const);
export const REJECT_FIELDS = Object.freeze(["code", "source-anchor", "resource-class"] as const);

export const PROBES: readonly ContractProbe[] = Object.freeze([
  {
    id: "request-managed-surface",
    source: "pi-host",
    referenceStatus: "externally-proven",
    statement: "Only the explicitly listed host tool surfaces enter the new decision pipeline.",
  },
  {
    id: "request-passthrough-surface",
    source: "pi-host",
    referenceStatus: "externally-proven",
    statement: "An unowned tool surface is passed through without being treated as a governed decision.",
  },
  {
    id: "shell-and-or-order",
    source: "bash-manual",
    referenceStatus: "independently-observed",
    statement: "And-or lists are evaluated left-to-right and short-circuit their next list element.",
  },
  {
    id: "shell-tilde-quoting",
    source: "bash-manual",
    referenceStatus: "independently-observed",
    statement: "Tilde expansion is not performed when the tilde is quoted or escaped.",
  },
  {
    id: "shell-parameter-binding",
    source: "bash-manual",
    referenceStatus: "independently-observed",
    statement: "Adjacent references to one loop binding use the same scalar value.",
  },
  {
    id: "linux-path-resolution",
    source: "linux-manual",
    referenceStatus: "externally-proven",
    statement: "Path candidates are resolved at canonicalization time and every bounded candidate is retained.",
  },
  {
    id: "policy-hard-boundary",
    source: "new-policy",
    referenceStatus: "newly-adopted",
    statement: "A hard boundary remains a denial regardless of policy preset widening or approval availability.",
  },
  {
    id: "policy-no-ui",
    source: "new-policy",
    referenceStatus: "newly-adopted",
    statement: "An ask result cannot execute when the host exposes no interactive UI.",
  },
]);

export function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
