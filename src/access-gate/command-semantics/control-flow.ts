// command-semantics/control-flow.ts — CWD 追踪与控制流分析
// 输入：ShellProgram + 初始 CWD
// 输出：每个命令节点的 CWD + 是否 opaque

import { isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import type { ShellProgram, ShellCommandNode, ShellOperator } from "../shell-parse/types";
import type { CwdCandidate, CwdState, CommandSemantics } from "./types";

// ─── 初始状态 ───

export function initialCwd(cwd: string): CwdState {
  return {
    cwd,
    certainty: "exact",
    candidates: [{ cwd, certainty: "exact", branch: "initial" }],
  };
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
    const home = homedir();
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
    cwdBefore: CwdState;
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

  if (program.dynamic || program.unsafeSyntax) {
    return {
      nodes: program.commands.map((cmd) => ({
        node: cmd,
        cwdBefore: initial,
        effectiveCwd: { ...initial, certainty: "joined" },
        semantics: null,
      })),
      opaque: true,
    };
  }

  let previousBefore = initial;
  let previousAfter = initial;

  for (let i = 0; i < program.commands.length; i++) {
    const cmd = program.commands[i]!;
    const operator = cmd.operatorBefore;
    const before = i === 0 || operator === "start" || operator === "&&" || operator === ";" || operator === "newline"
      ? previousAfter
      : previousBefore;
    const cdInfo = analyzeCd(cmd);
    let effectiveCwd = before;
    let after = before;

    if (cdInfo.target) {
      const targets = before.candidates
        .map((candidate) => resolveCdTarget(cdInfo.target!, candidate.cwd))
        .filter((resolved): resolved is { cwd: string; exists: boolean } => resolved !== null)
        .map((resolved, index) => ({
          cwd: resolved.cwd,
          certainty: "exact" as const,
          branch: `${i}:cd:${index}`,
        }));
      if (targets.length === 0) {
        opaque = true;
      } else {
        effectiveCwd = stateFromCandidates(targets);
        if (operator !== "|" && operator !== "&") after = effectiveCwd;
      }
    } else if (cdInfo.opaque) {
      opaque = true;
    }

    result.push({
      node: cmd,
      cwdBefore: before,
      effectiveCwd,
      semantics: null,
    });
    previousBefore = before;
    previousAfter = after;
  }

  return { nodes: result, opaque };
}

function stateFromCandidates(candidates: readonly CwdCandidate[]): CwdState {
  const unique = candidates.filter((candidate, index, values) => values.findIndex((value) => value.cwd === candidate.cwd) === index);
  return {
    cwd: unique[0]?.cwd ?? "",
    certainty: unique.length === 1 ? "exact" : "joined",
    candidates: unique,
  };
}
