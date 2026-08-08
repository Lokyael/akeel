// command-semantics/adapters/shared.ts — adapter 共享工具

import type { ShellArg } from "../../shell-parse/types";
import type { CommandSemantics, CommandClass, Effect, PathIntent } from "../types";

export interface MakeSemanticsOpts {
  reason: string;
  intents?: PathIntent[];
  effects?: readonly Effect[];
  hardRule?: string | null;
  opaque?: boolean;
}

/** 选项派生的路径 intent（source: option，span 合成）；confidence 默认 conservative。 */
export function optionIntent(
  operation: "read" | "write",
  rawPath: string,
  confidence: "exact" | "conservative" = "conservative",
): PathIntent {
  return { operation, rawPath, source: "option", span: { start: 0, end: 0 }, confidence };
}

function defaultEffects(cls: CommandClass): readonly Effect[] {
  if (cls === "inspect") return ["read"];
  if (cls === "modify") return ["write"];
  if (cls === "execute") return ["execute"];
  if (cls === "destroy") return ["execute"];
  return [];
}

/**
 * Extract the subcommand from tool arguments.
 * Skips known value-taking options and their values.
 * Returns "" when no subcommand is present (all args are flags).
 *
 * @param valueOptions — options that consume the next token as their value.
 *   Accepts both string[] and Set<string> for caller convenience.
 */
export function extractSubcommand(args: readonly ShellArg[], valueOptions: Iterable<string>): string {
  const opts = new Set(valueOptions);
  const parts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") break;
    if (v.startsWith("-")) {
      if (opts.has(v) && !v.includes("=") && i + 1 < args.length) {
        i++; // 跳过选项值
      }
      continue;
    }
    parts.push(v);
  }
  return parts.join(" ");
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
