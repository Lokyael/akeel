// command-semantics/normalize.ts — Wrapper 规范化
// 递归解包已知 wrapper，支持嵌套和深层链

import type { ShellCommandNode, ShellArg } from "../shell-parse/types";
import type { NormalizedCommand } from "./types";

const MAX_UNWRAP_DEPTH = 5;
const WRAPPER_NAMES = new Set(["env", "command", "nohup", "exec", "timeout"]);

/** wrapper 在 args 前的额外 positional 参数数。 */
const WRAPPER_POS_SKIP: Record<string, number> = {
  timeout: 1,
};

export function normalizeCommand(
  node: ShellCommandNode,
  depth = 0,
): NormalizedCommand | null {
  if (depth > MAX_UNWRAP_DEPTH) return null;

  // 先从 wrapper 数组尾部开始展开
  if (node.wrapper.length > 0) {
    const outer = node.wrapper[node.wrapper.length - 1]!.value?.toLowerCase();
    if (outer && WRAPPER_NAMES.has(outer)) {
      const inner = unwrap(node, outer);
      if (!inner) return null;
      return normalizeCommand(inner, depth + 1);
    }
  }

  // executable 自身可能是嵌套 wrapper（parser 把它放在了 executable）
  const cmd = node.executable?.value?.toLowerCase();
  if (cmd && WRAPPER_NAMES.has(cmd)) {
    // 把 executable 提升为 wrapper，递归展开
    if (node.executable) {
      const promoted: ShellCommandNode = {
        wrapper: [...node.wrapper, node.executable],
        envAssignments: node.envAssignments,
        executable: null,
        args: node.args,
        redirections: node.redirections,
        operatorBefore: node.operatorBefore,
        span: node.span,
      };
      return normalizeCommand(promoted, depth + 1);
    }
  }

  // 非 wrapper → 从 args 推断 executable（如被提升为 wrapper 后 executable=null）
  const resolvedExecutable = cmd ?? guessExecutable(node);
  const { adjustedArgs, adjustedExecutable } = resolvedExecutable && resolvedExecutable !== cmd
    ? removeFromArgs(node, resolvedExecutable)
    : { adjustedArgs: node.args, adjustedExecutable: node.executable };

  const finalNode = resolvedExecutable !== (node.executable?.value ?? null)
    ? { ...node, args: adjustedArgs, executable: adjustedExecutable }
    : node;

  return {
    wrappers: [],
    command: finalNode,
    executable: resolvedExecutable,
  };
}

/** 从 args 中找到并移除 executable token。 */
function removeFromArgs(node: ShellCommandNode, executableValue: string): { adjustedArgs: typeof node.args; adjustedExecutable: typeof node.executable } {
  const idx = node.args.findIndex((a) => a.value === executableValue);
  if (idx >= 0) {
    const newArgs = [...node.args];
    const found = newArgs.splice(idx, 1)[0]!;
    return { adjustedArgs: newArgs, adjustedExecutable: found };
  }
  return { adjustedArgs: node.args, adjustedExecutable: null };
}

/** 从 args 中推断 executable。 */
function guessExecutable(node: ShellCommandNode): string | null {
  for (const arg of node.args) {
    const val = arg.value;
    if (!val) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(val)) continue;
    if (val.startsWith("-")) continue;
    return val;
  }
  return null;
}

/**
 * 解包最外层 wrapper。
 * 只做结构转换：移除 wrapper 名、跳过 positional 参数。
 * 不推导 executable（由递归 normalizeCommand 处理）。
 */
function unwrap(
  node: ShellCommandNode,
  wrapperName: string,
): ShellCommandNode | null {
  // 尾部 wrapper 出栈
  const newWrappers = node.wrapper.slice(0, -1);

  // 跳过已知 positional 参数（如 timeout 的 duration）
  const skip = WRAPPER_POS_SKIP[wrapperName] ?? 0;
  const newArgs = node.args.slice(skip);

  return {
    wrapper: newWrappers,
    envAssignments: node.envAssignments,
    executable: node.executable,
    args: newArgs,
    redirections: node.redirections,
    operatorBefore: node.operatorBefore,
    span: node.span,
  };
}
