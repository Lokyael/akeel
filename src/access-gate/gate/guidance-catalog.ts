import type { DecisionCode, Guidance, GuidanceId } from "./decision-types";

export type DenyResponseKind = "shell-form" | "security-boundary" | "generic";

const SHELL_FORM_CODES = new Set<DecisionCode>([
  "dynamic-shell",
  "unsafe-syntax",
  "opaque-command",
  "unsupported-redirection",
  "uncertain-cwd",
]);

const SECURITY_BOUNDARY_CODES = new Set<DecisionCode>([
  "threat",
  "blocked-path",
  "symlink-escape",
  "path-unclassifiable",
  "destroy-command",
  "hard-command-rule",
]);

export function denyResponseKindFor(code: DecisionCode): DenyResponseKind {
  if (SECURITY_BOUNDARY_CODES.has(code)) return "security-boundary";
  if (SHELL_FORM_CODES.has(code)) return "shell-form";
  return "generic";
}

const GUIDANCE_CATALOG: Readonly<Partial<Record<DecisionCode, readonly Guidance[]>>> = {
  "dynamic-shell": [{ id: "batch-inspection-tools", safety: "recheck" }],
  "opaque-command": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "unsafe-syntax": [{ id: "split-supported-commands", safety: "recheck" }],
  "unsupported-redirection": [{ id: "split-supported-commands", safety: "recheck" }],
  "uncertain-cwd": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "shell-policy-denied": [{ id: "profile-restriction", safety: "recheck" }],
  "path-denied": [{ id: "profile-restriction", safety: "recheck" }],
  "unknown-tool": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "invalid-tool-input": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "resource-limit": [{ id: "split-supported-commands", safety: "recheck" }],
};

export function guidanceFor(code: DecisionCode): readonly Guidance[] {
  return GUIDANCE_CATALOG[code] ?? [];
}

const GUIDANCE_TEXT: Readonly<Record<GuidanceId, string>> = {
  "batch-inspection-tools": "Use a Direct read, grep, find, or ls tool for this inspection. Do not retry this Shell form unchanged.",
  "literal-command-or-direct-tool": "Use a simple literal command or a Direct tool.",
  "split-supported-commands": "Split the operation into simpler commands or use Direct tools.",
  "profile-restriction": "This operation is not allowed by the active Profile. Use an allowed Profile or wait for approval.",
};

export function guidanceText(id: GuidanceId): string {
  return GUIDANCE_TEXT[id] ?? id;
}
