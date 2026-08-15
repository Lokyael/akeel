// shell-parse/parser.ts — 受限 Shell 解析器
// 消费 LexToken[] 流，输出 ShellProgram
// 结构：resolvePreamble（命令前导：env/wrapper 链/executable，D-037 契约单点）
//     + tryParseRedirect（重定向唯一 owner：fd 数字邻接折叠在内，主循环不再跳过）
//     + parseCommandGroup（编排：preamble + 重定向/参数循环）

import type { LexToken } from "./lexer";
import type {
  ShellProgram,
  ShellCommandNode,
  ShellArg,
  ShellRedirectionNode,
  ShellOperator,
  RedirectionKind,
  SourceSpan,
} from "./types";
import { WRAPPER_CMDS_SET, WRAPPER_POS_SKIP } from "./wrappers";

const ALL_DIGITS = /^\d+$/;

// ─── 重定向 kind 推断 ───

function redirectKind(op: string, fd: number | null, target: string | null): RedirectionKind {
  if (op === "<") return "stdin";
  // <> 是 O_RDWR 读写打开：按 write 侧建模（write⇒read 一致性原则 D-017——
  // 允许写的路径应允许读，write 决策即覆盖双面；只建模 read 会漏写侧）
  if (op === "<>") return fd === 2 ? "stderr" : "stdout";
  // <&N / >&N：fd 复制；<&- / >&-：fd 关闭
  if (op === "<&" || op === ">&") {
    if (target === "-") return "fdClose";
    if (target !== null && ALL_DIGITS.test(target)) return "fdDuplicate";
    // 非数字目标（如 >&file）不是 fd 复制——落到下方 >& 分支按 stdout/stderr 处理
  }
  if (op === ">" || op === ">|") return fd === 2 ? "stderr" : "stdout";
  if (op === ">>") return fd === 2 ? "stderrAppend" : "stdoutAppend";
  if (op === "&>") return "stdout";
  if (op === "&>>") return "stdoutAppend";
  if (op === "<<") return "heredoc";
  if (op === "<<<") return "hereString";
  // >&file（非数字目标回退到这里）：按 fd 决定 stdout/stderr；POSIX 双流语义
  // （>&file 同时重定向 stdout+stderr）不在建模范围（D-037）——路径检查只关心
  // write intent，流选择无安全差异
  if (op === ">&") return fd === 2 ? "stderr" : "stdout";
  return "stdout";
}

// ─── 辅助：重定向解析（唯一 owner） ───

/**
 * Try to parse a redirect at tokens[i]. Returns the redirection node and new
 * index, or null if the token is not a redirect.
 *
 * fd 数字邻接（2>err）折叠在此单点：数字 word + 相邻（span 紧邻）redirect 一体
 * 消费为带 fd 的重定向——数字 word 永不落入 args，主循环无需独立跳过分支。
 * 两种入口：tokens[i] 是 redirect（无 fd 前缀），或 tokens[i] 是 fd 前缀数字 word。
 */
function tryParseRedirect(
  tokens: LexToken[],
  i: number,
): { redirection: ShellRedirectionNode; newIndex: number } | null {
  let opTok: LexToken;
  let fd: number | null = null;
  let j = i;

  if (tokens[i]?.kind === "redirect") {
    opTok = tokens[i]!;
  } else if (isFdPrefixAt(tokens, i)) {
    // fd 前缀（2>）：数字 word + 相邻 redirect 一体消费（原始文本判定——
    // 引号内数字（'2'>f）是参数而非 fd 前缀，bash 要求 fd 数字未引用）
    fd = Number(tokens[i]!.value);
    j = i + 1;
    opTok = tokens[j]!;
  } else {
    return null;
  }

  // heredoc / here-string 与文件重定向同样取下一个 word 作为目标；无目标则只消费自身
  let target: ShellArg | null = null;
  let newIndex = j + 1;
  if (tokens[j + 1]?.kind === "word") { target = wordToArg(tokens[j + 1]!); newIndex = j + 2; }

  const kind = redirectKind(opTok.value, fd, target?.value ?? null);
  if (fd === null) {
    if (kind === "stdin" || kind === "heredoc" || kind === "hereString") fd = 0;
    else if (kind === "stderr" || kind === "stderrAppend") fd = 2;
    else fd = 1;
  }

  return {
    redirection: {
      kind,
      fd,
      target,
      span: { start: opTok.span.start, end: target ? target.span.end : opTok.span.end },
    },
    newIndex,
  };
}

