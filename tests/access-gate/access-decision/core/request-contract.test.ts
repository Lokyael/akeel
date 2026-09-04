import assert from "node:assert/strict";
import test from "node:test";
import {
  MANAGED_SURFACES,
  PASSTHROUGH_SURFACES,
  PROBES,
  REQUEST_FIELDS,
  hasUniqueValues,
} from "./fixtures";

test("request contract has one explicit field set", () => {
  assert.deepEqual(REQUEST_FIELDS, ["surface", "arguments", "cwd", "hasUI"]);
  assert.equal(hasUniqueValues(REQUEST_FIELDS), true);
});

test("request contract closes governed and passthrough surfaces", () => {
  assert.deepEqual(MANAGED_SURFACES, ["read", "write", "edit", "find", "grep", "ls", "bash"]);
  assert.deepEqual(PASSTHROUGH_SURFACES, ["unknown-tool", "extension-tool"]);
  assert.equal(new Set([...MANAGED_SURFACES, ...PASSTHROUGH_SURFACES]).size, 9);
  assert.equal(PROBES.filter((probe) => probe.id.startsWith("request-")).length, 2);
});

test("request probes have external evidence and do not cite legacy behavior", () => {
  const requestProbes = PROBES.filter((probe) => probe.id.startsWith("request-"));
  assert.ok(requestProbes.every((probe) => probe.source === "pi-host"));
  assert.ok(requestProbes.every((probe) => probe.referenceStatus === "externally-proven"));
  assert.ok(requestProbes.every((probe) => !probe.statement.includes("legacy")));
});
