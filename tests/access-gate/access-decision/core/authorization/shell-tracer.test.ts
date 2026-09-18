import assert from "node:assert/strict";
import test from "node:test";

const core = await import("../../../../../packages/access-gate/src/access-gate/access-decision/core/index");

test("a bounded Shell call crosses the shared UI-independent authorization seam", () => {
  const exports = core as Record<string, Function>;
  let resolutions = 0;
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    home: "/home/user",
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        resolutions += 1;
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });
  const compilation = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "cat README.md" },
  }, environment);
  const admission = exports.projectUnifiedAdmission!(compilation);
  const policy = exports.freezeUnifiedPolicySnapshot!({
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
  const mandatory = exports.createMandatoryBoundaries!({ credentialRoots: ["/agent"] });

  assert.deepEqual(exports.authorizeAdmission!(admission, mandatory, policy), { kind: "allow" });
  assert.equal(resolutions, 1);
  assert.deepEqual(Reflect.ownKeys(compilation), []);
  assert.deepEqual(Reflect.ownKeys(admission), []);
});

test("bounded Shell flow reuses each state-token path fact for CWD transfer and admission", () => {
  const exports = core as Record<string, Function>;
  const resolutions: string[] = [];
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        resolutions.push(`${base}:${path}`);
        const candidate = path === "." ? base : `${base}/${path}`;
        return Object.freeze({ candidate, traversed: Object.freeze([base, candidate]) });
      },
    }),
  });
  const compilation = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "cd left || cd right; cat file" },
  }, environment);
  const admission = exports.projectUnifiedAdmission!(compilation);
  const policy = exports.freezeUnifiedPolicySnapshot!({
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
      opaque: "allow",
      destroy: "deny",
      unknown: "allow",
    },
  });
  const mandatory = exports.createMandatoryBoundaries!({ credentialRoots: ["/agent"] });

  assert.deepEqual(exports.authorizeAdmission!(admission, mandatory, policy), { kind: "allow" });
  assert.equal(resolutions.length, 5);
  assert.equal(resolutions.filter((entry) => entry === "/workspace:left").length, 1);
});

