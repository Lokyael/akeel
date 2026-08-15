// Read-only file commands — cat, head, tail, wc, cut, diff, less, more, file, stat, du, df, od
//
// B 候选：选项遍历由统一引擎 option-parse 承担；本文件只有 read intent 映射。
// opaqueOnUnknown: true（B4 收紧）；高频 flag（wc -l、head -n、diff -u 等）已建模。

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent } from "../types";
import { makeSemantics } from "./shared";
import { parseOptions, type Opt } from "./option-parse";

const READ_CONFIG: Record<string, readonly Opt[]> = {
  cat: [],
  head: [
    { names: ["-n", "--lines", "-c", "--bytes"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-q", "-v", "-z"], kind: "flag" },
  ],
  tail: [
    { names: ["-n", "--lines", "-c", "--bytes"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-f", "-F", "-q", "-v", "-z", "-s", "--pid"], kind: "flag" },
  ],
  wc: [
    { names: ["-l", "-w", "-c", "-m", "-L", "--lines", "--words", "--bytes", "--chars", "--max-line-length"], kind: "flag" },
  ],
  cut: [
    { names: ["-b", "--bytes", "-c", "--characters", "-d", "--delimiter", "-f", "--fields"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-s", "--only-delimited", "-n", "-z"], kind: "flag" },
  ],
  diff: [
    { names: ["--label"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-u", "-r", "-a", "-q", "-b", "-i", "-w", "-B", "-N", "-c", "-e", "-Z", "-p", "-x", "--exclude"], kind: "flag" },
  ],
  less: [
    { names: ["-S", "-N", "-R", "-i", "-F", "-X", "-G", "-M", "-g", "-s", "-u", "-z"], kind: "flag" },
  ],
  more: [
    { names: ["-d", "-l", "-f", "-c", "-s", "-u"], kind: "flag" },
  ],
  file: [
    { names: ["-f", "--files-from"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-b", "-i", "-L", "-s", "-z", "-P"], kind: "flag" },
  ],
  stat: [
    { names: ["-c", "--format"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-f", "-L", "-t"], kind: "flag" },
  ],
  du: [
    { names: ["-d", "--max-depth", "-t", "--threshold", "--exclude"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-s", "-h", "-a", "-c", "-x", "-L", "-P", "-0"], kind: "flag" },
  ],
  df: [
    { names: ["-t", "--type", "-x", "--exclude-type"], kind: "expression", forms: ["separated", "equals"] },
    { names: ["-h", "-a", "-k", "-i", "-T", "-P", "-l"], kind: "flag" },
  ],
  // od —— POSIX 只读检查：-A/-j/-N/-t 为必选值选项；GNU 可选值选项不建模（不建模=按 flag 跳过，
  // 位置参数仍正确提取，避免分离值误吞文件路径）
  od: [
    { names: ["-A", "-j", "-N", "-t"], kind: "expression", forms: ["separated", "attached", "equals"] },
    { names: ["-b", "-c", "-d", "-f", "-h", "-i", "-l", "-o", "-s", "-x", "-v"], kind: "flag" },
  ],
};

/** "-" 是 stdin，不算文件。 */
function fileArgs(args: readonly ShellArg[]): ShellArg[] {
  return args.filter((arg) => (arg.value) !== "-");
}

function readIntents(args: readonly ShellArg[]): PathIntent[] {
  return fileArgs(args).map((arg) => ({
    operation: "read" as const,
    rawPath: arg.value,
    source: "argument" as const,
    span: arg.span,
    confidence: "exact" as const,
  }));
}

export const readAdapter: CommandAdapter = {
  names: Object.keys(READ_CONFIG),
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const opts = READ_CONFIG[name];
    if (!opts) return makeSemantics("unknown", { reason: `unknown read command: ${name}`, opaque: true });

    // 收紧：未知选项 → opaque（B4；高频 flag 已建模避免日常过拒）
    const { positional, opaque } = parseOptions(node.args, { opts, positional: "file", opaqueOnUnknown: true });

    return makeSemantics("inspect", {
      reason: `${name} file read`,
      intents: readIntents(positional),
      opaque,
    });
  },
};
