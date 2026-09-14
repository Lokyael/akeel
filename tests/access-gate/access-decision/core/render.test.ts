import assert from "node:assert/strict";
import test from "node:test";
import { renderHostFacingDecision } from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";

test("renderer blocks with a static bounded reason that does not include display path", () => {
  const rendered = renderHostFacingDecision(
    { kind: "deny", code: "policy-denied" },
    { kind: "direct", operation: "write", path: "/workspace/project/private-notes.md" },
  );

  assert.deepEqual(rendered, {
    kind: "block",
    code: "policy-denied",
    reason: "Blocked by access policy.",
  });
  assert.equal(rendered.reason.includes("private-notes.md"), false);
  assert.equal(rendered.reason.length <= 120, true);
  assert.equal(Object.isFrozen(rendered), true);
});

test("renderer gives Shell approval a bounded summary with literal command text", () => {
  const rendered = renderHostFacingDecision(
    { kind: "ask", executed: false },
    {
      kind: "shell",
      command: "mkdir sensitive; cat file",
      operations: [
        { commandClass: "modify", effects: ["write"] },
        { commandClass: "inspect", effects: ["read"] },
      ],
    },
  );

  assert.deepEqual(rendered, {
    kind: "confirm",
    executed: false,
    summary: "shell modify [write]; inspect [read] — literal form: mkdir sensitive; cat file",
  });
  assert.equal(rendered.kind === "confirm" && rendered.summary.includes("mkdir sensitive"), true);
  assert.equal(rendered.kind === "confirm" && rendered.summary.length <= 160, true);
});

test("renderer escapes terminal control characters in approval summaries", () => {
  const rendered = renderHostFacingDecision(
    { kind: "ask", executed: false },
    {
      kind: "shell",
      command: "mkdir /tmp/x\rSAFE\bNOW",
      operations: [{ commandClass: "modify", effects: ["write"] }],
    },
  );

  assert.equal(rendered.kind, "confirm");
  if (rendered.kind === "confirm") {
    assert.equal(rendered.summary.includes("\\x0d"), true);
    assert.equal(rendered.summary.includes("\\x08"), true);
    assert.equal(rendered.summary.includes("\r"), false);
    assert.equal(rendered.summary.includes("\b"), false);
  }
});

test("renderer labels opaque execution in approval summaries", () => {
  const rendered = renderHostFacingDecision(
    { kind: "ask", executed: false },
    {
      kind: "shell",
      command: "pytest tests/",
      operations: [{ commandClass: "execute", effects: ["execute"], opaque: true }],
    },
  );

  assert.equal(rendered.kind, "confirm");
  if (rendered.kind === "confirm") {
    assert.equal(rendered.summary.includes("execute [opaque] [execute]"), true);
  }
});

test("renderer returns an immutable host result without sharing its input", () => {
  const decision = { kind: "allow" } as const;
  const rendered = renderHostFacingDecision(decision);

  assert.notEqual(rendered, decision);
  assert.equal(Object.isFrozen(rendered), true);
  assert.deepEqual(rendered, decision);
});
