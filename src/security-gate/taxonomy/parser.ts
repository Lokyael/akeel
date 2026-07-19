/**
 * taxonomy/parser.ts — Shell command parser and analysis functions.
 *
 * Extracted from taxonomy/index.ts as part of the taxonomy/ module split.
 * Provides quote-aware tokenization, segment splitting, redirection extraction,
 * shell analysis, and read-path extraction.
 *
 * Depends on: taxonomy/types.ts, taxonomy/helpers.ts
 */

import type { ShellSegment, ShellRedirection, ShellAnalysis, LiteralReadPath } from "./types";
import { containsUnquoted, isUnquotedAt, isFdBoundary, normalizeExecutable, commandFromTokens } from "./helpers";

// ─── Tokenizer ───

function tokenizeSegment(text: string): { tokens: string[]; unsafeSyntax: string | null } {
  const tokens: string[] = [];
  let token = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const push = () => {
    if (token.length > 0) tokens.push(token);
    token = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      token += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && !inSingle) {
      token += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      token += ch;
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      token += ch;
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      push();
      continue;
    }
    token += ch;
  }
  if (escaped) return { tokens, unsafeSyntax: "dangling escape" };
  if (inSingle || inDouble) return { tokens, unsafeSyntax: "unterminated quote" };
  push();
  return { tokens, unsafeSyntax: null };
}

// ─── Redirection Parsing ───

function redirectOperatorAt(text: string, index: number): string | null {
  for (const operator of ["&>>", "<<<", ">>", "<<", ">&", "<&", "&>", ">", "<"]) {
    if (text.startsWith(operator, index)) return operator;
  }
  return null;
}

function readRedirectTarget(text: string, start: number): { target: string | null; end: number } {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index++;
  if (index >= text.length || ";|&".includes(text[index])) return { target: null, end: index };

  const quote = text[index] === "'" || text[index] === '"' ? text[index] : null;
  if (quote) {
    index++;
    const targetStart = index;
    while (index < text.length && text[index] !== quote) index++;
    return { target: text.slice(targetStart, index), end: Math.min(index + 1, text.length) };
  }

  const targetStart = index;
  while (index < text.length && !/[\s;|&]/.test(text[index])) index++;
  return { target: text.slice(targetStart, index) || null, end: index };
}

/** Extract redirections from a shell command string (quote-aware). */
export function extractRedirections(text: string): ShellRedirection[] {
  const redirections: ShellRedirection[] = [];
  for (let index = 0; index < text.length; index++) {
    if (!isUnquotedAt(text, index)) continue;
    const operator = redirectOperatorAt(text, index);
    if (!operator) continue;

    let fdStart = index;
    while (fdStart > 0 && /\d/.test(text[fdStart - 1])) fdStart--;
    const hasFd = fdStart < index && isFdBoundary(text, fdStart);
    const fd = hasFd ? Number(text.slice(fdStart, index)) : null;
    const target = readRedirectTarget(text, index + operator.length);
    if ((operator === "<" || operator === ">") && target.target?.startsWith("(")) continue;

    if (operator === ">&" || operator === "<&") {
      const fdTarget = target.target === "-" || /^\d+$/.test(target.target ?? "");
      redirections.push({
        kind: fdTarget ? (target.target === "-" ? "fd-close" : "fd-duplicate") : operator === ">&" ? "file-write" : "file-read",
        target: target.target,
        fd,
      });
    } else if (operator === "<<<") {
      redirections.push({ kind: "here-string", target: target.target, fd });
    } else if (operator === "<<") {
      redirections.push({ kind: "heredoc", target: target.target, fd });
    } else if (operator === ">>" || operator === "&>>") {
      redirections.push({ kind: "file-append", target: target.target, fd: operator === "&>>" ? null : fd });
    } else if (operator === "&>") {
      redirections.push({ kind: "file-write", target: target.target, fd: null });
    } else if (operator === ">") {
      redirections.push({
        kind: fd !== null && target.target === "/dev/null" ? "fd-write" : "file-write",
        target: target.target,
        fd,
      });
    } else if (operator === "<") {
      redirections.push({ kind: "file-read", target: target.target, fd });
    }
    index = Math.max(index, target.end - 1);
  }

  if (containsUnquoted(text, (ch, next) => (ch === "<" || ch === ">") && next === "(")) {
    redirections.push({ kind: "process-substitution", target: null, fd: null });
  }
  return redirections;
}

// ─── Shell Segment Construction ───

