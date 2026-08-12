// tests/access-gate/option-parse.test.ts
// option-parse 引擎直接契约测试（其余经 adapter 测试间接覆盖）。
// 锁定：值消费（separated/equals/attached/suffix）、`--`、组合簇、program-first、
// opaque 策略、class 调节原语（T-059/B1）、前缀重叠校验（B）、consumeUntil 校验（E）。

import test from "node:test";
import assert from "node:assert/strict";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { parseOptions, type Opt, type OptConfig } from "../../src/access-gate/command-semantics/adapters/option-parse";
import type { ShellArg } from "../../src/access-gate/shell-parse/types";

/** 将命令串解析为首个命令节点的 args（与 adapter 测试同链）。
 * 统一加占位命令名前缀：parser 把首个 token 当 executable，引擎只消费其后 args。 */
function argsOf(cmd: string): readonly ShellArg[] {
  const { program } = parse(lex(`tool ${cmd}`).tokens);
  return program.commands[0]!.args;
}

function run(cmd: string, opts: readonly Opt[], cfg?: Partial<Omit<OptConfig, "opts">>): ReturnType<typeof parseOptions> {
  return parseOptions(argsOf(cmd), {
    opts,
    positional: "file",
    opaqueOnUnknown: false,
    ...cfg,
  });
}

// ─── 基础契约：值消费四形态 ───

const OUTPUT_OPTS: Opt[] = [
  { names: ["-o", "--output"], kind: "file", operation: "write", forms: ["separated", "equals", "attached"] },
  { names: ["-n", "--lines"], kind: "expression", forms: ["separated", "equals"] },
];

test("engine: separated consumes the next token", () => {
  const r = run("-o out.txt in.txt", OUTPUT_OPTS);
  assert.deepEqual(r.positional.map((a) => a.value), ["in.txt"]);
  assert.equal(r.consumed.length, 1);
  assert.equal(r.consumed[0]!.option, "-o");
  assert.equal(r.consumed[0]!.value, "out.txt");
  assert.equal(r.consumed[0]!.kind, "file");
});

test("engine: equals form on long option", () => {
  const r = run("--output=out.txt", OUTPUT_OPTS);
  assert.equal(r.consumed[0]!.option, "--output");
  assert.equal(r.consumed[0]!.value, "out.txt");
});

test("engine: attached short-option value", () => {
  const r = run("-oout.txt", OUTPUT_OPTS);
  assert.equal(r.consumed[0]!.option, "-o");
  assert.equal(r.consumed[0]!.value, "out.txt");
});

test("engine: suffix flag form (-i.bak → flag -i, write)", () => {
  const opts: Opt[] = [
    { names: ["-i", "--in-place"], kind: "flag", operation: "write", forms: ["suffix", "equals"] },
  ];
  const r = run("sed -i.bak", opts);
  assert.deepEqual(r.flags, ["-i"]);
  assert.equal(r.sawWrite, true);
});

test("engine: POSIX cluster splits flags", () => {
  const opts: Opt[] = [
    { names: ["-r"], kind: "flag" },
    { names: ["-n"], kind: "flag" },
  ];
  const r = run("-rn", opts);
  assert.deepEqual(r.flags, ["-r", "-n"]);
});

test("engine: cluster with trailing value option consumes remainder", () => {
  const opts: Opt[] = [
    { names: ["-r"], kind: "flag" },
    { names: ["-t"], kind: "expression", forms: ["separated", "attached"] },
  ];
  const r = run("-rt d", opts);
  assert.deepEqual(r.flags, ["-r"]);
  assert.equal(r.consumed[0]!.option, "-t");
  assert.equal(r.consumed[0]!.value, "d");
});

test("engine: unknown char in cluster is opaque under opaqueOnUnknown", () => {
  const opts: Opt[] = [{ names: ["-r"], kind: "flag" }];
  const r = run("-rz", opts, { opaqueOnUnknown: true });
  assert.equal(r.opaque, true);
});

// ─── `--` 终止选项 ───

test("engine: everything after -- is positional", () => {
  const opts: Opt[] = [{ names: ["-o"], kind: "file", forms: ["separated"] }];
  const r = run("-- -o not-an-option", opts);
  assert.deepEqual(r.positional.map((a) => a.value), ["-o", "not-an-option"]);
  assert.equal(r.consumed.length, 0);
});

// ─── opaque 策略 ───

test("engine: unknown option opaque under opaqueOnUnknown", () => {
  const r = run("--bogus", [], { opaqueOnUnknown: true });
  assert.equal(r.opaque, true);
});

test("engine: unknown option silent under opaqueOnUnknown=false", () => {
  const r = run("--bogus", []);
  assert.equal(r.opaque, false);
});

// ─── program-first ───

