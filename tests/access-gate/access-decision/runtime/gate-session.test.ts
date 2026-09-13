import assert from "node:assert/strict";
import test from "node:test";
import { decodePolicyConfiguration } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";

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
