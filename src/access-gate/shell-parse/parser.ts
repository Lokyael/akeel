// shell-parse/parser.ts — 受限 Shell 解析器
// 消费 LexToken[] 流，输出 ShellProgram

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
  if (op === "<" || op === "<>") return "stdin";
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

// ─── 辅助：重定向解析 ───

/**
 * Try to parse a redirect at tokens[i]. Returns the redirection node and new
 * index, or null if the token is not a redirect.
 */
function tryParseRedirect(
  tokens: LexToken[],
  i: number,
): { redirection: ShellRedirectionNode; newIndex: number } | null {
  const tok = tokens[i]!;
  if (tok.kind !== "redirect") return null;

  const next = i + 1 < tokens.length ? tokens[i + 1] : null;
  let fd: number | null = null;
  const op = tok.value;

  // detect fd prefix (e.g. 2>)
  if (i > 0
    && tokens[i - 1]?.kind === "word"
    && ALL_DIGITS.test(tokens[i - 1]!.value)
    && tokens[i - 1]!.span.end === tok.span.start) {
    fd = Number(tokens[i - 1]!.value);
  }

  // heredoc / here-string 与文件重定向同样取下一个 word 作为目标；无目标则只消费自身
  let target: ShellArg | null = null;
  if (next?.kind === "word") { target = wordToArg(next); i += 2; }
  else { i += 1; }

  const kind = redirectKind(op, fd, target?.value ?? null);
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
      span: { start: tok.span.start, end: target ? target.span.end : tok.span.end },
    },
    newIndex: i,
  };
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

function parseCommandGroup(tokens: LexToken[]): Omit<ShellCommandNode, "operatorBefore"> | null {
  // 状态机：
  // preamble     = 命令前导（env assignment / wrapper / executable 判定）
  // wrapper-args = wrapper 参数区（选项 / env assignment / wrapper positional / 嵌套 wrapper / executable）
  // args         = 已进入命令参数区
  let state: "preamble" | "wrapper-args" | "args" = "preamble";

  const envAssignments: ShellArg[] = [];
  const wrapper: ShellArg[] = [];
  let executable: ShellArg | null = null;
  const args: ShellArg[] = [];
  const redirections: ShellRedirectionNode[] = [];

  let i = 0;
  let wrapperSkipRemaining = 0;

  while (i < tokens.length) {
    const tok = tokens[i]!;

    // An adjacent numeric token belongs to the redirect, not command args.
    if (tok.kind === "word"
      && i + 1 < tokens.length
      && tokens[i + 1]?.kind === "redirect"
      && ALL_DIGITS.test(tok.value)
      && tok.span.end === tokens[i + 1]!.span.start) {
      i++;
      continue;
    }

    // ── 处理重定向 ──
    const redirect = tryParseRedirect(tokens, i);
    if (redirect) {
      state = "args";
      redirections.push(redirect.redirection);
      i = redirect.newIndex;
      continue;
    }

    // ── 处理 word token ──
    if (tok.kind === "word") {
      const arg = wordToArg(tok);
      const isEnvAssign = /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok.value);

      if (state === "preamble" && isEnvAssign) {
        envAssignments.push(arg);
        i++;
        continue;
      }

      if (state === "preamble") {
        const cmd = tok.value.toLowerCase();
        if (WRAPPER_CMDS_SET.has(cmd)) {
          wrapper.push(arg);
          state = "wrapper-args";
          wrapperSkipRemaining = WRAPPER_POS_SKIP[arg.value ?? ""] ?? 0;
          i++;
          continue;
        }
        // not a wrapper — it's the executable
        executable = arg;
        state = "args";
        i++;
        continue;
      }

      if (state === "wrapper-args") {
        // wrapper arguments (options or env assignments)
        if (isEnvAssign) {
          envAssignments.push(arg);
          i++;
          continue;
        }
        if (tok.value.startsWith("-")) {
          // wrapper option — skip
          i++;
          continue;
        }
        // 某些 wrapper 有固定 positional 参数（如 timeout <duration>）：
        // parser 消费丢弃，不进入 args——args 只含真实命令参数（D-037）
        if (wrapperSkipRemaining > 0) {
          wrapperSkipRemaining--;
          i++;
          continue;
        }
        // 嵌套 wrapper 继续入栈——executable 永不承载 wrapper（D-037）
        if (WRAPPER_CMDS_SET.has(tok.value.toLowerCase())) {
          wrapper.push(arg);
          wrapperSkipRemaining = WRAPPER_POS_SKIP[arg.value ?? ""] ?? 0;
          i++;
          continue;
        }
        // first non-wrapper, non-option after wrapper = executable
        executable = arg;
        state = "args";
        i++;
        continue;
      }

      if (state === "args") {
        args.push(arg);
        state = "args";
        i++;
        continue;
      }
    }

    // fallback
    i++;
  }

  const allTokens = tokens;
  const span: SourceSpan = allTokens.length > 0
    ? { start: allTokens[0]!.span.start, end: allTokens[allTokens.length - 1]!.span.end }
    : { start: 0, end: 0 };

  return {
    envAssignments,
    wrapper,
    executable,
    args,
    redirections,
    span,
  };
}

function wordToArg(tok: LexToken): ShellArg {
  // 解析引号
  let value: string | null;
  let quoted = tok.quoted;

  if (tok.value.startsWith("'") && tok.value.endsWith("'") && tok.value.length >= 2) {
    value = tok.value.slice(1, -1);
    quoted = true;
  } else if (tok.value.startsWith('"') && tok.value.endsWith('"') && tok.value.length >= 2) {
    value = tok.value.slice(1, -1);
    quoted = true;
  } else {
    value = tok.value;
  }

  // 动态 token 判断：信任 lexer 的 dynamic 标记。
  // lexer 已正确处理：未引用字符中的动态模式 + 双引号内的 $ 和 `。
  // 单引号内的所有字符（包括 $ `）都是字面量，dynamic 保持 false。
  const dynamic = tok.dynamic;

  return {
    raw: tok.rawValue,
    value,
    quoted,
    dynamic,
    span: tok.span,
  };
}
