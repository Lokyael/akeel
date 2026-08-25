// command-semantics/normalize.ts — Wrapper 规范化 + time/! 前缀剥离（T-062 A0-1）
// parser 已把完整 wrapper 链放入 node.wrapper，executable 是真实命令（D-037）：
// - 嵌套 wrapper 由 parser 在 wrapper-args 状态下入栈，wrapper positional 已消费并
//   保留在 node.wrapperPositionals 供 token 级扫描；
// - 本模块纯出栈 + 命令位 time/! 简单主体剥离（G7）：弹出 wrapper 链与 wrapperPositionals，
//   再剥 `time`（跳过 `-p`）/ `!` 前导——env/command 包裹时不剥离（time 作外部命令分类）。
//   time/! 的管线形态（time cmd1 | cmd2、! a || b）由 region pass（Phase 1）opaque 吞下，不达此层。

import type { ShellCommandNode } from "../shell-parse/types";
import type { NormalizedCommand } from "./types";

/**
 * 命令位 `!` / `time` 简单主体剥离（G7）。
 * - `! cmd...` → 剥 `!`，取 cmd 为真实命令（否定式不改变路径/效果意图）
 * - `time cmd...` / `time -p cmd...` → 剥 `-p` 与 `time`，取 cmd 为真实命令
 * - 其余 → null（不剥离）
 */
function stripLeadingPrefix(node: ShellCommandNode): ShellCommandNode | null {
  const exe = node.executable?.value?.toLowerCase();
  const args = node.args;
  if (exe === "!") {
    const next = args[0];
    if (!next) return null;
    return { ...node, executable: args[0]!, args: args.slice(1) };
  }
  if (exe === "time") {
    let i = 0;
    while (i < args.length && args[i]!.value === "-p") i++;
    const next = args[i];
    if (!next) return null;
    return { ...node, executable: next, args: args.slice(i + 1) };
  }
  return null;
}

export function normalizeCommand(node: ShellCommandNode): NormalizedCommand {
  // 弹出 wrapper 链与 wrapper 簿记：命令的真实参数由 parser 保证，无需再裁切
  let command: ShellCommandNode = node.wrapper.length > 0
    ? { ...node, wrapper: [], wrapperPositionals: [] }
    : node;
  // G7：env/command 包裹时 time/! 不作保留字处理（time 为外部命令分类）——必须在 wrapper 出栈前判 wrapper。
  const wrappedBy = (name: string) => node.wrapper.some((w) => w.value === name);
  if (!wrappedBy("env") && !wrappedBy("command")) {
    const stripped = stripLeadingPrefix(command);
    if (stripped) command = stripped;
  }
  return { command, executable: command.executable?.value ?? null };
}