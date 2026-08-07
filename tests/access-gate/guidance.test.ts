import assert from "node:assert/strict";
import test from "node:test";
import { renderCompilationFailure, renderDecision } from "../../src/access-gate/gate/render-decision";
import { denyResponseKindFor, guidanceFor, guidanceText } from "../../src/access-gate/gate/guidance-catalog";
import type { DenyResponseKind } from "../../src/access-gate/gate/guidance-catalog";
import type { GateDecision, GateEvidence, GuidanceId, DecisionCode } from "../../src/access-gate/gate/decision-types";

const evidence: GateEvidence[] = [{ kind: "syntax", subject: "~/sensitive/path" }];

test("maps dynamic-shell to batch-inspection-tools guidance", () => {
  const guidance = guidanceFor("dynamic-shell");
  assert.equal(guidance.length, 1);
  assert.equal(guidance[0]!.id, "batch-inspection-tools");
});

test("literal command guidance states a verifiable literal criterion", () => {
  const text = guidanceText("literal-command-or-direct-tool");
  assert.ok(text.includes("single-quote"));
  assert.ok(text.includes("command substitution"));
  assert.ok(text.includes("Do not retry"));
});

test("split command guidance names supported separators and redirects", () => {
  const text = guidanceText("split-supported-commands");
  assert.ok(text.includes("&&"));
  assert.ok(text.includes(";"));
  assert.ok(text.includes(">>"));
  assert.ok(text.includes("Do not retry"));
});

test("profile guidance tells the agent to ask the user instead of self-serving", () => {
  const text = guidanceText("profile-restriction");
  assert.ok(text.includes("ask the user"));
  assert.equal(text.includes("wait for approval"), false);
  assert.equal(text.includes("Use an allowed Profile"), false);
});

test("check-tool-input guidance covers both unknown tool and bad input", () => {
  const text = guidanceText("check-tool-input");
  assert.ok(text.includes("not supported"));
  assert.ok(text.includes("schema"));
});

test("blocked path and threat do not offer bypass guidance", () => {
  assert.deepEqual(guidanceFor("blocked-path"), []);
  assert.deepEqual(guidanceFor("threat"), []);
  assert.deepEqual(guidanceFor("symlink-escape"), []);
});

test("path-denied and tool-input codes map to profile/tool guidance", () => {
  // path-denied → profile-restriction (tells the agent to ask the user)
  assert.equal(guidanceFor("path-denied")[0]?.id, "profile-restriction");
  // invalid-tool-input → check-tool-input (fix parameters, not the Shell form)
  assert.equal(guidanceFor("invalid-tool-input")[0]?.id, "check-tool-input");
  // unknown-tool → check-tool-input (use a known tool)
  assert.equal(guidanceFor("unknown-tool")[0]?.id, "check-tool-input");
  // resource-limit → split-supported-commands
  assert.equal(guidanceFor("resource-limit")[0]?.id, "split-supported-commands");
  // unsupported redirections and uncertain cwd use recovery guidance rather than security bypass text
  assert.equal(guidanceFor("unsupported-redirection")[0]?.id, "split-supported-commands");
  assert.equal(guidanceFor("uncertain-cwd")[0]?.id, "literal-command-or-direct-tool");
  assert.deepEqual(guidanceFor("destroy-command"), []);
  assert.deepEqual(guidanceFor("hard-command-rule"), []);
});

test("hard deny renderer explains that unsupported Shell forms need a different form or Direct tool", () => {
  const decision: GateDecision = {
    disposition: "deny",
    code: "dynamic-shell",
    enforcement: "hard",
    evidence,
    guidance: guidanceFor("dynamic-shell"),
  };
  const result = renderDecision(decision);
  assert.equal(result.kind, "block");
  assert.equal(result.code, "dynamic-shell");
  assert.ok(result.reason.includes("Shell form cannot be approved"));
  assert.ok(result.reason.includes("Direct"));
  assert.equal(result.reason.includes("batch-inspection-tools"), false);
  assert.equal(result.reason.includes("Permanently blocked"), false);
  assert.equal(result.reason.includes("work around"), false);
  assert.equal(result.reason.includes("different entry point"), false);
});

