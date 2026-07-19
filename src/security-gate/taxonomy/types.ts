/**
 * taxonomy/types.ts — Type definitions for the command classification system.
 *
 * Extracted from taxonomy/index.ts as part of the taxonomy/ module split.
 * These types describe shell commands, their classification, and analysis results.
 */

export type CommandCategory =
  | "read-only" | "vcs-mutate" | "fs-mutate"
  | "destructive" | "privilege" | "remote-exec" | "shell-write";

export type Severity = "safe" | "dangerous" | "critical";
export type PlanAction = "allow" | "block";
export type BuildAction = "allow" | "ask" | "block";

export interface CommandRule {
  id: string;
  description: string;
  plan: PlanAction;
  build: BuildAction;
  category: CommandCategory;
  severity: Severity;
  /** Hard rules cannot be relaxed by permission.bash. */
  hard?: boolean;
  /** Non-hard rules may be relaxed by an explicit bash allow. */
  overrideable?: boolean;
  extractPath?: (cmd: string) => string | null;
}

export type ShellRedirectKind = "fd-write" | "fd-duplicate" | "fd-close" | "file-write" | "file-append" | "file-read" | "heredoc" | "here-string" | "process-substitution";

export interface ShellRedirection {
  kind: ShellRedirectKind;
  target: string | null;
  fd: number | null;
}

export interface ShellSegment {
  text: string;
  tokens: string[];
  command: string | null;
  operatorBefore: "start" | "&&" | "||" | ";" | "|" | "&" | "newline";
  redirections: ShellRedirection[];
  hasCommandSubstitution: boolean;
  hasDynamicExecution: boolean;
}

export interface ShellAnalysis {
  segments: ShellSegment[];
  unsafeSyntax: string | null;
  hasAmbiguousRead: boolean;
  hasCommandSubstitution: boolean;
}

export interface LiteralReadPath {
  path: string;
  command: string;
}

/** Internal: command definition entry (not exported from taxonomy/public) */
export interface CmdDef {
  cmd: string;
  sub?: RegExp;
  rule: CommandRule;
}

/** Internal: pattern definition entry (not exported from taxonomy/public) */
export interface PatDef {
  match: (seg: string) => boolean;
  rule: CommandRule;
}
