import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_CLASSES,
  POLICY_DECISIONS,
  POLICY_OPERATIONS,
  POLICY_MONOTONICITY_CASES,
  PROBES,
  hasUniqueValues,
} from "./fixtures";

test("policy snapshot vocabulary is closed and non-empty", () => {
  assert.equal(hasUniqueValues(POLICY_OPERATIONS), true);
  assert.equal(hasUniqueValues(POLICY_CLASSES), true);
  assert.equal(hasUniqueValues(POLICY_DECISIONS), true);
  assert.deepEqual(POLICY_DECISIONS, ["hard-deny", "policy-deny", "ask", "allow"]);
});

test("policy precedence keeps hard boundaries ahead of policy denial and approval", () => {
  const precedence = new Map(POLICY_DECISIONS.map((decision, index) => [decision, index]));
  assert.ok(precedence.get("hard-deny")! < precedence.get("policy-deny")!);
  assert.ok(precedence.get("policy-deny")! < precedence.get("ask")!);
  assert.ok(precedence.get("ask")! < precedence.get("allow")!);
});

test("policy contract records hard-boundary, no-UI, and monotonicity invariants", () => {
  const policyProbes = PROBES.filter((probe) => probe.id.startsWith("policy-"));
  assert.deepEqual(policyProbes.map((probe) => probe.id), ["policy-hard-boundary", "policy-no-ui"]);
  assert.ok(policyProbes.every((probe) => probe.referenceStatus === "newly-adopted"));
  assert.ok(policyProbes.some((probe) => probe.statement.includes("widening")));
  assert.ok(policyProbes.some((probe) => probe.statement.includes("no interactive UI")));

  for (const policyCase of POLICY_MONOTONICITY_CASES) {
    if (policyCase.name === "hard-boundary") assert.equal(policyCase.wide, "hard-deny");
    assert.ok(POLICY_DECISIONS.includes(policyCase.narrow));
    assert.ok(POLICY_DECISIONS.includes(policyCase.wide));
  }
});
