import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

test("blocked path and threat do not offer bypass guidance", () => {
  assert.deepEqual(guidanceFor("blocked-path"), []);
  assert.deepEqual(guidanceFor("threat"), []);
  assert.deepEqual(guidanceFor("symlink-escape"), []);
});

test("path-denied and invalid-tool-input map to profile/tool guidance", () => {
  // path-denied → profile-restriction (suggests switching Profile)
  assert.equal(guidanceFor("path-denied")[0]?.id, "profile-restriction");
  // invalid-tool-input → literal-command-or-direct-tool (suggests correct tool usage)
  assert.equal(guidanceFor("invalid-tool-input")[0]?.id, "literal-command-or-direct-tool");
  // unknown-tool → literal-command-or-direct-tool
  assert.equal(guidanceFor("unknown-tool")[0]?.id, "literal-command-or-direct-tool");
  // resource-limit → split-supported-commands
  assert.equal(guidanceFor("resource-limit")[0]?.id, "split-supported-commands");
  // unsupported redirections and uncertain cwd use recovery guidance rather than security bypass text
  assert.equal(guidanceFor("unsupported-redirection")[0]?.id, "split-supported-commands");
  assert.equal(guidanceFor("uncertain-cwd")[0]?.id, "literal-command-or-direct-tool");
  assert.deepEqual(guidanceFor("destroy-command"), []);
  assert.deepEqual(guidanceFor("hard-command-rule"), []);
});

test("hard deny renderer explains that unsupported Shell forms need a different entry point", () => {
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

test("renderer does not embed raw evidence paths when security-sensitive", () => {
  const deny: GateDecision = {
    disposition: "deny",
    code: "blocked-path",
    enforcement: "hard",
    evidence: [{ kind: "path", subject: "~/.ssh/id_rsa @ /home/user" }],
    guidance: guidanceFor("blocked-path"),
  };
  const result = renderDecision(deny);
  assert.equal(result.kind, "block");
  assert.equal(result.reason.includes("~/.ssh"), false);
});

test("ask renderer preserves full evidence and does not allow guidance bypass", () => {
  const ask: GateDecision = {
    disposition: "ask",
    code: "approval-required",
    evidence: [
      { kind: "path", subject: "write path: src/main.ts @ /project" },
      { kind: "path", subject: "write path: docs/task.md @ /project" },
    ],
    approval: {
      code: "approval-required",
      scope: "tool-call",
      evidence,
      options: ["Allow once", "Deny"],
    },
  };
  const result = renderDecision(ask);
  assert.equal(result.kind, "block");
  assert.equal(result.code, "approval-required");
  assert.ok(result.reason.includes("src/main.ts"));
  assert.ok(result.reason.includes("docs/task.md"));
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


test("every GuidanceId maps to a non-empty text", () => {
  const ids: GuidanceId[] = [
    "batch-inspection-tools",
    "literal-command-or-direct-tool",
    "split-supported-commands",
    "profile-restriction",
  ];
  for (const id of ids) {
    const text = guidanceText(id);
    assert.ok(text.length > 0);
    assert.notEqual(text, id); // not falling back to id string
  }
});
