// command-semantics/control-flow.ts — CWD 追踪与控制流分析
// 输入：ShellProgram + 初始 CWD
// 输出：每个命令节点的 CWD + 是否 opaque

import { isAbsolute, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { ShellProgram, ShellCommandNode, ShellOperator } from "../shell-parse/types";
import type { CwdState, CommandSemantics } from "./types";

// ─── 初始状态 ───

export function initialCwd(cwd: string): CwdState {
  return { cwd, certainty: "exact" };
}

// ─── cd 命令分析 ───

export interface CdInfo {
  target: string | null;
  opaque: boolean;
}

/**
 * 提取 cd 的目标路径。
 * cd（无参数）→ ~
 * cd path → path（如果 path 不含变量/glob）
 * cd - / pushd / popd → opaque
 */
export function analyzeCd(node: ShellCommandNode): CdInfo {
  if (!node.executable || node.executable.value?.toLowerCase() !== "cd") {
    return { target: null, opaque: false };
  }
  // cd 无参数 → ~
  if (node.args.length === 0) {
    return { target: "~", opaque: false };
  }
  // 多于一个参数 → opaque（cd 不允许多个参数，但 Shell 会忽略多余的）
  // 保守处理：多个参数也 opaque
  if (node.args.length > 1) {
    return { target: null, opaque: true };
  }
  const arg = node.args[0]!;
  if (!arg.value || arg.dynamic || arg.value === "-") {
    return { target: null, opaque: true };
  }
  return { target: arg.value, opaque: false };
}

/**
 * 在给定 cwd 下解析 cd target。
 * 返回新的 cwd，或 null（目标不可用）。
 */
export function resolveCdTarget(target: string, currentCwd: string): { cwd: string; exists: boolean } | null {
  if (target === "~") {
    const home = process.env.HOME || "/home";
    return { cwd: home, exists: existsSync(home) && statSync(home).isDirectory() };
  }
  const resolved = isAbsolute(target) ? target : resolve(currentCwd, target);
  const exists = existsSync(resolved) && statSync(resolved).isDirectory();
  return { cwd: resolved, exists };
}

// ─── 主控制流分析 ───

export interface ControlFlowAnalysis {
  nodes: {
    node: ShellCommandNode;
    effectiveCwd: CwdState;
    semantics: CommandSemantics | null;
  }[];
  opaque: boolean;
}

/**
 * 分析 ShellProgram 的控制流。
 * 返回每个命令节点在分析时的有效 cwd 和语义（如果 adapter 已产生）。
 */
export function analyzeControlFlow(
  program: ShellProgram,
  initial: CwdState,
): ControlFlowAnalysis {
  const result: ControlFlowAnalysis["nodes"] = [];
  let opaque = false;

  // 如果程序有动态 token 或 unsafe syntax → opaque
  if (program.dynamic || program.unsafeSyntax) {
    return {
      nodes: program.commands.map((cmd) => ({
        node: cmd,
        effectiveCwd: { cwd: initial.cwd, certainty: "joined" },
        semantics: null,
      })),
      opaque: true,
    };
  }

  // 遍历每个命令
  // "joined" cwd: 需要 intersection 检查
  let currentCwd = initial.cwd;
  let currentCertainty: "exact" | "joined" = initial.certainty;

  for (let i = 0; i < program.commands.length; i++) {
    const cmd = program.commands[i]!;
    const op = cmd.operatorBefore;

    // 如果前一个操作符是 && 或 ||，尝试 joined cwd
    if (i > 0 && (op === "&&" || op === "||")) {
      // conservative: 使用 joined，需要检查所有可能分支
      // 简单处理：从上个命令的 cd 结果考虑
      // 对于 &&：只有前一个成功才执行，cwd 来自上一个命令
      // 对于 ||：只有前一个失败才执行，cwd 是初始状态
      // 我们不知道成功/失败 → 用 joined
      currentCertainty = "joined";
    }

    if (op === "|") {
      // pipeline: 每个命令在独立 subshell 中执行
      // cwd 变化不传播到右侧
      // 但 pipeline 不改变当前 cwd
      // 保持 current cwd
    }

    // 提取 cd 信息
    const cdInfo = analyzeCd(cmd);
    let effectiveCwd: CwdState = { cwd: currentCwd, certainty: currentCertainty };

    if (cdInfo.target) {
      // 解析 cd target
      const resolved = resolveCdTarget(cdInfo.target, currentCwd);
      if (resolved) {
        effectiveCwd = { cwd: resolved.cwd, certainty: "exact" };
        // 如果没有管道反转，更新 currentCwd
        if (op !== "|" && cmd.executable?.value?.toLowerCase() === "cd") {
          currentCwd = resolved.cwd;
          currentCertainty = "exact";
        }
      } else {
        // 目标不可解析 → opaque
        opaque = true;
      }
    } else if (cdInfo.opaque) {
      // cd - 或 pushd/popd → opaque
      opaque = true;
    }

    result.push({
      node: cmd,
      effectiveCwd,
      semantics: null, // 由 adapter 填充
    });
  }

  return { nodes: result, opaque };
}
