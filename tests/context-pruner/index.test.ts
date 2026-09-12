import assert from "node:assert/strict";
import test from "node:test";
import contextPruner, { projectTestOutput, pruneTestContext } from "../../src/context-pruner/index";

function bashToolCall(id: string, command: string): Record<string, unknown> {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name: "bash", arguments: { command } }],
    timestamp: 1,
  };
}

function bashToolResult(
  id: string,
  output: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: "bash",
    content: [{ type: "text", text: output }],
    isError: false,
    timestamp: 2,
    ...overrides,
  };
}

function userBashExecution(command: string, output: string): Record<string, unknown> {
  return {
    role: "bashExecution",
    command,
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: 3,
  };
}

const successfulNodeTest = [
  "▶ example",
  "✔ passes",
  "ℹ tests 1",
  "ℹ pass 1",
  "ℹ fail 0",
  "ℹ cancelled 0",
  "ℹ skipped 0",
  "ℹ todo 0",
  "ℹ duration_ms 5969.43248",
].join("\n");

test("the shared projection exposes the exact model view without mutating the original output", () => {
  const output = successfulNodeTest;
  const projection = projectTestOutput({
    command: "npm test",
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
  });

  assert.deepEqual(projection, {
    original: output,
    model: "All tests passed",
    changed: true,
  });
  assert.equal(output, successfulNodeTest);
});

test("the shared projection marks unchanged or unsupported output without creating a model view", () => {
  assert.deepEqual(
    projectTestOutput({
      command: "npm run lint",
      output: "lint output",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    }),
    { original: "lint output", model: "lint output", changed: false },
  );
  assert.equal(
    projectTestOutput({
      command: "npm test",
      output: "cancelled output",
      cancelled: true,
      truncated: false,
    }),
    undefined,
  );
});

test("the context projection trims a verified successful model bash test result", () => {
  const messages = [bashToolCall("call-1", "npm test"), bashToolResult("call-1", successfulNodeTest)];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, [bashToolCall("call-1", "npm test"), bashToolResult("call-1", "All tests passed")]);
  assert.equal((messages[1] as { content: Array<{ text: string }> }).content[0]!.text, successfulNodeTest);
});

test("an unrecognized zero-exit output is not presented as passed tests", () => {
  const output = "runner completed without a test summary";
  const projection = projectTestOutput({
    command: "npm test",
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
  });

  assert.deepEqual(projection, { original: output, model: output, changed: false });
});

