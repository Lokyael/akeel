// shell-parse/types.ts — Shell IR 类型定义
// 受限 Shell 中间表示，不依赖 command rules 或 Profile

export type ShellOperator = "start" | "&&" | "||" | ";" | "|" | "&" | "newline";

export interface SourceSpan {
  start: number;
  end: number;
}

export interface ShellArg {
  raw: string;
  value: string | null;
  quoted: boolean;
  dynamic: boolean;
  span: SourceSpan;
}

export type RedirectionKind =
  | "stdin"
  | "stdout"
  | "stdoutAppend"
  | "stderr"
  | "stderrAppend"
  | "fdDuplicate"
  | "fdClose"
  | "heredoc"
  | "hereString";

export interface ShellRedirectionNode {
  kind: RedirectionKind;
  fd: number | null;
  target: ShellArg | null;
  span: SourceSpan;
}

export interface ShellCommandNode {
  envAssignments: readonly ShellArg[];
  wrapper: readonly ShellArg[];
  executable: ShellArg | null;
  args: readonly ShellArg[];
  redirections: readonly ShellRedirectionNode[];
  operatorBefore: ShellOperator;
  span: SourceSpan;
}

export interface ShellProgram {
  commands: readonly ShellCommandNode[];
  unsafeSyntax: string | null;
  dynamic: boolean;
}
