import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_OUTCOMES, REJECT_CODES, REJECT_FIELDS, REJECT_PRIORITIES, PROBES } from "./fixtures";

test("reject is a closed canonical outcome with an anchorable code", () => {
  assert.deepEqual(CANONICAL_OUTCOMES, ["complete", "reject"]);
  assert.ok(REJECT_CODES.every((code) => /^[a-z-]+$/u.test(code)));
  assert.ok(REJECT_CODES.includes("security-boundary"));
  assert.deepEqual(REJECT_FIELDS, ["code", "source-anchor", "resource-class"]);
});

test("reject precedence is policy-independent and deterministic", () => {
  assert.deepEqual(REJECT_PRIORITIES, [
    "invalid-request",
    "security-boundary",
    "unsupported-syntax",
    "dynamic-value",
    "resource-limit",
  ]);
  assert.ok(!REJECT_PRIORITIES.some((code: string) => code === "allow" || code === "ask"));
});

test("reject probes carry source anchors without user-derived display text", () => {
  const anchored = PROBES.filter((probe) => probe.id.includes("boundary") || probe.id.includes("path"));
  assert.ok(anchored.length >= 2);
  assert.ok(anchored.every((probe) => probe.statement.length > 0));
  assert.ok(anchored.every((probe) => !probe.statement.includes("user value")));
});
