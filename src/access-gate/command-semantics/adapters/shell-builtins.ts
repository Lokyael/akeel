// Shell builtin commands — source (.), and future builtins.
// source / . reads and executes a file in the current shell environment.
// Classified as execute (consistent with python/node interpreters) because
// the sourced file can contain arbitrary commands including destructive ones.
// The file argument produces a read path intent so path policy also applies.

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

/**
 * Extract the file argument from source/. commands.
 *
 * source filename [arguments]
 * . filename [arguments]
 *
 * The first non-option, non-stdin argument is the file to source.
 * Returns null when:
 *  - No file argument provided (bash runtime error, not our concern)
 *  - Argument is "-" (stdin — no filesystem path to check)
 *
 * Confidence:
 *  - "exact" when the filename contains "/" — bash reads that exact file
 *  - "conservative" when no "/" — bash searches PATH, resolved path unknown
 */
function fileIntent(args: readonly ShellArg[]): PathIntent | null {
  const fileArg = args.find((a) => {
    if (!a.value) return false;
    if (a.value === "-") return false; // stdin
    if (a.value.startsWith("-")) return false; // future-proof: skip options
    return true;
  });
  if (!fileArg?.value) return null;

  const hasPathSep = fileArg.value.includes("/");
  return {
    operation: "read",
    rawPath: fileArg.value,
    source: "argument" as const,
    span: fileArg.span,
    confidence: hasPathSep ? "exact" : "conservative",
  };
}

export const shellBuiltinsAdapter: CommandAdapter = {
  names: ["source", "."],
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? ".";
    const intent = fileIntent(node.args);
    return makeSemantics("execute", {
      reason: `${name}: source shell file`,
      effects: ["execute"],
      intents: intent ? [intent] : [],
    });
  },
};
