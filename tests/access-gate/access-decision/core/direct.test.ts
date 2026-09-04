import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDecisionService,
  createPolicyState,
  type DirectRequest,
  type PolicyConfig,
} from "../../../../src/access-gate/access-decision";
import {
  compileDirect,
  evaluateAdmission,
  freezePolicySnapshot,
  projectAdmission,
} from "../../../../src/access-gate/access-decision/core/index";

function testService(paths: NonNullable<PolicyConfig["paths"]>): ReturnType<typeof createDecisionService> {
  return createDecisionService(createPolicyState({ paths }));
}

test("Direct path policy follows existing symlink components", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-keel-direct-path-"));
  const target = join(root, "target");
  mkdirSync(target);
  writeFileSync(join(target, "secret"), "hidden\n");
  symlinkSync(target, join(root, "link"), "dir");
  try {
    const compilation = compileDirect({
      surface: "read",
      arguments: { path: "link/secret" },
      cwd: root,
      hasUI: false,
    });
    const admission = projectAdmission(compilation);
    assert.ok(admission);
    assert.deepEqual(
      evaluateAdmission(admission, freezePolicySnapshot({
        read: "allow",
        write: "deny",
        list: "deny",
        search: "deny",
        blockedRoots: [target],
      })),
      { kind: "deny", code: "hard-boundary" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Direct path policy rejects traversal through a blocked component", () => {
  const compilation = compileDirect({
    surface: "read",
    arguments: { path: ".git/../README.md" },
    cwd: "/workspace/project",
    hasUI: false,
  });
  const admission = projectAdmission(compilation);
  assert.ok(admission);
  assert.deepEqual(
    evaluateAdmission(admission, freezePolicySnapshot({
      read: "allow",
      write: "deny",
      list: "deny",
      search: "deny",
      blockedRoots: ["/workspace/project/.git"],
    })),
    { kind: "deny", code: "hard-boundary" },
  );
});

test("Direct path policy retains blocked components hidden by a symlink target", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-keel-direct-link-target-"));
  const allowed = join(root, "allowed");
  const blocked = join(root, "blocked");
  mkdirSync(allowed);
  mkdirSync(blocked);
  symlinkSync("blocked/../allowed", join(root, "target"), "dir");
  symlinkSync("target", join(root, "link"), "dir");
  try {
    const compilation = compileDirect({
      surface: "read",
      arguments: { path: "link/file" },
      cwd: root,
      hasUI: false,
    });
    const admission = projectAdmission(compilation);
    assert.ok(admission);
    assert.deepEqual(
      evaluateAdmission(admission, freezePolicySnapshot({
        read: "allow",
        write: "deny",
        list: "deny",
        search: "deny",
        blockedRoots: [blocked],
      })),
      { kind: "deny", code: "hard-boundary" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Direct search cannot recurse into a blocked descendant", () => {
  const service = testService({
    read: "allow",
    write: "allow",
    list: "allow",
    search: "allow",
    blockedRoots: ["/workspace/project/.git"],
  });

  assert.deepEqual(service.decide({
    surface: "search",
    arguments: { path: ".", pattern: "needle" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
});

test("admits a normalized Direct read request through the public service seam", () => {
  const service = testService({ read: "allow", write: "ask" });
  const request: DirectRequest = {
    surface: "read",
    arguments: { path: "README.md" },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("admits a Direct read request with bounded line selection", () => {
  const service = testService({ read: "allow", write: "deny", list: "deny", search: "deny" });
  const request: DirectRequest = {
    surface: "read",
    arguments: { path: "README.md", offset: 5, limit: 20 },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("admits a Direct write request with its required content", () => {
  const service = testService({ read: "deny", write: "allow", list: "deny", search: "deny" });
  const request: DirectRequest = {
    surface: "write",
    arguments: { path: "notes.md", content: "hello\n" },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("admits a normalized Direct list request through the public service seam", () => {
  const service = testService({ read: "deny", write: "deny", list: "allow", search: "deny" });
  const request: DirectRequest = {
    surface: "list",
    arguments: { path: "src" },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("defaults a Direct list request without a path to cwd", () => {
  const service = testService({ read: "deny", write: "deny", list: "allow", search: "deny" });
  const request: DirectRequest = {
    surface: "list",
    arguments: {},
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("admits a bounded Direct search request through the public service seam", () => {
  const service = testService({ read: "deny", write: "deny", list: "deny", search: "allow" });
  const request: DirectRequest = {
    surface: "search",
    arguments: { path: "src", pattern: "createDecisionService" },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("rejects a Direct request with an unknown top-level field", () => {
  const service = testService({ read: "allow", write: "ask" });
  const request = {
    surface: "read",
    arguments: { path: "README.md" },
    cwd: "/workspace/project",
    hasUI: false,
    extra: "must not be ignored",
  } as never;

  assert.deepEqual(service.decide(request), { kind: "deny", code: "invalid-request" });
});

test("rejects a Direct request whose textual inputs exceed the byte budget", () => {
  const service = testService({ read: "allow", write: "allow", list: "allow", search: "allow" });
  const request = {
    surface: "read",
    arguments: { path: "x".repeat(16_384) },
    cwd: "/workspace/project",
    hasUI: false,
  } as never;

  assert.deepEqual(service.decide(request), { kind: "deny", code: "resource-limit" });
});

test("rejects a Direct request whose UTF-8 text exceeds the byte budget", () => {
  const service = testService({ read: "allow", write: "allow", list: "allow", search: "allow" });
  const request = {
    surface: "read",
    arguments: { path: "界".repeat(8_193) },
    cwd: "/workspace/project",
    hasUI: false,
  } as never;

  assert.deepEqual(service.decide(request), { kind: "deny", code: "resource-limit" });
});

test("checks the UTF-8 budget without allocating an encoded copy", () => {
  const service = testService({ read: "allow", write: "allow", list: "allow", search: "allow" });
  const request = {
    surface: "read",
    arguments: { path: "x".repeat(16_384) },
    cwd: "/workspace/project",
    hasUI: false,
  } as never;
  const original = Object.getOwnPropertyDescriptor(globalThis, "TextEncoder");
  Object.defineProperty(globalThis, "TextEncoder", {
    configurable: true,
    value: class {
      encode(): never {
        throw new Error("budget check allocated an encoded copy");
      }
    },
  });

  try {
    assert.deepEqual(service.decide(request), { kind: "deny", code: "resource-limit" });
  } finally {
    if (original) Object.defineProperty(globalThis, "TextEncoder", original);
  }
});

test("rejects a Direct path containing a NUL byte", () => {
  const service = testService({ read: "allow", write: "ask" });
  const request = {
    surface: "read",
    arguments: { path: "notes\u0000.md" },
    cwd: "/workspace/project",
    hasUI: false,
  } as never;

  assert.deepEqual(service.decide(request), { kind: "deny", code: "invalid-request" });
});
