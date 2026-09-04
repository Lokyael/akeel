import assert from "node:assert/strict";
import test from "node:test";
import { scanShellWords } from "../../../../src/access-gate/access-decision/core/index";

const bashContract = {
  source: "bash-manual",
  referenceStatus: "independently-observed",
} as const;

test("supported shell words decode quotes and escapes while retaining source coordinates", () => {
  const result = scanShellWords("printf '%s' \"hello world\" file\\ name");

  assert.deepEqual(result, {
    kind: "complete",
    words: [
      { text: "printf", start: 0, end: 6, quote: "bare" },
      { text: "%s", start: 7, end: 11, quote: "single" },
      { text: "hello world", start: 12, end: 25, quote: "double" },
      { text: "file name", start: 26, end: 36, quote: "escaped" },
    ],
  });
  assert.equal(bashContract.referenceStatus, "independently-observed");
});

test("an unquoted tilde prefix remains expanded across a later escape", () => {
  assert.deepEqual(scanShellWords("~/secret\\ file"), {
    kind: "complete",
    words: [{ text: "~/secret file", start: 0, end: 14, quote: "escaped", pathKind: "home-relative" }],
  });
});

test("quoted and escaped tildes remain literal path words", () => {
  const result = scanShellWords("~/x \"~/x\" \\~/x");

  assert.deepEqual(result, {
    kind: "complete",
    words: [
      { text: "~/x", start: 0, end: 3, quote: "bare", pathKind: "home-relative" },
      { text: "~/x", start: 4, end: 9, quote: "double", pathKind: "literal" },
      { text: "~/x", start: 10, end: 14, quote: "escaped", pathKind: "literal" },
    ],
  });
  assert.equal(bashContract.source, "bash-manual");
});

test("dynamic expansions are rejected instead of being guessed", () => {
  assert.deepEqual(scanShellWords("printf '%s' \"$HOME\""), {
    kind: "reject",
    code: "dynamic-value",
    anchor: { start: 12, end: 19 },
    resourceClass: "syntax",
  });
});