function makeShellSegment(text: string, operatorBefore: ShellSegment["operatorBefore"]): ShellSegment {
  const tokenResult = tokenizeSegment(text);
  const hasCommandSubstitution = containsUnquoted(text, (ch, next) => (ch === "$" && next === "(") || ch === "`");
  const hasDynamicExecution = hasCommandSubstitution ||
    containsUnquoted(text, (ch, next, inDouble) => (ch === "$" && next !== "(") || ((!inDouble) && (ch === "*" || ch === "?")) || ((ch === "<" || ch === ">") && next === "("));
  return {
    text: text.trim(),
    tokens: tokenResult.tokens,
    command: commandFromTokens(tokenResult.tokens),
    operatorBefore,
    redirections: extractRedirections(text),
    hasCommandSubstitution,
    hasDynamicExecution,
  };
}

// ─── Full Shell Analysis ───

/** Analyze a restricted, quote-aware shell syntax layer. */
export function analyzeShellCommand(command: string): ShellAnalysis {
  if (command.trim().length === 0) {
    return { segments: [], unsafeSyntax: "empty command", hasAmbiguousRead: false, hasCommandSubstitution: false };
  }

  const segments: ShellSegment[] = [];
  let current = "";
  let operatorBefore: ShellSegment["operatorBefore"] = "start";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let unsafeSyntax: string | null = null;
  let lastWasOperator = false;

  const flush = () => {
    if (!current.trim()) return false;
    segments.push(makeShellSegment(current, operatorBefore));
    current = "";
    lastWasOperator = false;
    return true;
  };

  const setOperator = (operator: ShellSegment["operatorBefore"], width: number) => {
    if (!current.trim() || lastWasOperator) {
      unsafeSyntax = unsafeSyntax ?? "unexpected control operator";
      return width;
    }
    flush();
    operatorBefore = operator;
    lastWasOperator = true;
    return width;
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1] ?? "";
    if (escaped) {
      current += ch;
      escaped = false;
      if (!/\s/.test(ch)) lastWasOperator = false;
      continue;
    }
    if (ch === "\\" && !inSingle) {
      current += ch;
      escaped = true;
      lastWasOperator = false;
      continue;
    }
    if (ch === "'" && !inDouble) {
      current += ch;
      inSingle = !inSingle;
      lastWasOperator = false;
      continue;
    }
    if (ch === '"' && !inSingle) {
      current += ch;
      inDouble = !inDouble;
      lastWasOperator = false;
      continue;
    }
    if (inSingle || inDouble) {
      current += ch;
      if (!/\s/.test(ch)) lastWasOperator = false;
      continue;
    }

    if (ch === "\n") {
      setOperator("newline", 1);
      continue;
    }
    if ((ch === ">" || ch === "<") && next === "&") {
      current += ch + next;
      lastWasOperator = false;
      i++;
      continue;
    }
    if (ch === "&" && next === ">") {
      current += ch + next;
      lastWasOperator = false;
      i++;
      continue;
    }
    if (ch === "&" && next === "&") {
      setOperator("&&", 2);
      i++;
      continue;
    }
    if (ch === "|" && next === "|") {
      setOperator("||", 2);
      i++;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&") {
      setOperator(ch as ";" | "|" | "&", 1);
      continue;
    }
    current += ch;
    if (!/\s/.test(ch)) lastWasOperator = false;
  }

  if (escaped) unsafeSyntax = unsafeSyntax ?? "dangling escape";
  if (inSingle || inDouble) unsafeSyntax = unsafeSyntax ?? "unterminated quote";
  if (lastWasOperator) unsafeSyntax = unsafeSyntax ?? "trailing control operator";
  flush();

  const hasCommandSubstitution = segments.some((segment) => segment.hasCommandSubstitution);
  const hasAmbiguousRead = segments.some((segment) => {
    const commandName = segment.command;
    const args = segment.tokens.slice(1);
    const hasRecursiveFlag = args.some((token) => /^(?:-[^-]*[rR]|--recursive)$/.test(token));
    const hasBroadOperand = args.some((token) => token === "." || token === ".." || token.startsWith("./") || /[*?]/.test(token));
    if (commandName === "find" || commandName === "tree") return true;
    if (commandName === "grep" || commandName === "rg") return hasRecursiveFlag || hasBroadOperand || args.length < 2;
    if (commandName === "ls") return hasRecursiveFlag || hasBroadOperand || args.filter((token) => !token.startsWith("-")).length === 0;
    return false;
  });

  return { segments, unsafeSyntax, hasAmbiguousRead, hasCommandSubstitution };
}

