// 消费者：command-semantics/ 目录全部 adapter 测试。
// 约定（出现即断言，独立手写期望——不从 adapter 表派生）：
// - `cls`/`opaque` 出现即断言相等；
// - `effects` 出现即断言其中每个 effect 都被包含（成员语义）；
// - `intents` 出现即断言完整有序列表：length + 每项按出现字段子集匹配
//   （`Partial<PathIntent>`：省略字段不约束，如 span/source 不锁定）；
// - `ctx` 覆盖默认语义上下文；`analyze` 覆盖分析入口（如 normalize 解包）。

import test from "node:test";
import assert from "node:assert/strict";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { normalizeCommand } from "../../../src/access-gate/command-semantics/normalize";
import { analyzeSemantics } from "../../../src/access-gate/command-semantics/registry";
import type {
  CommandClass,
  CommandSemantics,
  Effect,
  PathIntent,
} from "../../../src/access-gate/command-semantics/types";

export interface SemCase {
  cmd: string | readonly string[];
  name: string;
  cls?: CommandClass;
  opaque?: boolean;
  effects?: readonly Effect[];
  intents?: readonly Partial<PathIntent>[];
  analyze?: (cmd: string) => CommandSemantics;
}

/** 默认分析入口：解析命令串并对首个命令节点做语义分析。 */
function analyzeCommand(cmd: string): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  return analyzeSemantics(program.commands[0]!);
}

/** normalize 解包后的分析入口（env/command 等 wrapper 用例）。 */
export function analyzeNormalizedCommand(cmd: string): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  const norm = normalizeCommand(program.commands[0]!);
  return analyzeSemantics(norm.command);
}

function describeIntent(i: PathIntent): string {
  return `${i.operation}:${i.rawPath}${i.confidence ? `@${i.confidence}` : ""}`;
}

/** 单用例断言（供表格驱动与负向控制复用）。 */
export function assertSemanticCase(c: SemCase): void {
  const analyze = c.analyze ?? analyzeCommand;
  const cmds = typeof c.cmd === "string" ? [c.cmd] : c.cmd;
  for (const cmd of cmds) {
    const sem = analyze(cmd);
    const label = `[${c.name}] ${cmd}`;
    if (c.cls !== undefined) assert.equal(sem.commandClass, c.cls, `${label}: class`);
    if (c.opaque !== undefined) assert.equal(sem.opaque, c.opaque, `${label}: opaque`);
    if (c.effects !== undefined) {
      for (const e of c.effects) {
        assert.ok(sem.effects.includes(e), `${label}: effects missing ${e} (have ${sem.effects.join(",")})`);
      }
    }
    if (c.intents !== undefined) {
      const actual = sem.intents.map(describeIntent).join(", ");
      assert.equal(sem.intents.length, c.intents.length, `${label}: intents length (actual [${actual}])`);
      for (let i = 0; i < c.intents.length; i++) {
        const exp: Partial<PathIntent> = c.intents[i]!;
        const act: PathIntent = sem.intents[i]!;
        const keys = Object.keys(exp);
        for (const key of keys) {
          const expected = exp[key as keyof PathIntent];
          const actual = act[key as keyof PathIntent];
          assert.equal(actual, expected, `${label}: intents[${i}].${key} (actual ${describeIntent(act)})`);
        }
      }
    }
  }
}

/** 按行注册 node:test 用例：每行独立 test，失败精确到行。 */
export function defineSemanticTests(suite: {
  prefix: string;
  analyze?: (cmd: string) => CommandSemantics;
  cases: readonly SemCase[];
}): void {
  for (const c of suite.cases) {
    test(`${suite.prefix}${c.name}`, () => {
      assertSemanticCase({ ...c, analyze: c.analyze ?? suite.analyze });
    });
  }
}

/** 按 adapter 命令族的便捷注册（prefix = "${adapter}: "，默认分析入口）。 */
export function defineAdapterTests(adapter: string, cases: readonly SemCase[]): void {
  defineSemanticTests({ prefix: `${adapter}: `, cases });
}
