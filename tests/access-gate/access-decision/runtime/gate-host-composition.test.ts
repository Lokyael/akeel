import assert from "node:assert/strict";
import test from "node:test";
import { decodePolicyConfiguration } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";
import { createGateSession } from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";

const runtime = await import("../../../../packages/access-gate/src/access-gate/access-decision/runtime/index");

function session() {
  return createGateSession({
    cwd: "/workspace",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration: decodePolicyConfiguration({ presets: { guided: {} }, activePreset: "guided" }),
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        return Object.freeze({ candidate: `${base}/${path}`, traversed: Object.freeze([base, `${base}/${path}`]) });
      },
    }),
  });
}

test("Pi realizes approval-required only through host UI", async () => {
  const handleGateSessionToolCall = (runtime as Record<string, unknown>).handleGateSessionToolCall;
  assert.equal(typeof handleGateSessionToolCall, "function");
  const event = { toolName: "write", input: { path: "out.txt", content: "payload" } };

  assert.deepEqual(await (handleGateSessionToolCall as Function)(session(), event, {
    cwd: "/workspace",
    hasUI: false,
  }), { block: true, reason: "Blocked because approval UI is unavailable." });

  let confirmations = 0;
  assert.equal(await (handleGateSessionToolCall as Function)(session(), event, {
    cwd: "/workspace",
    hasUI: true,
    ui: {
      async confirm() {
        confirmations += 1;
        return true;
      },
    },
  }), undefined);
  assert.equal(confirmations, 1);
});

test("the GateSession host seam passes unowned tools without context validation", async () => {
  const handleGateSessionToolCall = (runtime as Record<string, unknown>).handleGateSessionToolCall;
  assert.equal(typeof handleGateSessionToolCall, "function");
  assert.equal(await (handleGateSessionToolCall as Function)(session(), {
    toolName: "other-extension",
    input: null,
  }, null), undefined);
});
