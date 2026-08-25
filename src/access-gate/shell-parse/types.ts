// shell-parse/types.ts — Shell IR 类型定义
// 受限 Shell 中间表示，不依赖 command rules 或 Profile

export type ShellOperator = "start" | "&&" | "||" | ";" | "|" | "&" | "newline";

export interface SourceSpan {
  start: number;
  end: number;
}

export interface ShellArg {
  raw: string;
  /** 解码后的词值（lexer 单点产出；bash 词义：引号剥离 + 转义解析）。 */
  value: string;
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
  /** wrapper 的 positional 参数（如 timeout <duration>）：parser 消费不入 args，仅保留供 token 级扫描（D-037）。 */
  wrapperPositionals: readonly ShellArg[];
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
  /** T-062 P1T1：for 作用域（region pass 产出；结构扫描判据；命令不回指，单向无环 W1）。 */
  loopScopes: readonly LoopScope[];
  /** T-062 P1T1：非 for 保留字区（if/while/case/… 全部 opaque，统一 compound-command 拒绝）。 */
  opaqueRegions: readonly OpaqueRegion[];
}

/** for 作用域（T-062 P1T1）。body 为命令引用、唯一来源（R3）；region pass 装配，命令不持有回指（W1）。 */
export interface LoopScope {
  variable: ShellArg;
  words: readonly ShellArg[];
  hasIn: boolean;
  /** for-group 的前操作符（P2 守卫 `|`/`&` 与归约首条承载所需）。 */
  opBefore: ShellOperator;
  /** loop 后首条命令的 operatorBefore（后置 `|`/`&` 守卫；孤立 `&` 一并收进；无后继 = null）。 */
  trailingOperator: ShellOperator | null;
  /** body 命令（唯一来源 R3）。 */
  body: readonly ShellCommandNode[];
  /** loop 级重定向（pre-for 前导 / pre-do 头部 / post-done 尾部，三类位置）。 */
  redirections: readonly ShellRedirectionNode[];
  /** `for...in...; do`（多行形态为 `\ndo` 前缀换行）原始坐标区间。 */
  headerSpan: SourceSpan;
  /** 终止分隔符（`;`/newline）+ `done` 原始坐标区间。 */
  doneSpan: SourceSpan;
}

/** 非 for 保留字区（if/while/case/… 与 C 风格 for、`time`/`!` 管线形态）。 */
export interface OpaqueRegion {
  keyword: string;
  span: SourceSpan;
}
