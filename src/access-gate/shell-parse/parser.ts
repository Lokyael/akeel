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

const WRAPPER_CMDS = new Set(["env", "command", "nohup", "exec", "timeout"]);

/** wrapper 在 executable 之前的额外 positional 参数数量。 */
const WRAPPER_SKIP_COUNT: Record<string, number> = {
  timeout: 1,  // timeout <duration> <command> [args...]
};

const ALL_DIGITS = /^\d+$/;

// ─── 重定向 kind 推断 ───

function redirectKind(op: string, fd: number | null, target: string | null): RedirectionKind {
  if (op === "<" || op === "<>") return "stdin";
  if (op === "<&" || op === ">&") {
    if (target === "-") return "fdClose";
    if (target !== null && ALL_DIGITS.test(target)) return "fdDuplicate";
  }
  if (op === ">" || op === ">|") return fd === 2 ? "stderr" : "stdout";
  if (op === ">>") return fd === 2 ? "stderrAppend" : "stdoutAppend";
  if (op === "&>") return "stdout";
  if (op === "&>>") return "stdoutAppend";
  if (op === "<<") return "heredoc";
  if (op === "<<<") return "hereString";
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

  let target: ShellArg | null = null;
  if (op === "<<" || op === "<<<") {
    if (next?.kind === "word") { target = wordToArg(next); i += 2; }
    else { i += 1; }
  } else {
    if (next?.kind === "word") { target = wordToArg(next); i += 2; }
    else { i += 1; }
  }

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
      // redirect + next word = one redirection unit in the current command
      // 把 redirect token 和下一个 word token 一起推入当前组
      // 我们用特殊标记：保留 redirect token 原位，parser 逐 token 处理
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
  // 0=args-before-cmd (env var assignment)
  // 1=wrappers
  // 2=options (wrapper args)
  // 3=env-assign after wrapper
  // 4=executable
  // 5=arguments and redirections
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
        if (WRAPPER_CMDS.has(cmd)) {
          wrapper.push(arg);
          state = "wrapper-args";
          wrapperSkipRemaining = WRAPPER_SKIP_COUNT[arg.value ?? ""] ?? 0;
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
        // 某些 wrapper 有固定 positional 参数（如 timeout <duration>）
        const wrapperName = wrapper.length > 0 ? wrapper[wrapper.length - 1]!.value : "";
        if (wrapperSkipRemaining > 0) {
          // 把 skippable 参数加入 args，不计为 executable
          args.push(arg);
          wrapperSkipRemaining--;
          i++;
          continue;
        }
        // first non-option after wrapper = executable
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

  // 动态 token 判断（未引用的 $ ` * ? [ ( 等）
  const dynamic = !quoted && [...value].some((ch) => "$`*?[{(".includes(ch));

  return {
    raw: tok.rawValue,
    value,
    quoted,
    dynamic,
    span: tok.span,
  };
}
