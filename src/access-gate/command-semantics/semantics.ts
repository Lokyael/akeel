// command-semantics/semantics.ts — 语义构造原语（公共层，非 adapter 内部实现）
// 原 shared.ts 上升拆分（E）：语义构造与参数提取/意图构造/规则匹配/身份归一分离，
// 每模块单一职责；consumers（adapter/overrides/registry）从公共层引用。

import type { CommandSemantics, CommandClass, Effect, PathIntent } from "./types";
import { COMMAND_CLASS_EFFECTS } from "../domain";

interface MakeSemanticsOpts {
  reason: string;
  intents?: PathIntent[];
  effects?: readonly Effect[];
  opaque?: boolean;
}

export function makeSemantics(
  cls: CommandClass,
  opts: MakeSemanticsOpts,
): CommandSemantics {
  return {
    commandClass: cls,
    effects: opts.effects ?? COMMAND_CLASS_EFFECTS[cls].defaults,
    intents: opts.intents ?? [],
    opaque: opts.opaque ?? false,
    reason: opts.reason,
  };
}
