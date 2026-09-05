import assert from "node:assert/strict";
import test from "node:test";
import { createPolicyState } from "../../../../src/access-gate/access-decision";

test("policy state publishes one immutable adapted snapshot", () => {
  const config = { paths: { read: "allow" as const }, commands: { inspect: "allow" as const } };
  const state = createPolicyState(config);

  assert.deepEqual(state.snapshot.direct, {
    read: "allow",
    write: "deny",
    edit: "deny",
    list: "deny",
    search: "deny",
    allowedRoots: [],
    blockedRoots: [],
    blockedPaths: [],
  });
  assert.equal(state.snapshot.shell.inspect, "allow");
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.snapshot), true);
});

test("policy state rejects malformed external configuration", () => {
  assert.throws(() => createPolicyState({ paths: { read: "maybe" } }), /invalid policy config/);
});
