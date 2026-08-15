// command-semantics/overrides.ts — 命令覆盖层
//
// 集中配置（config.yaml，D-041）的 commands 段消费方。
// 内置 adapter 仍是权威来源；本文件把 config.yaml 的 commands 段
// （aliases / commands / reclassify）归一为扩展语义并应用。
//
// 配置来源：$PI_CODING_AGENT_DIR/pi-keel/config.yaml，默认 ~/.pi/agent/pi-keel/config.yaml。

import type { CommandClass, CommandSemantics } from "./types";
import type { ShellArg } from "../shell-parse/types";
import { basename } from "node:path";
import { firstWord, fullSubcommand, makeSemantics, SYNTHETIC_SPAN } from "./adapters/shared";
import { COMMAND_CLASS_SET, EFFECT_SET } from "../domain";
import { loadConfig } from "../config";
import type { CommandDef, CommandOverrides, ReclassifyEntry } from "../config";
import { getAgentDir } from "../agent-dir";

// ─── 运行时校验 ───

function validateCommandDef(name: string, def: CommandDef): void {
  if (!COMMAND_CLASS_SET.has(def.class)) {
    throw new Error(`config.yaml: ${name}: invalid class "${def.class}"`);
  }
  if (def.effects && !def.effects.every((effect) => EFFECT_SET.has(effect))) {
    const bad = def.effects.find((effect) => !EFFECT_SET.has(effect))!;
    throw new Error(`config.yaml: ${name}: invalid effect "${bad}"`);
  }
  if (def.subcommands) {
    for (const [sc, sub] of Object.entries(def.subcommands)) {
      if (!COMMAND_CLASS_SET.has(sub.class)) {
        throw new Error(`config.yaml: ${name}.${sc}: invalid class "${sub.class}"`);
      }
      if (sub.effects && !sub.effects.every((effect) => EFFECT_SET.has(effect))) {
        const bad = sub.effects.find((effect) => !EFFECT_SET.has(effect))!;
        throw new Error(`config.yaml: ${name}.${sc}: invalid effect "${bad}"`);
      }
    }
  }
}

// ─── 加载 ───

/** 记忆已校验的 commands 对象（引用来自 loadConfig 缓存，同一 agentDir 稳定；
 * 配置变化重新加载后是新对象，自动重新校验；无需显式 reset 联动）。 */
const _validated = new WeakSet<CommandOverrides>();

/** 返回 config.yaml 的 commands 段；无配置/无该段时返回空覆盖。 */
export function loadOverrides(agentDir = getAgentDir()): CommandOverrides {
  const loaded = loadConfig(agentDir);
  if (loaded.kind !== "ok") return {};
  const commands = loaded.value.commands;
  if (!commands) return {};

  // 已校验对象直接返回（避免每次命令分析重复校验，原 _cache 语义，D-041）
  if (_validated.has(commands)) return commands;

  // 运行时校验 class 字段（commands 和 reclassify）
  if (commands.commands) {
    for (const [name, def] of Object.entries(commands.commands)) {
      validateCommandDef(name, def);
    }
  }
  if (commands.reclassify) {
    for (const rule of commands.reclassify) {
      if (!COMMAND_CLASS_SET.has(rule.class)) {
        throw new Error(`config.yaml: reclassify[${rule.command}]: invalid class "${rule.class}"`);
      }
    }
  }
  _validated.add(commands);
  return commands;
}

// ─── 应用覆盖 ───
// 子命令提取：commands 分发用引擎 positional[0]（首词，T-059）；reclassify pattern 用
// fullSubcommand（含选项尾部，raw 契约，D-024）。known 局限（取值选项值不跳过）见 shared.ts/D-024。

/**
 * 应用 CommandDef 产生语义结果。
 * 用于 config.yaml commands 段中完整定义的命令。
 */
export function applyCommandDef(
  def: CommandDef,
  args: readonly ShellArg[],
  commandName: string,
): CommandSemantics {
  // 无子命令定义 → 直接返回基类
  if (!def.subcommands || Object.keys(def.subcommands).length === 0) {
    return makeSemantics(def.class, {
      reason: `${commandName} (user-defined)`,
      effects: def.effects,
    });
  }

  // 匹配子命令（首词；用户定义命令无 valueOptions 感知，D-024）。
  // firstWord（raw 契约）替代整台引擎取 positional[0]（E）；`-` 按位置词、`--` 终止，与引擎语义一致。
  const subcmd = firstWord(args, { dashIsOption: false });
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
 * 否则用户声明在路径形式下静默失效（D-024 覆盖层一致性）。
 * 返回新的 CommandClass，或 null 表示不覆盖。
 */
export function applyReclassify(
  rules: readonly ReclassifyEntry[],
  originalName: string,
  resolvedName: string,
  args: readonly ShellArg[],
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
  if (!executable) return { value: targetName, dynamic: false, span: SYNTHETIC_SPAN, quoted: false, raw: targetName };
  return { ...executable, value: targetName };
}
