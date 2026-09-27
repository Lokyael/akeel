import assert from "node:assert/strict";
import test from "node:test";
import { decodePolicyConfiguration } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";
import {
  CanonicalCompilation,
  CompileEnvironment,
  createLinuxPathEvidence,
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

test("default roots admit only the session access root and staging root", () => {
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

  assert.deepEqual(session.evaluate({ surface: "write", arguments: { path: "/tmp/akeel-stage/artifact.md", content: "ok" } }), {
    kind: "allow",
  });
  assert.deepEqual(session.evaluate({ surface: "write", arguments: { path: "/tmp/akeel/artifact.md", content: "ok" } }), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("GateSession enforces capabilityRoots with read-only admission and anti-tamper write denial under develop", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession;
  const configuration = decodePolicyConfiguration({
    presets: {
      develop: {
        paths: { read: "allow", write: "allow", edit: "allow" },
        commands: { inspect: "allow", modify: "allow", execute: "allow" },
      },
    },
    activePreset: "develop",
  });

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

  const session = (createGateSession as Function)({
    cwd: "/workspace",
    home: "/home/user",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    capabilityRoots: ["/agent/skills"],
    configuration,
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return mockEvidence(path.startsWith("/") ? path : `${base}/${path}`);
      },
    }),
  });

  // 1. Direct read on capability asset outside workspace is allowed under develop
  assert.deepEqual(session.evaluate({ surface: "read", arguments: { path: "/agent/skills/foo/SKILL.md" } }), {
    kind: "allow",
  });

  // 2. Direct write on capability asset is hard-denied even under develop
  assert.deepEqual(session.evaluate({ surface: "write", arguments: { path: "/agent/skills/foo/SKILL.md", content: "evil" } }), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 3. Rejects invalid capabilityRoots
  assert.throws(() => {
    (createGateSession as Function)({
      cwd: "/workspace",
      home: "/home/user",
      stagingRoot: "/tmp/akeel-stage",
      credentialRoots: ["/agent"],
      capabilityRoots: ["relative/path"],
      configuration,
      pathEvidence: Object.freeze({ resolve: () => undefined }),
    });
  }, TypeError);
});

test("Capability Domain does not exempt Direct search from path scope or search policy", () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession as Function;
  const capabilityRoot = "/home/user/.agents/skills";

  function createSearchSession(allowedRoots: readonly string[], blockedRoots: readonly string[] = []) {
    return createGateSession({
      cwd: "/workspace",
      home: "/home/user",
      stagingRoot: "/tmp/akeel-stage",
      credentialRoots: ["/home/user/.pi/agent"],
      capabilityRoots: [capabilityRoot],
      configuration: decodePolicyConfiguration({
        paths: {
          read: "deny",
          write: "deny",
          edit: "deny",
          list: "deny",
          search: "deny",
          allowedRoots,
          blockedRoots,
          blockedPaths: [],
        },
        commands: {
          inspect: "deny",
          modify: "deny",
          execute: "deny",
          opaque: "deny",
          destroy: "deny",
          unknown: "deny",
        },
      }),
      pathEvidence: createLinuxPathEvidence(),
    });
  }

  const outsideWorkspace = createSearchSession(["/workspace"]);
  assert.deepEqual(outsideWorkspace.evaluate({
    surface: "search",
    arguments: { path: capabilityRoot, pattern: "token" },
  }), { kind: "deny", code: "hard-boundary" });

  const explicitlyScoped = createSearchSession([capabilityRoot]);
  assert.deepEqual(explicitlyScoped.evaluate({
    surface: "search",
    arguments: { path: capabilityRoot, pattern: "token" },
  }), { kind: "deny", code: "policy-denied" });

  const blockedDescendant = createSearchSession(
    [capabilityRoot],
    [`${capabilityRoot}/private`],
  );
  assert.deepEqual(blockedDescendant.evaluate({
    surface: "search",
    arguments: { path: capabilityRoot, pattern: "token" },
  }), { kind: "deny", code: "hard-boundary" });
});

test("GateSession binds RootCatalog references to evaluate path proof relations end-to-end", async () => {
  const createGateSession = (runtime as Record<string, unknown>).createGateSession as Function;
  const { createPlatformValueIssuer } = await import("../../../../packages/platform-runtime/src/internal/sealed-values");

  const issuer = createPlatformValueIssuer("linux");
  const catalog = issuer.issueRootCatalog(["/workspace", "/tmp/akeel-stage", "/home/user/.pi/agent"]);
  const rootRefByPath = new Map<string, unknown>([
    ["/workspace", catalog.roots[0]],
    ["/tmp/akeel-stage", catalog.roots[1]],
    ["/home/user/.pi/agent", catalog.roots[2]],
  ]);

  const credentialProof = issuer.issuePathProof({
    literal: "anything",
    canonicalDisplay: "/random/location/auth.json",
    nativeIdentity: "dev:1:ino:999",
    catalog,
    relations: [{ rootIndex: 2, relations: ["descendant"] }],
  });

  const session = createGateSession({
    cwd: "/workspace",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/home/user/.pi/agent"],
    rootRefByPath,
    configuration: decodePolicyConfiguration({
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
        opaque: "allow",
        destroy: "allow",
        unknown: "allow",
      },
    }),
    pathEvidence: {
      resolve() {
        return {
          candidate: "/random/location/auth.json",
          traversed: ["/random/location/auth.json"],
          proof: credentialProof,
        };
      },
    },
  });

  // Proof with relations pointing to credential root must be hard-denied regardless of path string
  const result = session.evaluate({ surface: "read", arguments: { path: "fake" } });
  assert.deepEqual(result, { kind: "deny", code: "hard-boundary" });
});