test("bounded modify commands extract target paths and obey write policy and boundaries", () => {
  const exports = core as Record<string, Function>;
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        const candidate = path.startsWith("/") ? path : `${base}/${path}`;
        return Object.freeze({ candidate, traversed: Object.freeze([base, candidate]) });
      },
    }),
  });

  const mandatory = exports.createMandatoryBoundaries!({ credentialRoots: ["/agent"] });
  const allowModifyPolicy = exports.freezeUnifiedPolicySnapshot!({
    paths: {
      read: "allow",
      write: "allow",
      edit: "allow",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace"],
      blockedRoots: [],
      blockedPaths: ["/workspace/blocked.txt"],
    },
    commands: {
      inspect: "allow",
      modify: "allow",
      execute: "deny",
      opaque: "deny",
      destroy: "deny",
      unknown: "deny",
    },
  });

  for (const cmd of ["touch file.txt", "mkdir dir", "cp src.txt dst.txt", "mv src.txt dst.txt", "ln -s src.txt dst.txt"]) {
    const compilation = exports.compileManagedCall!({
      surface: "bash",
      arguments: { command: cmd },
    }, environment);
    assert.equal("kind" in compilation && compilation.kind === "reject", false, cmd);
    const admission = exports.projectUnifiedAdmission!(compilation);
    assert.deepEqual(exports.authorizeAdmission!(admission, mandatory, allowModifyPolicy), { kind: "allow" }, cmd);
  }

  const blockedCompilation = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "touch blocked.txt" },
  }, environment);
  const blockedAdmission = exports.projectUnifiedAdmission!(blockedCompilation);
  assert.deepEqual(exports.authorizeAdmission!(blockedAdmission, mandatory, allowModifyPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("cross-surface policy evaluation verifies dual-axis tightening and path intent monotonicity", () => {
  const exports = core as Record<string, Function>;
  const environment = exports.createCompileEnvironment!({
    cwd: "/workspace",
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        const candidate = path.startsWith("/") ? path : `${base}/${path}`;
        return Object.freeze({ candidate, traversed: Object.freeze([base, candidate]) });
      },
    }),
  });

  const mandatory = exports.createMandatoryBoundaries!({ credentialRoots: ["/agent"] });

  // 1. Dual-axis tightening: Shell imposes commands axis in addition to path axis (no literal parity)
  const askInspectPolicy = exports.freezeUnifiedPolicySnapshot!({
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
      inspect: "ask",
      modify: "deny",
      execute: "deny",
      opaque: "deny",
      destroy: "deny",
      unknown: "deny",
    },
  });

  const directRead = exports.compileManagedCall!({
    surface: "read",
    arguments: { path: "file.txt" },
  }, environment);
  const directAdmission = exports.projectUnifiedAdmission!(directRead);
  assert.deepEqual(exports.authorizeAdmission!(directAdmission, mandatory, askInspectPolicy), { kind: "allow" });

  const shellRead = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "cat file.txt" },
  }, environment);
  const shellAdmission = exports.projectUnifiedAdmission!(shellRead);
  assert.deepEqual(exports.authorizeAdmission!(shellAdmission, mandatory, askInspectPolicy), { kind: "approval-required" });

  // 2. Monotonicity: narrowing path intent does not weaken decisions or bypass boundaries
  const normalPolicy = exports.freezeUnifiedPolicySnapshot!({
    paths: {
      read: "allow",
      write: "allow",
      edit: "allow",
      list: "allow",
      search: "allow",
      allowedRoots: ["/workspace"],
      blockedRoots: [],
      blockedPaths: ["/workspace/blocked.txt"],
    },
    commands: {
      inspect: "allow",
      modify: "allow",
      execute: "deny",
      opaque: "deny",
      destroy: "deny",
      unknown: "deny",
    },
  });

  // Allowed file within root is admitted under allowing policy
  const allowedTouch = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "touch file.txt" },
  }, environment);
  assert.deepEqual(exports.authorizeAdmission!(exports.projectUnifiedAdmission!(allowedTouch), mandatory, normalPolicy), {
    kind: "allow",
  });

  // Blocked file remains hard-boundary even with specific path intent
  const blockedTouch = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "touch blocked.txt" },
  }, environment);
  assert.deepEqual(exports.authorizeAdmission!(exports.projectUnifiedAdmission!(blockedTouch), mandatory, normalPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // Path outside allowed roots remains hard-boundary
  const outsideTouch = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "touch /outside/file.txt" },
  }, environment);
  assert.deepEqual(exports.authorizeAdmission!(exports.projectUnifiedAdmission!(outsideTouch), mandatory, normalPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Shell operations respect capabilityRoots with anti-tamper hard boundary for modifications", () => {
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

  const mandatory = exports.createMandatoryBoundaries!({
    credentialRoots: ["/agent"],
    capabilityRoots: ["/agent/skills"],
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
      destroy: "deny",
      unknown: "deny",
    },
  });

  // 1. Inspecting file in capability roots is allowed (read effect)
  const catCall = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "cat /agent/skills/foo/SKILL.md" },
  }, environment);
  assert.deepEqual(exports.authorizeAdmission!(exports.projectUnifiedAdmission!(catCall), mandatory, policy), {
    kind: "allow",
  });

  // 2. Modifying file in capability roots is hard-denied (anti-tamper)
  const touchCall = exports.compileManagedCall!({
    surface: "bash",
    arguments: { command: "touch /agent/skills/foo/SKILL.md" },
  }, environment);
  assert.deepEqual(exports.authorizeAdmission!(exports.projectUnifiedAdmission!(touchCall), mandatory, policy), {
    kind: "deny",
    code: "hard-boundary",
  });
});

