// command-semantics/types.ts — 命令语义类型定义
// 语义注册表输出和 adapter 接口

import type {
  ShellCommandNode,
  SourceSpan,
} from "../shell-parse/types";
import type { CommandClass, Effect, PathOperation, PathSource } from "../domain";

// 命令分类与 Effect 的定义见 domain.ts（唯一来源）。
// inspect  读取文件 — 所有路径意图均已知，无变更
// modify   写入/删除/移动文件 — 所有目标均已知
// execute  运行代码 — 效果取决于外部内容（脚本、二进制文件、Makefile）
// destroy  不可逆破坏 — 无论信任度如何均不可接受
// unknown  无匹配适配器

export type { CommandClass, Effect, PathOperation, PathSource } from "../domain";

// ─── 路径意图 ───

export interface PathIntent {
  operation: PathOperation;
  rawPath: string;
  source: PathSource;
  span: SourceSpan;
  confidence: "exact" | "conservative";
}

// ─── 完整语义输出 ───

export interface CommandSemantics {
  commandClass: CommandClass;
  effects: readonly Effect[];
  intents: readonly PathIntent[];
  hardRule: string | null;
  opaque: boolean;
  reason: string;
}

// ─── 语义注册表上下文 ───
// 当前所有 adapter 均不消费（analyze 签名保留它作为预留接口，T-059/B2）：
// 供未来需要项目上下文（相对路径解析、staging 判定）的 adapter 接入；
// shell-compiler 仍构造并传入，避免签名反复横跳。

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
// D-037：parser 拥有 wrapper 链，normalize 纯出栈——解包后的命令不再携带 wrapper
// 簿记（恒空 wrappers 字段已移除，诚实形状）。

export interface NormalizedCommand {
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
  certainty: "exact" | "conservative";
  candidates: readonly CwdCandidate[];
}
