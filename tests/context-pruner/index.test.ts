import assert from "node:assert/strict";
import test from "node:test";
import contextPruner, { pruneTestContext } from "../../src/context-pruner/index";

function bashExecution(command: string, output: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    role: "bashExecution",
    command,
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: 1,
    ...overrides,
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

test("successful npm test output is reduced to one fixed line", () => {
  const messages = [bashExecution("npm test", successfulNodeTest)];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, [bashExecution("npm test", "All tests passed")]);
  assert.equal((messages[0] as { output: string }).output, successfulNodeTest);
});

test("successful npm run test output is reduced without parsing runner noise", () => {
  const result = pruneTestContext([
    bashExecution("npm run test -- --reporter=spec", "all test output\nℹ fail 0\nℹ duration_ms 10"),
  ]);

  assert.equal((result[0] as { output: string }).output, "All tests passed");
});

test("compound commands beginning with supported test invocations are not pruned", () => {
  const output = "test output\nextra command output";
  const messages = [
    bashExecution("npm test && echo EXTRA", output),
    bashExecution("npm run test; echo EXTRA", output),
    bashExecution("npm test | tee result", output),
    bashExecution("npm run test > result", output),
  ];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
  assert.notEqual(result, messages);
});

test("quoted shell operators remain arguments of an independent test invocation", () => {
  const messages = [bashExecution('npm test -- --grep "a && b"', "runner output")];

  const result = pruneTestContext(messages);

  assert.equal((result[0] as { output: string }).output, "All tests passed");
});

test("command substitutions inside double-quoted arguments are not pruned", () => {
  const output = "runner output from command substitution";
  const messages = [
    bashExecution('npm test -- --grep "$(printf substitution)"', output),
    bashExecution('npm test -- --grep "`printf substitution`"', output),
  ];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
});

test("a failure summary prevents a false success even when the process exit code is zero", () => {
  const result = pruneTestContext([
    bashExecution("npm test", "✖ hidden failure\nℹ fail 1"),
  ]);

  assert.equal((result[0] as { output: string }).output, "✖ hidden failure\nℹ fail 1");
});

test("failed test output keeps failure cases, diagnostics, stacks, and failure summary", () => {
  const output = [
    "▶ example",
    "✔ passes",
    "✖ rejects invalid input",
    "  error: expected 2 to equal 3",
    "      at TestContext.<anonymous> (tests/example.test.ts:10:5)",
    "      at Test.run (node:internal/test_runner/test:632:9)",
    "ℹ tests 2",
    "ℹ pass 1",
    "ℹ fail 1",
    "ℹ duration_ms 20",
  ].join("\n");

  const result = pruneTestContext([bashExecution("npm test", output, { exitCode: 1 })]);
  const pruned = (result[0] as { output: string }).output;

  assert.equal(
    pruned,
    [
      "✖ rejects invalid input",
      "  error: expected 2 to equal 3",
      "      at TestContext.<anonymous> (tests/example.test.ts:10:5)",
      "      at Test.run (node:internal/test_runner/test:632:9)",
      "ℹ fail 1",
    ].join("\n"),
  );
  assert.doesNotMatch(pruned, /✔ passes/);
  assert.doesNotMatch(pruned, /duration_ms/);
});

test("cancelled, truncated, and non-test messages remain unchanged", () => {
  const cancelled = bashExecution("npm test", "cancelled output", { cancelled: true });
  const truncated = bashExecution("npm test", "partial output", { truncated: true });
  const other = bashExecution("npm run lint", "lint output", { exitCode: 0 });
  const messages = [cancelled, truncated, other];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
  assert.notEqual(result, messages);
});

test("diagnostic-only failures retain a bounded context around the error", () => {
  const output = [
    "runner output",
    "1) suite rejects invalid input:",
    "  AssertionError: expected 2 to equal 3",
    "failure context below",
    "runner footer",
  ].join("\n");

  const result = pruneTestContext([bashExecution("npm test", output, { exitCode: 1 })]);

  assert.equal(
    (result[0] as { output: string }).output,
    [
      "1) suite rejects invalid input:",
      "  AssertionError: expected 2 to equal 3",
      "failure context below",
    ].join("\n"),
  );
});

test("failed tests without a reliable failure block retain the original output", () => {
  const output = "runner failed before reporting a test case";
  const messages = [bashExecution("npm test", output, { exitCode: 1 })];

  const result = pruneTestContext(messages);

  assert.deepEqual(result, messages);
  assert.notEqual(result, messages);
});

test("the extension registers the context transformation without involving a model", async () => {
  let handler: ((event: { messages: unknown[] }) => unknown) | undefined;
  const pi = {
    on(event: string, callback: (event: { messages: unknown[] }) => unknown): void {
      assert.equal(event, "context");
      handler = callback;
    },
  };

  contextPruner(pi as never);
  assert.ok(handler);

  const result = await handler!({ messages: [bashExecution("npm test", successfulNodeTest)] });
  assert.deepEqual(result, { messages: [bashExecution("npm test", "All tests passed")] });
});
