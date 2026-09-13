import assert from "node:assert/strict";
import test from "node:test";

const adapters = await import("../../../../packages/access-gate/src/access-gate/access-decision/adapters/index");

test("one policy decode issues a tagged registry of unified snapshots", () => {
  const decodePolicyConfiguration = (adapters as Record<string, unknown>).decodePolicyConfiguration;
  assert.equal(typeof decodePolicyConfiguration, "function");

  const decoded = (decodePolicyConfiguration as Function)({
    presets: {
      focus: {
        paths: {
          read: "allow",
          write: "ask",
          edit: "ask",
          list: "allow",
          search: "allow",
          allowedRoots: ["/workspace"],
          blockedRoots: [],
          blockedPaths: [],
        },
        commands: {
          inspect: "allow",
          modify: "ask",
          execute: "deny",
          destroy: "allow",
          unknown: "deny",
        },
      },
    },
    activePreset: "focus",
  });

  assert.equal(decoded.kind, "enabled");
  assert.equal(decoded.activePreset, "focus");
  assert.equal(decoded.switchable, true);
  assert.deepEqual(Reflect.ownKeys(decoded.snapshots.focus), ["paths", "commands"]);
  assert.equal(decoded.snapshots.focus.paths.edit, "ask");
  assert.equal(decoded.snapshots.focus.commands.destroy, "allow");
  assert.ok(Object.isFrozen(decoded.snapshots.focus));
});

test("the explicit disabled form does not manufacture an authorization snapshot", () => {
  const decodePolicyConfiguration = (adapters as Record<string, unknown>).decodePolicyConfiguration;
  assert.equal(typeof decodePolicyConfiguration, "function");
  assert.deepEqual((decodePolicyConfiguration as Function)({ accessGate: "disabled" }), { kind: "disabled" });
});
