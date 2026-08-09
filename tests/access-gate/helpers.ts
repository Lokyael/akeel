import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import type { CompilerContext, CompleteAccessPlan, CompileResult } from "../../src/access-gate/gate/access-request";
import { resolveProfiles } from "../../src/access-gate/profile/resolve";
import type { ResolvedProfiles } from "../../src/access-gate/profile/types";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { normalizeCommand } from "../../src/access-gate/command-semantics/normalize";
import { analyzeSemantics } from "../../src/access-gate/command-semantics/registry";
import type {
  CommandClass,
  CommandSemantics,
  Effect,
  PathIntent,
  SemanticContext,
} from "../../src/access-gate/command-semantics/types";

/** Shared temp workspace for access-gate tests. */
export function makeContext(
  prefix: string,
  prepare?: (root: string) => void,
): CompilerContext & { cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const staging = mkdtempSync(join(tmpdir(), `${prefix}-staging`));
  prepare?.(root);
  return {
    cwd: root,
    projectRoot: root,
    stagingDir: staging,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(staging, { recursive: true, force: true });
    },
  };
}

/** Load and resolve the built-in profiles from builtins.json (fail-fast at module load). */
export function loadBuiltinProfiles(): ResolvedProfiles {
  const builtinsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/access-gate/profile/builtins.json");
  const result = resolveProfiles(JSON.parse(readFileSync(builtinsPath, "utf-8")));
  if (!result.ok) throw new Error(`builtins resolution failed: ${result.error}`);
  return result.value;
}

// ─── 命令语义表格驱动 ───

/** 语义断言上下文：与 access-gate 测试共享的固定 POSIX 工作区。 */
export const DEFAULT_CTX: SemanticContext = { projectRoot: "/p", stagingDir: "/s", cwd: "/p" };

/**
 * 表格驱动用例。
 *
 * 约定（出现即断言，独立手写期望——不从 adapter 表派生）：
 * - `cls`/`opaque` 出现即断言相等；
 * - `effects` 出现即断言其中每个 effect 都被包含（成员语义）；
 * - `intents` 出现即断言完整有序列表：length + 每项按出现字段子集匹配
 *   （`Partial<PathIntent>`：省略字段不约束，如 span/source 不锁定）；
 * - `ctx` 覆盖默认语义上下文；`analyze` 覆盖分析入口（如 normalize 解包）。
 */
export interface SemCase {
  cmd: string | readonly string[];
  name: string;
  cls?: CommandClass;
  opaque?: boolean;
  effects?: readonly Effect[];
  intents?: readonly Partial<PathIntent>[];
  ctx?: SemanticContext;
  analyze?: (cmd: string, ctx: SemanticContext) => CommandSemantics;
}

/** 默认分析入口：解析命令串并对首个命令节点做语义分析。 */
export function analyzeCommand(cmd: string, ctx: SemanticContext = DEFAULT_CTX): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  return analyzeSemantics(program.commands[0]!, ctx);
}

/** normalize 解包后的分析入口（env/command 等 wrapper 用例）。 */
export function analyzeNormalizedCommand(cmd: string, ctx: SemanticContext = DEFAULT_CTX): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  const norm = normalizeCommand(program.commands[0]!);
  if (!norm) throw new Error(`normalize failed for command: ${cmd}`);
  return analyzeSemantics(norm.command, ctx);
}

function describeIntent(i: PathIntent): string {
  return `${i.operation}:${i.rawPath}${i.confidence ? `@${i.confidence}` : ""}`;
}

/** 单用例断言（供表格驱动与负向控制复用）。 */
export function assertSemanticCase(c: SemCase): void {
  const analyze = c.analyze ?? analyzeCommand;
  const cmds = typeof c.cmd === "string" ? [c.cmd] : c.cmd;
  for (const cmd of cmds) {
    const sem = analyze(cmd, c.ctx ?? DEFAULT_CTX);
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
  analyze?: (cmd: string, ctx: SemanticContext) => CommandSemantics;
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

// ─── 编译器结果与深度冻结共享工具 ───

/** 断言编译器返回 complete 并返回 plan（reject 时直接失败）。 */
export function complete(result: CompileResult): CompleteAccessPlan {
  assert.equal(result.kind, "complete");
  return result.plan;
}

/** 深度冻结对象图（含 Symbol 属性），返回原值。 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    for (const symbol of Object.getOwnPropertySymbols(value)) deepFreeze((value as Record<PropertyKey, unknown>)[symbol]);
    Object.freeze(value);
  }
  return value;
}
