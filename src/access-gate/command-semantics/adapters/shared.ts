// command-semantics/adapters/shared.ts — adapter 共享工具

import type { CommandSemantics, CommandClass, Effect, PathIntent } from "../types";

export interface MakeSemanticsOpts {
  reason: string;
  intents?: PathIntent[];
  effects?: readonly Effect[];
  hardRule?: string | null;
  opaque?: boolean;
}

function defaultEffects(cls: CommandClass): readonly Effect[] {
  if (cls === "readOnly") return ["read"];
  if (cls === "mutating") return ["write"];
  if (cls === "dangerous") return ["execute"];
  return [];
}

export function makeSemantics(
  cls: CommandClass,
  opts: MakeSemanticsOpts,
): CommandSemantics {
  return {
    class: cls,
    effects: opts.effects ?? defaultEffects(cls),
    intents: opts.intents ?? [],
    cwdTransition: { kind: "none" },
    hardRule: opts.hardRule ?? null,
    opaque: opts.opaque ?? false,
    reason: opts.reason,
  };
}
