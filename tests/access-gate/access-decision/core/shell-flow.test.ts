import assert from "node:assert/strict";
import test from "node:test";
import { parseShellFlow } from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/flow";

const bashContract = {
  source: "bash-manual",
  referenceStatus: "independently-observed",
} as const;

test("and-or flow preserves command order and operator spans", () => {
  assert.deepEqual(parseShellFlow("false && printf B || printf C"), {
    kind: "complete",
    commands: [
      {
        kind: "simple",
        words: [{ text: "false", start: 0, end: 5, quote: "bare" }],
      },
      {
        kind: "simple",
        words: [
          { text: "printf", start: 9, end: 15, quote: "bare" },
          { text: "B", start: 16, end: 17, quote: "bare" },
        ],
      },
      {
        kind: "simple",
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
        kind: "simple",
        words: [{ text: "cd", start: 0, end: 2, quote: "bare" }, { text: "project", start: 3, end: 10, quote: "bare" }],
      },
      {
        kind: "simple",
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

test("background operators remain outside the supported flow subset", () => {
  assert.deepEqual(parseShellFlow("cat README.md &"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 14, end: 15 },
    resourceClass: "syntax",
  });
});

test("bounded two-stage pipeline is parsed with upstream and downstream commands", () => {
  assert.deepEqual(parseShellFlow("cat README.md | head"), {
    kind: "complete",
    commands: [
      {
        kind: "pipeline",
        upstream: {
          words: [
            { text: "cat", start: 0, end: 3, quote: "bare" },
            { text: "README.md", start: 4, end: 13, quote: "bare" },
          ],
        },
        downstream: {
          words: [
            { text: "head", start: 16, end: 20, quote: "bare" },
          ],
        },
        pipe: { text: "|", start: 14, end: 15, quote: "bare" },
      },
    ],
    operators: [],
  });
});

test("pipeline rejects multi-stage pipelines with depth greater than two", () => {
  assert.deepEqual(parseShellFlow("cat README.md | head | grep foo"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 21, end: 22 },
    resourceClass: "syntax",
  });
});

test("pipeline rejects internal cd commands fail-closed", () => {
  assert.deepEqual(parseShellFlow("cd project | head"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 11, end: 12 },
    resourceClass: "syntax",
  });
  assert.deepEqual(parseShellFlow("cat README.md | cd project"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 14, end: 15 },
    resourceClass: "syntax",
  });
});

test("pipeline rejects empty upstream or downstream commands", () => {
  assert.deepEqual(parseShellFlow("| head"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 0, end: 1 },
    resourceClass: "syntax",
  });
  assert.deepEqual(parseShellFlow("cat README.md |"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 14, end: 15 },
    resourceClass: "syntax",
  });
});

test("pipeline within and-or flow preserves outer operator ordering", () => {
  assert.deepEqual(parseShellFlow("cat README.md | head && printf done"), {
    kind: "complete",
    commands: [
      {
        kind: "pipeline",
        upstream: {
          words: [
            { text: "cat", start: 0, end: 3, quote: "bare" },
            { text: "README.md", start: 4, end: 13, quote: "bare" },
          ],
        },
        downstream: {
          words: [
            { text: "head", start: 16, end: 20, quote: "bare" },
          ],
        },
        pipe: { text: "|", start: 14, end: 15, quote: "bare" },
      },
      {
        kind: "simple",
        words: [
          { text: "printf", start: 24, end: 30, quote: "bare" },
          { text: "done", start: 31, end: 35, quote: "bare" },
        ],
      },
    ],
    operators: [
      { kind: "and", start: 21, end: 23 },
    ],
  });
});
