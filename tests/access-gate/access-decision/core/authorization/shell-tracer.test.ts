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