test("recognized Node TAP, Vitest, Jest, and Bun summaries can be projected", () => {
  const cases = [
    ["ℹ tests 1\nℹ pass 1\nℹ fail 0", "npm test"],
    ["Test Files  1 passed (1)\nTests       1 passed (1)", "npm test"],
    ["Test Suites: 1 passed, 1 total\nTests: 1 passed, 1 total", "npm test"],
    ["1 pass\nRan 1 tests across 1 files", "npm test"],
  ] as const;

  for (const [output, command] of cases) {
    const projection = projectTestOutput({
      command,
      output,
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    assert.equal(projection?.model, "All tests passed");
    assert.equal(projection?.changed, true);
  }
});

test("failure summaries block a success projection even with a zero exit code", () => {
  const cases = [
    "Test Files  1 failed | 1 passed (2)\nTests       1 failed | 1 passed (2)",
    "1 pass\n1 fail",
    "1 pass",
  ];

  for (const output of cases) {
    const projection = projectTestOutput({
      command: "npm test",
      output,
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    assert.notEqual(projection?.model, "All tests passed");
  }
});

test("warnings and nonzero metadata on mixed lines remain visible", () => {
  for (const output of [
    "1 pass\nwarning: skip 0",
    "1 pass\nℹ skipped 0 todo 1",
    "ℹ tests 1\nℹ pass 1\nℹ fail 0\nskipped: 1",
    "ℹ tests 1\nℹ pass 1\nℹ fail 0\ntodo: 1",
    "ℹ tests 1\nℹ pass 1\nℹ fail 0\ncancelled: 1",
  ]) {
    const projection = projectTestOutput({
      command: "npm test",
      output,
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    assert.deepEqual(projection, { original: output, model: output, changed: false });
  }
});

test("incomplete or inconsistent summaries are not presented as passed tests", () => {
  const cases = [
    "ℹ tests 2\nℹ pass 1\nℹ fail 0",
    "Tests: 1 passed, 2 total",
    "Tests: 1 passed, 1 failure, 1 total",
    "Test Files  1 passed (1)\nTests       1 passed | 1 skipped (2)",
    "Test Files  1 passed (1)\nTests       1 passed | 1 fail (1)",
    "1 pass\nRan 2 tests across 1 files",
    "ℹ tests 1\nℹ pass 1\nℹ fail 0\nSnapshots: 1 failed",
  ];

  for (const output of cases) {
    const projection = projectTestOutput({
      command: "npm test",
      output,
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    assert.deepEqual(projection, { original: output, model: output, changed: false });
  }
});

test("a later zero-test summary is not hidden by an earlier passing summary", () => {
  const cases = [
    "ℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ tests 0\nℹ pass 0\nℹ fail 0",
    "Tests: 1 passed, 1 total\nTests: 0 total",
    "Tests  1 passed (1)\nTests  0 passed (0)",
    "1 pass\nRan 1 tests across 1 files\n0 pass\nRan 0 tests across 1 files",
    "ℹ tests 1\nℹ pass 1\nℹ fail 0\nTests: 0 total",
  ];

  for (const output of cases) {
    const projection = projectTestOutput({
      command: "npm test",
      output,
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });
    assert.deepEqual(projection, { original: output, model: output, changed: false });
  }
});

test("a nested TAP summary does not override a valid top-level aggregate", () => {
  const output = [
    "  ℹ tests 0",
    "  ℹ pass 0",
    "  ℹ fail 0",
    "ℹ tests 1",
    "ℹ pass 1",
    "ℹ fail 0",
  ].join("\n");
  const projection = projectTestOutput({
    command: "npm test",
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
  });

  assert.deepEqual(projection, { original: output, model: "All tests passed", changed: true });
});

test("numeric overflow in a summary is not treated as verified evidence", () => {
  const count = "9".repeat(400);
  const output = `ℹ tests ${count}\nℹ pass ${count}\nℹ fail 0`;
  const projection = projectTestOutput({
    command: "npm test",
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
  });

  assert.deepEqual(projection, { original: output, model: output, changed: false });
});

test("a zero-test summary is not presented as passed tests", () => {
  const output = [
    "ℹ tests 0",
    "ℹ pass 0",
    "ℹ fail 0",
    "ℹ skipped 0",
    "ℹ todo 0",
  ].join("\n");
  const projection = projectTestOutput({
    command: "npm test",
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
  });

  assert.deepEqual(projection, { original: output, model: output, changed: false });
});

test("skipped, todo, and warning details remain visible after a passing test run", () => {
  const output = [
    "ℹ tests 2",
    "ℹ pass 1",
    "ℹ fail 0",
    "ℹ skipped 1",
    "ℹ todo 0",
    "warning: test environment fallback enabled",
  ].join("\n");
  const projection = projectTestOutput({
    command: "npm test",
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
  });

  assert.deepEqual(projection, { original: output, model: output, changed: false });
});

test("the context projection trims npm run test without parsing runner noise", () => {
  const result = pruneTestContext([
    bashToolCall("call-1", "npm run test -- --reporter=spec"),
    bashToolResult("call-1", "all test output\nℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ duration_ms 10"),
  ]);

  assert.equal(
    (result[1] as { content: Array<{ text: string }> }).content[0]!.text,
    "All tests passed",
  );
});

test("user bashExecution messages are never pruned", () => {
  const message = userBashExecution("npm test", successfulNodeTest);

  const result = pruneTestContext([message]);

  assert.deepEqual(result, [message]);
  assert.strictEqual(result[0], message);
  assert.equal((result[0] as { output: string }).output, successfulNodeTest);
});

test("a tool result without its matching bash tool call is not pruned", () => {
  const message = bashToolResult("missing-call", successfulNodeTest);

  const result = pruneTestContext([message]);

  assert.deepEqual(result, [message]);
  assert.strictEqual(result[0], message);
});

test("compound model bash commands are not pruned", () => {
  const output = "test output\nextra command output";
  const messages = [
    bashToolCall("call-1", "npm test && echo EXTRA"),
    bashToolResult("call-1", output),
    bashToolCall("call-2", "npm run test; echo EXTRA"),
    bashToolResult("call-2", output),
    bashToolCall("call-3", "npm test | tee result"),
    bashToolResult("call-3", output),
    bashToolCall("call-4", "npm run test > result"),
    bashToolResult("call-4", output),
  ];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
  assert.notEqual(result, messages);
});

test("quoted shell operators remain arguments of an independent model bash test", () => {
  const result = pruneTestContext([
    bashToolCall("call-1", 'npm test -- --grep "a && b"'),
    bashToolResult("call-1", successfulNodeTest),
  ]);

  assert.equal((result[1] as { content: Array<{ text: string }> }).content[0]!.text, "All tests passed");
});

test("command substitutions inside double-quoted arguments are not pruned", () => {
  const output = "runner output from command substitution";
  const messages = [
    bashToolCall("call-1", 'npm test -- --grep "$(printf substitution)"'),
    bashToolResult("call-1", output),
    bashToolCall("call-2", 'npm test -- --grep "`printf substitution`"'),
    bashToolResult("call-2", output),
  ];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
});

test("an errored host result is not presented as successful with a zero status", () => {
  const messages = [
    bashToolCall("call-1", "npm test"),
    bashToolResult("call-1", `${successfulNodeTest}\n\nCommand exited with code 0`, { isError: true }),
  ];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
});

test("a failure summary prevents a false success when the model bash result is an error", () => {
  const result = pruneTestContext([
    bashToolCall("call-1", "npm test"),
    bashToolResult("call-1", "✖ hidden failure\nℹ fail 1\n\nCommand exited with code 1", { isError: true }),
  ]);

  assert.equal(
    (result[1] as { content: Array<{ text: string }> }).content[0]!.text,
    "✖ hidden failure\nℹ fail 1\n\nCommand exited with code 1",
  );
});

test("failed model bash tests keep failure cases, diagnostics, stacks, and status", () => {
  const output = [
    "▶ example",
    "✔ passes",
    "✖ rejects invalid input",
    "  error: expected 2 to equal 3",
    "      at TestContext.<anonymous> (tests/example.test.ts:10:5)",
    "      at Test.run (internal/test_runner:632:9)",
    "ℹ tests 2",
    "ℹ pass 1",
    "ℹ fail 1",
    "ℹ duration_ms 20",
  ].join("\n");

  const result = pruneTestContext([
    bashToolCall("call-1", "npm test"),
    bashToolResult("call-1", `${output}\n\nCommand exited with code 1`, { isError: true }),
  ]);
  const pruned = (result[1] as { content: Array<{ text: string }> }).content[0]!.text;

  assert.equal(
    pruned,
    [
      "✖ rejects invalid input",
      "  error: expected 2 to equal 3",
      "      at TestContext.<anonymous> (tests/example.test.ts:10:5)",
      "      at Test.run (internal/test_runner:632:9)",
      "ℹ fail 1",
      "",
      "Command exited with code 1",
    ].join("\n"),
  );
  assert.doesNotMatch(pruned, /✔ passes/);
  assert.doesNotMatch(pruned, /duration_ms/);
});

test("cancelled, truncated, non-test, and uncertain model bash results remain unchanged", () => {
  const cancelled = [bashToolCall("call-1", "npm test"), bashToolResult("call-1", "partial output\n\nCommand aborted", { isError: true })];
  const truncated = [
    bashToolCall("call-2", "npm test"),
    bashToolResult("call-2", successfulNodeTest, { details: { truncation: { truncated: true } } }),
  ];
  const other = [bashToolCall("call-3", "npm run lint"), bashToolResult("call-3", "lint output")];
  const uncertain = [bashToolCall("call-4", "npm test"), bashToolResult("call-4", "runner failed", { isError: true })];

  for (const messages of [cancelled, truncated, other, uncertain]) {
    const result = pruneTestContext(messages);
    assert.deepEqual(result, messages);
    assert.notEqual(result, messages);
  }
});

test("diagnostic-only model bash failures retain a bounded context around the error", () => {
  const output = [
    "runner output",
    "1) suite rejects invalid input:",
    "  AssertionError: expected 2 to equal 3",
    "failure context below",
    "runner footer",
  ].join("\n");

  const result = pruneTestContext([
    bashToolCall("call-1", "npm test"),
    bashToolResult("call-1", `${output}\n\nCommand exited with code 1`, { isError: true }),
  ]);

  assert.equal(
    (result[1] as { content: Array<{ text: string }> }).content[0]!.text,
    [
      "1) suite rejects invalid input:",
      "  AssertionError: expected 2 to equal 3",
      "failure context below",
      "",
      "Command exited with code 1",
    ].join("\n"),
  );
});

test("failed model bash tests without a reliable failure block retain the original result", () => {
  const output = "runner failed before reporting a test case";
  const messages = [
    bashToolCall("call-1", "npm test"),
    bashToolResult("call-1", `${output}\n\nCommand exited with code 1`, { isError: true }),
  ];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
  assert.notEqual(result, messages);
});

test("the extension registers only the context transformation", async () => {
  let handler: ((event: { messages: unknown[] }) => unknown) | undefined;
  const pi = {
    on(event: string, callback: (event: { messages: unknown[] }) => unknown): void {
      assert.equal(event, "context");
      handler = callback;
    },
  };

  contextPruner(pi as never);
  assert.ok(handler);

  const result = await handler!({
    messages: [bashToolCall("call-1", "npm test"), bashToolResult("call-1", successfulNodeTest)],
  });
  assert.deepEqual(result, {
    messages: [bashToolCall("call-1", "npm test"), bashToolResult("call-1", "All tests passed")],
  });
});
