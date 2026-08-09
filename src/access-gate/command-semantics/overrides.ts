// command-semantics/overrides.ts — 命令覆盖层
//
// 为 Shell 命令提供用户全局的轻量扩展入口。
// 内置 adapter 仍是权威来源；此文件只处理用户定义的扩展和覆盖。
//
// 配置路径：$PI_CODING_AGENT_DIR/pi-keel/command-overrides.yaml，默认 ~/.pi/agent/pi-keel/command-overrides.yaml。

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CommandClass, CommandSemantics, Effect } from "./types";
import type { ShellArg } from "../shell-parse/types";
import { firstSubcommand, fullSubcommand, makeSemantics } from "./adapters/shared";
import { COMMAND_CLASS_SET } from "../domain";
import { getAgentDir } from "../agent-dir";

// ─── 类型 ───

/** 单个命令的声明式定义（用于 YAML 中的 commands 段）。 */
interface CommandDef {
  class: CommandClass;
  effects?: Effect[];
  /** 子命令覆盖。key 是第一个非选项参数值。 */
  subcommands?: Record<string, { class: CommandClass; effects?: Effect[] }>;
}

/** 分类微调规则。pattern 是正则表达式，匹配命令的子命令部分。 */
interface ReclassifyEntry {
  command: string;
  pattern: string;
  class: CommandClass;
}

/** command-overrides.yaml 的完整结构。 */
interface CommandOverrides {
  aliases?: Record<string, string>;
  commands?: Record<string, CommandDef>;
  reclassify?: ReclassifyEntry[];
}

// ─── 运行时校验 ───

function validateCommandDef(name: string, def: CommandDef): void {
  if (!COMMAND_CLASS_SET.has(def.class)) {
    throw new Error(`command-overrides: ${name}: invalid class "${def.class}"`);
  }
  if (def.subcommands) {
    for (const [sc, sub] of Object.entries(def.subcommands)) {
      if (!COMMAND_CLASS_SET.has(sub.class)) {
        throw new Error(`command-overrides: ${name}.${sc}: invalid class "${sub.class}"`);
      }
    }
  }
}

// ─── 加载 ───

const _cache = new Map<string, CommandOverrides>();

function loadFile(path: string): CommandOverrides | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as CommandOverrides;
  } catch (error) {
    // 与 profiles 加载（响亮报错）一致：解析失败必须可见，不能静默回退默认语义
    console.error(`command-overrides: failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function mergeOverrides(base: CommandOverrides | null, overlay: CommandOverrides | null): CommandOverrides {
  if (!overlay) return base ?? {};
  if (!base) return overlay;
  const merged: CommandOverrides = {};
  if (base.aliases || overlay.aliases) merged.aliases = { ...base.aliases, ...overlay.aliases };
  if (base.commands || overlay.commands) merged.commands = { ...base.commands, ...overlay.commands };
  if (base.reclassify || overlay.reclassify) merged.reclassify = [...(base.reclassify ?? []), ...(overlay.reclassify ?? [])];
  return merged;
}

export function loadOverrides(agentDir = getAgentDir()): CommandOverrides {
  const globalPath = join(agentDir, "pi-keel", "command-overrides.yaml");
  const cached = _cache.get(globalPath);
  if (cached) return cached;

  const result = mergeOverrides(null, loadFile(globalPath));

  // 运行时校验 class 字段（commands 和 reclassify）
  if (result.commands) {
    for (const [name, def] of Object.entries(result.commands)) {
      validateCommandDef(name, def);
    }
  }
  if (result.reclassify) {
    for (const rule of result.reclassify) {
      if (!COMMAND_CLASS_SET.has(rule.class)) {
        throw new Error(`command-overrides: reclassify[${rule.command}]: invalid class "${rule.class}"`);
      }
    }
  }

  _cache.set(globalPath, result);
  return result;
}

/** 仅用于测试：重置加载缓存。 */
export function resetOverrides(): void {
  _cache.clear();
}

// ─── 应用覆盖 ───
// 子命令提取统一由 shared.ts 提供（T-046 R4）：
// firstSubcommand（commands 分发，首 token）与 fullSubcommand（reclassify pattern，
// 含选项尾部）从首个非选项参数起提取；known 局限（不跳过取值选项值）见 shared.ts/D-024。

/**
 * 应用 CommandDef 产生语义结果。
 * 用于 YAML commands 段中完整定义的命令。
 */
export function applyCommandDef(
  def: CommandDef,
  args: ReadonlyArray<{ value?: string | null }>,
  commandName: string,
): CommandSemantics {
  // 无子命令定义 → 直接返回基类
  if (!def.subcommands || Object.keys(def.subcommands).length === 0) {
    return makeSemantics(def.class, {
      reason: `${commandName} (user-defined)`,
      effects: def.effects,
    });
  }

  // 匹配子命令（只取第一个非选项参数）
  const subcmd = firstSubcommand(args);
  const match = def.subcommands[subcmd];
  if (match) {
    return makeSemantics(match.class, {
      reason: `${commandName} ${subcmd} (user-defined)`,
      effects: match.effects ?? def.effects,
    });
  }

  // 子命令未匹配 → 用基类，标记 opaque
  return makeSemantics(def.class, {
    reason: `${commandName} (user-defined, unrecognized subcommand: ${subcmd || "(none)"})`,
    effects: def.effects,
    opaque: true,
  });
}

/**
 * 检查 reclassify 规则。
 * 同时匹配原始命令名、别名解析后的名称，以及路径形式的 basename——adapter 已按
 * basename 识别命令身份（./bin/git → git adapter），reclassify 应对齐该身份，
 * 否则用户声明在路径形式下静默失效（D-034 覆盖层一致性）。
 * 返回新的 CommandClass，或 null 表示不覆盖。
 */
export function applyReclassify(
  rules: readonly ReclassifyEntry[],
  originalName: string,
  resolvedName: string,
  args: ReadonlyArray<{ value?: string | null }>,
): CommandClass | null {
  const subcmd = fullSubcommand(args);
  const names = originalName === resolvedName ? [originalName] : [originalName, resolvedName];
  if (originalName.includes("/") && !names.includes(basename(originalName))) {
    names.push(basename(originalName));
  }
  for (const rule of rules) {
    if (!names.includes(rule.command)) continue;
    try {
      if (new RegExp(rule.pattern).test(subcmd)) {
        return rule.class;
      }
    } catch {
      // 无效正则，跳过
    }
  }
  return null;
}

/**
 * 创建别名节点：将 executable 的值替换为别名目标，
 * 使 adapter 按目标命令的规则进行分析。
 */
export function aliasNode(
  executable: ShellArg | null,
  targetName: string,
): ShellArg | null {
  if (!executable) return { value: targetName, dynamic: false, span: { start: 0, end: 0 }, quoted: false, raw: targetName };
  return { ...executable, value: targetName };
}
