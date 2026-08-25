// T-062 A0-2: 词义层 denoteWord 基础形态

import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { homedir } from "node:os";
import { denoteWord, type Binding } from "../../../src/access-gate/command-semantics/denote";

const emptyEnv = new Map<string, Binding>();
const span = { start: 0, end: 1 };

function w(value: string, raw = value, quoted = false, dynamic = false) {
  return { value, raw, quoted, dynamic, span };
}

test("denote: unquoted leading tilde normalizes once", () => {
  const r = denoteWord(w("~/x"), emptyEnv);
  assert.deepEqual(r, { kind: "static", values: [join(homedir(), "x")] });
});

test("denote: bare tilde normalizes to home", () => {
  assert.deepEqual(denoteWord(w("~"), emptyEnv), { kind: "static", values: [homedir()] });
});

test("denote: QUOTED tilde stays literal", () => {
  assert.deepEqual(denoteWord(w("~/x", '"~/x"', true), emptyEnv), { kind: "static", values: ["~/x"] });
});

test("denote: escaped tilde stays literal", () => {
  assert.deepEqual(denoteWord(w("~/x", "\\~/x"), emptyEnv), { kind: "static", values: ["~/x"] });
});

test("denote: dynamic word is opaque in A0 (no bindings)", () => {
  const r = denoteWord(w("$f", "$f", false, true), emptyEnv);
  assert.equal(r.kind, "opaque");
});

test("denote: dynamic glob word is opaque (N3 entry short-circuit)", () => {
  assert.equal(denoteWord(w("a[b]", "a[b]", false, true), emptyEnv).kind, "opaque");
});

test("denote: plain literal passes through", () => {
  assert.deepEqual(denoteWord(w("plain.txt"), emptyEnv), { kind: "static", values: ["plain.txt"] });
});

test("denote: ~user / ~+ stay literal (not modeled)", () => {
  assert.deepEqual(denoteWord(w("~root"), emptyEnv), { kind: "static", values: ["~root"] });
  assert.deepEqual(denoteWord(w("~+"), emptyEnv), { kind: "static", values: ["~+"] });
});

test("denote: tilde normalization is idempotent across double application", () => {
  const once = denoteWord(w("~/x"), emptyEnv);
  assert.equal(once.kind, "static");
  if (once.kind === "static") {
    const second = denoteWord(w(once.values[0]!), emptyEnv);
    assert.deepEqual(second, once);
  }
});

// ─── Phase 2 / Task 4: 绑定求值（仅 $f、须双引号区段） ───

const fEnv = new Map<string, Binding>([
  ["f", { kind: "literals", values: ["a", "b"] }],
]);

function dq(value: string, raw: string) {
  // 双引号区段内的 `$` 令 lexer 置 dynamic=true（hadDynamicInDouble）
  return w(value, raw, true, true);
}

test("denote: double-quoted $f expands to literal set", () => {
  const r = denoteWord(dq("$f", '"$f"'), fEnv);
  assert.deepEqual(r, { kind: "static", values: ["a", "b"] });
});

test("denote: constant prefix concatenation (\"== $f\")", () => {
  const r = denoteWord(dq("== $f", '"== $f"'), fEnv);
  assert.deepEqual(r, { kind: "static", values: ["== a", "== b"] });
});

test("denote: mixed quoted/unquoted x\"$f\"y concatenates", () => {
  const r = denoteWord(dq("x$fy", 'x"$f"y'), fEnv);
  assert.deepEqual(r, { kind: "static", values: ["xay", "xby"] });
});

test("denote: brace ref inside double quotes is static", () => {
  const r = denoteWord(dq("${f}x", '"${f}x"'), fEnv);
  assert.deepEqual(r, { kind: "static", values: ["ax", "bx"] });
});

test("denote: bare unquoted $f is opaque (field splitting)", () => {
  assert.equal(denoteWord(w("$f", "$f", false, true), fEnv).kind, "opaque");
});

test("denote: bare brace ${f} unquoted is opaque", () => {
  assert.equal(denoteWord(w("${f}", "${f}", false, true), fEnv).kind, "opaque");
});

test("denote: $fx (word-char suffix) is opaque", () => {
  assert.equal(denoteWord(dq("$fx", '"$fx"'), fEnv).kind, "opaque");
});

test("denote: single-quoted $f stays literal", () => {
  const r = denoteWord(w("$f", "'$f'", true, false), fEnv);
  assert.deepEqual(r, { kind: "static", values: ["$f"] });
});

test("denote: unbound var $HOME in quotes is opaque", () => {
  assert.equal(denoteWord(dq("$HOME", '"$HOME"'), fEnv).kind, "opaque");
});

test("denote: ${f:-def} modifier is opaque", () => {
  assert.equal(denoteWord(dq("${f:-def}", '"${f:-def}"'), fEnv).kind, "opaque");
});

test("denote: command substitution inside quotes is opaque", () => {
  assert.equal(denoteWord(dq("$(f)", '"$(f)"'), fEnv).kind, "opaque");
});

test("denote: unknown binding kind blocks expansion", () => {
  const envU = new Map<string, Binding>([["f", { kind: "unknown" }]]);
  assert.equal(denoteWord(dq("$f", '"$f"'), envU).kind, "opaque");
});

test("denote: double-quoted glob char is NOT residual-dynamic (literal inside quotes)", () => {
  // 双引号内的 `*` 是字面，`$f` 可展开 → static
  const r = denoteWord(dq("*$f", '"*$f"'), fEnv);
  assert.deepEqual(r, { kind: "static", values: ["*a", "*b"] });
});

test("denote: unquoted glob alongside quoted ref is opaque", () => {
  // "$f"* ：尾部未引用 `*` 是 glob → opaque（N3/G10）
  assert.equal(denoteWord(dq("$f*", '"$f"*'), fEnv).kind, "opaque");
});