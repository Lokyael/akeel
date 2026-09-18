import assert from "node:assert/strict";
import test from "node:test";
import type { ShellWord } from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/language";
import {
  parseSegment,
  type SegmentContract,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/segment-parser";

function word(text: string, start = 0): ShellWord {
  return Object.freeze({ text, start, end: start + text.length, quote: "bare" as const });
}

type CommonKey = "config" | "output" | "verbose" | "force" | "help" | "dir";

const contract: SegmentContract<CommonKey> = Object.freeze({
  options: Object.freeze([
    { key: "config" as const, names: ["--config", "-c"], arity: "required" as const },
    { key: "output" as const, names: ["--output", "-o"], arity: "required" as const },
    { key: "dir" as const, names: ["-C"], arity: "required" as const, forms: ["separate" as const, "equals" as const, "attached" as const] },
    { key: "verbose" as const, names: ["--verbose", "-v"], arity: "flag" as const },
    { key: "force" as const, names: ["--force", "-f"], arity: "flag" as const },
    { key: "help" as const, names: ["--help", "-h"], arity: "flag" as const },
  ]),
});

test("segment parser handles separated, equals, attached, and flag forms", () => {
  const words = [
    word("-v", 0),
    word("--config", 3),
    word("pyproject.toml", 12),
    word("-ooutput.txt", 27),
    word("-Cdir", 40),
    word("src/main.ts", 46),
  ];

  const result = parseSegment(words, contract);
  assert.equal(result.kind, "complete");
  if (result.kind === "complete") {
    assert.deepEqual(result.options.map((o) => ({
      kind: o.kind,
      key: o.key,
      name: o.name,
      value: o.kind === "valued" ? o.value.text : undefined,
    })), [
      { kind: "flag", key: "verbose", name: "-v", value: undefined },
      { kind: "valued", key: "config", name: "--config", value: "pyproject.toml" },
      { kind: "valued", key: "output", name: "-o", value: "output.txt" },
      { kind: "valued", key: "dir", name: "-C", value: "dir" },
    ]);
    assert.deepEqual(result.operands.map((w) => w.text), ["src/main.ts"]);
    assert.deepEqual(result.pathspecOperands, []);
  }
});

test("segment parser unpacks short flag clusters and attached values", () => {
  const words = [word("-vf", 0), word("-Cpath/to/dir", 4), word("file.txt", 18)];

  const result = parseSegment(words, contract);
  assert.equal(result.kind, "complete");
  if (result.kind === "complete") {
    assert.deepEqual(result.options.map((o) => ({ key: o.key, name: o.name })), [
      { key: "verbose", name: "-v" },
      { key: "force", name: "-f" },
      { key: "dir", name: "-C" },
    ]);
    assert.deepEqual(result.operands.map((w) => w.text), ["file.txt"]);
  }
});

test("segment parser separates pathspec operands strictly after --", () => {
  const words = [
    word("--verbose", 0),
    word("target", 10),
    word("--", 17),
    word("path1.ts", 20),
    word("--not-an-option", 29),
  ];

  const result = parseSegment(words, contract);
  assert.equal(result.kind, "complete");
  if (result.kind === "complete") {
    assert.deepEqual(result.options.map((o) => o.key), ["verbose"]);
    assert.deepEqual(result.operands.map((w) => w.text), ["target"]);
    assert.deepEqual(result.pathspecOperands.map((w) => w.text), ["path1.ts", "--not-an-option"]);
  }
});

test("segment parser detects missing value for separated option at end or before option", () => {
  const endResult = parseSegment([word("--config", 0)], contract);
  assert.equal(endResult.kind, "malformed");
  if (endResult.kind === "malformed") {
    assert.equal(endResult.reason, "missing-value");
    assert.equal(endResult.word.text, "--config");
  }

  const beforeOptResult = parseSegment([word("--config", 0), word("--verbose", 9)], contract);
  assert.equal(beforeOptResult.kind, "malformed");
  if (beforeOptResult.kind === "malformed") {
    assert.equal(beforeOptResult.reason, "missing-value");
    assert.equal(beforeOptResult.word.text, "--config");
  }

  const emptyEqualsResult = parseSegment([word("--config=", 0)], contract);
  assert.equal(emptyEqualsResult.kind, "malformed");
  if (emptyEqualsResult.kind === "malformed") {
    assert.equal(emptyEqualsResult.reason, "missing-value");
    assert.equal(emptyEqualsResult.word.text, "--config=");
  }
});

test("segment parser truncates and produces indeterminate on unknown option", () => {
  const words = [
    word("-v", 0),
    word("--unknown", 3),
    word("subcommand", 13),
    word("file.txt", 24),
  ];

  const result = parseSegment(words, contract);
  assert.equal(result.kind, "indeterminate");
  if (result.kind === "indeterminate") {
    assert.equal(result.reason, "unknown-option");
    assert.equal(result.word.text, "--unknown");
    assert.deepEqual(result.options.map((o) => o.key), ["verbose"]);
    assert.deepEqual(result.operands, []);
    assert.deepEqual(result.remainder.map((w) => w.text), ["--unknown", "subcommand", "file.txt"]);
  }
});

test("segment parser supports stopAtFirstOperand for subcommand routing", () => {
  const words = [
    word("-v", 0),
    word("workspace", 3),
    word("create", 13),
    word("--help", 20),
  ];

  const result = parseSegment(words, contract, { stopAtFirstOperand: true });
  assert.equal(result.kind, "complete");
  if (result.kind === "complete") {
    assert.deepEqual(result.options.map((o) => o.key), ["verbose"]);
    assert.deepEqual(result.operands.map((w) => w.text), ["workspace"]);
    assert.deepEqual(result.remainder.map((w) => w.text), ["create", "--help"]);
  }
});

test("segment parser supports matchExtraOption for custom patterns like numeric flags", () => {
  const numericContract: SegmentContract<CommonKey | "numericLimit"> = {
    options: contract.options,
    matchExtraOption: (token) => {
      if (/^-[1-9][0-9]*$/u.test(token.text)) {
        return { key: "numericLimit", name: token.text };
      }
      return undefined;
    },
  };

  const words = [word("-5", 0), word("--verbose", 3), word("src/file.ts", 13)];
  const result = parseSegment(words, numericContract);
  assert.equal(result.kind, "complete");
  if (result.kind === "complete") {
    assert.equal(result.options[0]?.key, "numericLimit");
    assert.equal(result.options[0]?.name, "-5");
    assert.equal(result.options[1]?.key, "verbose");
    assert.deepEqual(result.operands.map((w) => w.text), ["src/file.ts"]);
  }
});

test("segment parser precisely computes source anchors for attached and equals short options", () => {
  // -Cdir:  start=0, length=5. 'd' is at index 2
  const attachedRes = parseSegment([word("-Cdir", 0)], contract);
  assert.equal(attachedRes.kind, "complete");
  if (attachedRes.kind === "complete") {
    const opt = attachedRes.options[0];
    assert.equal(opt?.kind, "valued");
    if (opt?.kind === "valued") {
      assert.equal(opt.value.text, "dir");
      assert.equal(opt.value.start, 2);
      assert.equal(opt.value.end, 5);
    }
  }

  // -C=dir: start=6, length=6. '-' is 6, 'C' is 7, '=' is 8, 'd' is at index 9
  const equalsRes = parseSegment([word("-C=dir", 6)], contract);
  assert.equal(equalsRes.kind, "complete");
  if (equalsRes.kind === "complete") {
    const opt = equalsRes.options[0];
    assert.equal(opt?.kind, "valued");
    if (opt?.kind === "valued") {
      assert.equal(opt.value.text, "dir");
      assert.equal(opt.value.start, 9);
      assert.equal(opt.value.end, 12);
    }
  }

  // Cluster: -vC=dir: start=0, length=7. '-' is 0, 'v' is 1, 'C' is 2, '=' is 3, 'd' is at index 4
  const clusterEqualsRes = parseSegment([word("-vC=dir", 0)], contract);
  assert.equal(clusterEqualsRes.kind, "complete");
  if (clusterEqualsRes.kind === "complete") {
    const opt = clusterEqualsRes.options[1];
    assert.equal(opt?.kind, "valued");
    if (opt?.kind === "valued") {
      assert.equal(opt.value.text, "dir");
      assert.equal(opt.value.start, 4);
      assert.equal(opt.value.end, 7);
    }
  }
});

test("segment parser strictly enforces separate, equals, and attached form constraints", () => {
  type StrictKey = "attachedOnly" | "equalsOnly" | "separateOnly";
  const strictContract: SegmentContract<StrictKey> = {
    options: [
      { key: "attachedOnly", names: ["-A"], arity: "required", forms: ["attached"] },
      { key: "equalsOnly", names: ["-E"], arity: "required", forms: ["equals"] },
      { key: "separateOnly", names: ["-S"], arity: "required", forms: ["separate"] },
    ],
  };

  // attachedOnly accepts -Aval, rejects -A=val and separated
  assert.equal(parseSegment([word("-Aval", 0)], strictContract).kind, "complete");
  const equalsRejected = parseSegment([word("-A=val", 0)], strictContract);
  assert.equal(equalsRejected.kind, "malformed");
  if (equalsRejected.kind === "malformed") {
    assert.equal(equalsRejected.reason, "unsupported-form");
  }
  const separateRejectedForA = parseSegment([word("-A", 0), word("val", 3)], strictContract);
  assert.equal(separateRejectedForA.kind, "malformed");
  if (separateRejectedForA.kind === "malformed") {
    assert.equal(separateRejectedForA.reason, "unsupported-form");
  }

  // equalsOnly accepts -E=val, rejects -Eval and separated
  assert.equal(parseSegment([word("-E=val", 0)], strictContract).kind, "complete");
  const attachedRejected = parseSegment([word("-Eval", 0)], strictContract);
  assert.equal(attachedRejected.kind, "malformed");
  if (attachedRejected.kind === "malformed") {
    assert.equal(attachedRejected.reason, "unsupported-form");
  }
  const separateRejectedForE = parseSegment([word("-E", 0), word("val", 3)], strictContract);
  assert.equal(separateRejectedForE.kind, "malformed");
  if (separateRejectedForE.kind === "malformed") {
    assert.equal(separateRejectedForE.reason, "unsupported-form");
  }

  // separateOnly accepts -S val, rejects -Sval and -S=val
  assert.equal(parseSegment([word("-S", 0), word("val", 3)], strictContract).kind, "complete");
  const attachedRejectedForS = parseSegment([word("-Sval", 0)], strictContract);
  assert.equal(attachedRejectedForS.kind, "malformed");
  const equalsRejectedForS = parseSegment([word("-S=val", 0)], strictContract);
  assert.equal(equalsRejectedForS.kind, "malformed");
});

