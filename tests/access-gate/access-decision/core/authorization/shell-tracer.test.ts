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

