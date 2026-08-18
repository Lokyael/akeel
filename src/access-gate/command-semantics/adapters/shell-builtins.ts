// Shell builtin commands — source (.).
//
// source / . reads and executes a file in the current shell environment.
// Classified as execute (consistent with python/node interpreters) because
// the sourced file can contain arbitrary commands including destructive ones.
// The file argument produces a read path intent so path policy also applies.
//
// Key semantics:
//   - source and . have NO options in bash/POSIX.  The first argument is
//     always the file to source.
//   - bash's "source" (non-POSIX) searches PATH when the filename has no "/".
//     POSIX "." does not — it only looks in the current directory.
//   - "-" as the filename means stdin (no filesystem path to check).

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent } from "../types";
import { makeSemantics } from "../semantics";

/**
 * Extract the file argument from source/. commands.
 *
 * The first argument IS the file (neither source nor . have options).
 * Returns null when:
 *  - No arguments (bash runtime error)
 *  - File is "-" (stdin)
 *
 * Confidence:
 *  - source without "/" → "conservative" (bash searches PATH)
 *  - . without "/"    → "exact" (POSIX . only looks in cwd)
 *  - Any with "/"     → "exact"
 */
function fileIntent(args: readonly ShellArg[], isDotCommand: boolean): PathIntent | null {
  if (args.length === 0) return null;
  const fileArg = args[0]!;
  if (!fileArg.value) return null;
  if (fileArg.value === "-") return null; // stdin

  const hasPathSep = fileArg.value.includes("/");
  // Only bash's "source" (not POSIX ".") searches PATH when no "/"
  const confidence = (!isDotCommand && !hasPathSep) ? "conservative" : "exact";

  return {
    operation: "read",
    rawPath: fileArg.value,
    source: "argument" as const,
    span: fileArg.span,
    confidence,
  };
}

export const shellBuiltinsAdapter: CommandAdapter = {
  names: ["source", "."],
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const isDot = name === ".";
    const intent = fileIntent(node.args, isDot);
    return makeSemantics("execute", {
      reason: `${name || "."}: source shell file`,
      effects: ["execute"],
      intents: intent ? [intent] : [],
    });
  },
};
