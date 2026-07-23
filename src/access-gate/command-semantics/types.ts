// command-semantics/types.ts — 命令语义类型定义
// 语义注册表输出和 adapter 接口

import type {
  ShellCommandNode,
  ShellArg,
  SourceSpan,
} from "../shell-parse/types";

// ─── 命令分类 ───

export type CommandClass = "readOnly" | "mutating" | "dangerous" | "unclassified";

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
