import assert from "node:assert/strict";
import test from "node:test";
import type { DirectRequest } from "../../../../packages/access-gate/src/access-gate/access-decision/core/index";
import {
  createPolicyState,
  createProjectContext,
} from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";
import { createTestDecisionService as createDecisionService } from "./test-fixtures";

const request = (hasUI: boolean): DirectRequest => ({
  surface: "write",
  arguments: { path: "notes.md", content: "updated\n" },
  cwd: "/workspace/project",
  hasUI,
});

test("rejects a structurally copied policy state", () => {
  const state = createPolicyState({ paths: { read: "allow", write: "ask" } });

  assert.throws(
    () => createDecisionService({ snapshot: state.snapshot } as never),
    { name: "TypeError", message: "invalid policy state" },
  );
});

test("rejects a structurally copied project context", () => {
  const context = createProjectContext({ cwd: "/", projectRoot: "/project", stagingRoot: "/tmp" });

  assert.throws(
    () => createDecisionService(createPolicyState({}), { ...context } as never),
    { name: "TypeError", message: "invalid project context" },
  );
});

test("injects project and staging roots into Direct path authorization", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );
  const inside: DirectRequest = {
    surface: "read",
    arguments: { path: "README.md" },
    cwd: "/workspace/project",
    hasUI: false,
  };
  const outside: DirectRequest = { ...inside, arguments: { path: "/etc/passwd" } };

  assert.deepEqual(service.decide(inside), { kind: "allow" });
  assert.deepEqual(service.decide(outside), { kind: "deny", code: "hard-boundary" });
});

test("accepts a runtime policy state produced by the new config adapter", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "ask" } }),
  );

  assert.deepEqual(service.decide(request(true)), { kind: "ask", executed: false });
});

test("explicit allowed roots do not gain implicit project access", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", allowedRoots: ["/srv/audit"] } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );

  assert.deepEqual(service.decide({
    surface: "read",
    arguments: { path: "/workspace/project/README.md" },
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "deny", code: "hard-boundary" });
});

test("explicit allowed roots constrain Shell access independently", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", allowedRoots: ["/srv/audit"] }, commands: { inspect: "allow" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );

  assert.deepEqual(service.decideToolCall("bash", { command: "cat /workspace/project/README.md" }, {
    cwd: "/workspace/project",
    hasUI: false,
  }), { kind: "block", code: "hard-boundary", reason: "Blocked by a security boundary." });
});

test("path-form interpreter information calls remain hard-denied", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow" }, commands: { inspect: "allow" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );

  assert.deepEqual(
    service.decideToolCall("bash", { command: "./python --version" }, { cwd: "/workspace/project", hasUI: false }),
    { kind: "block", code: "hard-boundary", reason: "Blocked by a security boundary." },
  );
});

test("routes a host Shell call through canonical compilation and shell policy", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "ask" }, commands: { modify: "ask" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );

  assert.deepEqual(
    service.decideToolCall("bash", { command: "mkdir generated" }, { cwd: "/workspace/project", hasUI: true }),
    { kind: "confirm", executed: false, summary: "shell modify [write] — literal form: mkdir generated" },
  );
});

test("routes a real Pi tool-call event through the same trusted host context seam", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));

  const result = service.decidePiToolCall(
    { toolName: "write", input: { path: "notes.md", content: "content\n" }, cwd: "/attacker", hasUI: true },
    { cwd: "/workspace/project", hasUI: false, ui: {} },
  );

  assert.deepEqual(result, {
    kind: "block",
    code: "no-ui",
    reason: "Blocked because approval UI is unavailable.",
  });
});

test("renders Shell host approvals with a bounded summary and literal command text", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "ask" }, commands: { modify: "ask" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );

  const result = service.decideToolCall(
    "bash",
    { command: "mkdir generated-from-command-text" },
    { cwd: "/workspace/project", hasUI: true },
  );

  assert.equal(result.kind, "confirm");
  if (result.kind !== "confirm") return;
  assert.equal(result.executed, false);
  assert.equal(result.summary.length <= 160, true);
  assert.equal(result.summary.includes("mkdir"), true);
  assert.equal(result.summary.includes("generated-from-command-text"), true);
});

test("renders Direct host approvals with a bounded summary and no file content", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));
  const longName = `${"a".repeat(220)}.md`;

  const result = service.decideToolCall(
    "write",
    { path: longName, content: "do-not-render-this-content" },
    { cwd: "/workspace/project", hasUI: true },
  );

  assert.equal(result.kind, "confirm");
  if (result.kind !== "confirm") return;
  assert.equal(result.executed, false);
  assert.equal(result.summary.startsWith("write "), true);
  assert.equal(result.summary.length <= 160, true);
  assert.equal(result.summary.includes("do-not-render-this-content"), false);
});

test("renders Shell canonical rejects with static bounded text and no command text", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow" }, commands: { inspect: "allow" } }));

  const result = service.decideToolCall(
    "bash",
    { command: "cat \"$HOME\"" },
    { cwd: "/workspace/project", hasUI: false },
  );

  assert.deepEqual(result, {
    kind: "block",
    code: "dynamic-value",
    reason: "Blocked because the shell command contains dynamic values.",
  });
  assert.equal("reason" in result && result.reason.includes("$HOME"), false);
});

