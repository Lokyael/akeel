// command-semantics/normalize.ts — Wrapper 规范化
// parser 已把完整 wrapper 链放入 node.wrapper，executable 是真实命令（D-037）：
// - 嵌套 wrapper 由 parser 在 wrapper-args 状态下入栈，wrapper positional 已消费并
//   保留在 node.wrapperArgs 供 token 级扫描；
// - 本模块只做纯出栈：弹出 wrapper 链与 wrapperArgs，不再做猜测、重构或递归
//   （promotion / guessExecutable / removeFromArgs / slice / MAX_UNWRAP_DEPTH 已删除，D-037）。

import type { ShellCommandNode } from "../shell-parse/types";
import type { NormalizedCommand } from "./types";

export function normalizeCommand(node: ShellCommandNode): NormalizedCommand {
  return {
    // 弹出 wrapper 链与 wrapper 簿记：命令的真实参数由 parser 保证，无需再裁切
    command: node.wrapper.length > 0 ? { ...node, wrapper: [], wrapperArgs: [] } : node,
    executable: node.executable?.value ?? null,
  };
}
