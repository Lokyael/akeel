// command-semantics/control-flow.ts — CWD 追踪与控制流分析
// 输入：ShellProgram + 初始 CWD
// 输出：每个命令节点的 CWD + 是否 opaque

import { isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { statSync } from "node:fs";
import type { ShellProgram, ShellCommandNode } from "../shell-parse/types";
import type { CwdCandidate, CwdState } from "./types";

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
  /** 是否为 cd 命令（含 cd 无参数、cd -、cd $x 等 opaque 形态）。 */
  isCd: boolean;
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
    return { isCd: false, target: null, opaque: false };
  }
  // cd 无参数 → ~
  if (node.args.length === 0) {
    return { isCd: true, target: "~", opaque: false };
  }
  // 多于一个参数 → opaque（cd 不允许多个参数，但 Shell 会忽略多余的）
  // 保守处理：多个参数也 opaque
  if (node.args.length > 1) {
    return { isCd: true, target: null, opaque: true };
  }
  const arg = node.args[0]!;
  if (!arg.value || arg.dynamic || arg.value === "-") {
    return { isCd: true, target: null, opaque: true };
  }
  return { isCd: true, target: arg.value, opaque: false };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 在给定 cwd 下解析 cd target。
 * 返回绝对目标与存在性（基于分析时点，statSync）；
 * 不存在时由调用方按后继操作符决定候选建模（D-045：; / newline → 双候选，&& → 单候选）。
 */
export function resolveCdTarget(target: string, currentCwd: string): { cwd: string; exists: boolean } {
  if (target === "~") {
    const home = homedir();
    return { cwd: home, exists: isDirectory(home) };
  }
  const resolved = isAbsolute(target) ? target : resolve(currentCwd, target);
  return { cwd: resolved, exists: isDirectory(resolved) };
}

// ─── 主控制流分析 ───

export interface ControlFlowAnalysis {
  nodes: {
    node: ShellCommandNode;
    cwdBefore: CwdState;
    effectiveCwd: CwdState;
  }[];
  opaque: boolean;
}

/**
 * 分析 ShellProgram 的控制流。
 * 返回每个命令节点在分析时的有效 cwd（semantics 字段恒 null 死字段已删除，
 * 语义分析由 shell-compiler 在 control-flow 之后单独调用 analyzeSemantics）。
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
        effectiveCwd: { ...initial, certainty: "conservative" },
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
      // D-045：目标存在性基于分析时点。存在 → 单候选（现状不变）；不存在且后继为
      // ; / newline（cd 失败后命令仍在旧 cwd 执行）→ 双候选保守 {目标, cd 前 cwd}——
      // 目标可能被前序命令创建（先建后 cd），也可能运行时失败；&& 短路时旧 cwd 分支不存在，不虚构。
      const resolved = before.candidates.map((candidate) => resolveCdTarget(cdInfo.target!, candidate.cwd));
      const targetCandidates = resolved.map((target, index) => ({
        cwd: target.cwd,
        certainty: "exact" as const,
        branch: `${i}:cd:${index}`,
      }));
      const nextOp = program.commands[i + 1]?.operatorBefore;
      const fallback =
        (nextOp === ";" || nextOp === "newline") && resolved.some((r) => !r.exists)
          ? before.candidates
          : [];
      // 候选集恒非空不变量：before.candidates 恒非空（初始候选 1，stateFromCandidates 保序去重非空）
      effectiveCwd = stateFromCandidates([...targetCandidates, ...fallback]);
      if (operator !== "|" && operator !== "&") after = effectiveCwd;
    } else if (cdInfo.opaque) {
      opaque = true;
    }

    result.push({
      node: cmd,
      cwdBefore: before,
      effectiveCwd,
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
    certainty: unique.length === 1 ? "exact" : "conservative",
    candidates: unique,
  };
}
