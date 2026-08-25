// T-062 P1T1: region pass（for 作用域 + opaque 区 + 边界关键字守卫）

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import type { ShellProgram } from "../../../src/access-gate/shell-parse/types";

function parseInput(input: string): { program: ShellProgram; error: string | null } {
  return parse(lex(input).tokens);
}

test("region: for loop yields loopScopes with body commands only (for/do/done consumed)", () => {
  const { program, error } = parseInput("for f in a b c; do echo x; done");
  assert.equal(error, null);
  assert.equal(program.commands.length, 1);
  assert.equal(program.commands[0]!.executable?.value, "echo");
  assert.equal(program.loopScopes.length, 1);
  const scope = program.loopScopes[0]!;
  assert.equal(scope.variable.value, "f");
  assert.deepEqual(scope.words.map((w) => w.value), ["a", "b", "c"]);
  assert.equal(scope.hasIn, true);
  assert.equal(scope.body.length, 1);
  assert.equal(scope.body[0]!.executable?.value, "echo");
});

test("region: empty body loop still recorded (structural rejection relies on list, not tags)", () => {
  const { program } = parseInput("for f in a; do ; done");
  assert.equal(program.loopScopes.length, 1);
  assert.equal(program.commands.length, 0);
});

test("region: quoted for is a command-position word, do closes nothing (G6)", () => {
  // `'for'` 引号化 → 不是保留字：首组是普通命令（for），do 无开放范围 → 语法错（与 bash 一致）
  const { error: p2error } = parseInput("echo for f in a; do x; done");
  assert.equal(p2error, "syntax error near do"); // G6：无开放范围的组首 do
  const { error } = parseInput("'for' f in a; do echo x; done");
  assert.equal(error, "syntax error near do");
});

test("region: echo done inside body does not close the loop; stray done closes", () => {
  const { program, error } = parseInput("for f in a; do echo done; done");
  assert.equal(error, null);
  assert.equal(program.loopScopes.length, 1);
  assert.equal(program.loopScopes[0]!.body.length, 1);
});

test("region: second in is a list element; unquoted do terminates the word list (H2)", () => {
  const { program } = parseInput("for f in a in b; do echo; done");
  assert.deepEqual(program.loopScopes[0]!.words.map((w) => w.value), ["a", "in", "b"]);
  const { program: p2 } = parseInput("for f in do; do echo; done");
  assert.deepEqual(p2.loopScopes[0]!.words, []);
  const { program: p3 } = parseInput("for f in \"do\"; do echo; done");
  assert.deepEqual(p3.loopScopes[0]!.words.map((w) => w.value), ["do"]);
});

test("region: nested do/done pair correctly (inner loop independent)", () => {
  const { program, error } = parseInput("for a in 1; do for b in 2; do echo x; done; done");
  assert.equal(error, null);
  assert.equal(program.loopScopes.length, 2);
  const outer = program.loopScopes.find((s) => s.variable.value === "a")!;
  assert.ok(outer);
  assert.equal(outer.body.length, 1);
  const inner = program.loopScopes.find((s) => s.variable.value === "b")!;
  assert.ok(inner);
  assert.equal(inner.variable.value, "b");
  assert.equal(inner.body.length, 1);
});

test("region: if/while/case become single opaqueRegions (deep consumption G9, position-aware close I11)", () => {
  const { program } = parseInput("if true; then ls; fi");
  assert.deepEqual(program.opaqueRegions.map((o) => o.keyword), ["if"]);
  assert.equal(program.commands.length, 0);
  const { program: p2 } = parseInput("if true; then echo \"fi\"; fi");
  assert.equal(p2.opaqueRegions.length, 1);
  const { program: p3 } = parseInput("while true; do echo done; done");
  assert.equal(p3.opaqueRegions.length, 1);
  assert.equal(p3.opaqueRegions[0]!.keyword, "while");
  const { program: p4 } = parseInput("( echo a; echo b )");
  assert.equal(p4.opaqueRegions.length, 1);
  assert.equal(p4.opaqueRegions[0]!.keyword, "(");
  assert.equal(p4.commands.length, 0);
  const { program: p5 } = parseInput("case a in x) echo;; esac");
  assert.equal(p5.opaqueRegions.length, 1);
  assert.equal(p5.opaqueRegions[0]!.keyword, "case");
});

