import assert from "node:assert/strict";
import test from "node:test";

const core = await import("../../../../../packages/access-gate/src/access-gate/access-decision/core/index");

test("a Direct call crosses one UI-independent compilation and authorization seam", () => {
  assert.equal(typeof (core as Record<string, unknown>).compileManagedCall, "function");
  assert.equal(typeof (core as Record<string, unknown>).createCompileEnvironment, "function");
  assert.equal(typeof (core as Record<string, unknown>).projectUnifiedAdmission, "function");
  assert.equal(typeof (core as Record<string, unknown>).authorizeAdmission, "function");
});

test("a Direct read resolves once and authorizes without host UI facts", () => {
  const exports = core as Record<string, unknown>;
  assert.equal(typeof exports.createMandatoryBoundaries, "function");
  assert.equal(typeof exports.freezeUnifiedPolicySnapshot, "function");

  let resolutions = 0;
  const environment = (exports.createCompileEnvironment as Function)({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        resolutions += 1;
        assert.equal(base, "/workspace");
        assert.equal(path, "README.md");
        return Object.freeze({
          candidate: "/workspace/README.md",
          traversed: Object.freeze(["/", "/workspace", "/workspace/README.md"]),
        });
      },
    }),
  });
  const compilation = (exports.compileManagedCall as Function)({
    surface: "read",
    arguments: { path: "README.md" },
  }, environment);
  const admission = (exports.projectUnifiedAdmission as Function)(compilation);
  const policy = (exports.freezeUnifiedPolicySnapshot as Function)({
    paths: {
      read: "allow",
      write: "deny",
      edit: "deny",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace"],
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
  });
  const mandatory = (exports.createMandatoryBoundaries as Function)({
    credentialRoots: ["/home/user/.pi/agent"],
  });

  assert.deepEqual(Reflect.ownKeys(compilation), []);
  assert.deepEqual(Reflect.ownKeys(admission), []);
  assert.deepEqual((exports.authorizeAdmission as Function)(admission, mandatory, policy), { kind: "allow" });
  assert.equal(resolutions, 1);
});

