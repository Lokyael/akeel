import assert from "node:assert/strict";
import test from "node:test";
import { decodePolicyConfiguration } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";
import {
  CanonicalCompilation,
  CompileEnvironment,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";
import {
  MandatoryBoundaries,
  UnifiedAdmissionPlan,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";

const runtime = await import("../../../../packages/access-gate/src/access-gate/access-decision/runtime/index");

test("GateSession owns policy state while evaluation remains independent of host UI", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  assert.equal(typeof createGateSession, "function");

  const configuration = decodePolicyConfiguration({
    presets: { guided: {} },
    activePreset: "guided",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });

  assert.deepEqual(session.evaluate({ surface: "write", arguments: { path: "out.txt", content: "payload" } }), {
    kind: "approval-required",
    display: { kind: "direct", operation: "write", path: "/workspace/out.txt" },
  });
  assert.equal(session.activePreset(), "guided");
  assert.equal(session.activatePreset("review"), true);
  assert.deepEqual(session.evaluate({ surface: "write", arguments: { path: "out.txt", content: "payload" } }), {
    kind: "deny",
    code: "policy-denied",
  });
});

test("sealed classes reject prototype forgeries without throwing TypeError", () => {
  for (const Cls of [CanonicalCompilation, CompileEnvironment, UnifiedAdmissionPlan, MandatoryBoundaries]) {
    const forged = Object.create(Cls.prototype);
    assert.doesNotThrow(() => {
      assert.equal(Cls.read(forged), undefined);
    });
  }
});

test("bash and sh script execution follows the develop opaque policy", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: {
      develop: {
        paths: { allowedRoots: ["/workspace"] },
        commands: { execute: "allow" },
      },
    },
    activePreset: "develop",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });

  for (const command of ["bash script.sh", "sh runner.sh"]) {
    assert.deepEqual(session.evaluate({ surface: "bash", arguments: { command } }), {
      kind: "allow",
    }, command);
  }
});

test("git apply is permanently hard-denied", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: { develop: { commands: { modify: "allow", execute: "allow" } } },
    activePreset: "develop",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });

  assert.deepEqual(session.evaluate({ surface: "bash", arguments: { command: "git apply patch.diff" } }), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("unlink and truncate are permanent hard-deny destruction commands", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: {
      permissive: {
        paths: { read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow", allowedRoots: [], blockedRoots: [], blockedPaths: [] },
        commands: { inspect: "allow", modify: "allow", execute: "allow", destroy: "allow", unknown: "allow" },
      },
    },
    activePreset: "permissive",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });

  for (const command of ["unlink file.txt", "truncate -s 0 file.txt", "/bin/unlink file.txt"]) {
    assert.deepEqual(session.evaluate({ surface: "bash", arguments: { command } }), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("git check-ignore without separator extracts paths and denies credential violation", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: { review: {} },
    activePreset: "review",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/home/user/.pi/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        const candidate = path.startsWith("/") ? path : `${base}/${path}`;
        return Object.freeze({ candidate, traversed: Object.freeze([candidate]) });
      },
    }),
  });

  assert.deepEqual(session.evaluate({ surface: "bash", arguments: { command: "git check-ignore /home/user/.pi/agent/auth.json" } }), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Direct compilation treats tildes literally without home expansion", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: { review: {} },
    activePreset: "review",
  });
  let resolvedWithKind: unknown;
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string, options?: unknown) {
        resolvedWithKind = options;
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base]) });
      },
    }),
  });

  session.evaluate({ surface: "read", arguments: { path: "~/notes.md" } });
  assert.deepEqual(resolvedWithKind, { pathKind: "literal" });
});

test("GateSession close transitions state and unknown preset activation returns false", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: { guided: {} },
    activePreset: "guided",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base]) });
      },
    }),
  });

  assert.equal(session.activatePreset("non-existent-preset"), false);
  assert.equal(session.activePreset(), "guided");

  session.close();
  assert.equal(session.activatePreset("review"), false);
  assert.deepEqual(session.evaluate({ surface: "read", arguments: { path: "notes.md" } }), {
    kind: "deny",
    code: "invalid-admission",
  });
});

test("default roots admit the session access root, staging root, and /tmp/akeel", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: { develop: {} },
    activePreset: "develop",
  });
  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        const candidate = path.startsWith("/") ? path : `${base}/${path}`;
        return Object.freeze({ candidate, traversed: Object.freeze([candidate]) });
      },
    }),
  });

  assert.deepEqual(session.evaluate({ surface: "write", arguments: { path: "/tmp/akeel/artifact.md", content: "ok" } }), {
    kind: "allow",
  });
});

