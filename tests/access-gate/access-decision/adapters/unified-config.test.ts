import assert from "node:assert/strict";
import test from "node:test";
import { decodePolicyConfiguration } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";

test("one policy decode issues a tagged registry of unified snapshots", () => {
  const decoded = decodePolicyConfiguration({
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
  assert.deepEqual(decodePolicyConfiguration({ accessGate: "disabled" }), { kind: "disabled" });
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

  const decoded = decodePolicyConfiguration(config);
  assert.equal(decoded.kind, "enabled");
  assert.equal(decoded.activePreset, "guided");
  assert.equal(decoded.snapshots.review.paths.write, "deny");
  assert.equal(decoded.snapshots.guided.paths.edit, "ask");
  assert.equal(decoded.snapshots.develop.paths.edit, "allow");
  assert.equal(decoded.snapshots.develop.commands.destroy, "deny");

  const builtinsDefaulted = decodePolicyConfiguration({
    presets: {
      audit: {
        paths: { read: "allow", write: "deny", edit: "deny", list: "allow", search: "allow", allowedRoots: [], blockedRoots: [], blockedPaths: [] },
        commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
      },
    },
    activePreset: "review",
  });
  assert.equal(builtinsDefaulted.kind, "enabled");
  assert.deepEqual(Object.keys(builtinsDefaulted.snapshots), ["review", "guided", "develop", "audit"]);

  const scoped = decodePolicyConfiguration({
    presets: {
      review: { paths: { allowedRoots: ["/workspace/project"] } },
    },
    activePreset: "review",
  });
  assert.equal(scoped.kind, "enabled");
  assert.deepEqual(scoped.snapshots.review.paths.allowedRoots, ["/workspace/project"]);
  assert.deepEqual(scoped.snapshots.guided.paths.allowedRoots, []);

  assert.throws(() => decodePolicyConfiguration({ ...config, activePreset: "status" }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    ...config,
    presets: { ...config.presets, status: config.presets.review },
  }), /invalid policy config/);
});

test("named presets merge builtins with custom presets", () => {
  const decoded = decodePolicyConfiguration({
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

  assert.equal(decoded.kind, "enabled");
  assert.deepEqual(Object.keys(decoded.snapshots), ["review", "guided", "develop", "audit"]);
  assert.equal(decoded.activePreset, "audit");
  assert.equal(decoded.snapshots.review.paths.read, "allow");
  assert.equal(decoded.snapshots.develop.paths.write, "allow");
  assert.deepEqual(decoded.snapshots.audit.paths.allowedRoots, ["/workspace/audit"]);
  assert.deepEqual(decoded.snapshots.audit.paths.blockedRoots, ["/workspace/audit/private"]);
  assert.equal(decoded.snapshots.audit.commands.destroy, "allow");
});

test("built-in preset semantics cannot be overridden", () => {
  assert.throws(() => decodePolicyConfiguration({
    presets: { review: { paths: { write: "allow" } } },
    activePreset: "review",
  }), /invalid policy config/);

  assert.throws(() => decodePolicyConfiguration({
    presets: { develop: { commands: { destroy: "allow" } } },
    activePreset: "develop",
  }), /invalid policy config/);
});

test("omitted policy sections use a closed deny-by-default snapshot", () => {
  const decoded = decodePolicyConfiguration({
    paths: { read: "allow" },
  });
  assert.equal(decoded.kind, "enabled");
  assert.deepEqual(decoded.snapshots.static, {
    paths: {
      read: "allow",
      write: "deny",
      edit: "deny",
      list: "deny",
      search: "deny",
      allowedRoots: [],
      blockedRoots: [],
      blockedPaths: [],
    },
    commands: {
      inspect: "deny",
      modify: "deny",
      execute: "deny",
      destroy: "deny",
      unknown: "deny",
    },
  });
});

test("unknown config fields are rejected at every level", () => {
  assert.throws(() => decodePolicyConfiguration({ unknown: true }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({ presets: {}, unknown: true }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    paths: { read: "allow" }, extra: true,
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    paths: { read: "allow", extra: true },
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    commands: { inspect: "allow", extra: true },
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    presets: {
      custom: { paths: {}, extra: true },
    },
    activePreset: "custom",
  }), /invalid policy config/);
});

test("malformed modes and non-absolute policy paths are rejected", () => {
  assert.throws(() => decodePolicyConfiguration({
    paths: { read: "maybe" },
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    commands: { inspect: "forbidden" },
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    paths: { allowedRoots: ["relative/path"] },
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    paths: { blockedPaths: ["/valid", "not-valid"] },
  }), /invalid policy config/);
  assert.throws(() => decodePolicyConfiguration({
    paths: { allowedRoots: ["/valid/\u0000"] },
  }), /invalid policy config/);
});

test("rejects write modes that are wider than the read mode", () => {
  for (const [read, write] of [["deny", "ask"], ["deny", "allow"], ["ask", "allow"]] as const) {
    assert.throws(
      () => decodePolicyConfiguration({ paths: { read, write } }),
      /invalid policy config/,
      `${read}/${write}`,
    );
  }
});

test("rejects malformed lower-kebab-case custom preset names", () => {
  for (const name of ["Audit", "audit_preset", "audit-", "-audit", "audit preset", "audit/preset", "1audit"]) {
    assert.throws(() => decodePolicyConfiguration({
      presets: { [name]: {} },
      activePreset: name,
    }), /invalid policy config/, name);
  }
});

test("rejects incomplete custom presets through the direct adapter", () => {
  assert.throws(() => decodePolicyConfiguration({
    presets: { custom: { paths: { read: "allow" } } },
    activePreset: "custom",
  }, true), /invalid policy config/);
});

test("explicit edit mode is independent and omission denies by default", () => {
  const custom = decodePolicyConfiguration({
    paths: { read: "allow", write: "ask", edit: "allow" },
  });
  assert.equal(custom.kind, "enabled");
  assert.equal(custom.snapshots.static.paths.write, "ask");
  assert.equal(custom.snapshots.static.paths.edit, "allow");

  const fallback = decodePolicyConfiguration({
    paths: { read: "allow", write: "ask" },
  });
  assert.equal(fallback.kind, "enabled");
  assert.equal(fallback.snapshots.static.paths.write, "ask");
  assert.equal(fallback.snapshots.static.paths.edit, "deny");
});
