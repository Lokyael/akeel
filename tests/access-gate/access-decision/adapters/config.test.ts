import assert from "node:assert/strict";
import test from "node:test";
import { adaptPolicyConfig } from "../../../../src/access-gate/access-decision";

test("new config adapts path and command policy into a deeply immutable snapshot", () => {
  const config = {
    paths: {
      read: "allow",
      write: "ask",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace/project", "/tmp/pi-work"],
      blockedRoots: ["/workspace/project/.git"],
      blockedPaths: ["/workspace/project/.env"],
    },
    commands: {
      inspect: "allow",
      modify: "ask",
      execute: "deny",
      destroy: "deny",
      unknown: "ask",
    },
  } as const;

  const snapshot = adaptPolicyConfig(config);

  assert.deepEqual(snapshot, {
    direct: {
      read: "allow",
      write: "ask",
      edit: "ask",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace/project", "/tmp/pi-work"],
      blockedRoots: ["/workspace/project/.git"],
      blockedPaths: ["/workspace/project/.env"],
    },
    shell: {
      read: "allow",
      write: "ask",
      inspect: "allow",
      modify: "ask",
      execute: "deny",
      destroy: "deny",
      unknown: "ask",
      allowedRoots: ["/workspace/project", "/tmp/pi-work"],
      blockedRoots: ["/workspace/project/.git"],
      blockedPaths: ["/workspace/project/.env"],
    },
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.direct), true);
  assert.equal(Object.isFrozen(snapshot.shell), true);
  assert.equal(Object.isFrozen(snapshot.shell.allowedRoots), true);
});

test("explicit edit mode overrides write mode and fallback preserves write mode", () => {
  const custom = adaptPolicyConfig({
    paths: { read: "allow", write: "ask", edit: "allow" },
  });
  assert.equal(custom.direct.write, "ask");
  assert.equal(custom.direct.edit, "allow");

  const fallback = adaptPolicyConfig({
    paths: { read: "allow", write: "ask" },
  });
  assert.equal(fallback.direct.write, "ask");
  assert.equal(fallback.direct.edit, "ask");
});

test("omitted policy sections use a closed deny-by-default snapshot", () => {
  assert.deepEqual(adaptPolicyConfig({}), {
    direct: {
      read: "deny",
      write: "deny",
      edit: "deny",
      list: "deny",
      search: "deny",
      allowedRoots: [],
      blockedRoots: [],
      blockedPaths: [],
    },
    shell: {
      read: "deny",
      write: "deny",
      inspect: "deny",
      modify: "deny",
      execute: "deny",
      destroy: "deny",
      unknown: "deny",
      allowedRoots: [],
      blockedRoots: [],
      blockedPaths: [],
    },
  });
});

test("unknown config fields are rejected at every level", () => {
  assert.throws(
    () => adaptPolicyConfig({ extra: "ignored" }),
    { name: "TypeError", message: "invalid policy config" },
  );
  assert.throws(
    () => adaptPolicyConfig({ paths: { extra: "ignored" } }),
    { name: "TypeError", message: "invalid policy config" },
  );
  assert.throws(
    () => adaptPolicyConfig({ commands: { extra: "ignored" } }),
    { name: "TypeError", message: "invalid policy config" },
  );
});

test("malformed modes and non-absolute policy paths are rejected", () => {
  assert.throws(() => adaptPolicyConfig({ paths: { read: "maybe" } }), /invalid policy config/);
  assert.throws(() => adaptPolicyConfig({ paths: { allowedRoots: ["project"] } }), /invalid policy config/);
  assert.throws(() => adaptPolicyConfig({ paths: { blockedPaths: ["/safe/\u0000path"] } }), /invalid policy config/);
});
