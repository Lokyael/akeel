// command-semantics/intent.ts — 路径意图构造原语（公共层）
// 原 shared.ts 上升拆分（E）：选项派生意图的共享映射，各 adapter 不再逐字段复制。

import type { PathIntent } from "./types";
import type { SourceSpan } from "../shell-parse/types";

/** 非真实位置的合成 span 哨兵（adapter 无法获得 token 位置的路径 intent 用）。 */
export const SYNTHETIC_SPAN: SourceSpan = { start: 0, end: 0 };

/**
 * consumed 中 kind=file 的值 → 路径 intent（source: option，span 取选项 token，confidence 保守）。
 * 引擎产物（option-parse）的语义补全：各 adapter 共享同一映射，避免逐字段复制。
 */
export function consumedFileIntents(consumed: ReadonlyArray<{ kind: "file" | "expression"; operation: "read" | "write"; value: string; span: { start: number; end: number } }>): PathIntent[] {
  return consumed
    .filter((e) => e.kind === "file")
    .map((e) => ({ operation: e.operation, rawPath: e.value, source: "option", span: e.span, confidence: "conservative" }));
}

/** 选项派生的路径 intent（source: option，span 合成）；confidence 默认 conservative。 */
export function optionIntent(
  operation: "read" | "write",
  rawPath: string,
  confidence: "exact" | "conservative" = "conservative",
): PathIntent {
  return { operation, rawPath, source: "option", span: SYNTHETIC_SPAN, confidence };
}
