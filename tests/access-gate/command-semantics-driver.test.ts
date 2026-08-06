// tests/access-gate/command-semantics-driver.test.ts
// 驱动自测：正向确认 + 负向控制（防驱动静默全过——表格行被错误地全部放行）

import test from "node:test";
import assert from "node:assert/strict";
import { assertSemanticCase, analyzeNormalizedCommand } from "./helpers";

test("driver: matching case passes", () => {
  assertSemanticCase({
    cmd: "rm x",
    name: "ok",
    cls: "modify",
    effects: ["delete"],
    intents: [{ operation: "write", rawPath: "x" }],
  });
});

test("driver: rejects wrong class", () => {
  assert.throws(
    () => assertSemanticCase({ cmd: "rm x", name: "bad", cls: "execute" }),
    /class/,
  );
});

test("driver: rejects missing effect", () => {
  assert.throws(
    () => assertSemanticCase({ cmd: "rm x", name: "bad", effects: ["network"] }),
    /effects missing network/,
  );
});

test("driver: rejects intents length mismatch", () => {
  assert.throws(
    () => assertSemanticCase({ cmd: "cp a b", name: "bad", intents: [{ operation: "read", rawPath: "a" }] }),
    /intents length/,
  );
});

test("driver: rejects intents field mismatch", () => {
  assert.throws(
    () => assertSemanticCase({ cmd: "rm x", name: "bad", intents: [{ operation: "write", rawPath: "wrong" }] }),
    /intents\[0\]\.rawPath/,
  );
});

test("driver: multi-cmd case asserts each command", () => {
  assertSemanticCase({ cmd: ["true", "false", "echo hi"], name: "noop", cls: "inspect" });
});

test("driver: normalize entry unwraps env wrapper", () => {
  assertSemanticCase({
    cmd: "env rm ~/.ssh/id_rsa",
    name: "normalized",
    analyze: analyzeNormalizedCommand,
    cls: "modify",
    intents: [{ operation: "write", rawPath: "~/.ssh/id_rsa" }],
  });
});
