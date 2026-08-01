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
  "unknown-tool": [{ id: "check-tool-input", safety: "recheck" }],
  "invalid-tool-input": [{ id: "check-tool-input", safety: "recheck" }],
  "resource-limit": [{ id: "split-supported-commands", safety: "recheck" }],
};

export function guidanceFor(code: DecisionCode): readonly Guidance[] {
  return GUIDANCE_CATALOG[code] ?? [];
}

const GUIDANCE_TEXT: Readonly<Record<GuidanceId, string>> = {
  "batch-inspection-tools": "Use a Direct read, grep, find, or ls tool for this inspection. Do not retry this Shell form unchanged.",
  "literal-command-or-direct-tool": "Use a literal Shell command or a Direct tool (read, grep, find, ls). A literal command has no dynamic tokens: every argument must be fixed text, so single-quote any argument containing $, a backtick, or the glob/expansion characters * ? [ { ( , and do not use command substitution. Do not retry the same Shell form unchanged.",
  "split-supported-commands": "Split the operation into separate commands joined by && or ;, one action per command, and avoid command substitution and complex redirection; when redirection is needed, use only simple forms such as >, >>, 2>, or < with a plain file path. For inspection, use Direct tools (read, grep, find, ls). Do not retry the same Shell form unchanged.",
  "check-tool-input": "The requested tool or its input is not supported. Use a known Direct tool (read, write, edit, find, grep, ls) or a literal Shell command; if you retry the same tool, correct its parameters to match the tool schema.",
  "profile-restriction": "This operation is not allowed by the active Profile. You cannot change the Profile yourself; ask the user to update the Profile or approve the operation.",
};

export function guidanceText(id: GuidanceId): string {
  return GUIDANCE_TEXT[id] ?? id;
}
