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

/** 配置目标：配置文件路径 + 置信度（exact = 静态确定，conservative = 环境依赖）。 */
export interface ConfigTarget {
  rawPath: string;
  confidence: "exact" | "conservative";
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
 * 无子命令（全为选项）时返回 -1。
 */
export function firstNonOptionIndex(args: readonly ShellArg[], valueOptions: Iterable<string>): number {
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
 * Extract the subcommand from tool arguments.
 * Skips known value-taking options and their values.
 * Returns "" when no subcommand is present (all args are flags).
 *
 * @param valueOptions — options that consume the next token as their value.
 *   Accepts both string[] and Set<string> for caller convenience.
 */
export function extractSubcommand(args: readonly ShellArg[], valueOptions: Iterable<string>): string {
  const idx = firstNonOptionIndex(args, valueOptions);
  if (idx < 0) return "";
  const parts: string[] = [];
  for (let i = idx; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") break;
    if (v.startsWith("-")) continue;
    parts.push(v);
  }
  return parts.join(" ");
}

// ─── 配置命令共享解析引擎（git config / npm config，T-037 系列） ───

/**
 * 配置命令选项表：层级/标志/值消费语义的声明式描述。
 * 读写判定策略由各 adapter 本地决定（git 用 positional 推断，npm 用子命令 op）；
 * 本引擎只共享“遍历、层级解析、值消费、opaque”的确定性部分。
 */
export interface ConfigOptionTable {
  /** 读特征选项（改变输出格式/过滤，不改变文件访问）。 */
  readFlags: ReadonlySet<string>;
  /** 写特征选项。 */
  writeFlags: ReadonlySet<string>;
  /** 读特征且消费下一个 token 为值的选项（值非路径，如 git --type/--default）。 */
  readConsume: ReadonlySet<string>;
  /** 读特征且仅支持 = 前缀形式的选项（如 git --value=）。 */
  readEquals: readonly string[];
  /** 已知但无目标/读/写语义的修饰选项（如 npm -g/--global），不置 opaque。 */
  ignoreFlags: ReadonlySet<string>;
  /** 消费下一个 token 为目标路径的选项（git -f、npm --userconfig）。 */
  consumeTargets: ReadonlySet<string>;
  /** 以 = 前缀形式给出目标路径的选项（git --file=、npm --userconfig=）。 */
  equalsTargets: readonly string[];
  /** 层级选项 → 静态目标（git --global/--system/--local）。 */
  staticTargets: Readonly<Record<string, ConfigTarget>>;
  /** 无显式层级时的默认目标（环境依赖时用 conservative）。 */
  defaultTarget: ConfigTarget;
}

export interface ConfigParseResult {
  /** 显式层级目标（无显式层级时 null）。 */
  target: ConfigTarget | null;
  sawRead: boolean;
  sawWrite: boolean;
  /** 未知选项/空值目标 → opaque（fail-closed，不猜）。 */
  sawUnknown: boolean;
  /** 非选项 token（含 op 位置）。 */
  positional: readonly string[];
  /** 首个非选项 token（git 为 key、npm 为子命令 op）。 */
  op: string;
}

/**
 * 共享配置参数遍历：识别层级、读写标志、值消费、未知选项。
 * `--` 之后的 token 全部按位置参数处理。
 */
export function parseConfigOptions(args: readonly ShellArg[], table: ConfigOptionTable): ConfigParseResult {
  let target: ConfigTarget | null = null;
  let sawRead = false;
  let sawWrite = false;
  let sawUnknown = false;
  let op = "";
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const val = args[i]!.value ?? "";
    if (val === "--") {
      for (let j = i + 1; j < args.length; j++) positional.push(args[j]!.value ?? "");
      break;
    }
    if (!val.startsWith("-")) {
      if (!op) op = val;
      positional.push(val);
      continue;
    }

    if (table.readFlags.has(val)) { sawRead = true; continue; }
    if (table.writeFlags.has(val)) { sawWrite = true; continue; }
    const staticTarget = table.staticTargets[val];
    if (staticTarget) { target = staticTarget; continue; }
    if (table.ignoreFlags.has(val)) continue;

    const eq = val.indexOf("=");
    if (eq > 0) {
      const name = val.slice(0, eq);
      const rest = val.slice(eq + 1);
      if (table.readEquals.includes(name)) { sawRead = true; continue; }
      if (table.equalsTargets.includes(name)) {
        if (!rest) { sawUnknown = true; continue; }  // 空目标不猜，避免空路径 intent
        target = { rawPath: rest, confidence: "exact" };
        continue;
      }
      sawUnknown = true;
      continue;
    }

    if (table.consumeTargets.has(val) && i + 1 < args.length) {
      const consumed = args[i + 1]!.value ?? "";
      if (!consumed) { sawUnknown = true; continue; }
      target = { rawPath: consumed, confidence: "exact" };
      i++;
      continue;
    }
    if (table.readConsume.has(val) && i + 1 < args.length) { sawRead = true; i++; continue; }

    // 未知选项 → opaque
    sawUnknown = true;
  }

  return { target, sawRead, sawWrite, sawUnknown, positional, op };
}

export function makeSemantics(
  cls: CommandClass,
  opts: MakeSemanticsOpts,
): CommandSemantics {
  return {
    class: cls,
    effects: opts.effects ?? defaultEffects(cls),
    intents: opts.intents ?? [],
    cwdTransition: { kind: "none" },
    hardRule: opts.hardRule ?? null,
    opaque: opts.opaque ?? false,
    reason: opts.reason,
  };
}
