// shell-parse/index.ts — 公共入口

export { lex } from "./lexer";
export { parse } from "./parser";
export type { LexToken, LexTokenKind } from "./lexer";
export type {
  ShellProgram,
  ShellCommandNode,
  ShellArg,
  ShellRedirectionNode,
  ShellOperator,
  RedirectionKind,
  SourceSpan,
} from "./types";