/** tokens[i] 是否为 fd 数字前缀（未引用数字 word + 相邻 redirect），preamble 遇此即止。
 * 以原始文本（raw）判定：引号内数字（'2'）不是 fd 前缀（bash 语义），
 * 转义数字（\2）同样不是——raw 保留引号与转义，解码 value 会误判。 */
function isFdPrefixAt(tokens: LexToken[], i: number): boolean {
  return tokens[i]?.kind === "word"
    && ALL_DIGITS.test(tokens[i]!.raw)
    && tokens[i + 1]?.kind === "redirect"
    && tokens[i]!.span.end === tokens[i + 1]!.span.start;
}

// ─── 命令前导解析（D-037 wrapper 契约单点） ───

interface Preamble {
  envAssignments: ShellArg[];
  /** wrapper 链（嵌套入栈顺序；executable 永不承载 wrapper，D-037）。 */
  wrapper: ShellArg[];
  /** wrapper 的 positional 参数（如 timeout <duration>）：parser 消费不入 args，仅保留供 token 级扫描（D-037）。 */
  wrapperPositionals: ShellArg[];
  executable: ShellArg | null;
  /** 前导结束后的首个 token 索引（重定向或命令参数区起点）。 */
  index: number;
}

/**
 * 解析命令前导：env assignment（preamble 态）、wrapper 链（wrapper-args 态：
 * 选项跳过 / env / skip 计数 positional / 嵌套 wrapper）、executable。
 * 遇重定向（含 fd 前缀）即止——executable 永不在此后设置（与既有语义一致：
 * 重定向把剩余词推进 args 态，executable 保持 null）。
 */
function resolvePreamble(tokens: LexToken[]): Preamble {
  let state: "preamble" | "wrapper-args" = "preamble";
  const envAssignments: ShellArg[] = [];
  const wrapper: ShellArg[] = [];
  const wrapperPositionals: ShellArg[] = [];
  let executable: ShellArg | null = null;
  let wrapperSkipRemaining = 0;
  let i = 0;

  while (i < tokens.length) {
    // 重定向（含 fd 前缀）：停止前导解析，executable 不再设置
    if (tokens[i]!.kind === "redirect" || isFdPrefixAt(tokens, i)) break;
    if (tokens[i]!.kind !== "word") { i++; continue; }

    const arg = wordToArg(tokens[i]!);
    // env 赋值判定以原始文本为准（bash：赋值名必须未引用）——`FOO='bar'` 是赋值，
    // `'FOO=bar'` 是命令名（词义解码后两者同形，raw 保留引号可区分）
    const isEnvAssign = /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]!.raw);

    if (state === "preamble" && isEnvAssign) {
      envAssignments.push(arg);
      i++;
      continue;
    }
    if (state === "preamble") {
      const cmd = tokens[i]!.value.toLowerCase();
      if (WRAPPER_CMDS_SET.has(cmd)) {
        wrapper.push(arg);
        state = "wrapper-args";
        wrapperSkipRemaining = WRAPPER_POS_SKIP[arg.value] ?? 0;
        i++;
        continue;
      }
      // 非 wrapper —— 是 executable
      executable = arg;
      i++;
      break;
    }

    // state === "wrapper-args"
    if (isEnvAssign) {
      envAssignments.push(arg);
      i++;
      continue;
    }
    if (tokens[i]!.value.startsWith("-")) {
      // wrapper option — skip
      i++;
      continue;
    }
    // 某些 wrapper 有固定 positional 参数（如 timeout <duration>）：
    // parser 消费不入 args——args 只含真实命令参数（D-037）；token 保留在
    // wrapperPositionals 供 threatScan 扫描（时长槽不能成为威胁扫描盲区）
    if (wrapperSkipRemaining > 0) {
      wrapperPositionals.push(arg);
      wrapperSkipRemaining--;
      i++;
      continue;
    }
    // 嵌套 wrapper 继续入栈——executable 永不承载 wrapper（D-037）
    if (WRAPPER_CMDS_SET.has(tokens[i]!.value.toLowerCase())) {
      wrapper.push(arg);
      wrapperSkipRemaining = WRAPPER_POS_SKIP[arg.value] ?? 0;
      i++;
      continue;
    }
    // first non-wrapper, non-option after wrapper = executable
    executable = arg;
    i++;
    break;
  }

  return { envAssignments, wrapper, wrapperPositionals, executable, index: i };
}

