// access-gate/shell-parse — Shell IR 词法/语法分析公共表面（D-018/D-037）

export { lex } from "./lexer";
export type { LexToken } from "./lexer";
export { parse } from "./parser";
export type {
  ShellCommandNode,
  ShellProgram,
  ShellRedirectionNode,
  ShellArg,
  SourceSpan,
  ShellOperator,
  RedirectionKind,
} from "./types";