test("renders Shell host denials with static bounded text and no command text", () => {
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "ask" }, commands: { modify: "deny" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
  );

  const result = service.decideToolCall(
    "bash",
    { command: "mkdir private-notes" },
    { cwd: "/workspace/project", hasUI: true },
  );

  assert.deepEqual(result, {
    kind: "block",
    code: "policy-denied",
    reason: "Blocked by access policy.",
  });
  assert.equal("reason" in result && result.reason.includes("mkdir"), false);
});

test("observes one canonical compile and one projection per managed Direct tool call", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "ask" } }),
    undefined,
    { record: (event: string) => events.push(event) },
  );

  assert.equal(
    service.decideToolCall("write", { path: "notes.md", content: "updated\n" }, { cwd: "/workspace/project", hasUI: true }).kind,
    "confirm",
  );

  assert.deepEqual(events, [
    "adapt-managed",
    "compile-direct",
    "project-direct-admission",
    "evaluate-direct-policy",
    "project-direct-display",
    "render-host-facing",
  ]);
});

test("does not project Direct display for allow or deny decisions", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "deny" } }),
    undefined,
    { record: (event: string) => events.push(event) },
  );

  assert.equal(
    service.decideToolCall("read", { path: "README.md" }, { cwd: "/workspace/project", hasUI: false }).kind,
    "allow",
  );
  assert.equal(
    service.decideToolCall("write", { path: "notes.md", content: "updated" }, { cwd: "/workspace/project", hasUI: false }).kind,
    "block",
  );
  assert.deepEqual(events, [
    "adapt-managed", "compile-direct", "project-direct-admission", "evaluate-direct-policy", "render-host-facing",
    "adapt-managed", "compile-direct", "project-direct-admission", "evaluate-direct-policy", "render-host-facing",
  ]);
});

test("observes one canonical compile and one projection per managed Shell tool call", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "ask" }, commands: { modify: "ask" } }),
    createProjectContext({ cwd: "/workspace/project", projectRoot: "/workspace/project", stagingRoot: "/tmp/akeel" }),
    { record: (event: string) => events.push(event) },
  );

  assert.equal(
    service.decideToolCall("bash", { command: "mkdir generated" }, { cwd: "/workspace/project", hasUI: true }).kind,
    "confirm",
  );

  assert.deepEqual(events, [
    "adapt-managed",
    "compile-shell",
    "project-shell-admission",
    "evaluate-shell-policy",
    "project-shell-display",
    "render-host-facing",
  ]);
});

test("does not project Admission or Display after a Direct canonical reject", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow", write: "allow" } }),
    undefined,
    { record: (event: string) => events.push(event) },
  );

  assert.equal(
    service.decideToolCall("write", { path: "notes.md" }, { cwd: "/workspace/project", hasUI: true }).kind,
    "block",
  );

  assert.deepEqual(events, ["adapt-managed", "compile-direct", "render-host-facing"]);
});

test("does not project Admission after a Shell canonical reject", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow" }, commands: { inspect: "allow" } }),
    undefined,
    { record: (event: string) => events.push(event) },
  );

  assert.equal(
    service.decideToolCall("bash", { command: "cat \"$HOME\"" }, { cwd: "/workspace/project", hasUI: true }).kind,
    "block",
  );

  assert.deepEqual(events, ["adapt-managed", "compile-shell", "render-host-facing"]);
});

test("renders adapter rejects without entering canonical or policy evaluation", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "allow" } }),
    undefined,
    { record: (event: string) => events.push(event) },
  );

  assert.equal(
    service.decideToolCall("read", { path: "README.md" }, { cwd: "relative", hasUI: true }).kind,
    "block",
  );

  assert.deepEqual(events, ["adapt-reject", "render-host-facing"]);
});

test("does not observe canonical or policy events for passthrough tools", () => {
  const events: string[] = [];
  const service = createDecisionService(
    createPolicyState({ paths: { read: "deny", write: "deny" }, commands: { unknown: "deny" } }),
    undefined,
    { record: (event: string) => events.push(event) },
  );

  assert.deepEqual(service.decideToolCall("web_search", { query: "pi" }, { cwd: "relative", hasUI: false }), {
    kind: "passthrough",
    toolName: "web_search",
  });
  assert.deepEqual(events, ["adapt-passthrough"]);
});

test("passes unowned host tools through without policy evaluation", () => {
  const service = createDecisionService(createPolicyState({}), createProjectContext({ cwd: "/", projectRoot: "/project", stagingRoot: "/tmp" }));

  assert.deepEqual(service.decideToolCall("web_search", { query: "pi" }, { cwd: "/", hasUI: false }), {
    kind: "passthrough",
    toolName: "web_search",
  });
});

test("returns one non-executing ask for a guarded Direct write with UI", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));

  assert.deepEqual(service.decide(request(true)), { kind: "ask", executed: false });
});

test("denies a guarded Direct write without UI instead of executing it", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "ask" } }));

  assert.deepEqual(service.decide(request(false)), { kind: "deny", code: "no-ui" });
});

test("returns a policy denial for a valid Direct write", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "deny" } }));

  assert.deepEqual(service.decide(request(true)), { kind: "deny", code: "policy-denied" });
});

test("renders Direct host denials with static bounded text and no request path", () => {
  const service = createDecisionService(createPolicyState({ paths: { read: "allow", write: "deny" } }));

  const result = service.decideToolCall(
    "write",
    { path: "private-notes.md", content: "secret\n" },
    { cwd: "/workspace/project", hasUI: true },
  );

  assert.deepEqual(result, {
    kind: "block",
    code: "policy-denied",
    reason: "Blocked by access policy.",
  });
  assert.equal("reason" in result && result.reason.includes("private-notes.md"), false);
});
