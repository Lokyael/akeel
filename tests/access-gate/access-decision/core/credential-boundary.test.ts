import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  MandatoryBoundaries,
  projectUnifiedAdmission,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";
import {
  compileManagedCall,
  createCompileEnvironment,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

const mandatory = createMandatoryBoundaries({ credentialRoots: ["/home/user/.pi/agent"] });
const allowPolicy = freezeUnifiedPolicySnapshot({
  paths: {
    read: "allow",
    write: "allow",
    edit: "allow",
    list: "allow",
    search: "allow",
    allowedRoots: [],
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

function authorizeRequest(request: unknown, path: string, traversed: readonly string[] = []) {
  const env = createCompileEnvironment({
    cwd: "/workspace",
    pathEvidence: {
      resolve() {
        return Object.freeze({
          candidate: path,
          traversed: Object.freeze(traversed.length > 0 ? [...traversed] : [path]),
        });
      },
    },
  });
  const compilation = compileManagedCall(request, env);
  const admission = projectUnifiedAdmission(compilation);
  return authorizeAdmission(admission, mandatory, allowPolicy);
}

function authorizePath(path: string, traversed: readonly string[] = []) {
  return authorizeRequest({ surface: "read", arguments: { path } }, path, traversed);
}

for (const path of [
  "/home/user/.pi/agent/auth.json",
  "/home/user/.pi/agent/auth.json.bak",
  "/home/user/.pi/agent/auth.json.old",
  "/home/user/.pi/agent/auth.json~",
  "/home/user/.pi/agent/auth.json.2025",
]) {
  test(`credential boundary rejects ${path}`, () => {
    assert.deepEqual(authorizePath(path), { kind: "deny", code: "hard-boundary" });
  });
}

for (const path of [
  "/home/user/.pi/agent/auth.json.template",
  "/home/user/.pi/agent/auth.json.sample",
  "/home/user/.pi/agent/auth.json.example",
  "/home/user/.pi/agent/auth.json.skeleton",
  "/home/user/.pi/agent/settings.json",
  "/home/user/.pi/agent/sessions/auth.json",
  "/home/user/.pi/other/auth.json",
]) {
  test(`credential boundary leaves ${path} outside its protected class`, () => {
    assert.deepEqual(authorizePath(path), { kind: "allow" });
  });
}

test("credential boundary catches a protected path in traversal prefixes", () => {
  assert.deepEqual(
    authorizePath("/workspace/link/notes.md", ["/", "/workspace/link", "/home/user/.pi/agent/auth.json"]),
    { kind: "deny", code: "hard-boundary" },
  );
});

test("credential boundary requires non-empty absolute roots", () => {
  assert.throws(() => createMandatoryBoundaries({ credentialRoots: [] }), /invalid mandatory boundaries/);
  assert.throws(() => createMandatoryBoundaries({ credentialRoots: ["relative-agent"] }), /invalid mandatory boundaries/);
  assert.throws(() => createMandatoryBoundaries({ credentialRoots: ["/agent/\u0000"] }), /invalid mandatory boundaries/);
});

test("credential boundary cannot be forged by copying its public shape", () => {
  const forged = { ...mandatory };
  assert.equal(MandatoryBoundaries.read(forged), undefined);
});

test("recursive Direct search rejects a credential root and its parents", () => {
  for (const path of ["/home/user/.pi/agent", "/home/user"]) {
    assert.deepEqual(
      authorizeRequest({ surface: "search", arguments: { path, pattern: "token" } }, path),
      { kind: "deny", code: "hard-boundary" },
      path,
    );
  }
});

test("recursive Direct search outside credential roots remains policy governed", () => {
  assert.deepEqual(
    authorizeRequest({ surface: "search", arguments: { path: "/workspace/project", pattern: "token" } }, "/workspace/project"),
    { kind: "allow" },
  );
});

test("non-recursive agent directory access remains policy governed", () => {
  assert.deepEqual(authorizePath("/home/user/.pi/agent"), { kind: "allow" });
});

test("recursive Shell search rejects a credential root and its parents", () => {
  for (const path of ["/home/user/.pi/agent", "/home/user"]) {
    assert.deepEqual(
      authorizeRequest({ surface: "bash", arguments: { command: `grep -r token ${path}` } }, path),
      { kind: "deny", code: "hard-boundary" },
      path,
    );
  }
});

test("recursive Shell search outside credential roots remains policy governed", () => {
  assert.deepEqual(
    authorizeRequest({ surface: "bash", arguments: { command: "grep -r token /workspace/project" } }, "/workspace/project"),
    { kind: "allow" },
  );
});
