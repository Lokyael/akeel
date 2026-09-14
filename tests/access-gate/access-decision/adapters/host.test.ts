import assert from "node:assert/strict";
import test from "node:test";
import { adaptPiGateToolCall } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/host";

test("Pi gate adapter validates host context and maps governed surfaces", () => {
  const result = adaptPiGateToolCall(
    { toolName: "read", input: { path: "notes.md" } },
    { cwd: "/workspace/project", hasUI: false },
  );

  assert.equal(result.kind, "managed");
  if (result.kind !== "managed") return;
  assert.equal(result.request.surface, "read");
  assert.deepEqual(result.request.arguments, { path: "notes.md" });
});

test("Pi gate adapter normalizes aliases ls, grep, find to canonical surfaces", () => {
  const lsResult = adaptPiGateToolCall({ toolName: "ls", input: {} }, { cwd: "/", hasUI: true });
  assert.equal(lsResult.kind === "managed" && lsResult.request.surface, "list");

  const grepResult = adaptPiGateToolCall({ toolName: "grep", input: { pattern: "abc" } }, { cwd: "/", hasUI: true });
  assert.equal(grepResult.kind === "managed" && grepResult.request.surface, "search");

  const findResult = adaptPiGateToolCall({ toolName: "find", input: { pattern: "*.ts" } }, { cwd: "/", hasUI: true });
  assert.equal(findResult.kind === "managed" && findResult.request.surface, "search");
});

test("Pi gate adapter passes through unowned tools without checking context", () => {
  const result = adaptPiGateToolCall(
    { toolName: "web_search", input: { query: "pi" } },
    { cwd: "invalid", hasUI: "not-boolean" },
  );
  assert.deepEqual(result, { kind: "passthrough", toolName: "web_search" });
});

test("Pi gate adapter fails closed on invalid host context or malformed input", () => {
  assert.deepEqual(
    adaptPiGateToolCall({ toolName: "read", input: { path: "a" } }, { cwd: "relative", hasUI: true }),
    { kind: "reject", code: "invalid-host-context" },
  );
  assert.deepEqual(
    adaptPiGateToolCall({ toolName: "read", input: { path: "a" } }, null),
    { kind: "reject", code: "invalid-host-context" },
  );
  assert.deepEqual(
    adaptPiGateToolCall({ toolName: "read", input: null }, { cwd: "/workspace", hasUI: true }),
    { kind: "reject", code: "unsupported-surface" },
  );
  assert.deepEqual(
    adaptPiGateToolCall(null, { cwd: "/workspace", hasUI: true }),
    { kind: "reject", code: "invalid-host-context" },
  );
});

test("Pi gate adapter maps edit tool call to managed direct request", () => {
  const result = adaptPiGateToolCall(
    { toolName: "edit", input: { path: "src/index.ts", edits: [{ oldText: "a", newText: "b" }] } },
    { cwd: "/workspace/project", hasUI: true },
  );
  assert.deepEqual(result, {
    kind: "managed",
    request: {
      surface: "edit",
      arguments: { path: "src/index.ts", edits: [{ oldText: "a", newText: "b" }] },
    },
  });
});
