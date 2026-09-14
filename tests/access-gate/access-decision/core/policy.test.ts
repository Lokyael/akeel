import assert from "node:assert/strict";
import test from "node:test";
import { freezeUnifiedPolicySnapshot } from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";

const baseSnapshot = {
  paths: {
    read: "allow",
    write: "ask",
    edit: "deny",
    list: "allow",
    search: "allow",
    allowedRoots: [],
    blockedRoots: [],
    blockedPaths: [],
  },
  commands: {
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    destroy: "deny",
    unknown: "deny",
  },
};

test("policy snapshot rejects an unknown decision mode", () => {
  assert.throws(
    () => freezeUnifiedPolicySnapshot({
      ...baseSnapshot,
      paths: { ...baseSnapshot.paths, read: "unexpected" },
    }),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
  assert.throws(
    () => freezeUnifiedPolicySnapshot({
      ...baseSnapshot,
      commands: { ...baseSnapshot.commands, inspect: "unexpected" },
    }),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
});

test("policy snapshot rejects unknown fields", () => {
  assert.throws(
    () => freezeUnifiedPolicySnapshot({ ...baseSnapshot, extra: "ignored" }),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
  assert.throws(
    () => freezeUnifiedPolicySnapshot({
      ...baseSnapshot,
      paths: { ...baseSnapshot.paths, extra: "ignored" },
    }),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
  assert.throws(
    () => freezeUnifiedPolicySnapshot({
      ...baseSnapshot,
      commands: { ...baseSnapshot.commands, extra: "ignored" },
    }),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
});
