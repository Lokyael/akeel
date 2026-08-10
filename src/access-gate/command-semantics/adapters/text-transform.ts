// 文本处理命令 — sed, awk, sort, uniq, tr 的选项语义
//
// B 候选：选项遍历由统一引擎 option-parse 承担（Opt/ParseResult），本文件只剩 schema 声明
// 与语义映射（consumed → 路径 intent；sawWrite → modify 升级；位置参数性质 → intent 操作）。
// 制度化 D-027（值性质）与 T-045（位置参数性质）。

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics, consumedFileIntents } from "./shared";
import { parseOptions, type Opt, type OptConfig } from "./option-parse";

/** 命令级配置：选项 schema + 位置参数性质 + 未知选项策略（text-transform：未知 → opaque）。 */
interface TextConfigEntry {
  class: "inspect" | "modify" | "unknown";
  config: OptConfig;
  reason: string;
  /** sed/awk 在出现写选项（-i）时，位置参数是原地修改目标而非只读输入。 */
  inPlace?: boolean;
}

// 值性质（D-027）：file = 路径 intent；expression = 程序/表达式（-e/-F/-v/-t/-k 等）；flag = 无值。
// 附着形式：separated（-e X）、equals（--expression=X）、attached（-eX、-oX）、suffix（-i.bak）。

const SED_OPTS: Opt[] = [
  { names: ["-i", "--in-place"], kind: "flag", operation: "write", forms: ["suffix", "equals"] },
  { names: ["-e", "--expression"], kind: "expression", isPattern: true, forms: ["separated", "attached", "equals"] },
  { names: ["-f", "--file"], kind: "file", operation: "read", isPattern: true, forms: ["separated", "equals"] },
  { names: ["-l", "--line-length"], kind: "expression", forms: ["separated", "equals"] },
  { names: ["-n", "--quiet", "--silent"], kind: "flag" },
  { names: ["-E", "-r", "-z", "-s", "-u", "--sandbox", "--debug"], kind: "flag" },
];

const AWK_OPTS: Opt[] = [
  { names: ["-i", "--in-place"], kind: "flag", operation: "write", forms: ["suffix", "equals"] },
  { names: ["-f", "--file"], kind: "file", operation: "read", isPattern: true, forms: ["separated", "equals"] },
  { names: ["-e"], kind: "expression", isPattern: true, forms: ["separated", "attached"] },
  { names: ["-F", "--field-separator"], kind: "expression", forms: ["separated", "attached", "equals"] },
  { names: ["-v", "--assign"], kind: "expression", forms: ["separated", "attached", "equals"] },
  { names: ["-V", "--version", "-h", "--help"], kind: "flag" },
];

const SORT_OPTS: Opt[] = [
  { names: ["-o", "--output"], kind: "file", operation: "write", forms: ["separated", "attached", "equals"] },
  { names: ["-t", "--field-separator", "-k", "--key"], kind: "expression", forms: ["separated", "attached", "equals"] },
  { names: ["-n", "-r", "-u", "-f", "-b", "-c", "-m", "-h", "-V", "-s", "--numeric-sort", "--reverse", "--unique", "--ignore-case", "--stable", "--check", "--merge", "--version", "--help"], kind: "flag" },
];

const UNIQ_OPTS: Opt[] = [
  { names: ["-o", "--output"], kind: "file", operation: "write", forms: ["separated", "attached", "equals"] },
  { names: ["-c", "-d", "-u", "-i", "--count", "--repeated", "--unique", "--ignore-case", "--version", "--help"], kind: "flag" },
];

// tr 无文件参数（GNU/POSIX 均只读 stdin）；选项全为 flag，位置参数（SET1/SET2）是字符集非文件（T-045: set）。
const TR_OPTS: Opt[] = [
  { names: ["-c", "--complement", "-d", "--delete", "-s", "--squeeze-repeats", "-t", "--truncate-set1", "--help", "--version"], kind: "flag" },
];

const TEXT_CONFIG: Record<string, TextConfigEntry> = {
  sed: { class: "inspect", config: { opts: SED_OPTS, positional: "program-first", opaqueOnUnknown: true }, reason: "stream editor", inPlace: true },
  awk: { class: "inspect", config: { opts: AWK_OPTS, positional: "program-first", opaqueOnUnknown: true }, reason: "pattern scanning", inPlace: true },
  sort: { class: "inspect", config: { opts: SORT_OPTS, positional: "file", opaqueOnUnknown: true }, reason: "sort lines" },
  uniq: { class: "inspect", config: { opts: UNIQ_OPTS, positional: "file", opaqueOnUnknown: true }, reason: "unique lines" },
  tr: { class: "inspect", config: { opts: TR_OPTS, positional: "set", opaqueOnUnknown: true }, reason: "translate characters" },
};

/** consumed 中 kind=file 的值 → 路径 intent（共享 helper，consumedFileIntents）。 */

export const textTransformAdapter: CommandAdapter = {
  names: Object.keys(TEXT_CONFIG),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const entry = TEXT_CONFIG[name];
    if (!entry) return makeSemantics("unknown", { reason: `unknown text command: ${name}`, opaque: true });

    const { positional, consumed, sawWrite, opaque } = parseOptions([...node.args], entry.config);

    // 位置参数：sed/awk 在 in-place 写出现时是原地修改目标（write），否则只读输入
    const positionalOp = entry.inPlace && sawWrite ? "write" : "read";
    const positionalIntents: PathIntent[] = positional.map((arg) => ({
      operation: positionalOp,
      rawPath: arg.value ?? "",
      source: "argument" as const,
      span: arg.span,
      confidence: "exact" as const,
    }));

    // 写意图（-o/--output 或 in-place -i）→ 升级 modify
    const fileIntents = consumedFileIntents(consumed);
    const hasWrite = sawWrite || fileIntents.some((i) => i.operation === "write");
    const cls: "inspect" | "modify" | "unknown" = hasWrite ? "modify" : entry.class;

    // 位置参数与选项值 intent 按 token 出现顺序合并（span 排序）
    const intents = [...positionalIntents, ...fileIntents].sort((a, b) => a.span.start - b.span.start);

    return makeSemantics(cls, {
      reason: entry.reason,
      intents,
      opaque,
    });
  },
};
