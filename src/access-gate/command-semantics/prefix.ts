// command-semantics/prefix.ts — builtin/command 前缀解析单点（T-062 A0-1）
// Q1：analyzeCd（cd 家族判定）、verifyLoopScope 黑名单展开（Phase 2）共用此函数，防前缀解析漂移。
// 与 tilde 单一来源（expandTildeArg）同纪律：一处实现、多消费方同源。

import type { ShellArg, ShellCommandNode } from "../shell-parse/types";

export type PrefixedCommand =
  | { kind: "command"; cmd: string; args: readonly ShellArg[] }
  | { kind: "opaque-options" }
  | null;

/**
 * 解析命令前缀取真实命令名与有效参数列表。
 * - `builtin <cmd> [args...]`：`<cmd>` 为真实命令，args 从其后开始；首个 arg 以 `-` 开头 → opaque-options。
 * - `command` 为 wrapper（parser 已出栈，executable 已是真实命令）→ 返回 null（调用方按 executable 处理）。
 *   ⚠️ 已知边界：parser 在 wrapper-args 态静默跳过 `command -p/-v` 等选项，post-parse 无法区分
 *   `command cd` 与 `command -p cd`（两者 executable 均为 cd）——opaque-options 分支现阶段仅 builtin 可达，
 *   command 选项形态在文档中记为已知边界（模型为 executable 本身，属上近似、安全方向）。
 * - 无 builtin/command 前缀 → null（调用方直接使用 node.executable）。
 */
export function prefixedCommand(node: ShellCommandNode): PrefixedCommand {
  const exe = node.executable?.value?.toLowerCase();
  if (exe !== "builtin") return null;
  const first = node.args[0];
  if (!first || first.value.startsWith("-")) return { kind: "opaque-options" };
  return { kind: "command", cmd: first.value.toLowerCase(), args: node.args.slice(1) };
}