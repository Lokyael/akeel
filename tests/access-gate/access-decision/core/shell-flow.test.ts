import assert from "node:assert/strict";
import test from "node:test";
import {
  parseShellFlow,
  reachableShellCommands,
  traceShellFlowCwds,
} from "../../../../src/access-gate/access-decision/core/index";

const bashContract = {
  source: "bash-manual",
  referenceStatus: "independently-observed",
} as const;

test("and-or flow preserves command order and operator spans", () => {
  assert.deepEqual(parseShellFlow("false && printf B || printf C"), {
    kind: "complete",
    commands: [
      {
        words: [{ text: "false", start: 0, end: 5, quote: "bare" }],
      },
      {
        words: [
          { text: "printf", start: 9, end: 15, quote: "bare" },
          { text: "B", start: 16, end: 17, quote: "bare" },
        ],
      },
      {
        words: [
          { text: "printf", start: 21, end: 27, quote: "bare" },
          { text: "C", start: 28, end: 29, quote: "bare" },
        ],
      },
    ],
    operators: [
      { kind: "and", start: 6, end: 8 },
      { kind: "or", start: 18, end: 20 },
    ],
  });
  assert.equal(bashContract.referenceStatus, "independently-observed");
});

test("a sequence separator is represented without merging adjacent commands", () => {
  assert.deepEqual(parseShellFlow("cd project; cat README.md"), {
    kind: "complete",
    commands: [
      {
        words: [{ text: "cd", start: 0, end: 2, quote: "bare" }, { text: "project", start: 3, end: 10, quote: "bare" }],
      },
      {
        words: [
          { text: "cat", start: 12, end: 15, quote: "bare" },
          { text: "README.md", start: 16, end: 25, quote: "bare" },
        ],
      },
    ],
    operators: [{ kind: "sequence", start: 10, end: 11 }],
  });
  assert.equal(bashContract.source, "bash-manual");
});

test("pipelines and background operators remain outside the supported flow subset", () => {
  assert.deepEqual(parseShellFlow("cat README.md | head"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 14, end: 15 },
    resourceClass: "syntax",
  });
});

test("and-or reachability skips an unexecuted branch without losing the fallback", () => {
  const flow = parseShellFlow("false && cd /tmp || printf done");
  if (flow.kind === "reject") {
    assert.fail(`unexpected flow rejection: ${flow.code}`);
  }

  assert.deepEqual(reachableShellCommands(flow, [["failure"], ["success"], ["success"]]), [0, 2]);
});

test("a sequence always reaches the next command while retaining its own status", () => {
  const flow = parseShellFlow("false; printf done");
  if (flow.kind === "reject") {
    assert.fail(`unexpected flow rejection: ${flow.code}`);
  }

  assert.deepEqual(reachableShellCommands(flow, [["failure"], ["success"]]), [0, 1]);
});

test("mixed and-or reachability retains a direct left-success path", () => {
  const flow = parseShellFlow("cat input || false && printf done");
  if (flow.kind === "reject") {
    assert.fail(`unexpected flow rejection: ${flow.code}`);
  }

  assert.deepEqual(
    reachableShellCommands(flow, [["success", "failure"], ["failure"], ["success", "failure"]]),
    [0, 1, 2],
  );
});

test("an unexecuted cd does not change the cwd of an or fallback", () => {
  const flow = parseShellFlow("false && cd /tmp || printf done");
  if (flow.kind === "reject") {
    assert.fail(`unexpected flow rejection: ${flow.code}`);
  }

  assert.deepEqual(traceShellFlowCwds(flow, "/workspace", [["failure"], ["success"], ["success"]]), [
    { commandIndex: 0, cwd: "/workspace" },
    { commandIndex: 2, cwd: "/workspace" },
  ]);
});

test("branching cd paths preserve every reachable cwd at the join", () => {
  const flow = parseShellFlow("cd left || cd right; cat input.txt");
  if (flow.kind === "reject") {
    assert.fail(`unexpected flow rejection: ${flow.code}`);
  }

  const states = traceShellFlowCwds(
    flow,
    "/workspace",
    [["success", "failure"], ["success", "failure"], ["success", "failure"], ["success", "failure"]],
  );
  assert.ok(states);
  assert.deepEqual(
    [...states].sort((left, right) => left.commandIndex - right.commandIndex || left.cwd.localeCompare(right.cwd)),
    [
      { commandIndex: 0, cwd: "/workspace" },
      { commandIndex: 1, cwd: "/workspace" },
      { commandIndex: 2, cwd: "/workspace" },
      { commandIndex: 2, cwd: "/workspace/left" },
      { commandIndex: 2, cwd: "/workspace/right" },
    ],
  );
});

test("a successful cd changes the cwd only for commands reached afterward", () => {
  const flow = parseShellFlow("true && cd /tmp; cat README.md");
  if (flow.kind === "reject") {
    assert.fail(`unexpected flow rejection: ${flow.code}`);
  }

  assert.deepEqual(traceShellFlowCwds(flow, "/workspace", [["success"], ["success"], ["success"]]), [
    { commandIndex: 0, cwd: "/workspace" },
    { commandIndex: 1, cwd: "/workspace" },
    { commandIndex: 2, cwd: "/tmp" },
  ]);
});
