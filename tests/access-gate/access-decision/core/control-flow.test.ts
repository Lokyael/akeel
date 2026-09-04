import assert from "node:assert/strict";
import test from "node:test";
import { PROBES } from "./fixtures";

test("control-flow contract includes the four mixed and-or forms", () => {
  const forms = [
    "false && cd X; command",
    "true || cd X; command",
    "A && B || C",
    "A || B && C",
  ];
  assert.equal(forms.length, 4);
  assert.ok(PROBES.some((probe) => probe.id === "shell-and-or-order"));
});

test("control-flow contract requires bounded reachable outcomes", () => {
  const statement = PROBES.find((probe) => probe.id === "linux-path-resolution")!.statement;
  assert.match(statement, /every bounded candidate/);
  assert.ok(!statement.includes("old gate"));
});
