// shared.ts 提取助手直接测试（E：positionalWords / firstWord / subcommandArgs 语义契约）
// 三个 helper 的 `-`/`--` 语义是 E 收敛的正确性基础，直接锁定，防等价性漂移。

import assert from "node:assert/strict";
import test from "node:test";
import { firstWord, positionalWords, subcommandArgs } from "../../../src/access-gate/command-semantics/adapters/shared";

const arg = (value: string) => ({ value });

test("positionalWords: dashIsOption=false treats - as positional (engine semantics)", () => {
  const args = [arg("-x"), arg("-"), arg("--"), arg("-y"), arg("file")];
  // -x 选项跳过；- 位置词；-- 终止选项区后 -y 也是位置参数
  assert.deepEqual(positionalWords(args, { dashIsOption: false }).map((a) => a.value), ["-", "-y", "file"]);
});

test("positionalWords: dashIsOption=true skips - (git checkout - semantics)", () => {
  const args = [arg("-x"), arg("-"), arg("file")];
  assert.deepEqual(positionalWords(args, { dashIsOption: true }).map((a) => a.value), ["file"]);
});

test("positionalWords: -- terminates the option region", () => {
  const args = [arg("--"), arg("-x"), arg("file")];
  assert.deepEqual(positionalWords(args, { dashIsOption: true }).map((a) => a.value), ["-x", "file"]);
});

test("firstWord: first non-option word, empty when none", () => {
  assert.equal(firstWord([arg("-v"), arg("build"), arg("x")], { dashIsOption: true }), "build");
  assert.equal(firstWord([], { dashIsOption: false }), "");
});

test("subcommandArgs: engine positional preferred, falls back to first raw token", () => {
  assert.deepEqual(subcommandArgs([arg("build")], [arg("-v"), arg("build")]), [{ value: "build" }]);
  assert.deepEqual(subcommandArgs([], [arg("--version")]), [{ value: "--version" }]);
  assert.deepEqual(subcommandArgs([], []), []);
});
