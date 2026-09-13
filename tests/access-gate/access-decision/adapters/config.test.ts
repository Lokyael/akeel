import assert from "node:assert/strict";
import test from "node:test";
import { adaptPolicyConfig, adaptPolicyPresets, isAccessGateDisabled } from "../../../../packages/access-gate/src/access-gate/access-decision";

test("new config adapts path and command policy into a deeply immutable snapshot", () => {
  const config = {
    paths: {
      read: "allow",
      write: "ask",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace/project", "/tmp/akeel"],
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
      edit: "deny",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace/project", "/tmp/akeel"],
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
      allowedRoots: ["/workspace/project", "/tmp/akeel"],
      blockedRoots: ["/workspace/project/.git"],
      blockedPaths: ["/workspace/project/.env"],
    },
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.direct), true);
  assert.equal(Object.isFrozen(snapshot.shell), true);
  assert.equal(Object.isFrozen(snapshot.shell.allowedRoots), true);
});

test("explicit edit mode is independent and omission denies by default", () => {
  const custom = adaptPolicyConfig({
    paths: { read: "allow", write: "ask", edit: "allow" },
  });
  assert.equal(custom.direct.write, "ask");
  assert.equal(custom.direct.edit, "allow");

  const fallback = adaptPolicyConfig({
    paths: { read: "allow", write: "ask" },
  });
  assert.equal(fallback.direct.write, "ask");
  assert.equal(fallback.direct.edit, "deny");
});

test("named presets preserve built-in semantics and select the active snapshot", () => {
  const config = {
    presets: {
      review: { paths: { read: "allow" }, commands: { inspect: "allow" } },
      guided: { paths: { read: "allow", write: "ask", edit: "ask" }, commands: { inspect: "allow", modify: "ask", execute: "ask" } },
      develop: { paths: { read: "allow", write: "allow", edit: "allow" }, commands: { inspect: "allow", modify: "allow", execute: "allow" } },
    },
    activePreset: "guided",
  } as const;

  const presets = adaptPolicyPresets(config);
  assert.ok(presets);
  assert.equal(presets.active, "guided");
  assert.equal(presets.snapshots.review.direct.write, "deny");
  assert.equal(presets.snapshots.guided.direct.edit, "ask");
  assert.equal(presets.snapshots.develop.direct.edit, "allow");
  assert.equal(presets.snapshots.develop.shell.destroy, "deny");
  const builtinsDefaulted = adaptPolicyPresets({
    presets: {
      audit: {
        paths: { read: "allow", write: "deny", edit: "deny", list: "allow", search: "allow" },
        commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
      },
    },
    activePreset: "review",
  });
  assert.ok(builtinsDefaulted);
  assert.deepEqual(Object.keys(builtinsDefaulted.snapshots), ["review", "guided", "develop", "audit"]);
  const scoped = adaptPolicyPresets({
    presets: {
      review: { ...config.presets.review, paths: { ...config.presets.review.paths, allowedRoots: ["/workspace/project"] } },
      guided: config.presets.guided,
      develop: config.presets.develop,
    },
    activePreset: "review",
  });
  assert.ok(scoped);
  assert.deepEqual(scoped.snapshots.review.direct.allowedRoots, ["/workspace/project"]);
  assert.deepEqual(scoped.snapshots.guided.direct.allowedRoots, []);
  assert.throws(() => adaptPolicyPresets({ ...config, activePreset: "status" }), /invalid policy config/);
  assert.throws(() => adaptPolicyPresets({
    ...config,
    presets: { ...config.presets, status: config.presets.review },
  }), /invalid policy config/);
});

test("named presets merge builtins with custom presets", () => {
  const presets = adaptPolicyPresets({
    presets: {
      audit: {
        paths: {
          read: "allow",
          write: "deny",
          edit: "deny",
          list: "allow",
          search: "allow",
          allowedRoots: ["/workspace/audit"],
          blockedRoots: ["/workspace/audit/private"],
          blockedPaths: ["/workspace/audit/.env"],
        },
        commands: {
          inspect: "allow",
          modify: "deny",
          execute: "deny",
          destroy: "allow",
          unknown: "deny",
        },
      },
    },
    activePreset: "audit",
  });

  assert.ok(presets);
  assert.deepEqual(Object.keys(presets.snapshots), ["review", "guided", "develop", "audit"]);
  assert.equal(presets.active, "audit");
  assert.equal(presets.snapshots.review.direct.read, "allow");
  assert.equal(presets.snapshots.develop.direct.write, "allow");
  assert.deepEqual(presets.snapshots.audit.direct.allowedRoots, ["/workspace/audit"]);
  assert.deepEqual(presets.snapshots.audit.direct.blockedRoots, ["/workspace/audit/private"]);
  assert.equal(presets.snapshots.audit.shell.destroy, "allow");
});

test("built-in preset semantics cannot be overridden", () => {
  assert.throws(() => adaptPolicyPresets({
    presets: {
      review: { paths: { read: "allow", write: "allow" }, commands: { inspect: "allow" } },
      guided: { paths: { read: "allow" }, commands: { inspect: "allow" } },
      develop: { paths: { read: "allow" }, commands: { inspect: "allow" } },
    },
    activePreset: "review",
  }), /invalid policy config/);
});

test("recognizes the explicit access-gate disabled configuration", () => {
  assert.equal(isAccessGateDisabled({ accessGate: "disabled" }), true);
  assert.equal(isAccessGateDisabled({}), false);
  assert.throws(() => isAccessGateDisabled({ accessGate: "enabled" }), /invalid policy config/);
  assert.throws(() => isAccessGateDisabled({ accessGate: "disabled", paths: { read: "allow" } }), /invalid policy config/);
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

test("rejects write modes that are wider than the read mode", () => {
  for (const [read, write] of [["deny", "ask"], ["deny", "allow"], ["ask", "allow"]] as const) {
    assert.throws(
      () => adaptPolicyConfig({ paths: { read, write } }),
      /invalid policy config/,
      `${read}/${write}`,
    );
  }
});

test("rejects malformed lower-kebab-case custom preset names", () => {
  for (const name of ["audit-", "audit--logs", "Audit", "audit_logs"]) {
    assert.throws(() => adaptPolicyPresets({
      presets: { [name]: { paths: { read: "allow" }, commands: { inspect: "allow" } } },
      activePreset: name,
    }), /invalid policy config/, name);
  }
});

test("rejects incomplete custom presets through the direct adapter", () => {
  assert.throws(() => adaptPolicyPresets({
    presets: {
      audit: {
        paths: { read: "allow" },
        commands: { inspect: "allow" },
      },
    },
    activePreset: "audit",
  }), /invalid policy config/);
});
