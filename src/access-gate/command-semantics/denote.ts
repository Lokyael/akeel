// command-semantics/denote.ts — 词义层（T-062 A0-2）
// 唯一实现可静态确定的 bash 词义（引号/转义解码已在 lexer；tilde 词级与[Phase 2]绑定展开归此层）。
// A0 形态：env 未接入绑定（Phase 2 Task 4 接入 literals）；无绑定引用 = 字面常量（tilde 经 expandTildeArg 词级归一一次）；
// dynamic 词（$ / 反引号 / 未引号 glob / 花括号）→ opaque —— N3 入口短路，与 G10（Phase 2 守卫）双保险。

import type { ShellArg } from "../shell-parse/types";
import { expandTildeArg } from "../path";

export type Binding =
  | { kind: "literals"; values: readonly string[] }
  | { kind: "unknown" };

export type WordEvalResult =
  | { kind: "static"; values: readonly string[] }
  | { kind: "opaque" };

/**
 * 词义求值（A0 基础形态）。
 * - dynamic 词：任何未绑定可解的动态 token（$ / 反引号 / glob / 花括号）→ opaque（N3 入口短路）
 * - 字面常量：经 expandTildeArg 词级归一（quoted / 转义 `\~` 不展开；`~user` / `~+` / `~-` 原样）
 * - 归一结果无 `~` 残留 → 二次应用恒等（idempotent，防两处展开漂移）
 */
export function denoteWord(arg: ShellArg, env: ReadonlyMap<string, Binding>): WordEvalResult {
  void env; // A0：绑定求值归 Phase 2 Task 4；env 占位保持签名稳定
  if (arg.dynamic) return { kind: "opaque" };
  return { kind: "static", values: [expandTildeArg(arg)] };
}