test("engine: program-first skips first positional until pattern", () => {
  const opts: Opt[] = [{ names: ["-e"], kind: "expression", isPattern: true, forms: ["separated"] }];
  const cfg: OptConfig = { opts, positional: "program-first", opaqueOnUnknown: true };
  // 无 -e：第一个位置参数（程序）被跳过
  const noPattern = parseOptions(argsOf("s/x/y/ file"), cfg);
  assert.deepEqual(noPattern.positional.map((a) => a.value), ["file"]);
  // 有 -e：program 语义由 -e 承载，位置参数全保留
  const withPattern = parseOptions(argsOf("-e s/x/y/ file"), cfg);
  assert.deepEqual(withPattern.positional.map((a) => a.value), ["file"]);
});

// ─── 缺值取值选项 ───

test("engine: separated option at end is silently not consumed", () => {
  const r = run("-o", OUTPUT_OPTS);
  assert.equal(r.consumed.length, 0);
  assert.deepEqual(r.positional, []);
});

// ─── consumeUntil ───

test("engine: consumeUntil consumes until terminator", () => {
  const opts: Opt[] = [
    { names: ["-exec"], kind: "flag", operation: "write", consumeUntil: ["+", ";"] },
  ];
  // `;` 是控制操作符，lexer 已拆分组——引擎只可能在收到 word `+` 终止符时结束
  const r = run("-exec echo hi + x", opts);
  assert.equal(r.sawWrite, true);
  // -exec 区内容不参与 positional
  assert.deepEqual(r.positional.map((a) => a.value), ["x"]);
});

// ─── B: 前缀重叠校验（suffix/attached 声明顺序敏感消除） ───

test("engine B: suffix prefix overlap fails fast", () => {
  const opts: Opt[] = [
    { names: ["-i"], kind: "flag", forms: ["suffix"] },
    { names: ["-in"], kind: "flag", forms: ["suffix"] },
  ];
  assert.throws(() => run("-i.bak", opts), /prefix/i);
});

test("engine B: attached/suffix cross prefix overlap fails fast", () => {
  const opts: Opt[] = [
    { names: ["-i"], kind: "file", forms: ["attached"] },
    { names: ["-in"], kind: "flag", forms: ["suffix"] },
  ];
  assert.throws(() => run("-in", opts), /prefix/i);
});

test("engine B: non-overlapping suffix names pass", () => {
  const opts: Opt[] = [
    { names: ["-i"], kind: "flag", forms: ["suffix"] },
    { names: ["-E"], kind: "flag", forms: ["suffix"] },
  ];
  assert.doesNotThrow(() => run("-i.bak", opts));
});

// ─── E: consumeUntil 必须声明 operation write ───

test("engine E: consumeUntil without write operation fails fast", () => {
  const opts: Opt[] = [
    { names: ["-exec"], kind: "flag", consumeUntil: ["+", ";"] },
  ];
  assert.throws(() => run("-exec echo ;", opts), /consumeUntil/i);
});

// ─── B1: class 调节原语 ───

test("engine B1: upgradeTo modify surfaces classAdjust", () => {
  const opts: Opt[] = [
    { names: ["-s", "--set"], kind: "expression", upgradeTo: "modify", forms: ["separated", "equals"] },
  ];
  const r = run("date -s now", opts);
  assert.equal(r.classAdjust, "modify");
});

test("engine B1: downgradeTo inspect surfaces classAdjust", () => {
  const opts: Opt[] = [
    { names: ["--check"], kind: "flag", downgradeTo: "inspect" },
  ];
  const r = run("black --check .", opts);
  assert.equal(r.classAdjust, "inspect");
});

test("engine B1: destroy wins over modify (risk order, fail-closed)", () => {
  const opts: Opt[] = [
    { names: ["-f"], kind: "flag", upgradeTo: "destroy" },
    { names: ["--soft"], kind: "flag", upgradeTo: "modify" },
  ];
  const r = run("-f --soft", opts);
  assert.equal(r.classAdjust, "destroy");
});

test("engine B1: no adjustment leaves classAdjust null", () => {
  const r = run("plain", []);
  assert.equal(r.classAdjust, null);
});

test("engine B1: adjustment via equals form and attached form", () => {
  const opts: Opt[] = [
    { names: ["--fix"], kind: "flag", upgradeTo: "modify", forms: ["equals"] },
    { names: ["-o"], kind: "file", operation: "write", upgradeTo: "modify", forms: ["attached"] },
  ];
  assert.equal(run("--fix=x", opts).classAdjust, "modify");
  assert.equal(run("-oout.txt", opts).classAdjust, "modify");
});

test("engine B1: cluster with value-option tail surfaces classAdjust", () => {
  const opts: Opt[] = [
    { names: ["-r"], kind: "flag" },
    { names: ["-s"], kind: "expression", upgradeTo: "modify", forms: ["separated", "attached"] },
  ];
  // 簇内取值字符（-s 附着值）→ recordValue → applyAdjust
  assert.equal(run("-rsnow", opts).classAdjust, "modify");
});

test("engine B1: cluster destroy wins over modify (pendingAdjust risk order)", () => {
  const opts: Opt[] = [
    { names: ["-f"], kind: "flag", upgradeTo: "destroy" },
    { names: ["-m"], kind: "flag", upgradeTo: "modify" },
  ];
  assert.equal(run("-fm", opts).classAdjust, "destroy");
});