// ─── 主解析函数 ───

export function parse(tokens: LexToken[]): { program: ShellProgram; error: string | null } {
  if (tokens.length === 0) {
    return { program: { commands: [], unsafeSyntax: null, dynamic: false }, error: "empty command" };
  }

  const commands: ShellCommandNode[] = [];
  let error: string | null = null;
  const totalDynamic = tokens.some((t) => t.dynamic);

  // 分割 token 流为 command groups
  const groups: { tokens: LexToken[]; opBefore: ShellOperator }[] = [];
  let currentGroup: LexToken[] = [];
  let lastOp: ShellOperator = "start";

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === "operator") {
      // flush current group
      groups.push({ tokens: currentGroup, opBefore: lastOp });
      currentGroup = [];
      lastOp = tok.value as ShellOperator;
    } else if (tok.kind === "redirect") {
      // redirect token 留在组内原位，parseCommandGroup 用 tryParseRedirect 处理
      currentGroup.push(tok);
    } else {
      currentGroup.push(tok);
    }
  }
  groups.push({ tokens: currentGroup, opBefore: lastOp });

  // 过滤空组
  const nonEmpty = groups.filter((g) => g.tokens.length > 0);

  for (const group of nonEmpty) {
    const parsed = parseCommandGroup(group.tokens);
    if (!parsed) {
      error = "invalid command syntax";
      continue;
    }
    commands.push({
      ...parsed,
      operatorBefore: group.opBefore,
    });
  }

  // 剩余没有 command 的情况（全空）
  if (commands.length === 0 && nonEmpty.length === 0) {
    // 所有组都为空 → 空命令
    return { program: { commands: [], unsafeSyntax: null, dynamic: totalDynamic }, error: "empty command" };
  }

  // 计算 unsafeSyntax
  const unsafe = error ? error : null;

  return {
    program: { commands, unsafeSyntax: unsafe, dynamic: totalDynamic },
    error: unsafe,
  };
}

/**
 * 解析单个命令组：前导（env/wrapper/executable，resolvePreamble）+
 * 重定向与参数循环。重定向在任意位置由 tryParseRedirect 单一消费；其余 word 落 args。
 */
function parseCommandGroup(tokens: LexToken[]): Omit<ShellCommandNode, "operatorBefore"> | null {
  const preamble = resolvePreamble(tokens);
  const { envAssignments, wrapper, wrapperPositionals, executable } = preamble;
  const args: ShellArg[] = [];
  const redirections: ShellRedirectionNode[] = [];

  let i = preamble.index;
  while (i < tokens.length) {
    const redirect = tryParseRedirect(tokens, i);
    if (redirect) {
      redirections.push(redirect.redirection);
      i = redirect.newIndex;
      continue;
    }
    if (tokens[i]?.kind === "word") {
      args.push(wordToArg(tokens[i]!));
    }
    i++;
  }

  const span: SourceSpan = tokens.length > 0
    ? { start: tokens[0]!.span.start, end: tokens[tokens.length - 1]!.span.end }
    : { start: 0, end: 0 };

  return {
    envAssignments,
    wrapper,
    wrapperPositionals,
    executable,
    args,
    redirections,
    span,
  };
}

function wordToArg(tok: LexToken): ShellArg {
  // 词值已在 lexer 解码（bash 词义：引号剥离 + 转义解析，词义单点）；
  // 此处直通字段映射，不再二次解析引号（D-037 后 lexer 拥有区域状态机）。
  return {
    raw: tok.raw,
    value: tok.value,
    quoted: tok.quoted,
    dynamic: tok.dynamic,
    span: tok.span,
  };
}
