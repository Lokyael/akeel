// command-semantics/reduce.ts — reduceToFlat 文本归约（T-062 Phase 2 / Task 6）
// 归约前端核心：以原始命令文本的 raw 切片为基础合成扁平文本，重 lex/parse 自校验。
// - 单次调用处理命令内全部可建模 scopes（一个 pass 模板实例化，无拼接，G1）
// - 决不从解码值重序列化：body 命令直接取原 raw span 文本，引号/转义/空白不动
// - 只在双引号区段内且非转义的 `$f` 替换点改写（scanVarRefs 单源，O2）；值转义后
//   插入双引号区段（`"`→`\"`、`$`→`\$`、反引号→`\``、`\`→`\\`；换行/回车原样字面）
// - loop 整体重定向重挂载：首条截断类原样、后续截断类改 `>>`（fd 前缀与 target 引号原样）
// - 合成后立即重 lex/parse 自校验：解析失败/残余动态/带作用域 → null（fail-closed）

import { lex } from "../shell-parse/lexer";
import { parse } from "../shell-parse/parser";
import { scanVarRefs } from "./denote";
import type { LoopScope, ShellCommandNode, ShellRedirectionNode, SourceSpan } from "../shell-parse/types";

export interface ReducedSegment {
  kind: "verbatim" | "expanded";
  text: string;
  spanInReduced: SourceSpan;
  originalSpan: SourceSpan;
}

export interface ReductionResult {
  text: string;
  segments: ReducedSegment[];
  /** 仅各 loop 展开段、多 scope 逐段 `;` 连接的拼接文本（Task 8 expanded form；非全文）。 */
  reductionText: string;
}

export interface ScopeWordValues {
  scope: LoopScope;
  values: readonly string[];
}

/** 值转义（插入双引号区段内；转义后重 lex 即成字面）。
 * 仅需转义 `"`/`$`/反引号/`\` 四类：双引号区内真实换行/回车是字面（lexer 引号内
 * 不产分隔，值原样保留）——把 `\n`/`\r` 映射成反斜杠文本反而会改变词值，破坏判定==展开
 * （计划 T1 的映射假设“自校验会拦”不成立：重 lex 成功但值已漂移）。 */
function escapeValue(v: string): string {
  let out = "";
  for (const ch of v) {
    switch (ch) {
      case '"': out += '\\"'; break;
      case "$": out += "\\$"; break;
      case "`": out += "\\`"; break;
      case "\\": out += "\\\\"; break;
      default: out += ch; // \n/\r 等原样入双引号区段（字面保留）
    }
  }
  return out;
}

/** loop 级重定向重挂载：首条原样；后续仅截断类（`>`/`>|`，含 fd 前缀）改 `>>`；`&>`/`&>>` → null 拒。 */
function remountRedirect(rawCommand: string, redir: ShellRedirectionNode, isFirst: boolean): string | null {
  const slice = rawCommand.slice(redir.span.start, redir.span.end);
  const { tokens, unsafeSyntax } = lex(slice);
  if (unsafeSyntax) return null;
  const op = tokens.find((t) => t.kind === "redirect");
  if (!op) return null;
  if (op.value === "&>" || op.value === "&>>") return null; // 双流形态不建模（含首条）
  if (isFirst) return slice;
  if (op.value === ">" || op.value === ">|") {
    // fd 前缀与 target 引号原样保留，仅改操作符字符
    return slice.slice(0, op.span.start) + ">>" + slice.slice(op.span.end);
  }
  return slice; // `>>`/`<`/`<>`/fd 复制 原样不变
}

/** 一条 body 命令的双引号 `$f` 替换点（绝对坐标）。 */
function collectRefs(body: readonly ShellCommandNode[], loopVar: string): { pos: number; len: number }[] {
  const out: { pos: number; len: number }[] = [];
  for (const cmd of body) {
    const words: { raw: string; span: SourceSpan }[] = [];
    if (cmd.executable) words.push(cmd.executable);
    words.push(...cmd.args, ...cmd.wrapperPositionals, ...cmd.envAssignments);
    for (const r of cmd.redirections) if (r.target) words.push(r.target);
    for (const w of words) {
      const { refs } = scanVarRefs(w.raw);
      for (const ref of refs) {
        if (!ref.inDoubleQuotes || ref.refName !== loopVar) continue;
        out.push({
          pos: w.span.start + ref.rawPos,
          len: ref.brace ? ref.refName.length + 3 : ref.refName.length + 1,
        });
      }
    }
  }
  return out;
}

