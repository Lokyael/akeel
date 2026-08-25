// T-062 Phase 2 / Task 5: verifyLoopScope strict 守卫矩阵

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { verifyLoopScope, type LoopLimits } from "../../../src/access-gate/command-semantics/loop";
import type { LoopScope } from "../../../src/access-gate/shell-parse/types";

const BIG: LoopLimits = { maxCommands: 100_000 };
const SMALL: LoopLimits = { maxCommands: 4 };

function scope(cmd: string): LoopScope {
  const { program } = parse(lex(cmd).tokens);
  assert.ok(program.loopScopes.length === 1, `expected exactly one loopScope for: ${cmd}`);
  return program.loopScopes[0]!;
}

function values(cmd: string, limits: LoopLimits = BIG): string[] | null {
  const r = verifyLoopScope(scope(cmd), limits);
  return r ? r.wordValues : null;
}

test("verify: literal word list + static body is modelable", () => {
  assert.deepEqual(values("for f in a b; do echo \"$f\"; done"), ["a", "b"]);
});

test("verify: quoted word with space is a single value", () => {
  assert.deepEqual(values("for f in \"a b\"; do echo \"$f\"; done"), ["a b"]);
});

test("verify: no `in` positional form is null", () => {
  assert.equal(values("for f; do echo \"$f\"; done"), null);
});

test("verify: empty word list is null", () => {
  assert.equal(values("for f in; do echo \"$f\"; done"), null);
});

test("verify: glob word list *.txt is null", () => {
  assert.equal(values("for f in *.txt; do echo \"$f\"; done"), null);
});

test("verify: ~user word list is null", () => {
  assert.equal(values("for f in ~user; do echo \"$f\"; done"), null);
});

test("verify: body cd / builtin cd is null", () => {
  assert.equal(values("for f in a; do cd /tmp; done"), null);
  assert.equal(values("for f in a; do builtin cd /tmp; touch \"$f\"; done"), null);
  assert.equal(values("for f in a; do env cd /tmp; done"), null);
});

test("verify: body state-mutation builtins are null", () => {
  for (const b of ["break", "continue", "exit", "return", "eval", "source", ".", "read", "shift", "set", "trap", "alias", "unalias", "export", "readonly", "declare", "typeset", "local", "unset", "exec"]) {
    assert.equal(values(`for f in a; do ${b} x; done`), null, `expected null for body ${b}`);
  }
});

test("verify: prefixed builtin eval is null", () => {
  assert.equal(values("for f in a; do builtin eval \"$f\"; done"), null);
});

test("verify: wrapper exec is null (O3)", () => {
  assert.equal(values("for f in a; do exec ls; done"), null);
});

test("verify: loop var reassignment f= is null", () => {
  assert.equal(values("for f in a; do f=evil; echo x; done"), null);
  assert.equal(values("for f in a; do export f=x; echo y; done"), null);
  assert.equal(values("for f in a; do read f; done"), null);
});

test("verify: builtin opaque-options first arg is null (conservative)", () => {
  assert.equal(values("for f in a; do builtin -x; done"), null);
});

test("verify: bare unquoted $f in body is null", () => {
  assert.equal(values("for f in a; do echo $f; done"), null);
});

test("verify: $HOME and command substitution in body are null", () => {
  assert.equal(values("for f in a; do echo \"$HOME\"; done"), null);
  assert.equal(values("for f in a; do echo \"$(x)\"; done"), null);
});

test("verify: empty body is pinned to compound-command (null)", () => {
  assert.equal(values("for f in a; do ; done"), null);
});

test("verify: body heredoc redirect is null, fdDuplicate is allowed", () => {
  assert.equal(values("for f in a; do cat << EOF; done"), null);
  assert.deepEqual(values("for f in a; do echo \"$f\" 2>&1; done"), ["a"]);
});

test("verify: env-assignment VALUES with dynamic content are null (G10 env 面)", () => {
  assert.equal(values("for f in a; do FOO=$HOME touch x; done"), null);
  assert.equal(values("for f in a; do FOO=$f echo x; done"), null); // 未引用 $f 不建模
  assert.deepEqual(values("for f in a; do FOO=x echo y; done"), ["a"]); // 字面 env 值放行
});

test("verify: compound/indirect loop-var assignment is null (f+= 族)", () => {
  assert.equal(values("for f in a; do f+=x; echo \"$f\"; done"), null); // 复合赋值
  assert.equal(values("for f in a; do printf -v f x; done"), null); // printf -v 赋值
  assert.equal(values("for f in a; do let \"f=1\"; done"), null); // let 算数赋值
  assert.equal(values("for f in a; do mapfile -t f < x; done"), null); // mapfile 读入
  // 正向：printf 非 -v 用法、-v 其他变量、let/mapfile 不出现 → 可建模
  assert.deepEqual(values("for f in a; do printf '%s' \"$f\"; done"), ["a"]);
  assert.deepEqual(values("for f in a; do printf -v g x; echo \"$f\"; done"), ["a"]);
});

test("verify: loop-level | and & operators are null", () => {
  assert.equal(values("cat x | for f in a; do echo \"$f\"; done"), null);
  assert.equal(values("for f in a; do echo \"$f\"; done | cat"), null);
  assert.equal(values("for f in a; do echo \"$f\"; done &"), null);
});

test("verify: N x body over maxCommands is null", () => {
  assert.equal(values("for f in a b c d e; do echo \"$f\"; echo \"x\"; done", SMALL), null);
  assert.deepEqual(values("for f in a; do echo \"$f\"; done", SMALL), ["a"]);
});

test("verify: loop-level redirect target static is modelable", () => {
  assert.deepEqual(values("for f in a > out; do echo \"$f\"; done"), ["a"]);
  assert.deepEqual(values("for f in a; do echo \"$f\"; done > out"), ["a"]);
});

test("verify: loop-level redirect target with $f is null (N2)", () => {
  assert.equal(values("for f in a > dir/\"$f\"; do echo \"$f\"; done"), null);
  assert.equal(values("for f in a; do echo \"$f\"; done > \"$f\""), null);
});

test("verify: loop-level heredoc is null", () => {
  assert.equal(values("for f in a; do echo x; done << EOF"), null);
});

test("verify: harmless wrappers (nohup/timeout) are allowed", () => {
  assert.deepEqual(values("for f in a; do timeout 2 echo \"$f\"; done"), ["a"]);
  assert.deepEqual(values("for f in a; do nohup echo \"$f\"; done"), ["a"]);
});