// ─── Read-Path Extraction ───

function literalOperand(token: string): string | null {
  const quoted = token.match(/^(['"])(.*)\1$/);
  const value = quoted ? quoted[2] : token;
  if (!value || /[$*?()]/.test(value) || value.includes("\\")) return null;
  return value;
}

function optionTakesValue(command: string, option: string): boolean {
  return command === "sed" && ["-e", "--expression", "-f", "--file"].includes(option) ||
    command === "awk" && ["-v", "-F", "--field-separator"].includes(option) ||
    command === "cut" && ["-b", "-c", "-d", "-f", "--bytes", "--characters", "--delimiter", "--fields"].includes(option) ||
    command === "diff" && ["-C", "-U", "-L", "--context", "--label", "--unified"].includes(option);
}

function extractReadOperands(command: string, args: string[]): string[] {
  if (command === "sed" || command === "awk") {
    let index = 0;
    while (index < args.length) {
      const arg = args[index];
      if (arg === "--") { index++; break; }
      if (!arg.startsWith("-")) { index++; break; }
      if (optionTakesValue(command, arg)) index++;
      index++;
    }
    return args.slice(index);
  }

  const operands: string[] = [];
  let afterEndOfOptions = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!afterEndOfOptions && arg === "--") {
      afterEndOfOptions = true;
      continue;
    }
    if (!afterEndOfOptions && arg.startsWith("-")) {
      if (optionTakesValue(command, arg)) index++;
      continue;
    }
    operands.push(arg);
  }
  return operands;
}

/** Extract only statically known file operands for the shared path policy. */
export function extractLiteralReadPaths(command: string): LiteralReadPath[] {
  const analysis = analyzeShellCommand(command);
  const paths: LiteralReadPath[] = [];
  for (const segment of analysis.segments) {
    const commandName = segment.command;
    if (!commandName || ["find", "tree"].includes(commandName)) continue;
    const args = segment.tokens.slice(1);
    let operands: string[];
    if (["grep", "rg"].includes(commandName)) {
      if (args.some((arg) => /^(?:-[^-]*[rR]|--recursive)$/.test(arg))) continue;
      const firstOperand = args.findIndex((arg) => !arg.startsWith("-"));
      operands = firstOperand >= 0 ? args.slice(firstOperand + 1) : [];
    } else if (["ls", "cat", "head", "tail", "stat", "file", "realpath", "sed", "awk", "sort", "uniq", "cut", "tr", "diff", "wc"].includes(commandName)) {
      operands = extractReadOperands(commandName, args);
    } else {
      continue;
    }
    for (const operand of operands) {
      const literal = literalOperand(operand);
      if (literal) paths.push({ path: literal, command: commandName });
    }
  }
  return paths;
}

/** Split compound command on quote-aware control operators. */
export function splitCommand(command: string): string[] {
  return analyzeShellCommand(command).segments.map((segment) => segment.text);
}

// ─── Nested Command Unwrapping ───

/** Unwrap nested commands (env var=value cmd, timeout, find -exec, etc.) for recursive rule lookup. */
export function unwrapNestedCommand(segment: string): string | null {
  const tokens = tokenizeSegment(segment).tokens;
  if (tokens.length === 0) return null;
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index++;
  const executable = tokens[index]?.replace(/^['"]|['"]$/g, "").replace(/^.*[\\/]/, "").toLowerCase();
  if (!executable) return null;

  if (["env", "command", "nohup", "exec"].includes(executable)) {
    index++;
    while (index < tokens.length && tokens[index].startsWith("-")) {
      index++;
      if (executable === "exec" && index < tokens.length && !tokens[index].startsWith("-")) index++;
    }
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index++;
    return index < tokens.length ? tokens.slice(index).join(" ") : null;
  }
  if (executable === "timeout") {
    index++;
    while (index < tokens.length && tokens[index].startsWith("-")) index++;
    if (index < tokens.length) index++;
    return index < tokens.length ? tokens.slice(index).join(" ") : null;
  }
  if (executable === "find" || executable === "xargs") {
    const markerIndex = executable === "find" ? tokens.indexOf("-exec") : 1;
    if (markerIndex >= 0 && markerIndex + 1 < tokens.length) {
      const nested = tokens.slice(markerIndex + 1).filter((token) => token !== "{}" && token !== "\\;" && token !== ";" && token !== "+");
      return nested.length > 0 ? nested.join(" ") : null;
    }
  }
  return null;
}