test("hard security deny explains that the boundary cannot be bypassed", () => {
  const decision: GateDecision = {
    disposition: "deny",
    code: "threat",
    enforcement: "hard",
    evidence: [{ kind: "threat", subject: "remote content" }],
    guidance: guidanceFor("threat"),
  };
  const result = renderDecision(decision);
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("non-overridable security boundary"));
  assert.ok(result.reason.includes("Do not retry or bypass"));
  assert.equal(result.reason.includes("Direct"), false);
});

function askDecision(evidenceItems: GateEvidence[]): GateDecision {
  return {
    disposition: "ask",
    code: "approval-required",
    evidence: evidenceItems,
    approval: {
      code: "approval-required",
      scope: "tool-call",
      evidence: evidenceItems,
      options: ["Allow once", "Deny"],
    },
  };
}

test("ask renderer preserves full evidence and does not allow guidance bypass", () => {
  const ask: GateDecision = askDecision([
    { kind: "path", subject: "write path: src/main.ts @ /project" },
    { kind: "path", subject: "write path: docs/task.md @ /project" },
  ]);
  const result = renderDecision(ask);
  assert.equal(result.kind, "block");
  assert.equal(result.code, "approval-required");
  assert.ok(result.reason.includes("src/main.ts"));
  assert.ok(result.reason.includes("docs/task.md"));
});

test("ask renderer shows the literal form of command evidence when raw command is available", () => {
  const command = "sh -c 'rm -rf /'";
  const ask: GateDecision = askDecision([
    { kind: "command", subject: "unknown command", span: { start: 0, end: command.length } },
  ]);
  const result = renderDecision(ask, command);
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("unknown command"), "类别保留");
  assert.ok(result.reason.includes(`literal form: ${command}`));
  assert.equal(result.reason.includes("unknown command: sh"), false, "ask 侧 subject 类别-only，可执行名由 literal 提供");
});

test("ask renderer shows the full command in the literal form without redaction", () => {
  // 命令由模型提出，原文已作为 toolCall 参数存在于会话与模型上下文；
  // 审批框（人类）展示完整命令供知情同意，不做脱敏；subject 为类别-only。
  const command = "sh -c 'cat ~/.env'";
  const ask: GateDecision = askDecision([
    { kind: "command", subject: "unknown command", span: { start: 0, end: command.length } },
  ]);
  const result = renderDecision(ask, command);
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes(`literal form: ${command}`));
});

test("ask literal form marks truncation instead of silently cutting", () => {
  const command = "echo " + "x".repeat(5_000);
  const ask: GateDecision = askDecision([
    { kind: "command", subject: "unknown command", span: { start: 0, end: command.length } },
  ]);
  const result = renderDecision(ask, command);
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("(truncated)"), "截断显式标注，不静默丢信息");
  assert.equal(result.reason.includes("x".repeat(5_000)), false);
});

test("ask renderer without raw command keeps evidence-only output", () => {
  const ask: GateDecision = askDecision([
    { kind: "command", subject: "unknown command" },
  ]);
  const result = renderDecision(ask);
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("unknown command"));
  assert.equal(result.reason.includes("literal form:"), false);
});

test("ask renderer skips literal form for out-of-range spans", () => {
  const ask: GateDecision = askDecision([
    { kind: "command", subject: "unknown command", span: { start: 0, end: 999 } },
  ]);
  const result = renderDecision(ask, "xargs sed -i 's/a/b/g'");
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("unknown command"));
  assert.equal(result.reason.includes("literal form:"), false);
});

