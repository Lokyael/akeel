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
