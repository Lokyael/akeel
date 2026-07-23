import assert from "node:assert/strict";
import test from "node:test";
import type { GateDecision } from "../../src/access-gate/gate/decision-types";

const evidence = [{ kind: "command" as const, subject: "test" }];

test("models approval, hard deny, profile deny, and user deny as distinct decisions", () => {
  const ask: GateDecision = {
    disposition: "ask",
    code: "approval-required",
    evidence,
    approval: {
      code: "approval-required",
      scope: "tool-call",
      evidence,
      options: ["Allow once", "Deny"],
    },
  };
  const hard: GateDecision = { disposition: "deny", code: "threat", enforcement: "hard", evidence, guidance: [] };
  const profile: GateDecision = { disposition: "deny", code: "shell-policy-denied", enforcement: "profile", evidence, guidance: [] };
  const user: GateDecision = { disposition: "deny", code: "user-denied", enforcement: "user", evidence, guidance: [] };

  assert.equal(ask.disposition, "ask");
  assert.equal(hard.enforcement, "hard");
  assert.equal(profile.enforcement, "profile");
  assert.equal(user.enforcement, "user");
});

test("rejects invalid code and enforcement combinations at compile time", () => {
  // @ts-expect-error hard enforcement cannot carry a user denial code.
  const invalid: GateDecision = { disposition: "deny", code: "user-denied", enforcement: "hard", evidence, guidance: [] };
  assert.equal(invalid.disposition, "deny");
});

test("guidance carries only a static id and recheck marker", () => {
  const decision: GateDecision = {
    disposition: "deny",
    code: "dynamic-shell",
    enforcement: "hard",
    evidence,
    guidance: [{ id: "batch-inspection-tools", safety: "recheck" }],
  };
  assert.deepEqual(decision.guidance, [{ id: "batch-inspection-tools", safety: "recheck" }]);
});
