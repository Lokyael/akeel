// command-semantics/rules.ts — 子命令规则表匹配原语（公共层）
// 原 shared.ts 上升拆分（E）：规则表驱动（每条 {cls, pattern, reason, network?}），
// 命中即返回；全部未命中返回 null。表末常以 pattern: () => true 的 catch-all 收尾。

import type { CommandSemantics, CommandClass } from "./types";
import { makeSemantics } from "./semantics";

export interface RuleDef {
  cls: CommandClass;
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

/** 按子命令 positional 匹配规则表；命中返回语义，全部未命中返回 null。
 * 子命令串 = positional 数组的 value 空格连接（调用方传入引擎输出的 positional，
 * 本函数内 join——投影内聚在唯一消费者）。 */
export function semanticsFromRules(
  positional: ReadonlyArray<{ readonly value?: string | null }>,
  rules: readonly RuleDef[],
): CommandSemantics | null {
  const subcmd = positional.map((a) => a.value).join(" ");
  for (const def of rules) {
    if (def.pattern(subcmd)) {
      return makeSemantics(def.cls, {
        reason: def.reason,
        effects: def.network ? ["network"] : undefined,
        opaque: def.cls === "unknown",
      });
    }
  }
  return null;
}
