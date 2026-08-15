import type { DecisionCode, GateEvidence, Guidance, GuidanceId } from "./decision-types";

export type DenyResponseKind = "shell-form" | "security-boundary" | "generic";

// 响应分类全量表：新增 DecisionCode 忘配在此编译报错（fail-fast，与 EVIDENCE_KIND 同模式）。
const DENY_RESPONSE_KIND: Readonly<Record<DecisionCode, DenyResponseKind>> = {
  "dynamic-shell": "shell-form",
  "unsafe-syntax": "shell-form",
  "opaque-command": "shell-form",
  "unsupported-redirection": "shell-form",
  "uncertain-cwd": "shell-form",
  threat: "security-boundary",
  "blocked-path": "security-boundary",
  "symlink-escape": "security-boundary",
  "path-unclassifiable": "security-boundary",
  "destroy-command": "security-boundary",
  "hard-command-rule": "security-boundary",
  "shell-policy-denied": "generic",
  "path-denied": "generic",
  "approval-required": "generic",
  "user-denied": "generic",
  "unknown-tool": "generic",
  "invalid-tool-input": "generic",
  "unknown-effect": "generic",
  "resource-limit": "generic",
};

export function denyResponseKindFor(code: DecisionCode): DenyResponseKind {
  return DENY_RESPONSE_KIND[code];
}

// ── evidence kind 映射（与 denyResponseKindFor 同模块相邻，共享 code 视图） ──
// Record<DecisionCode, ...> 全量枚举：新增 DecisionCode 在此编译报错（fail-fast）。
// approval-required/user-denied 保持 "command"（审批决策不经 evidenceKind 构造证据，
// 实际证据由 evaluate-request 直接构造为 command/path）。

const EVIDENCE_KIND: Readonly<Record<DecisionCode, GateEvidence["kind"]>> = {
  "dynamic-shell": "syntax",
  "unsafe-syntax": "syntax",
  "uncertain-cwd": "syntax",
  threat: "threat",
  "unknown-tool": "tool",
  "invalid-tool-input": "tool",
  "resource-limit": "tool",
  "unsupported-redirection": "redirection",
  "blocked-path": "path",
  "symlink-escape": "path",
  "path-unclassifiable": "path",
  "path-denied": "path",
  "destroy-command": "command",
  "hard-command-rule": "command",
  "shell-policy-denied": "command",
  "opaque-command": "command",
  "unknown-effect": "command",
  "approval-required": "command",
  "user-denied": "command",
};

export function evidenceKind(code: DecisionCode): GateEvidence["kind"] {
  return EVIDENCE_KIND[code];
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
