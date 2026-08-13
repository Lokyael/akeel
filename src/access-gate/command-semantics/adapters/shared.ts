// command-semantics/adapters/shared.ts — adapter 共享工具

import type { SourceSpan } from "../../shell-parse/types";
import type { CommandSemantics, CommandClass, Effect, PathIntent } from "../types";

/** 非真实位置的合成 span 哨兵（adapter 无法获得 token 位置的路径 intent 用）。 */
export const SYNTHETIC_SPAN: SourceSpan = { start: 0, end: 0 };

interface MakeSemanticsOpts {
  reason: string;
  intents?: PathIntent[];
  effects?: readonly Effect[];
  hardRule?: string | null;
  opaque?: boolean;
}

/**
 * consumed 中 kind=file 的值 → 路径 intent（source: option，span 取选项 token，confidence 保守）。
 * 引擎产物（option-parse）的语义补全：各 adapter 共享同一映射，避免逐字段复制。
 */
export function consumedFileIntents(consumed: ReadonlyArray<{ kind: "file" | "expression"; operation: "read" | "write"; value: string; span: { start: number; end: number } }>): PathIntent[] {
  return consumed
    .filter((e) => e.kind === "file")
    .map((e) => ({ operation: e.operation, rawPath: e.value, source: "option", span: e.span, confidence: "conservative" }));
}

/** 选项派生的路径 intent（source: option，span 合成）；confidence 默认 conservative。 */
export function optionIntent(
  operation: "read" | "write",
  rawPath: string,
  confidence: "exact" | "conservative" = "conservative",
): PathIntent {
  return { operation, rawPath, source: "option", span: SYNTHETIC_SPAN, confidence };
}


function defaultEffects(cls: CommandClass): readonly Effect[] {
  if (cls === "inspect") return ["read"];
  if (cls === "modify") return ["write"];
  if (cls === "execute") return ["execute"];
  if (cls === "destroy") return ["execute"];
  return [];
}

/** 首个非选项 token 的索引（跳过选项；不感知取值选项——raw 契约，D-024）。 */
function firstNonOptionIndex(args: ReadonlyArray<{ readonly value?: string | null }>): number {
  for (let i = 0; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") return -1;
    if (v.startsWith("-")) continue;
    return i;
  }
  return -1;
}

/**
 * 子命令尾部：首个非选项 token 起的全部 token，空格连接（reclassify pattern 匹配用）。
 * 与 adapter 提取不同，它包含选项及取值选项的值——
 * 已知局限：不跳过取值选项的值（如 cargo --manifest-path Cargo.toml build
 * 得到 "Cargo.toml build" 而非 "build"），因为它不依赖 per-adapter 配置。
 * reclassify 的 pattern 使用 substring 匹配（如 "build" 而非 "^build$"），
 * 典型场景（git 子命令）无此问题。详见 D-024。
 */
export function fullSubcommand(args: ReadonlyArray<{ readonly value?: string | null }>): string {
  const idx = firstNonOptionIndex(args);
  if (idx < 0) return "";
  const parts: string[] = [];
  for (let i = idx; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") break;
    parts.push(v);
  }
  return parts.join(" ");
}

/**
 * 可执行名规范化：版本化/别名解释器映射回基础名（nodejs→node、perl5→perl、
 * python3.11→python3）。registry 的 adapter 索引键与 preflight 的硬规则解释器
 * 判定共用同一映射（S1 单一来源，防两处漂移）。
 */
export function canonicalExecutableName(base: string): string {
  if (/^python3\.\d+$/.test(base)) return "python3";
  if (base === "nodejs") return "node";
  if (base === "perl5") return "perl";
  return base;
}

export function makeSemantics(
  cls: CommandClass,
  opts: MakeSemanticsOpts,
): CommandSemantics {
  return {
    commandClass: cls,
    effects: opts.effects ?? defaultEffects(cls),
    intents: opts.intents ?? [],
    hardRule: opts.hardRule ?? null,
    opaque: opts.opaque ?? false,
    reason: opts.reason,
  };
}

// ─── 子命令表匹配（package/build/interpreters 共用） ───
// 三份相同的「pattern 规则表 + 首命中返回 + unknown/回退」循环收敛为一处：
// 规则表驱动（每条 {cls, pattern, reason, network?}），命中即返回；全部未命中返回 null。
// 表末常以 pattern: () => true 的 catch-all 规则收尾（unknown 或回退分类），
// 使调用方通常无需处理 null——但 null 语义保留供需要显式回退的 adapter 使用。

export interface RuleDef {
  cls: CommandClass;
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

/** 按子命令 positional 匹配规则表；命中返回语义，全部未命中返回 null。
 * 子命令串 = positional 数组的 value 空格连接（调用方传入引擎输出的 positional，
 * 本函数内 join——投影内聚在唯一消费者，T-059）。 */
export function semanticsFromRules(
  positional: ReadonlyArray<{ readonly value?: string | null }>,
  rules: readonly RuleDef[],
): CommandSemantics | null {
  const subcmd = positional.map((a) => a.value ?? "").join(" ");
  for (const def of rules) {
    if (def.pattern(subcmd)) {
      return makeSemantics(def.cls, {
        reason: def.reason,
        effects: def.network ? ["network"] : undefined,
        opaque: def.cls === "unknown",
      });
    }
  }
  return null;
}
