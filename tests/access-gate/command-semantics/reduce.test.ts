// T-062 Phase 2 / Task 6: reduceToFlat（文本归约 + 重 lex 自校验）
// 文本相等性断言（判定==展开逐条对账）由 unroll-corpus.test.ts 的合法子集表承载——
// 此处只保留 corpus 表无法表达的输入结构用例：值转义回环、null 兜底路径与原地替换。

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { verifyLoopScope, type LoopLimits } from "../../../src/access-gate/command-semantics/loop";
import { reduceToFlat } from "../../../src/access-gate/command-semantics/reduce";
import type { LoopScope } from "../../../src/access-gate/shell-parse/types";

const BIG: LoopLimits = { maxCommands: 100_000 };

/** 解析命令、verify 全部 scope、对齐 pair 调 reduceToFlat。 */
function flat(cmd: string): ReturnType<typeof reduceToFlat> {
  const { program } = parse(lex(cmd).tokens);
  assert.equal(program.unsafeSyntax, null, `unexpected parse error: ${cmd}`);
  const pairs = program.loopScopes.map((s) => {
    const r = verifyLoopScope(s, BIG);
    assert.ok(r, `scope not modelable for reduce test: ${cmd}`);
    return { scope: s, values: r!.wordValues };
  });
  return reduceToFlat(cmd, program.loopScopes, pairs);
}

function text(cmd: string): string {
  const r = flat(cmd);
  assert.ok(r, `reduce returned null for: ${cmd}`);
  return r!.text;
}

test("reduce: values with quote/dollar/backtick escape and reparse to the same arg", () => {
  const cmd = "for f in 'a\"b' 'x$y' 'z`w'; do touch \"$f\"; done";
  const t = text(cmd);
  const { program } = parse(lex(t).tokens);
  const args = program.commands.flatMap((c) => c.args.map((a) => a.value));
  assert.deepEqual(args, ["a\"b", "x$y", "z`w"]);
});

test("reduce: newline-containing value round-trips literally inside quotes (判定==展开)", () => {
  // 双引号区段内真实换行是字面：值不映射成反斜杠文本，重 lex 后词值不变
  const cmd = "for f in 'a\nb'; do touch \"$f\"; done";
  const t = text(cmd);
  assert.equal(t, "touch \"a\nb\"");
  const { program } = parse(lex(t).tokens);
  assert.deepEqual(program.commands[0]!.args.map((a) => a.value), ["a\nb"]);
});

test("reduce: body command redirect target with loop var replaces in place", () => {
  assert.equal(text("for f in a; do echo x > \"$f\"; done"), "echo x > \"a\"");
});

test("reduce: residual dynamic fails self-validation and returns null", () => {
  // 裸 $f（未引号）不会被替换，重解析仍有动态 → 自校验 null（verify 已拒，此处直接调 reduce 验证兜底）
  const { program } = parse(lex("for f in a; do echo $f; done").tokens);
  const scope = program.loopScopes[0]! as LoopScope;
  const r = reduceToFlat("for f in a; do echo $f; done", [scope], [{ scope, values: ["a"] }]);
  assert.equal(r, null);
});

test("reduce: &> loop-level redirect is not modeled (null)", () => {
  const { program } = parse(lex("for f in a; do echo x; done &> out").tokens);
  const scope = program.loopScopes[0]! as LoopScope;
  const r = reduceToFlat("for f in a; do echo x; done &> out", [scope], [{ scope, values: ["a"] }]);
  assert.equal(r, null);
});

test("reduce: empty-body scope fails closed with null (no throw)", () => {
  const { program } = parse(lex("for f in a; do ; done").tokens);
  const scope = program.loopScopes[0]! as LoopScope;
  assert.equal(scope.body.length, 0);
  const r = reduceToFlat("for f in a; do ; done", [scope], [{ scope, values: ["a"] }]);
  assert.equal(r, null);
});