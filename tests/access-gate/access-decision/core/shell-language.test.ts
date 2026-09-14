import assert from "node:assert/strict";
import test from "node:test";
import { scanShellWords } from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/language";

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

test("ASCII control characters are rejected as unsupported syntax", () => {
  for (const input of ["mkdir /tmp/x\rVERIFIED", "cat 'file\rname'", "cat file\bname", "echo \x1b[31mred"]) {
    const result = scanShellWords(input);
    assert.equal(result.kind, "reject", input);
    if (result.kind === "reject") {
      assert.equal(result.code, "unsupported-syntax", input);
    }
  }
});

test("double quote escaping follows POSIX rules and retains non-special backslashes", () => {
  const result = scanShellWords('cat "foo\\bar" "foo\\"bar" "foo\\\\bar"');
  assert.deepEqual(result, {
    kind: "complete",
    words: [
      { text: "cat", start: 0, end: 3, quote: "bare" },
      { text: "foo\\bar", start: 4, end: 13, quote: "double" },
      { text: 'foo"bar', start: 14, end: 24, quote: "double" },
      { text: "foo\\bar", start: 25, end: 35, quote: "double" },
    ],
  });
});
