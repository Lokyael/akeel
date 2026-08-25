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