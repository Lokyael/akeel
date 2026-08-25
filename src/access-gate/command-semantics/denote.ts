// command-semantics/denote.ts — 词义层（T-062 A0-2 + Phase 2 Task 4）
// 唯一实现可静态确定的 bash 词义（引号/转义解码已在 lexer；tilde 词级与绑定展开归此层）。
// - A0：无绑定引用 = 字面常量（tilde 经 expandTildeArg 词级归一一次）
// - Phase 2 Task 4：env 接入 literals 绑定；仅**双引号区段内**的未修饰 `$f`/`${f}`
//   （后不接 `[A-Za-z0-9_]`，防 `$fx`）可展开；常量前缀/后缀拼接成字面集合；
//   其余动态形态 → opaque（N3 入口短路，与 G10 双保险——保证"可建模集 ≡ 归约后重解析可放行集"）。

import type { ShellArg } from "../shell-parse/types";
import { expandTildeArg } from "../path";

export type Binding =
  | { kind: "literals"; values: readonly string[] }
  | { kind: "unknown" };

export type WordEvalResult =
  | { kind: "static"; values: readonly string[] }
  | { kind: "opaque" };

/** 单一 raw 扫描器（O2）产出的变量引用；denoteWord 与 reduceToFlat 同源消费，防双扫描漂移。 */
export interface VarRef {
  refName: string;
  /** `$` 在 raw 中的位置。 */
  rawPos: number;
  /** `$` 在解码 value 中的位置（raw 扫描时同步换算）。 */
  valuePos: number;
  /** 是否位于双引号区段内（裸 `$f`/单引号内为 false）。 */
  inDoubleQuotes: boolean;
  /** `${f}` 花括号形态（决定 raw/value 长度）。 */
  brace: boolean;
  escaped: boolean;
}

/**
 * 单一 raw 扫描器（O2）。在 raw（含引号与转义）上逐字符追踪引号状态，
 * 输出变量引用集与「残余动态」标记。
 * - refs：所有 `$ident`（双引号区段内 inDoubleQuotes=true）；仅纯标识符形式
 *   （`$f`/`${f}`；`${f...}` 修饰、`$(...)`、`$((` 不产 ref）。
 * - residualDynamic：除合法 ref 外仍有动态触发内容（双引号内反引号/非 ref 的 `$`、
 *   未引用 isDynamic 字符）——该词不可静态求值，防 glob/命令替换/修饰按字面放行。
 */
export function scanVarRefs(raw: string): { refs: VarRef[]; residualDynamic: boolean } {
  const refs: VarRef[] = [];
  let residualDynamic = false;
  let dq = false; // 双引号内
  let sq = false; // 单引号内
  let valPos = 0; // 解码 value 中的当前位置
  const isDynamic = (ch: string) => "$`*?[{(".includes(ch);

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === "'" && !dq) { sq = !sq; i++; continue; }
    if (ch === '"' && !sq) { dq = !dq; i++; continue; }
    if (sq) { valPos++; i++; continue; }
    // 反斜杠转义（双引号内仅 $`\"换行 转义；未引用任意字符）：一律不产动态
    if (ch === "\\") {
      if (i + 1 < raw.length) { valPos++; i += 2; continue; }
      i++; continue;
    }
    if (dq) {
      if (ch === "`") { residualDynamic = true; valPos++; i++; continue; }
      if (ch === "$") {
        const ref = tryRef(raw, i, valPos, true);
        if (ref) { refs.push(ref); const l = refLen(ref); valPos += l; i += l; continue; }
        residualDynamic = true; // ${f...} 修饰 / $( 等非 ref `$`
        valPos++; i++; continue;
      }
      valPos++; i++; continue;
    }
    // 未引用
    if (ch === "$") {
      const ref = tryRef(raw, i, valPos, false);
      if (ref) { refs.push(ref); const l = refLen(ref); i += l; valPos += l; continue; }
      residualDynamic = true;
      valPos++; i++; continue;
    }
    if (isDynamic(ch)) residualDynamic = true;
    valPos++; i++;
  }
  return { refs, residualDynamic };
}

