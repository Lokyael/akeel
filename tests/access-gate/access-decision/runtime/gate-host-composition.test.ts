import assert from "node:assert/strict";
import test from "node:test";
import { decodePolicyConfiguration } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";
import {
  createGateSession,
  handleGateSessionToolCall,
} from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";
import type { GateSession } from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";

function createTestSession(configInput: unknown = { presets: { guided: {} }, activePreset: "guided" }): GateSession {
  return createGateSession({
    cwd: "/workspace/project",
    stagingRoot: "/tmp/akeel-stage",
    credentialRoots: ["/agent"],
    configuration: decodePolicyConfiguration(configInput),
    pathEvidence: Object.freeze({
      resolve(base: string, path: string) {
        const candidate = path.startsWith("/") ? path : `${base}/${path}`;
        return Object.freeze({ candidate, traversed: Object.freeze([base, candidate]) });
      },
    }),
  });
}

test("Pi realizes approval-required only through host UI", async () => {
  const event = { toolName: "write", input: { path: "out.txt", content: "payload" } };
  const session = createTestSession();

  assert.deepEqual(await handleGateSessionToolCall(session, event, {
    cwd: "/workspace/project",
    hasUI: false,
  }), { block: true, reason: "Blocked because approval UI is unavailable." });

  let confirmations = 0;
  assert.equal(await handleGateSessionToolCall(session, event, {
    cwd: "/workspace/project",
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
  const session = createTestSession();
  assert.equal(await handleGateSessionToolCall(session, {
    toolName: "other-extension",
    input: null,
  }, null), undefined);
});

test("Pi host composition blocks rendered denials with static reason", async () => {
  const session = createTestSession({
    presets: {
      custom: {
        paths: { read: "allow", write: "deny", edit: "deny", list: "allow", search: "allow", allowedRoots: [], blockedRoots: [], blockedPaths: [] },
        commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
      },
    },
    activePreset: "custom",
  });

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "write", input: { path: "private.md", content: "secret\n" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked by access policy." });
});

test("Pi host composition gives read-only guidance for a denied direct modification", async () => {
  const session = createTestSession({
    presets: { review: {} },
    activePreset: "review",
  });

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "edit", input: { path: "notes.md", edits: [{ oldText: "a", newText: "b" }] } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "The current session is read-only; prompt the user to switch policy.",
  });
});

test("Pi host composition keeps hard boundaries on generic guidance", async () => {
  const session = createTestSession({
    presets: {
      review: {
        paths: { blockedPaths: ["/workspace/project/notes.md"] },
      },
    },
    activePreset: "review",
  });

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "write", input: { path: "notes.md", content: "secret\n" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user." });
});

test("Pi host composition executes only after explicit approval", async () => {
  const session = createTestSession();
  let confirmation: { title: string; message: string } | undefined;

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "write", input: { path: "notes.md", content: "updated\n" } },
    {
      cwd: "/workspace/project",
      hasUI: true,
      ui: {
        confirm: async (title: string, message: string) => {
          confirmation = { title, message };
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.deepEqual(confirmation, {
    title: "Approval required",
    message: "write /workspace/project/notes.md",
  });
});

test("Pi host composition blocks a rejected approval without exposing content", async () => {
  const session = createTestSession();

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "write", input: { path: "notes.md", content: "secret-content" } },
    {
      cwd: "/workspace/project",
      hasUI: true,
      ui: { confirm: async () => false },
    },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked by user." });
  assert.equal(result?.reason.includes("secret-content"), false);
});

test("Pi host composition fails closed when approval UI is missing", async () => {
  const session = createTestSession();

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "write", input: { path: "notes.md", content: "updated\n" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because approval UI is unavailable." });
});

test("Pi host composition blocks unsupported governed surfaces with static text", async () => {
  const session = createTestSession();

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "read", input: "not-an-object" },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because this governed tool surface is unsupported." });
});

test("Pi host composition routes edit tool through policy", async () => {
  const session = createTestSession();

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "edit", input: { path: "notes.md", edits: [{ oldText: "a", newText: "b" }] } },
    { cwd: "/workspace/project", hasUI: false },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because approval UI is unavailable." });
});

test("Pi host composition blocks invalid host contexts with static text", async () => {
  const session = createTestSession();

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "read", input: { path: "README.md" } },
    { cwd: "relative", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because the host context is invalid." });
});

test("Pi host composition leaves passthrough tools outside host-context validation", async () => {
  const session = createTestSession();

  const result = await handleGateSessionToolCall(
    session,
    { toolName: "web_search", input: { query: "pi" } },
    { cwd: "relative", hasUI: "not-boolean", ui: {} },
  );

  assert.equal(result, undefined);
});

test("Pi host composition blocks Shell path-policy bypasses at the public seam", async () => {
  const session = createTestSession({
    presets: {
      develop: {
        paths: { blockedPaths: ["/etc/passwd"] },
      },
    },
    activePreset: "develop",
  });

  for (const command of [
    "bash -- /etc/passwd",
    "bash -o vi /etc/passwd",
    "npx tsx -- /etc/passwd",
    "tee /etc/passwd",
  ]) {
    const result = await handleGateSessionToolCall(
      session,
      { toolName: "bash", input: { command } },
      { cwd: "/workspace/project", hasUI: false, ui: {} },
    );
    assert.deepEqual(result, { block: true, reason: "Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user." }, command);
  }
  for (const command of ["dd if=/etc/passwd of=/tmp/out"]) {
    const result = await handleGateSessionToolCall(
      session,
      { toolName: "bash", input: { command } },
      { cwd: "/workspace/project", hasUI: false, ui: {} },
    );
    assert.deepEqual(result, { block: true, reason: "Blocked because approval UI is unavailable." }, command);
  }
});

test("Pi host composition does not block allows or passthrough tools", async () => {
  const session = createTestSession({
    presets: { develop: {} },
    activePreset: "develop",
  });

  assert.equal(
    await handleGateSessionToolCall(session, { toolName: "read", input: { path: "README.md" } }, { cwd: "/workspace/project", hasUI: false, ui: {} }),
    undefined,
  );
  assert.equal(
    await handleGateSessionToolCall(session, { toolName: "web_search", input: { query: "pi" } }, { cwd: "/workspace/project", hasUI: false, ui: {} }),
    undefined,
  );
});

test("handleGateSessionToolCall fails closed with invalid-admission block if session.evaluate throws", async () => {
  const faultySession: GateSession = {
    evaluate() {
      throw new Error("unexpected error in evaluate");
    },
    activePreset: () => "guided",
    activatePreset: () => false,
    close: () => {},
  };

  const result = await handleGateSessionToolCall(
    faultySession,
    { toolName: "read", input: { path: "notes.md" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because the authorization facts are invalid." });
});
