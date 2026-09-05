import assert from "node:assert/strict";
import test from "node:test";
import {
  createDecisionService,
  createPolicyState,
  handlePiToolCall,
} from "../../../../src/access-gate/access-decision";

test("Pi host composition blocks rendered denials with static reason", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "deny" } }));

  const result = await handlePiToolCall(
    service,
    { toolName: "write", input: { path: "private.md", content: "secret\n" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked by access policy." });
});

test("Pi host composition gives read-only guidance for a denied direct modification", async () => {
  const service = createDecisionService(createPolicyState({
    presets: {
      review: { paths: { read: "allow", write: "deny", edit: "deny" }, commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" } },
      guided: { paths: { read: "allow", write: "ask", edit: "ask" }, commands: { inspect: "allow", modify: "ask", execute: "ask", destroy: "deny", unknown: "deny" } },
      develop: { paths: { read: "allow", write: "allow", edit: "allow" }, commands: { inspect: "allow", modify: "allow", execute: "allow", destroy: "ask", unknown: "ask" } },
    },
    activePreset: "review",
  }));

  const result = await handlePiToolCall(
    service,
    { toolName: "edit", input: { path: "notes.md", edits: [{ oldText: "a", newText: "b" }] } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "The current session is read-only; switch policy with /policy before retrying this modification.",
  });
});

test("Pi host composition keeps hard boundaries on generic guidance", async () => {
  const service = createDecisionService(createPolicyState({
    presets: {
      review: { paths: { read: "allow", write: "deny", edit: "deny", blockedPaths: ["/workspace/project/notes.md"] }, commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" } },
      guided: { paths: { read: "allow", write: "ask", edit: "ask", blockedPaths: ["/workspace/project/notes.md"] }, commands: { inspect: "allow", modify: "ask", execute: "ask", destroy: "deny", unknown: "deny" } },
      develop: { paths: { read: "allow", write: "allow", edit: "allow", blockedPaths: ["/workspace/project/notes.md"] }, commands: { inspect: "allow", modify: "allow", execute: "allow", destroy: "ask", unknown: "ask" } },
    },
    activePreset: "review",
  }));

  const result = await handlePiToolCall(
    service,
    { toolName: "write", input: { path: "notes.md", content: "secret\n" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked by a security boundary." });
});

test("Pi host composition executes only after explicit approval", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));
  let confirmation: { title: string; message: string } | undefined;

  const result = await handlePiToolCall(
    service,
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
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));

  const result = await handlePiToolCall(
    service,
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
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));

  const result = await handlePiToolCall(
    service,
    { toolName: "write", input: { path: "notes.md", content: "updated\n" } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because approval UI is unavailable." });
});

test("Pi host composition blocks unsupported governed surfaces with static text", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow" } }));

  const result = await handlePiToolCall(
    service,
    { toolName: "read", input: "not-an-object" },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because this governed tool surface is unsupported." });
});

test("Pi host composition routes edit tool through policy", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask", edit: "ask" } }));

  const result = await handlePiToolCall(
    service,
    { toolName: "edit", input: { path: "notes.md", edits: [{ oldText: "a", newText: "b" }] } },
    { cwd: "/workspace/project", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because approval UI is unavailable." });
});

test("Pi host composition blocks invalid host contexts with static text", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow" } }));

  const result = await handlePiToolCall(
    service,
    { toolName: "read", input: { path: "README.md" } },
    { cwd: "relative", hasUI: true, ui: {} },
  );

  assert.deepEqual(result, { block: true, reason: "Blocked because the host context is invalid." });
});

test("Pi host composition leaves passthrough tools outside host-context validation", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "deny", write: "deny" } }));

  const result = await handlePiToolCall(
    service,
    { toolName: "web_search", input: { query: "pi" } },
    { cwd: "relative", hasUI: "not-boolean", ui: {} },
  );

  assert.equal(result, undefined);
});

test("Pi host composition blocks Shell path-policy bypasses at the public seam", async () => {
  const service = createDecisionService(createPolicyState({
    paths: { read: "allow", write: "allow", blockedPaths: ["/etc/passwd"] },
    commands: { execute: "allow", unknown: "allow" },
  }));

  for (const command of [
    "bash -- /etc/passwd",
    "bash -o vi /etc/passwd",
    "npx tsx -- /etc/passwd",
    "tee /etc/passwd",
    "dd if=/etc/passwd of=/tmp/out",
  ]) {
    const result = await handlePiToolCall(
      service,
      { toolName: "bash", input: { command } },
      { cwd: "/workspace/project", hasUI: false, ui: {} },
    );
    assert.deepEqual(result, { block: true, reason: "Blocked by a security boundary." }, command);
  }
});

test("Pi host composition does not block allows or passthrough tools", async () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow" } }));

  assert.equal(
    await handlePiToolCall(service, { toolName: "read", input: { path: "README.md" } }, { cwd: "/workspace/project", hasUI: false, ui: {} }),
    undefined,
  );
  assert.equal(
    await handlePiToolCall(service, { toolName: "web_search", input: { query: "pi" } }, { cwd: "/workspace/project", hasUI: false, ui: {} }),
    undefined,
  );
});
