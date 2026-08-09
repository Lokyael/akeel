// command-semantics/adapters/shared.ts — adapter 共享工具

import type { ShellArg } from "../../shell-parse/types";
import type { CommandSemantics, CommandClass, Effect, PathIntent } from "../types";

export interface MakeSemanticsOpts {
  reason: string;
  intents?: PathIntent[];
  effects?: readonly Effect[];
  hardRule?: string | null;
  opaque?: boolean;
}

/** 选项派生的路径 intent（source: option，span 合成）；confidence 默认 conservative。 */
export function optionIntent(
  operation: "read" | "write",
  rawPath: string,
  confidence: "exact" | "conservative" = "conservative",
): PathIntent {
  return { operation, rawPath, source: "option", span: { start: 0, end: 0 }, confidence };
}


function defaultEffects(cls: CommandClass): readonly Effect[] {
  if (cls === "inspect") return ["read"];
  if (cls === "modify") return ["write"];
  if (cls === "execute") return ["execute"];
  if (cls === "destroy") return ["execute"];
  return [];
}

/**
 * 首个非选项 token 的索引（跳过已知取值选项及其值）。
 * 无子命令（全为选项）或遇到 `--` 时返回 -1。
 */
export function firstNonOptionIndex(args: ReadonlyArray<{ readonly value?: string | null }>, valueOptions: Iterable<string>): number {
  const opts = new Set(valueOptions);
  for (let i = 0; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") return -1;
    if (v.startsWith("-")) {
      if (opts.has(v) && !v.includes("=") && i + 1 < args.length) i++;
      continue;
    }
    return i;
  }
  return -1;
}

/**
 * 子命令 token 收集核心（T-046 R4，三个提取器的唯一实现）：
 * 从首个非选项 token 起收集；includeOptions=false 只收集非选项 token，
 * includeOptions=true 收集全部后续 token（含选项与取值选项的值——调用方
 * 不提供 valueOptions 即不知哪些选项取值，D-024 已知局限）。`--` 之前终止。
 */
function collectSubcommandTokens(
  args: ReadonlyArray<{ readonly value?: string | null }>,
  valueOptions: Iterable<string>,
  includeOptions: boolean,
): string[] {
  const idx = firstNonOptionIndex(args, valueOptions);
  if (idx < 0) return [];
  const parts: string[] = [];
  for (let i = idx; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") break;
    if (!includeOptions && v.startsWith("-")) continue;
    parts.push(v);
  }
  return parts;
}

/**
 * Extract the subcommand from tool arguments: 全部非选项 token，空格连接。
 * 跳过已知取值选项及其值（adapter 分发语义）。
 * 无子命令（全为选项）时返回 ""。
 *
 * @param valueOptions — options that consume the next token as their value.
 *   Accepts both string[] and Set<string> for caller convenience.
 */
export function extractSubcommand(args: ReadonlyArray<{ readonly value?: string | null }>, valueOptions: Iterable<string>): string {
  return collectSubcommandTokens(args, valueOptions, false).join(" ");
}

/** 子命令：首个非选项 token（overrides commands 分发；无 valueOptions 感知，D-024）。 */
export function firstSubcommand(args: ReadonlyArray<{ readonly value?: string | null }>): string {
  return collectSubcommandTokens(args, [], false)[0] ?? "";
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
  return collectSubcommandTokens(args, [], true).join(" ");
}

/** 位置参数提取结果：positional + 被消费的取值选项（供目标目录/参考文件等语义判定）。 */
interface ExtractedArgs {
  positional: readonly ShellArg[];
  /** 被消费的取值选项（-t VALUE、--reference=VALUE 等），选项名归一化（去 = 后缀）。 */
  consumed: ReadonlyArray<{ option: string; value: string }>;
}

/**
 * 提取位置参数：跳过选项与选项值（valueOptions 消费下一个、attachedOptions 前缀内联），
 * `--` 之后全部按位置参数。被消费的选项值记录在 consumed（供路径语义判定，如 -t 目标目录）。
 */
export function extractPositionalArgs(
  args: readonly ShellArg[],
  valueOptions: readonly string[],
  attachedOptions: readonly string[],
): ExtractedArgs {
  const positional: ShellArg[] = [];
  const consumed: Array<{ option: string; value: string }> = [];
  for (let i = 0; i < args.length; i++) {
    const val = args[i]!.value ?? "";
    if (val === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (val.startsWith("-")) {
      if (valueOptions.includes(val) && i + 1 < args.length) {
        consumed.push({ option: val, value: args[i + 1]!.value ?? "" });
        i++;
        continue;
      }
      const attached = attachedOptions.find((prefix) => prefix && val.startsWith(prefix) && val.length > prefix.length);
      if (attached) {
        consumed.push({ option: attached.endsWith("=") ? attached.slice(0, -1) : attached, value: val.slice(attached.length) });
        continue;
      }
      // POSIX 组合簇 + 尾随带值短选项：-rt d（-t 分离值）、-rref.txt（-r 附着值）、-pm 755
      // 从前往后扫描单字符短选项，首个命中 valueOptions 的即带值选项；其前字符视为 flag 簇（不验证），
      // 值 = token 内剩余（附着）或下一 token（分离）；无下一 token（缺值，POSIX 错误输入）时静默不消费。
      // 未命中则整体跳过（纯 flag 簇/未知，现状）。
      if (!val.startsWith("--")) {
        for (let k = 1; k < val.length; k++) {
          const opt = `-${val[k]}`;
          if (valueOptions.includes(opt)) {
            if (k < val.length - 1) {
              consumed.push({ option: opt, value: val.slice(k + 1) });
            } else if (i + 1 < args.length) {
              consumed.push({ option: opt, value: args[i + 1]!.value ?? "" });
              i++;
            }
            break;
          }
        }
      }
      continue;
    }
    positional.push(args[i]!);
  }
  return { positional, consumed };
}

/** 组合短选项匹配所需的最小选项 schema 形状（text-transform 的 OptionSchema 满足此形状）。 */
interface FlagSchemaLike {
  names: readonly string[];
  takesValue: boolean;
  operation: "read" | "write";
  isPattern?: boolean;
}

/**
 * POSIX 组合短选项匹配：token 形如 -rn（单 "-"、非 "--"、长度 > 2），
 * 逐字符均为无值 flag 才消费。返回命中的 schema 列表（按字符序）；
 * 簇内含带值选项或未知字符返回 null——调用方保持原处置（如 text-transform 的 opaque）。
 */
export function matchFlagCluster(
  token: string,
  schemas: readonly FlagSchemaLike[],
): FlagSchemaLike[] | null {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2) return null;
  const found: FlagSchemaLike[] = [];
  for (const ch of token.slice(1).split("")) {
    const schema = schemas.find((s) => !s.takesValue && s.names.includes(`-${ch}`));
    if (!schema) return null;
    found.push(schema);
  }
  return found;
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
