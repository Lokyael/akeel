import assert from "node:assert/strict";
import test from "node:test";
import { freezePolicySnapshot } from "../../../../packages/access-gate/src/access-gate/access-decision/core";

test("policy snapshot rejects an unknown decision mode", () => {
  assert.throws(
    () => freezePolicySnapshot({ read: "allow", write: "unexpected" } as never),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
});

test("policy snapshot rejects unknown fields", () => {
  assert.throws(
    () => freezePolicySnapshot({ read: "allow", write: "ask", extra: "ignored" } as never),
    { name: "TypeError", message: "invalid policy snapshot" },
  );
});
