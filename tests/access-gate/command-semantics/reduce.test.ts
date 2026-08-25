// T-062 Phase 2 / Task 6: reduceToFlat（文本归约 + 重 lex 自校验）

import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { homedir } from "node:os";
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

/** 重 lex/parse 断言：命令数与动态标志。 */
function reparse(cmd: string): { commands: number; dynamic: boolean } {
  const { program } = parse(lex(cmd).tokens);
  return { commands: program.commands.length, dynamic: program.dynamic };
}

test("reduce: basic unroll is flat literals", () => {
  const cmd = "for f in a b; do cat \"$f\"; done";
  assert.equal(text(cmd), "cat \"a\"; cat \"b\"");
  const p = reparse(text(cmd));
  assert.equal(p.commands, 2);
  assert.equal(p.dynamic, false);
});

test("reduce: verbatim before/after with separators preserved", () => {
  assert.equal(text("cmd1; for f in a b; do x; done; cmd2"), "cmd1; x; x; cmd2");
});

test("reduce: constant prefix concatenation", () => {
  assert.equal(text("for f in a; do echo \"== $f\"; done"), "echo \"== a\"");
});

test("reduce: body && chain preserved between iterations", () => {
  assert.equal(text("for f in a b; do echo x && echo y; done"), "echo x && echo y; echo x && echo y");
});

test("reduce: post-done redirect truncates once then appends", () => {
  assert.equal(text("for f in a b; do touch \"$f\"; done > out"), "touch \"a\" > out; touch \"b\" >> out");
});

test("reduce: pre-do header redirect is remounted (truncate-once)", () => {
  assert.equal(text("for f in a b > out; do touch \"$f\"; done"), "touch \"a\" > out; touch \"b\" >> out");
});

test("reduce: pre-for leading redirect is remounted (I1)", () => {
  assert.equal(text("> out for f in a b; do echo x; done"), "echo x > out; echo x >> out");
});

test("reduce: fd-prefixed loop redirect keeps fd and appends on later iterations", () => {
  assert.equal(text("for f in a b; do echo \"$f\"; done 2> err"), "echo \"a\" 2> err; echo \"b\" 2>> err");
});

test("reduce: tilde word list expands to homedir absolute path", () => {
  const r = text("for f in ~/x; do touch \"$f\"; done");
  assert.equal(r, `touch "${join(homedir(), "x")}"`);
});

test("reduce: values with quote/dollar/backtick escape and reparse to the same arg", () => {
  const cmd = "for f in 'a\"b' 'x$y' 'z`w'; do touch \"$f\"; done";
  const t = text(cmd);
  const { program } = parse(lex(t).tokens);
  const args = program.commands.flatMap((c) => c.args.map((a) => a.value));
  assert.deepEqual(args, ["a\"b", "x$y", "z`w"]);
});

test("reduce: empty string value keeps an empty argument", () => {
  assert.equal(text("for f in a \"\" b; do touch \"$f\"; done"), "touch \"a\"; touch \"\"; touch \"b\"");
});

test("reduce: env-assignment prefix command stays as verbatim", () => {
  assert.equal(text("FOO=1; for f in a b; do touch \"$f\"; done"), "FOO=1; touch \"a\"; touch \"b\"");
});

test("reduce: body command redirect target with loop var replaces in place", () => {
  assert.equal(text("for f in a; do echo x > \"$f\"; done"), "echo x > \"a\"");
});

test("reduce: fdDuplicate in body stays unchanged", () => {
  assert.equal(text("for f in a; do echo \"$f\" 2>&1; done"), "echo \"a\" 2>&1");
});

test("reduce: multiple modelable scopes in one pass (single instance)", () => {
  assert.equal(
    text("for a in x; do touch \"$a\"; done; for b in y; do touch \"$b\"; done"),
    "touch \"x\"; touch \"y\"",
  );
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

test("reduce: newline-containing value round-trips literally inside quotes (判定==展开)", () => {
  // 双引号区段内真实换行是字面：值不映射成反斜杠文本，重 lex 后词值不变
  const cmd = "for f in 'a\nb'; do touch \"$f\"; done";
  const t = text(cmd);
  assert.equal(t, "touch \"a\nb\"");
  const { program } = parse(lex(t).tokens);
  assert.deepEqual(program.commands[0]!.args.map((a) => a.value), ["a\nb"]);
});