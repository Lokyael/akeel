// gate/decision/expansion-view.ts — 归约展示数据查询（D-056）
// 展示职责全归渲染层：kernel 证据坐标恒为归约坐标，本模块是「归约坐标 → 原始坐标」的唯一查询面。
// - mapOriginal：按段包含定位——expanded 段返回命令级原始 span（迭代拷贝同键 → 去重组）；
//   verbatim 段内线性位移恒定（骨架删除量由段自身 original/reduced 差吸收）；未命中恒等。
// - originalGroupKey：去重分组键（原始坐标串）。仅命令级证据调用（path 证据不切 literal、不分组）。

import type { ExpansionData } from "../plan";
import type { SourceSpan } from "../../shell-parse";

/**
 * 归约坐标 → 原始坐标。命令证据 span 恒落在单一段内（命令级 tile / verbatim 区间），
 * 不存在跨段需求；未命中（理论上不发生，防御）返回原样。
 */
export function mapOriginal(expansion: ExpansionData, span: SourceSpan): SourceSpan {
  for (const seg of expansion.segments) {
    if (span.start >= seg.reduced.start && span.start < seg.reduced.end) {
      if (seg.kind === "verbatim") {
        const off = seg.original.start - seg.reduced.start;
        return { start: span.start + off, end: span.end + off };
      }
      return seg.original;
    }
  }
  return span;
}

/** 命令证据分组键：mapOriginal 后的原始坐标串（迭代拷贝同键；不同 body 命令异键）。 */
export function originalGroupKey(expansion: ExpansionData, span: SourceSpan): string {
  const original = mapOriginal(expansion, span);
  return `${original.start}:${original.end}`;
}