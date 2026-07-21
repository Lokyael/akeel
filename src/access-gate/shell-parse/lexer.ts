// shell-parse/lexer.ts — 受限 Shell 词法分析器
// 输入：shell command string
// 输出：LexToken[] 扁平 token 流，带 source span
// 不依赖 command rules 或 Profile

export type LexTokenKind = "word" | "operator" | "redirect" | "heredoc-body";

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
  raw: string;       // 原始字符（含引号）
  hadQuote: boolean; // word 内出现过引号
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

export function lex(text: string): { tokens: LexToken[]; unsafeSyntax: string | null } {
  const tokens: LexToken[] = [];
  let unsafeSyntax: string | null = null;

  // 当前 word
  let wb: WordBuilder = { raw: "", hadQuote: false };
  let inSingle = false;
  let inDouble = false;

  const flush = () => {
    if (wb.raw.length === 0) return;
    const quoted = wb.hadQuote;
    const dynamic = !quoted && [...wb.raw].some(isDynamic);
    tokens.push({
      kind: "word",
      value: wb.raw,
      span: { start: 0, end: 0 },
      rawValue: wb.raw,
      quoted,
      dynamic,
    });
    wb = { raw: "", hadQuote: false };
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

  const emitOperator = (op: string, start: number) => {
    tokens.push({
      kind: "operator",
      value: op,
      span: { start, end: start + op.length },
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
      wb.raw += ch;
      wb.hadQuote = true;
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) {
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
      if (ch === "\\" && i + 1 < text.length && /[$`"\\\n]/.test(text[i + 1]!)) {
        wb.raw += ch;
        i++;
        continue;
      }
      wb.raw += ch;
      i++;
      continue;
    }

    // ── 以下仅在未引用时 ──

    // 空白 → flush word
    if (/\s/.test(ch)) {
      flush();
      i++;
      while (i < text.length && /\s/.test(text[i]!)) i++;
      continue;
    }

    // 重定向操作符 → flush + emit
    const redir = matchOp(REDIRECT_OPS, text, i);
    if (redir) {
      flush();
      emitRedirect(redir, i);
      i += redir.length;
      continue;
    }

    // 控制操作符 → flush + emit
    const op = matchOp(CTRL_OPS, text, i);
    if (op) {
      flush();
      emitOperator(op, i);
      i += op.length;
      continue;
    }

    // 普通字符
    wb.raw += ch;
    i++;
  }

  // 最后一个 word
  flush();

  // 未闭合引用
  if (inSingle || inDouble) unsafeSyntax = "unterminated quote";

  // 计算准确的 span（基于 rawValue 在原始 text 中的位置）
  let pos = 0;
  for (const tok of tokens) {
    const idx = text.indexOf(tok.rawValue, pos);
    if (idx >= 0) {
      tok.span = { start: idx, end: idx + tok.rawValue.length };
      pos = idx + tok.rawValue.length;
    }
  }

  return { tokens, unsafeSyntax };
}