test("renderer bounds evidence subject count and total reason length", () => {
  const hugeEvidence = Array.from({ length: 100 }, (_, i) => ({ kind: "path" as const, subject: `write path: file-${i}.ts @ /project` }));
  const deny: GateDecision = {
    disposition: "deny",
    code: "path-denied",
    enforcement: "profile",
    evidence: hugeEvidence,
    guidance: guidanceFor("path-denied"),
  };
  const result = renderDecision(deny);
  assert.equal(result.kind, "block");
  assert.ok(result.reason.length <= 2_048);
  assert.equal(result.reason.includes("This operation is not allowed by the active Profile"), true);
  assert.equal(result.reason.includes("PROFILE_BLOCK"), false);
  assert.equal(result.reason.includes("profile-restriction"), false);
  assert.equal(result.reason.includes("Use an allowed Profile"), false);
  assert.equal(result.reason.includes("wait for approval"), false);
  assert.ok(result.reason.includes("ask the user"));
});

test("renders compiler outcomes by category without internal identifiers", () => {
  const unsupported = renderCompilationFailure({
    kind: "reject",
    category: "unsupported-form",
    code: "dynamic-shell",
    evidence,
  });
  const security = renderCompilationFailure({
    kind: "reject",
    category: "security-block",
    code: "threat",
    evidence: [{ kind: "threat", subject: "remote content" }],
  });
  const invalid = renderCompilationFailure({
    kind: "reject",
    category: "invalid-request",
    code: "invalid-tool-input",
    evidence,
  });

  assert.equal(unsupported.kind, "block");
  assert.ok(unsupported.reason.includes("Direct"));
  assert.equal(unsupported.reason.includes("dynamic-shell"), false);
  assert.equal(security.kind, "block");
  assert.ok(security.reason.includes("non-overridable security boundary"));
  assert.equal(security.reason.includes("Direct"), false);
  assert.equal(invalid.kind, "block");
  assert.ok(invalid.reason.includes("could not be analyzed"));
});

test("classifies every DecisionCode into one renderer response kind", () => {
  const codes: readonly DecisionCode[] = [
    "dynamic-shell", "unsafe-syntax", "threat", "opaque-command", "destroy-command",
    "hard-command-rule", "blocked-path", "symlink-escape", "path-unclassifiable", "path-denied",
    "shell-policy-denied", "approval-required", "user-denied", "unknown-tool", "invalid-tool-input",
    "unsupported-redirection", "uncertain-cwd", "unknown-effect", "resource-limit",
  ];
  const expected: Record<DecisionCode, DenyResponseKind> = {
    "dynamic-shell": "shell-form", "unsafe-syntax": "shell-form", threat: "security-boundary",
    "opaque-command": "shell-form", "destroy-command": "security-boundary", "hard-command-rule": "security-boundary",
    "blocked-path": "security-boundary", "symlink-escape": "security-boundary", "path-unclassifiable": "security-boundary",
    "path-denied": "generic", "shell-policy-denied": "generic", "approval-required": "generic", "user-denied": "generic",
    "unknown-tool": "generic", "invalid-tool-input": "generic", "unsupported-redirection": "shell-form",
    "uncertain-cwd": "shell-form", "unknown-effect": "generic", "resource-limit": "generic",
  };
  for (const code of codes) assert.equal(denyResponseKindFor(code), expected[code]);
});

test("allow decision renders as allow", () => {
  assert.deepEqual(renderDecision({ disposition: "allow" }), { kind: "allow" });
});

test("user deny renderer explains the operation was not executed", () => {
  const decision: GateDecision = {
    disposition: "deny",
    code: "user-denied",
    enforcement: "user",
    evidence,
    guidance: [],
  };
  const result = renderDecision(decision);
  assert.equal(result.kind, "block");
  assert.equal(result.code, "user-denied");
  assert.ok(result.reason.includes("not executed"));
  assert.ok(result.reason.includes("wait for the user"));
  assert.equal(result.reason.includes("Affected operation"), false);
});


test("every GuidanceId maps to a non-empty text", () => {
  const ids: GuidanceId[] = [
    "batch-inspection-tools",
    "literal-command-or-direct-tool",
    "split-supported-commands",
    "profile-restriction",
    "check-tool-input",
  ];
  for (const id of ids) {
    const text = guidanceText(id);
    assert.ok(text.length > 0);
    assert.notEqual(text, id); // not falling back to id string
  }
});
