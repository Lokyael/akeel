// 搜索命令 — find, tree, grep, rg, ls 的路径 intent

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface SearchConfig {
  class: "readOnly" | "mutating" | "unclassified";
  /** 默认搜索根（. 表示当前 cwd）。 */
  defaultRoot: string;
  /** 识别搜索根：从参数中第几个位置开始（0 = 第一个非选项参数）。 */
  rootAtArgIndex: number;
  /** 是否需要递归标记才视为搜索。 */
  needsRecursiveFlag?: boolean;
  /** 递归选项。 */
  recursiveOpts?: string[];
  /** 选项名：其后一个 token 是选项值，不是路径。 */
  valueOpts?: readonly string[];
  /** 选项前缀：选项值附在同一 token 中，不是路径。 */
  attachedValueOpts?: readonly string[];
  /** 选项名：提供搜索 pattern，位置参数起点因此左移。 */
  patternOpts?: readonly string[];
  /** 文件选项：提取值为 read intent。 */
  fileOpts?: readonly string[];
  reason: string;
}

const SEARCH_CONFIG: Record<string, SearchConfig> = {
  find: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    valueOpts: ["-type", "-name", "-iname", "-path", "-ipath", "-size", "-mtime", "-atime", "-ctime", "-user", "-group", "-perm", "-exec", "-execdir", "-ok", "-maxdepth", "-mindepth"],
    reason: "search files",
  },
  tree: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    valueOpts: ["-L", "--level", "-I", "--ignore", "-P", "--pattern", "--charset"],
    reason: "list directory tree",
  },
  grep: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 1, // 第一个非选项参数是 pattern，第二个起是 targets
    needsRecursiveFlag: true,
    recursiveOpts: ["-r", "-R", "--recursive"],
    valueOpts: ["-e", "--regexp", "-f", "--file", "-m", "--max-count", "-A", "-B", "-C", "--include", "--exclude", "--exclude-dir"],
    attachedValueOpts: ["-e", "--regexp=", "-f", "--file=", "-m", "--max-count=", "-A", "-B", "-C"],
    patternOpts: ["-e", "--regexp", "-f", "--file"],
    fileOpts: ["-f", "--file"],
    reason: "search file contents",
  },
  rg: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 1, // pattern 在第一个非选项参数，targets 从第二个起
    valueOpts: ["-e", "--regexp", "-f", "--file", "-g", "--glob", "-t", "--type", "--type-not", "--iglob", "--iglob-case-insensitive", "-m", "--max-count", "--max-columns", "--max-depth", "--sort", "--sortr"],
    attachedValueOpts: ["-e", "--regexp=", "-f", "--file=", "-g", "--glob=", "-t", "--type=", "--type-not=", "--iglob=", "-m", "--max-count=", "--max-columns=", "--max-depth=", "--sort=", "--sortr="],
    patternOpts: ["-e", "--regexp", "-f", "--file"],
    fileOpts: ["-f", "--file"],
    reason: "ripgrep search",
  },
};

export const searchAdapter: CommandAdapter = {
  names: Object.keys(SEARCH_CONFIG),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = SEARCH_CONFIG[name];
    if (!config) return makeSemantics("unclassified", { reason: `unknown search command: ${name}`, opaque: true });

    const args = [...node.args];
    const intents: PathIntent[] = [];

    // ── 选项值和位置参数提取 ──
    const positional: ShellArg[] = [];
    const optionValues: Array<{ option: string; value: string; span: ShellArg["span"] }> = [];
    const valueOpts = config.valueOpts ?? [];
    const attachedValueOpts = config.attachedValueOpts ?? [];
    let parseOptions = true;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const val = arg.value ?? "";
      if (parseOptions && val === "--") {
        parseOptions = false;
        continue;
      }
      if (parseOptions && val.startsWith("-")) {
        const takesNext = valueOpts.includes(val);
        const hasAttachedValue = attachedValueOpts.some((prefix) => val.startsWith(prefix) && val.length > prefix.length);
        if (takesNext && i + 1 < args.length) {
          const value = args[i + 1]!;
          optionValues.push({ option: val, value: value.value ?? "", span: value.span });
          i++;
        } else if (hasAttachedValue) {
          const prefix = attachedValueOpts.find((candidate) => val.startsWith(candidate) && val.length > candidate.length)!;
          const option = prefix.endsWith("=") ? prefix.slice(0, -1) : prefix;
          optionValues.push({ option, value: val.slice(prefix.length), span: arg.span });
        }
        continue;
      }
      positional.push(arg);
    }

    // 文件选项值是 read intent；其他选项值（pattern、glob、type 等）不涉及路径。
    for (const entry of optionValues) {
      if (config.fileOpts?.includes(entry.option)) {
        intents.push({
          operation: "read",
          rawPath: entry.value,
          source: "option",
          span: entry.span,
          confidence: "conservative",
        });
      }
    }

    const hasPatternOption = optionValues.some((entry) => config.patternOpts?.includes(entry.option));
    const rootIndex = Math.max(0, config.rootAtArgIndex - (hasPatternOption ? 1 : 0));
    const foundRoots = positional.slice(rootIndex).map((arg) => arg.value ?? "");
    const roots = foundRoots.length > 0 ? foundRoots : [config.defaultRoot];
    const isRecursive = config.recursiveOpts
      ? args.some((a) => config.recursiveOpts!.includes(a.value ?? ""))
      : true;

    // 对于需要递归标记的命令，没有递归标记时不产生搜索 intent
    if (config.needsRecursiveFlag && !isRecursive) {
      // 非递归 grep 读取文件参数，但不会递归搜索目录。
      for (const file of foundRoots) {
        intents.push({
          operation: "read",
          rawPath: file,
          source: "argument",
          span: { start: 0, end: 0 },
          confidence: "conservative",
        });
      }
      return makeSemantics(config.class, {
        reason: config.reason,
        intents,
        opaque: false,
      });
    }

    for (const root of roots) {
      intents.push({
        operation: "search",
        rawPath: root,
        source: "argument",
        span: { start: 0, end: 0 },
        confidence: "conservative",
      });
    }

    return makeSemantics(config.class, {
      reason: config.reason,
      intents,
      opaque: false,
    });
  },
};
