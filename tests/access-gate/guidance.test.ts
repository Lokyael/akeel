import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderDecision } from "../../src/access-gate/gate/render-decision";
import { guidanceFor, guidanceText } from "../../src/access-gate/gate/guidance-catalog";
import type { GateDecision, GateEvidence, GuidanceId } from "../../src/access-gate/gate/decision-types";

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
  // destroy-command and hard-command-rule have no guidance (security-sensitive)
  assert.deepEqual(guidanceFor("destroy-command"), []);
  assert.deepEqual(guidanceFor("hard-command-rule"), []);
});

test("hard deny renderer includes guidance text in the reason", () => {
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
  assert.ok(result.reason.includes("batch-inspection-tools"));
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
  assert.ok(result.reason.includes("PROFILE_BLOCK"));
  // path-denied now carries profile-restriction guidance
  assert.ok(result.reason.includes("profile-restriction") || result.reason.includes("PROFILE_BLOCK"));
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
