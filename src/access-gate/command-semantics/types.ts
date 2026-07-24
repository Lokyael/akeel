// command-semantics/types.ts — 命令语义类型定义
// 语义注册表输出和 adapter 接口

import type {
  ShellCommandNode,
  ShellArg,
  SourceSpan,
} from "../shell-parse/types";

// ─── 命令分类 ───
// 5 个互斥类，按风险严格递增：inspect < modify < execute < destroy。
// unknown 为找不到匹配适配器的回退分类。
//
// inspect  读取文件 — 所有路径意图均已知，无变更
// modify   写入/删除/移动文件 — 所有目标均已知
// execute  运行代码 — 效果取决于外部内容（脚本、二进制文件、Makefile）
// destroy  不可逆破坏 — 无论信任度如何均不可接受
// unknown  无匹配适配器

export type CommandClass = "inspect" | "modify" | "execute" | "destroy" | "unknown";

// ─── Effect ───

export type Effect =
  | "read"
  | "search"
  | "write"
  | "delete"
  | "permissionChange"
  | "execute"
  | "network"
  | "cwdChange";

// ─── 路径意图 ───

export interface PathIntent {
  operation: "read" | "list" | "search" | "write";
  rawPath: string;
  source: "argument" | "option" | "redirection" | "cwd" | "wrapper";
  span: SourceSpan;
  confidence: "exact" | "conservative";
}

// ─── CWD 转换 ───

export type CwdTransition =
  | { kind: "none" }
  | { kind: "change"; path: string; confidence: "exact" | "opaque" }
  | { kind: "branch"; paths: readonly string[] };

// ─── 完整语义输出 ───

export interface CommandSemantics {
  class: CommandClass;
  effects: readonly Effect[];
  intents: readonly PathIntent[];
  cwdTransition: CwdTransition;
  hardRule: string | null;
  opaque: boolean;
  reason: string;
}

// ─── 语义注册表上下文 ───

export interface SemanticContext {
  projectRoot: string;
  stagingDir: string;
  cwd: string;
}

// ─── Adapter 接口 ───

export interface CommandAdapter {
  names: readonly string[];
  analyze(node: ShellCommandNode, context: SemanticContext): CommandSemantics;
}

// ─── NormalizedCommand（wrapper 解包后） ───

export interface NormalizedCommand {
  wrappers: readonly ShellArg[];
  command: ShellCommandNode;
  executable: string | null;
}

// ─── 控制流分析结果 ───

export interface CwdCandidate {
  cwd: string;
  certainty: "exact" | "conservative";
  branch: string;
}

export interface CwdState {
  cwd: string;
  certainty: "exact" | "joined";
  candidates: readonly CwdCandidate[];
}