/** body raw 文本 + 该迭代值的 `$f` 替换。 */
function bodyTextWithValue(rawCommand: string, body: readonly ShellCommandNode[], loopVar: string, value: string): string {
  const start = body[0]!.span.start;
  const end = body[body.length - 1]!.span.end;
  const esc = escapeValue(value);
  const repl = collectRefs(body, loopVar).sort((a, b) => a.pos - b.pos);
  let out = "";
  let cur = start;
  for (const r of repl) {
    if (r.pos < cur) continue; // 防重叠（理论不发生）
    out += rawCommand.slice(cur, r.pos) + esc;
    cur = r.pos + r.len;
  }
  out += rawCommand.slice(cur, end);
  return out;
}

export function reduceToFlat(
  rawCommand: string,
  scopes: readonly LoopScope[],
  scopeWordValues: readonly ScopeWordValues[],
): ReductionResult | null {
  if (scopes.length !== scopeWordValues.length) return null;

  // 每个 scope 的实际文本区间 = header 起点（或更早的 pre-for 重定向）到 doneSpan.end
  const extents = scopes.map((s, i) => {
    const values = scopeWordValues[i]!.values;
    const start = Math.min(s.headerSpan.start, ...s.redirections.map((r) => r.span.start));
    return { scope: s, start, end: s.doneSpan.end, values };
  }).sort((a, b) => a.start - b.start);

  // 区间重叠/嵌套 → null（嵌套 for 不建模；防拼接错位）
  for (let i = 1; i < extents.length; i++) {
    if (extents[i]!.start < extents[i - 1]!.end) return null;
  }

  const segments: ReducedSegment[] = [];
  const parts: string[] = [];
  const expandedParts: string[][] = []; // 每 loop 的展开段（intra-loop 已含 `; ` 前缀）
  let reducedPos = 0;
  let cursor = 0;

  for (const ext of extents) {
    // verbatim 段：cursor → extent.start
    if (ext.start > cursor) {
      const v = rawCommand.slice(cursor, ext.start);
      segments.push({
        kind: "verbatim",
        text: v,
        spanInReduced: { start: reducedPos, end: reducedPos + v.length },
        originalSpan: { start: cursor, end: ext.start },
      });
      parts.push(v);
      reducedPos += v.length;
    }
    cursor = ext.start;

    // 展开段：逐迭代
    const body = ext.scope.body;
    const bodySpan: SourceSpan = body.length > 0
      ? { start: body[0]!.span.start, end: body[body.length - 1]!.span.end }
      : { start: cursor, end: cursor };
    const loopVar = ext.scope.variable.value;
    const loopExpanded: string[] = [];
    for (let vi = 0; vi < ext.values.length; vi++) {
      const bodyText = bodyTextWithValue(rawCommand, body, loopVar, ext.values[vi]!);
      // loop 级重定向重挂载：迭代 ≥1 截断类改 `>>`
      let mountText = "";
      for (let mi = 0; mi < ext.scope.redirections.length; mi++) {
        const m = remountRedirect(rawCommand, ext.scope.redirections[mi]!, vi === 0);
        if (m === null) return null; // &>/&>> 双流等不建模 → fail-closed
        mountText += " " + m;
      }
      const iterText = bodyText + mountText;
      const segText = (vi > 0 ? "; " : "") + iterText;
      segments.push({
        kind: "expanded",
        text: segText,
        spanInReduced: { start: reducedPos, end: reducedPos + segText.length },
        originalSpan: bodySpan,
      });
      parts.push(segText);
      loopExpanded.push(segText);
      reducedPos += segText.length;
    }
    expandedParts.push(loopExpanded);
    cursor = ext.end;
  }

  // 尾 verbatim
  if (cursor < rawCommand.length) {
    const v = rawCommand.slice(cursor);
    segments.push({
      kind: "verbatim",
      text: v,
      spanInReduced: { start: reducedPos, end: reducedPos + v.length },
      originalSpan: { start: cursor, end: rawCommand.length },
    });
    parts.push(v);
    reducedPos += v.length;
  }

  const text = parts.join("");

  // 自校验：重 lex/parse —— 解析失败 / 残余动态 / 仍带作用域或 opaque → null（fail-closed）
  const { tokens: rtokens, unsafeSyntax: rlexErr } = lex(text);
  if (rlexErr) return null;
  const { program: rprogram, error: rparseErr } = parse(rtokens);
  if (rparseErr) return null;
  if (rprogram.dynamic || rprogram.loopScopes.length > 0 || rprogram.opaqueRegions.length > 0) return null;

  // reductionText：仅各 loop 展开段、多 scope 逐段 `;` 连接的拼接文本（非全文）
  const reductionText = expandedParts.map((loopPart) => loopPart.join("")).join("; ");

  return { text, segments, reductionText };
}