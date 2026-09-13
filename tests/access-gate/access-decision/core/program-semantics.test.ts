import assert from "node:assert/strict";
import test from "node:test";
import {
  firstNonOptionWord,
  hasUnknownOption,
  scanOptionWords,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/option-scanner";
import type { ShellWord } from "../../../../packages/access-gate/src/access-gate/access-decision/core/index";

function word(text: string, start: number): ShellWord {
  return Object.freeze({ text, start, end: start + text.length, quote: "bare" as const });
}

test("option scanner handles separated, equals, attached, and terminator forms", () => {
  const words = [
    word("--prefix", 0),
    word("deps", 9),
    word("--cache=/tmp/cache", 14),
    word("-Csrc", 34),
    word("--", 39),
    word("--not-an-option", 42),
  ];
  const occurrences = scanOptionWords(words, {
    valueOptions: new Set(["--prefix", "--cache"]),
    attachedOptions: new Set(["-C"]),
  });

  assert.deepEqual(occurrences.map(({ name, index, value, valueIndex, attached }) => ({
    name,
    index,
    value: value?.text,
    valueIndex,
    attached,
  })), [
    { name: "--prefix", index: 0, value: "deps", valueIndex: 1, attached: false },
    { name: "--cache", index: 2, value: "/tmp/cache", valueIndex: 2, attached: true },
    { name: "-C", index: 3, value: "src", valueIndex: 3, attached: true },
  ]);
});

test("option scanner finds the first positional and does not classify consumed values as unknown", () => {
  const words = [word("--prefix", 0), word("deps", 9), word("view", 14), word("--", 19), word("--literal", 22)];

  assert.equal(firstNonOptionWord(words, new Set(["--prefix"]))?.text, "view");
  assert.equal(hasUnknownOption(words, new Set(["--prefix"]), new Set(["--prefix"])), false);
});

test("option scanner exposes a missing separated value instead of consuming the next option", () => {
  const words = [word("--depth", 0), word("--unknown", 9), word("remote", 19)];
  const occurrences = scanOptionWords(words, { valueOptions: new Set(["--depth"]) });

  assert.equal(occurrences[0]?.missingValue, true);
  assert.equal(occurrences[0]?.value, undefined);
  assert.equal(occurrences[1]?.name, "--unknown");
  assert.equal(hasUnknownOption(words, new Set(["--depth"]), new Set(["--depth"])), true);

  const terminal = scanOptionWords([word("--depth", 0)], { valueOptions: new Set(["--depth"]) });
  assert.equal(terminal[0]?.missingValue, true);
  assert.equal(hasUnknownOption([word("--depth", 0)], new Set(["--depth"]), new Set(["--depth"])), true);

  const emptyAttached = scanOptionWords([word("--depth=", 0)], { valueOptions: new Set(["--depth"]) });
  assert.equal(emptyAttached[0]?.missingValue, true);
  assert.equal(emptyAttached[0]?.value, undefined);
});