/** 尝试在 raw[at] 处解析 `$ident`/`${ident}` 引用；成功返回 ref，否则 null。 */
function tryRef(raw: string, at: number, valuePos: number, inDoubleQuotes: boolean): VarRef | null {
  const n = raw[at + 1];
  if (n === "{") {
    let j = at + 2;
    let id = "";
    while (j < raw.length && /[A-Za-z0-9_]/.test(raw[j]!)) { id += raw[j]!; j++; }
    if (id && id[0] && /[A-Za-z_]/.test(id[0]!) && raw[j] === "}") {
      return { refName: id, rawPos: at, valuePos, inDoubleQuotes, brace: true, escaped: false };
    }
    return null; // ${f...} 修饰 / 空 / 非标识符
  }
  if (n && /[A-Za-z_]/.test(n)) {
    let j = at + 1;
    let id = "";
    while (j < raw.length && /[A-Za-z0-9_]/.test(raw[j]!)) { id += raw[j]!; j++; }
    return { refName: id, rawPos: at, valuePos, inDoubleQuotes, brace: false, escaped: false };
  }
  return null;
}

/** ref 的 raw 长度（= 解码 value 长度，双引号内 `$f`/`${f}` 原样入 value）。 */
function refLen(ref: VarRef): number {
  return ref.brace ? ref.refName.length + 3 : ref.refName.length + 1;
}

/** 将 value 按 refs（按 valuePos 升序）切成常量段与变量段，做笛卡尔拼接。 */
function expandValue(value: string, refs: VarRef[], bindings: readonly (readonly string[])[]): string[] {
  const sorted = [...refs].sort((a, b) => a.valuePos - b.valuePos);
  const segments: { before: string; values: readonly string[] }[] = [];
  let cursor = 0;
  for (let k = 0; k < sorted.length; k++) {
    const ref = sorted[k]!;
    segments.push({ before: value.slice(cursor, ref.valuePos), values: bindings[k]! });
    cursor = ref.valuePos + refLen(ref);
  }
  const tail = value.slice(cursor);
  let out = [""];
  for (const seg of segments) {
    const next: string[] = [];
    for (const acc of out) {
      for (const v of seg.values) next.push(acc + seg.before + v);
    }
    out = next;
  }
  return out.map((s) => s + tail);
}

/**
 * 词义求值。
 * - 无绑定可解的双引号 ref → 字面常量（tilde 经 expandTildeArg 词级归一；quoted/转义不展开）
 * - 含可解双引号 `$f` ref → env 展开成字面集合（常量前缀/后缀拼接）
 * - 残余动态 / 未绑定变量 / 修饰 / 命令替换 / 未引用动态 → opaque（N3/G10）
 */
export function denoteWord(arg: ShellArg, env: ReadonlyMap<string, Binding>): WordEvalResult {
  const { refs, residualDynamic } = scanVarRefs(arg.raw);
  // G10：任一未引用 `$f`（含与合法引号 ref 混排，如 `x$f"$f"`）→ opaque——未引用态有
  // 字段拆分/glob 分歧，必须由归约自校验兜底改成在守卫层就拒。
  if (refs.some((r) => !r.inDoubleQuotes)) return { kind: "opaque" };
  const legal = refs.filter((r) => r.inDoubleQuotes);
  if (legal.length === 0) {
    if (arg.dynamic || residualDynamic) return { kind: "opaque" };
    return { kind: "static", values: [expandTildeArg(arg)] };
  }
  if (arg.dynamic && residualDynamic) return { kind: "opaque" };
  // 每个 ref 解析绑定
  const bindings: (readonly string[])[] = [];
  for (const ref of legal) {
    const b = env.get(ref.refName);
    if (!b || b.kind !== "literals" || b.values.length === 0) return { kind: "opaque" };
    bindings.push(b.values);
  }
  const values = expandValue(arg.value, legal, bindings);
  return { kind: "static", values };
}
