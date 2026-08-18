// command-semantics/overrides.ts — 命令覆盖层
//
// 集中配置（config.yaml，D-041）的 commands 段消费方。
// 内置 adapter 仍是权威来源；本文件把 config.yaml 的 commands 段
// （aliases / commands / reclassify）归一为扩展语义并应用。
//
// 配置来源：$PI_CODING_AGENT_DIR/pi-keel/config.yaml，默认 ~/.pi/agent/pi-keel/config.yaml。
// 语义校验已在 config 层加载期完成（B），此处只读取已校验结果，不再自校验。

import type { CommandClass, CommandSemantics } from "./types";
import type { ShellArg } from "../shell-parse/types";
import { basename } from "node:path";
import { firstWord, fullSubcommand } from "./args";
import { makeSemantics } from "./semantics";
import { SYNTHETIC_SPAN } from "./intent";
import { loadConfig } from "../config";
import type { CommandDef, CommandOverrides, ReclassifyEntry } from "../config";
import { getAgentDir } from "../agent-dir";

// ─── 加载 ───

/** 返回 config.yaml 的 commands 段；无配置/无该段时返回空覆盖。
 * 已校验：config 层加载期完成语义校验（B），损坏配置 fail-closed，不会在此抛错。 */
export function commandOverridesFor(agentDir = getAgentDir()): CommandOverrides {
  const loaded = loadConfig(agentDir);
  if (loaded.kind !== "ok") return {};
  return loaded.value.commands ?? {};
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
