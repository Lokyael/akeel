import assert from "node:assert/strict";
import test from "node:test";
import { activatePolicyPreset, createPolicyState } from "../../../../src/access-gate/access-decision";

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

test("policy state switches immutable named presets without mutating the prior state", () => {
  const state = createPolicyState({
    presets: {
      review: { paths: { read: "allow" }, commands: { inspect: "allow" } },
      guided: { paths: { read: "allow", write: "ask", edit: "ask" }, commands: { inspect: "allow", modify: "ask", execute: "ask" } },
      develop: { paths: { read: "allow", write: "allow", edit: "allow" }, commands: { inspect: "allow", modify: "allow", execute: "allow" } },
    },
    activePreset: "review",
  });
  const next = activatePolicyPreset(state, "develop");

  assert.equal(state.activePreset, "review");
  assert.equal(state.snapshot.direct.write, "deny");
  assert.equal(next.activePreset, "develop");
  assert.equal(next.snapshot.direct.write, "allow");
  assert.notEqual(next, state);
  assert.throws(() => activatePolicyPreset(state, "unknown"), /unknown policy preset/);
});

test("policy state rejects malformed external configuration", () => {
  assert.throws(() => createPolicyState({ paths: { read: "maybe" } }), /invalid policy config/);
});