test("all Direct surfaces use their own policy axis without retaining tool content", () => {
  const exports = core as Record<string, Function>;
  const resolved: string[] = [];
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        resolved.push(path);
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });
  const policy = exports.freezeUnifiedPolicySnapshot!({
    paths: {
      read: "ask",
      write: "ask",
      edit: "allow",
      list: "ask",
      search: "ask",
      allowedRoots: ["/workspace"],
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
  const mandatory = exports.createMandatoryBoundaries!({ credentialRoots: ["/agent"] });
  const cases = [
    { request: { surface: "write", arguments: { path: "out.txt", content: "secret payload" } }, expected: "approval-required" },
    { request: { surface: "edit", arguments: { path: "file.ts", edits: [{ oldText: "a", newText: "b" }] } }, expected: "allow" },
    { request: { surface: "list", arguments: {} }, expected: "approval-required" },
    { request: { surface: "search", arguments: { pattern: "needle" } }, expected: "approval-required" },
  ] as const;

  for (const entry of cases) {
    const compilation = exports.compileManagedCall!(entry.request, environment);
    const admission = exports.projectUnifiedAdmission!(compilation);
    assert.deepEqual(exports.authorizeAdmission!(admission, mandatory, policy), { kind: entry.expected });
    assert.deepEqual(Reflect.ownKeys(compilation), []);
    assert.deepEqual(Reflect.ownKeys(admission), []);
  }
  assert.deepEqual(resolved, ["out.txt", "file.ts", ".", "."]);
});

test("capability asset domain grants immutable read-only admission and denies writes with hard boundary", () => {
  const exports = core as Record<string, Function>;
  function mockEvidence(candidate: string) {
    const parts = candidate.split("/").filter(Boolean);
    const traversed = ["/"];
    let cur = "";
    for (const part of parts) {
      cur += `/${part}`;
      traversed.push(cur);
    }
    return Object.freeze({ candidate, traversed: Object.freeze(traversed) });
  }
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve(_base: string, path: string) {
        return mockEvidence(path.startsWith("/") ? path : `/workspace/${path}`);
      },
    }),
  });
  const policy = exports.freezeUnifiedPolicySnapshot!({
    paths: {
      read: "deny",
      write: "allow",
      edit: "allow",
      list: "deny",
      search: "deny",
      allowedRoots: ["/workspace"],
      blockedRoots: [],
      blockedPaths: [],
    },
    commands: {
      inspect: "allow",
      modify: "allow",
      execute: "allow",
      destroy: "deny",
      unknown: "deny",
    },
  });
  const mandatory = exports.createMandatoryBoundaries!({
    credentialRoots: ["/agent"],
    capabilityRoots: ["/agent/skills", "/agent/git"],
  });

  // 1. Direct read in capability roots is allowed (even though policy read is deny and outside allowedRoots)
  const readComp = exports.compileManagedCall!({ surface: "read", arguments: { path: "/agent/skills/foo/SKILL.md" } }, environment);
  const readAdm = exports.projectUnifiedAdmission!(readComp);
  assert.deepEqual(exports.authorizeAdmission!(readAdm, mandatory, policy), { kind: "allow" });

  // 2. Direct list in capability roots is allowed
  const listComp = exports.compileManagedCall!({ surface: "list", arguments: { path: "/agent/skills/foo" } }, environment);
  const listAdm = exports.projectUnifiedAdmission!(listComp);
  assert.deepEqual(exports.authorizeAdmission!(listAdm, mandatory, policy), { kind: "allow" });

  // 3. Direct write in capability roots is hard-denied (anti-tamper invariant, even though policy write is allow)
  const writeComp = exports.compileManagedCall!({ surface: "write", arguments: { path: "/agent/skills/foo/SKILL.md", content: "hacked" } }, environment);
  const writeAdm = exports.projectUnifiedAdmission!(writeComp);
  assert.deepEqual(exports.authorizeAdmission!(writeAdm, mandatory, policy), { kind: "deny", code: "hard-boundary" });

  // 4. Direct edit in capability roots is hard-denied (anti-tamper invariant)
  const editComp = exports.compileManagedCall!({ surface: "edit", arguments: { path: "/agent/skills/foo/SKILL.md", edits: [{ oldText: "a", newText: "b" }] } }, environment);
  const editAdm = exports.projectUnifiedAdmission!(editComp);
  assert.deepEqual(exports.authorizeAdmission!(editAdm, mandatory, policy), { kind: "deny", code: "hard-boundary" });

  // 5. Credential dominance: auth.json under credential roots remains hard-denied even if overlapping with capability roots
  const credMandatory = exports.createMandatoryBoundaries!({
    credentialRoots: ["/agent"],
    capabilityRoots: ["/agent", "/agent/skills"],
  });
  const credComp = exports.compileManagedCall!({ surface: "read", arguments: { path: "/agent/auth.json" } }, environment);
  const credAdm = exports.projectUnifiedAdmission!(credComp);
  assert.deepEqual(exports.authorizeAdmission!(credAdm, credMandatory, policy), { kind: "deny", code: "hard-boundary" });
});

test("Direct capability anti-tamper follows symlink traversal evidence for writes and edits", () => {
  const exports = core as Record<string, Function>;
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve() {
        return Object.freeze({
          candidate: "/outside/target.txt",
          traversed: Object.freeze(["/", "/agent/npm", "/agent/npm/link", "/outside", "/outside/target.txt"]),
        });
      },
    }),
  });
  const policy = exports.freezeUnifiedPolicySnapshot!({
    paths: {
      read: "allow",
      write: "allow",
      edit: "allow",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace"],
      blockedRoots: [],
      blockedPaths: [],
    },
    commands: {
      inspect: "allow",
      modify: "allow",
      execute: "allow",
      destroy: "allow",
      unknown: "allow",
    },
  });
  const mandatory = exports.createMandatoryBoundaries!({
    credentialRoots: ["/credentials"],
    capabilityRoots: ["/agent/npm"],
  });

  const readComp = exports.compileManagedCall!({ surface: "read", arguments: { path: "/agent/npm/link/target.txt" } }, environment);
  const readAdm = exports.projectUnifiedAdmission!(readComp);
  assert.deepEqual(exports.authorizeAdmission!(readAdm, mandatory, policy), { kind: "deny", code: "hard-boundary" });

  for (const request of [
    { surface: "write", arguments: { path: "/agent/npm/link/target.txt", content: "tamper" } },
    { surface: "edit", arguments: { path: "/agent/npm/link/target.txt", edits: [{ oldText: "a", newText: "b" }] } },
  ]) {
    const compilation = exports.compileManagedCall!(request, environment);
    const admission = exports.projectUnifiedAdmission!(compilation);
    assert.deepEqual(exports.authorizeAdmission!(admission, mandatory, policy), { kind: "deny", code: "hard-boundary" });
  }
});
