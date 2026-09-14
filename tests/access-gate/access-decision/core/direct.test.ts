import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";
import {
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

type DirectRequest = Readonly<{
  readonly surface: "read" | "write" | "edit" | "list" | "search";
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly cwd: string;
  readonly hasUI: boolean;
}>;

type TestCompilation = Readonly<{
  readonly value: ReturnType<typeof compileManagedCall>;
  readonly hasUI: boolean;
}>;
type TestAdmission = Readonly<{
  readonly value: NonNullable<ReturnType<typeof projectUnifiedAdmission>>;
  readonly hasUI: boolean;
}>;
type TestPolicy = ReturnType<typeof freezeUnifiedPolicySnapshot>;

function createCredentialBoundary(roots: readonly string[]) {
  return createMandatoryBoundaries({ credentialRoots: roots });
}

const testBoundary = createCredentialBoundary(["/__test-agent-dir__"]);

function compileDirect(request: DirectRequest): TestCompilation {
  const { cwd, hasUI, ...managed } = request;
  return Object.freeze({
    value: compileManagedCall(
      managed,
      createCompileEnvironment({ cwd, pathEvidence: createLinuxPathEvidence() }),
    ),
    hasUI,
  });
}

function projectAdmission(compilation: TestCompilation): TestAdmission | undefined {
  const value = projectUnifiedAdmission(compilation.value);
  return value === undefined ? undefined : Object.freeze({ value, hasUI: compilation.hasUI });
}

function freezePolicySnapshot(input: Record<string, unknown>): TestPolicy {
  return freezeUnifiedPolicySnapshot({
    paths: {
      read: input.read,
      write: input.write,
      edit: input.edit ?? "deny",
      list: input.list ?? "deny",
      search: input.search ?? "deny",
      allowedRoots: input.allowedRoots ?? [],
      blockedRoots: input.blockedRoots ?? [],
      blockedPaths: input.blockedPaths ?? [],
    },
    commands: { inspect: "allow", modify: "allow", execute: "allow", destroy: "allow", unknown: "allow" },
  });
}

function evaluateAdmission(admission: TestAdmission, policy: TestPolicy, boundary = testBoundary) {
  const verdict = authorizeAdmission(admission.value, boundary, policy);
  if (verdict.kind !== "approval-required") return verdict;
  return admission.hasUI ? { kind: "ask", executed: false } as const : { kind: "deny", code: "no-ui" } as const;
}

function directAdmissionHitsCredentialBoundary(admission: TestAdmission, boundary: unknown): boolean {
  const allow = freezePolicySnapshot({ read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow" });
  return authorizeAdmission(admission.value, boundary, allow).kind === "deny";
}

function testService(paths: Record<string, unknown>) {
  const policy = freezePolicySnapshot(paths);
  return Object.freeze({
    decide(request: DirectRequest) {
      const compilation = compileDirect(request);
      const admission = projectAdmission(compilation);
      if (!admission) {
        const reject = compilation.value as { readonly code?: string };
        return { kind: "deny", code: reject.code ?? "invalid-request" };
      }
      return evaluateAdmission(admission, policy);
    },
  });
}

test("credential artifact paths remain hard boundaries under an allowing Direct policy", () => {
  const compilation = compileDirect({
    surface: "read",
    arguments: { path: "/home/user/.pi/agent/auth.json.bak" },
    cwd: "/workspace/project",
    hasUI: false,
  });
  const admission = projectAdmission(compilation);
  assert.ok(admission);
  assert.equal(directAdmissionHitsCredentialBoundary(
    admission,
    createCredentialBoundary(["/home/user/.pi/agent"]),
  ), true);
});

test("Policy Kernel evaluates a non-credential admission from only policy inputs", () => {
  const compilation = compileDirect({
    surface: "read",
    arguments: { path: "README.md" },
    cwd: "/workspace/project",
    hasUI: false,
  });
  const admission = projectAdmission(compilation);
  assert.ok(admission);

  assert.deepEqual(
    evaluateAdmission(admission, freezePolicySnapshot({ read: "allow", write: "deny" })),
    { kind: "allow" },
  );
});

test("Direct path policy follows existing symlink components", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-direct-path-"));
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
  const root = mkdtempSync(join(tmpdir(), "akeel-direct-link-target-"));
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

test("all Direct credential artifact surfaces remain hard boundaries", () => {
  const service = testService({
    read: "allow",
    write: "allow",
    edit: "allow",
    list: "allow",
    search: "allow",
  });

  assert.deepEqual(service.decide({
    surface: "read",
    arguments: { path: "/__test-agent-dir__/auth.json" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(service.decide({
    surface: "write",
    arguments: { path: "/__test-agent-dir__/auth.json.bak", content: "secret" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "/__test-agent-dir__/auth.json.old", edits: [{ oldText: "old", newText: "new" }] },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(service.decide({
    surface: "list",
    arguments: { path: "/__test-agent-dir__/auth.json~" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(service.decide({
    surface: "search",
    arguments: { path: "/__test-agent-dir__/auth.json.2025", pattern: "token" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
});

test("credential templates and non-recursive parent access remain policy-governed", () => {
  const service = testService({
    read: "allow",
    write: "allow",
    list: "allow",
    search: "allow",
  });

  assert.deepEqual(service.decide({
    surface: "read",
    arguments: { path: "/__test-agent-dir__/auth.json.template" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "allow" });
  assert.deepEqual(service.decide({
    surface: "list",
    arguments: { path: "/__test-agent-dir__" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "allow" });
  assert.deepEqual(service.decide({
    surface: "search",
    arguments: { path: "/__test-agent-dir__", pattern: "needle" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
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
  const service = testService({ read: "allow", write: "allow", list: "deny", search: "deny" });
  const request: DirectRequest = {
    surface: "write",
    arguments: { path: "notes.md", content: "hello\n" },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("admits a Direct write request whose content exceeds the path analysis budget", () => {
  const service = testService({ read: "allow", write: "allow", list: "deny", search: "deny" });
  const request: DirectRequest = {
    surface: "write",
    arguments: { path: "large.md", content: "x".repeat(32_768) },
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
    arguments: { path: "src", pattern: "compileManagedCall" },
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

test("admits a Direct edit request with path and valid edits", () => {
  const service = testService({ read: "allow", write: "deny", edit: "allow" });
  const request: DirectRequest = {
    surface: "edit",
    arguments: {
      path: "src/index.ts",
      edits: [{ oldText: "const a = 1;", newText: "const a = 2;" }],
    },
    cwd: "/workspace/project",
    hasUI: false,
  };

  assert.deepEqual(service.decide(request), { kind: "allow" });
});

test("distinguishes edit policy mode from write policy mode", () => {
  const editAllowedService = testService({ read: "allow", write: "deny", edit: "allow" });
  const writeRequest: DirectRequest = {
    surface: "write",
    arguments: { path: "src/index.ts", content: "export default {};" },
    cwd: "/workspace/project",
    hasUI: true,
  };
  const editRequest: DirectRequest = {
    surface: "edit",
    arguments: {
      path: "src/index.ts",
      edits: [{ oldText: "foo", newText: "bar" }],
    },
    cwd: "/workspace/project",
    hasUI: true,
  };

  assert.deepEqual(editAllowedService.decide(writeRequest), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(editAllowedService.decide(editRequest), { kind: "allow" });

  const writeAllowedService = testService({ read: "allow", write: "allow", edit: "ask" });
  assert.deepEqual(writeAllowedService.decide(writeRequest), { kind: "allow" });
  assert.deepEqual(writeAllowedService.decide(editRequest), { kind: "ask", executed: false });

  const noUiEditRequest: DirectRequest = { ...editRequest, hasUI: false };
  assert.deepEqual(writeAllowedService.decide(noUiEditRequest), { kind: "deny", code: "no-ui" });
});

test("rejects a Direct edit request with empty edits array or non-array", () => {
  const service = testService({ read: "allow", write: "allow", edit: "allow" });

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits: [] },
    cwd: "/workspace/project",
    hasUI: false,
  } as never), { kind: "deny", code: "invalid-request" });

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits: "not-an-array" },
    cwd: "/workspace/project",
    hasUI: false,
  } as never), { kind: "deny", code: "invalid-request" });
});

test("rejects a Direct edit request with malformed edit entries or NUL byte", () => {
  const service = testService({ read: "allow", write: "allow", edit: "allow" });

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits: [{ oldText: "a" }] },
    cwd: "/workspace/project",
    hasUI: false,
  } as never), { kind: "deny", code: "invalid-request" });

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits: [{ oldText: "a\u0000b", newText: "c" }] },
    cwd: "/workspace/project",
    hasUI: false,
  } as never), { kind: "deny", code: "invalid-request" });

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits: [{ oldText: "a", newText: 123 }] },
    cwd: "/workspace/project",
    hasUI: false,
  } as never), { kind: "deny", code: "invalid-request" });
});

test("rejects a Direct edit request exceeding max edit entries limit", () => {
  const service = testService({ read: "allow", write: "allow", edit: "allow" });
  const edits = Array.from({ length: 65 }, (_, i) => ({ oldText: `a${i}`, newText: `b${i}` }));

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "resource-limit" });
});

test("rejects a Direct edit request whose edits exceed the text budget", () => {
  const service = testService({ read: "allow", write: "allow", edit: "allow" });
  const edits = [{ oldText: "x".repeat(10_000), newText: "y".repeat(10_000) }];

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: { path: "src/index.ts", edits },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "resource-limit" });
});

test("Direct edit rejects modifications in a blocked component", () => {
  const service = testService({
    read: "allow",
    write: "allow",
    edit: "allow",
    blockedRoots: ["/workspace/project/.git"],
  });

  assert.deepEqual(service.decide({
    surface: "edit",
    arguments: {
      path: ".git/config",
      edits: [{ oldText: "a", newText: "b" }],
    },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
});
