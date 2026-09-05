import assert from "node:assert/strict";
import test from "node:test";
import { adaptHostDecision, adaptHostToolCall, adaptPiToolCall } from "../../../../src/access-gate/access-decision";

test("Pi tool-call composition derives cwd and UI only from ExtensionContext", () => {
  const result = adaptPiToolCall(
    { toolName: "read", input: { path: "notes.md", cwd: "/attacker", hasUI: true } },
    { cwd: "/workspace/project", hasUI: false, ui: {} },
  );

  assert.equal(result.kind, "managed");
  if (result.kind !== "managed") return;
  assert.equal(result.request.cwd, "/workspace/project");
  assert.equal(result.request.hasUI, false);
  assert.deepEqual(result.request.arguments, { path: "notes.md", cwd: "/attacker", hasUI: true });
});

test("host adapter derives UI capability and cwd from trusted host context", () => {
  const result = adaptHostToolCall(
    "read",
    { path: "notes.md", hasUI: true },
    { cwd: "/workspace/project", hasUI: false },
  );

  assert.equal(result.kind, "managed");
  if (result.kind !== "managed") return;
  assert.equal(result.request.hasUI, false);
  assert.equal(result.request.cwd, "/workspace/project");
  assert.deepEqual(result.request.arguments, { path: "notes.md", hasUI: true });
});

test("host adapter accepts host context fields beyond the authority projection", () => {
  const result = adaptHostToolCall(
    "read",
    { path: "a" },
    { cwd: "/", hasUI: true, mode: "tui", ui: {} },
  );

  assert.equal(result.kind, "managed");
});

test("host adapter closes governed surfaces and passes through unowned tools", () => {
  assert.equal(adaptHostToolCall("read", { path: "a" }, { cwd: "/", hasUI: true }).kind, "managed");
  assert.equal(adaptHostToolCall("ls", {}, { cwd: "/", hasUI: true }).kind, "managed");
  assert.equal(adaptHostToolCall("bash", { command: "pwd" }, { cwd: "/", hasUI: true }).kind, "managed");
  assert.deepEqual(adaptHostToolCall("web_search", { query: "pi" }, { cwd: "/", hasUI: true }), {
    kind: "passthrough",
    toolName: "web_search",
  });
});

test("invalid host context and unsupported inputs fail closed", () => {
  assert.deepEqual(adaptHostToolCall("read", { path: "a" }, { cwd: "relative", hasUI: true }), {
    kind: "reject",
    code: "invalid-host-context",
  });
  assert.deepEqual(adaptHostToolCall("edit", "not-an-object", { cwd: "/", hasUI: true }), {
    kind: "reject",
    code: "unsupported-surface",
  });
});

test("host adapter maps edit tool calls to managed direct requests", () => {
  const result = adaptHostToolCall(
    "edit",
    { path: "src/index.ts", edits: [{ oldText: "a", newText: "b" }] },
    { cwd: "/workspace/project", hasUI: true },
  );
  assert.deepEqual(result, {
    kind: "managed",
    request: {
      surface: "edit",
      arguments: { path: "src/index.ts", edits: [{ oldText: "a", newText: "b" }] },
      cwd: "/workspace/project",
      hasUI: true,
    },
  });
});

test("host adapter maps policy decisions to non-executing host outcomes", () => {
  assert.deepEqual(adaptHostDecision({ kind: "allow" }), { kind: "allow" });
  assert.deepEqual(adaptHostDecision({ kind: "ask", executed: false }), {
    kind: "confirm",
    executed: false,
  });
  assert.deepEqual(adaptHostDecision({ kind: "deny", code: "policy-denied" }), {
    kind: "block",
    code: "policy-denied",
  });
  assert.deepEqual(adaptHostDecision({ kind: "deny", code: "hard-boundary" }), {
    kind: "block",
    code: "hard-boundary",
  });
});
