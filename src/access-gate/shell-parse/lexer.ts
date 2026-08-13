// shell-parse/lexer.ts — 受限 Shell 词法分析器
// 输入：shell command string
// 输出：LexToken[] 扁平 token 流，带 source span
// 不依赖 command rules 或 Profile

const LEXER_LIMITS = {
  maxTokens: 4_096,
} as const;

type LexTokenKind = "word" | "operator" | "redirect" | "heredoc-body";

export interface LexToken {
  kind: LexTokenKind;
  value: string;
  span: { start: number; end: number };
  rawValue: string;
  quoted: boolean;
  dynamic: boolean;
}

/**
 * lexer 内部状态：每个 word 独立追踪引用状态。
 */
interface WordBuilder {
  raw: string;              // 原始字符（含引号）
  start: number;            // 首个字符在原文中的位置（T-059/B3：扫描时直记 span）
  hadQuote: boolean;        // word 内出现过引号
  hadDynamicInDouble: boolean;  // $ 或 ` 出现在双引号内（触发命令替换）
}

function isDynamic(ch: string): boolean {
  return "$`*?[{(".includes(ch);
}

/** 长匹配优先的重定向操作符。 */
const REDIRECT_OPS = ["&>>", "<<<", ">>&", "<>&", ">>", "<<", ">&", "<&", "&>", ">|", "<>", ">", "<"];

function matchOp(ops: string[], text: string, index: number): string | null {
  for (const op of ops) {
    if (text.startsWith(op, index)) return op;
  }
  return null;
}

const CTRL_OPS = ["&&", "||", ";", "|", "&"];

/** 行尾延续操作符：其后紧跟换行时，换行不构成命令分隔（bash 语义：a &&\nb 等价 a && b）。 */
const LINE_CONTINUATION_OPS = new Set(["&&", "||", "|", "&"]);

export function lex(text: string): { tokens: LexToken[]; unsafeSyntax: string | null } {
  if (text.length > LEXER_LIMITS.maxTokens * 20) return { tokens: [], unsafeSyntax: "input exceeds the lexer budget" };
  const tokens: LexToken[] = [];
  let unsafeSyntax: string | null = null;

  // 当前 word
  let wb: WordBuilder = { raw: "", start: 0, hadQuote: false, hadDynamicInDouble: false };
  let inSingle = false;
  let inDouble = false;

  const flush = (end: number) => {
    if (wb.raw.length === 0) return;
    const quoted = wb.hadQuote;
    // 未引用 → 检查原始字符中的动态模式
    // 双引号内出现 $ 或 ` → 命令替换仍然生效，标记为动态
    const dynamic = (!quoted && [...wb.raw].some(isDynamic)) || wb.hadDynamicInDouble;
    tokens.push({
      kind: "word",
      value: wb.raw,
      span: { start: wb.start, end },
      rawValue: wb.raw,
      quoted,
      dynamic,
    });
    wb = { raw: "", start: 0, hadQuote: false, hadDynamicInDouble: false };
  };

  const beginWord = (at: number) => {
    if (wb.raw.length === 0) wb.start = at;
  };

  const emitRedirect = (op: string, start: number) => {
    tokens.push({
      kind: "redirect",
      value: op,
      span: { start, end: start + op.length },
      rawValue: op,
      quoted: false,
      dynamic: false,
    });
  };

  const emitOperator = (op: string, start: number, end?: number) => {
    tokens.push({
      kind: "operator",
      value: op,
      span: { start, end: end ?? start + op.length },
      rawValue: op,
      quoted: false,
      dynamic: false,
    });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;

    // ── 注释 #（未引用且为行首或前有空白）──
    if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(text[i - 1]))) {
      const end = text.indexOf("\n", i);
      i = end >= 0 ? end : text.length;
      continue;
    }

    // ── 反斜杠换行 continuation ──
    if (ch === "\\" && i + 1 < text.length && text[i + 1] === "\n" && !inSingle) {
      i += 2;
      continue;
    }

    // ── 引用 ──
    if (ch === "'" && !inDouble) {
      beginWord(i);
      wb.raw += ch;
      wb.hadQuote = true;
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) {
      beginWord(i);
      wb.raw += ch;
      wb.hadQuote = true;
      inDouble = !inDouble;
      i++;
      continue;
    }

    // ── 在引用中：直接追加（含双引号内的转义）──
    if (inSingle) {
      wb.raw += ch;
      i++;
      continue;
    }
    if (inDouble) {
      // 反斜杠转义：跳过下一个字符（"\$" → 字面量 "$"）
      if (ch === "\\" && i + 1 < text.length && /[$`"\\\n]/.test(text[i + 1]!)) {
        wb.raw += ch;
        wb.raw += text[i + 1]!;
        i += 2;
        continue;
      }
      // $ 和 ` 在双引号内仍然触发命令替换（与单引号不同）
      if (ch === "$" || ch === "`") {
        wb.hadDynamicInDouble = true;
      }
      wb.raw += ch;
      i++;
      continue;
    }

    // ── 以下仅在未引用时 ──

    // 空白 → flush word
    if (/\s/.test(ch)) {
      flush(i);
      const runStart = i;
      i++;
      while (i < text.length && /\s/.test(text[i]!)) i++;
      // 换行判断基于整个空白 run：run 内含 \n/\r 即产分隔 token——
      // 换行前的空格/制表符（尾随空白）不改变分隔语义，不能只看 run 首字符
      const runText = text.slice(runStart, i);
      if (/[\n\r]/.test(runText)) {
        // 行尾延续：run 前 token 是 && || | &（延续）或重定向操作符（目标可跨行）时
        // 不产分隔 token（bash 语义）；否则 newline 是命令分隔符
        const last = tokens[tokens.length - 1];
        const continues = last?.kind === "redirect"
          || (last?.kind === "operator" && LINE_CONTINUATION_OPS.has(last.value));
        if (!continues) emitOperator("newline", runStart, i);
      }
      continue;
    }

    // 重定向操作符 → flush + emit
    const redir = matchOp(REDIRECT_OPS, text, i);
    if (redir) {
      flush(i);
      emitRedirect(redir, i);
      i += redir.length;
      continue;
    }

    // 控制操作符 → flush + emit
    const op = matchOp(CTRL_OPS, text, i);
    if (op) {
      flush(i);
      emitOperator(op, i);
      i += op.length;
      continue;
    }

    // 普通字符
    beginWord(i);
    wb.raw += ch;
    i++;
  }

  // 最后一个 word
  flush(text.length);

  // 未闭合引用
  if (inSingle || inDouble) unsafeSyntax = "unterminated quote";

  if (tokens.length > LEXER_LIMITS.maxTokens) return { tokens: [], unsafeSyntax: "token count exceeds the lexer budget" };
  return { tokens, unsafeSyntax };
}
