// command-semantics/adapters/shared.ts — adapter 共享工具

import type { CommandSemantics, CommandClass, PathIntent } from "../types";

export interface MakeSemanticsOpts {
  reason: string;
  intents?: PathIntent[];
  effects?: string[];
  hardRule?: string | null;
  opaque?: boolean;
}

export function makeSemantics(
  cls: CommandClass,
  opts: MakeSemanticsOpts,
): CommandSemantics {
  return {
    class: cls,
    effects: (opts.effects ?? []) as any,
    intents: opts.intents ?? [],
    cwdTransition: { kind: "none" },
    hardRule: opts.hardRule ?? null,
    opaque: opts.opaque ?? false,
    reason: opts.reason,
  };
}