test("region: C-style for (( is opaque (non-identifier header), consumed to done", () => {
  const { program, error } = parseInput("for ((i=0; i<3; i++)); do echo x; done");
  assert.equal(program.opaqueRegions.some((o) => o.keyword === "for ((…)"), true);
  assert.equal(program.commands.length, 0);
  assert.equal(program.loopScopes.length, 0);
  assert.equal(error, null);
});

test("region: header pipe/and/or is a syntax error (V1)", () => {
  for (const cmd of ["for f in a | b; do x; done", "for f in a && b; do x; done", "for f in a || b; do x; done"]) {
    const { error } = parseInput(cmd);
    assert.equal(error, "invalid for header", cmd);
  }
});

test("region: for words without in is a syntax error; missing done/fi is unterminated", () => {
  assert.equal(parseInput("for f a b; do x; done").error, "invalid for header");
  assert.equal(parseInput("for f in a; do echo x").error, "unterminated for");
  assert.equal(parseInput("if true; then ls").error, "unterminated fi");
});

test("region: assignment-prefixed for is a syntax error (R2); `FOO=1; for` is fine", () => {
  assert.equal(parseInput("FOO=1 for f in a; do x; done").error, "invalid for header");
  const { program, error } = parseInput("FOO=1; for f in a; do touch x; done");
  assert.equal(error, null);
  assert.equal(program.loopScopes.length, 1);
  assert.equal(program.commands.length, 2);
});

test("region: time/! pipeline forms are opaque; simple bodies pass through", () => {
  const { program } = parseInput("time cmd1 | cmd2");
  assert.equal(program.opaqueRegions.length, 1);
  assert.equal(program.opaqueRegions[0]!.keyword, "time/!");
  const { program: p2 } = parseInput("! a || b");
  assert.equal(p2.opaqueRegions.length, 1);
  const { program: p3 } = parseInput("time for f in a; do x; done");
  assert.equal(p3.opaqueRegions.length, 1);
});

test("region: nested pairing matrix (if-in-for, while-in-for, for-in-while)", () => {
  const { program } = parseInput("for f in a; do if true; then ls; fi; done");
  assert.equal(program.loopScopes.length, 1);
  assert.deepEqual(program.opaqueRegions.map((o) => o.keyword), ["if"]);
  const { program: p2 } = parseInput("for f in a; do while true; do x; done; done");
  assert.equal(p2.loopScopes.length, 1);
  assert.equal(p2.opaqueRegions.length, 1);
  const { program: p3 } = parseInput("while read x; do for g in b; do echo $g; done; done");
  assert.equal(p3.opaqueRegions.length, 1);
  assert.equal(p3.opaqueRegions[0]!.keyword, "while");
  assert.equal(p3.loopScopes.length, 1); // 内层 for 标签独立（for-in-while）
  assert.equal(p3.loopScopes[0]!.variable.value, "g");
});

test("region: multi-line for (newline separators) records scope", () => {
  const { program, error } = parseInput("for f in a b c\ndo echo x\ndone");
  assert.equal(error, null);
  assert.equal(program.loopScopes.length, 1);
  assert.equal(program.loopScopes[0]!.body.length, 1);
});

test("region: pre-for/pre-do redirection tokens collected into scope.redirections", () => {
  const { program } = parseInput(">out for f in a; do echo x; done");
  assert.equal(program.loopScopes.length, 1);
  assert.ok(program.loopScopes[0]!.redirections.length >= 1);
  const { program: p2 } = parseInput("for f in a >out; do echo x; done");
  assert.ok(p2.loopScopes[0]!.redirections.length >= 1);
  const { program: p3 } = parseInput("for f in a; do echo x; done >out");
  assert.ok(p3.loopScopes[0]!.redirections.length >= 1);
});

test("region: trailing operator recorded (incl. isolated & after done)", () => {
  const { program } = parseInput("for f in a; do x; done && echo ok");
  assert.equal(program.loopScopes[0]!.trailingOperator, "&&");
  const { program: p2 } = parseInput("for f in a; do x; done &");
  assert.equal(p2.loopScopes[0]!.trailingOperator, "&");
});