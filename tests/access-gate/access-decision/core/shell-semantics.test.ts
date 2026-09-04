import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeShellCommand,
  shellCommandOutcomes,
} from "../../../../src/access-gate/access-decision/core/index";

const policyContract = {
  source: "new-policy",
  referenceStatus: "newly-adopted",
} as const;

test("true and false have deterministic command outcomes without execution", () => {
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("true")), ["success"]);
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("false")), ["failure"]);
  assert.equal(policyContract.source, "new-policy");
});

test("redirection makes otherwise deterministic commands outcome-uncertain", () => {
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("true < missing")), ["success", "failure"]);
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("false > output")), ["success", "failure"]);
});

test("filesystem-dependent commands retain both possible outcomes", () => {
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("cd /tmp")), ["success", "failure"]);
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("cat README.md")), ["success", "failure"]);
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("a supported inspection command has explicit class and read effect", () => {
  assert.deepEqual(analyzeShellCommand("cat README.md"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "README.md", role: "source" }],
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("a wrapper preserves the underlying command semantics", () => {
  assert.deepEqual(analyzeShellCommand("env -i cat README.md"), {
    kind: "complete",
    executable: "cat",
    wrappers: ["env"],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "README.md", role: "source" }],
  });
  assert.equal(policyContract.source, "new-policy");
});

test("a redirection contributes a write effect and target path", () => {
  assert.deepEqual(analyzeShellCommand("printf ok > result.txt"), {
    kind: "complete",
    executable: "printf",
    wrappers: [],
    commandClass: "inspect",
    effects: ["write"],
    paths: [{ text: "result.txt", role: "target" }],
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("an input redirection contributes a read source path", () => {
  assert.deepEqual(analyzeShellCommand("cat < input.txt"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "input.txt", role: "source" }],
  });
  assert.equal(policyContract.source, "new-policy");
});

test("source and target paths retain their command order", () => {
  assert.deepEqual(analyzeShellCommand("cat input.txt > output.txt"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read", "write"],
    paths: [
      { text: "input.txt", role: "source" },
      { text: "output.txt", role: "target" },
    ],
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});
