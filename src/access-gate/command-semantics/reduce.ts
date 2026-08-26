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

interface ReductionResult {
  text: string;
  segments: ReducedSegment[];
  /** 仅各 loop 展开段、多 scope 逐段 `;` 连接的拼接文本（expanded form 展示；非全文）。 */
  expandedText: string;
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

/** 单条 body 命令的双引号 `$f` 替换点（绝对坐标）。 */
function collectRefs(cmd: ShellCommandNode, loopVar: string): { pos: number; len: number }[] {
  const out: { pos: number; len: number }[] = [];
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
  return out;
}

/** 单条 body 命令 tile 的 raw 文本 + 该 tile 内 `$f` 替换（lead 承载迭代分隔 `; ` 前缀）。
 * tile = [cmd.span.start, tileEnd)：命令本体 + 其后分隔符（`&&`/`;` 等归前段，文本全等前提）。 */
function tileTextWithValue(
  rawCommand: string,
  cmd: ShellCommandNode,
  tileEnd: number,
  loopVar: string,
  value: string,
  lead: string,
): string {
  const esc = escapeValue(value);
  const repl = collectRefs(cmd, loopVar).sort((a, b) => a.pos - b.pos);
  let out = lead;
  let cur = cmd.span.start;
  for (const r of repl) {
    if (r.pos < cur) continue; // 防重叠（理论不发生）
    out += rawCommand.slice(cur, r.pos) + esc;
    cur = r.pos + r.len;
  }
  out += rawCommand.slice(cur, tileEnd);
  return out;
}

/** 追加一个 ReducedSegment（verbatim/expanded 共用装配）。 */
function pushSegment(
  segments: ReducedSegment[],
  parts: string[],
  kind: ReducedSegment["kind"],
  text: string,
  reducedPos: number,
  originalSpan: SourceSpan,
): void {
  segments.push({
    kind,
    text,
    spanInReduced: { start: reducedPos, end: reducedPos + text.length },
    originalSpan,
  });
  parts.push(text);
}

export function reduceToFlat(
  rawCommand: string,
  scopes: readonly LoopScope[],
  scopeWordValues: readonly ScopeWordValues[],
): ReductionResult | null {
  if (scopes.length !== scopeWordValues.length) return null;
  // 空 body scope（`for f in a; do ; done`）：直接 fail-closed null（生产路径由 verify 先拒；
  // 此处为 API 级契约兜底——文档承诺不可建模输入返回 null 而非抛错）
  if (scopes.some((s) => s.body.length === 0)) return null;
  if (scopeWordValues.some((p) => p.values.length === 0)) return null;

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
      pushSegment(segments, parts, "verbatim", v, reducedPos, { start: cursor, end: ext.start });
      reducedPos += v.length;
    }
    cursor = ext.start;

    // 展开段：逐迭代
    const body = ext.scope.body;
    const loopVar = ext.scope.variable.value;
    const loopExpanded: string[] = [];
    for (let vi = 0; vi < ext.values.length; vi++) {
      const value = ext.values[vi]!;
      const lead = vi > 0 ? "; " : "";
      const iterParts: string[] = [];
      // 命令级展开段：逐 body 命令 tile（original 为命令自身 span——修复整 body 粒度的去重折叠）
      for (let k = 0; k < body.length; k++) {
        const cmd = body[k]!;
        const tileEnd = k + 1 < body.length ? body[k + 1]!.span.start : cmd.span.end;
        const segText = tileTextWithValue(rawCommand, cmd, tileEnd, loopVar, value, k === 0 ? lead : "");
        pushSegment(segments, parts, "expanded", segText, reducedPos, cmd.span);
        reducedPos += segText.length;
        iterParts.push(segText);
      }
      // loop 级重定向重挂载段：迭代 ≥1 截断类改 `>>`（original 用重定向自身坐标）
      for (let mi = 0; mi < ext.scope.redirections.length; mi++) {
        const m = remountRedirect(rawCommand, ext.scope.redirections[mi]!, vi === 0);
        if (m === null) return null; // &>/&>> 双流等不建模 → fail-closed
        const segText = " " + m;
        pushSegment(segments, parts, "expanded", segText, reducedPos, ext.scope.redirections[mi]!.span);
        reducedPos += segText.length;
        iterParts.push(segText);
      }
      loopExpanded.push(iterParts.join(""));
    }
    expandedParts.push(loopExpanded);
    cursor = ext.end;
  }

  // 尾 verbatim
  if (cursor < rawCommand.length) {
    const v = rawCommand.slice(cursor);
    pushSegment(segments, parts, "verbatim", v, reducedPos, { start: cursor, end: rawCommand.length });
    reducedPos += v.length;
  }

  const text = parts.join("");

  // 自校验：重 lex/parse —— 解析失败 / 残余动态 / 仍带作用域或 opaque → null（fail-closed）
  const { tokens: rtokens, unsafeSyntax: rlexErr } = lex(text);
  if (rlexErr) return null;
  const { program: rprogram, error: rparseErr } = parse(rtokens);
  if (rparseErr) return null;
  if (rprogram.dynamic || rprogram.loopScopes.length > 0 || rprogram.opaqueRegions.length > 0) return null;

  // expandedText：仅各 loop 展开段、多 scope 逐段 `;` 连接的拼接文本（expanded form 展示；非全文）
  const expandedText = expandedParts.map((loopPart) => loopPart.join("")).join("; ");

  return { text, segments, expandedText };
}