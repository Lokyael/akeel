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
  /** 文件选项：提取为 read intent。 */
  fileOpts?: string[];
  reason: string;
}

const SEARCH_CONFIG: Record<string, SearchConfig> = {
  find: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    reason: "search files",
  },
  tree: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    reason: "list directory tree",
  },
  grep: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 1, // 第一个非选项参数是 pattern，第二个起是 targets
    needsRecursiveFlag: true,
    recursiveOpts: ["-r", "-R", "--recursive"],
    fileOpts: ["-f", "--file"],
    reason: "search file contents",
  },
  rg: {
    class: "readOnly",
    defaultRoot: ".",
    rootAtArgIndex: 1, // pattern 在第一个非选项参数，targets 从第二个起
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

    // ── 文件选项提取（-f pattern-file, --file pattern-file）──
    if (config.fileOpts) {
      for (let i = 0; i < args.length; i++) {
        const val = args[i]!.value ?? "";
        if (config.fileOpts.includes(val) && i + 1 < args.length) {
          const nextVal = args[i + 1]!.value;
          if (nextVal && !nextVal.startsWith("-")) {
            intents.push({
              operation: "read",
              rawPath: nextVal,
              source: "option",
              span: { start: 0, end: 0 },
              confidence: "conservative",
            });
          }
        }
      }
    }

    // ── 搜索根提取 ──
    // 跳过选项和选项值，找到第 N 个非选项参数
    let nonOptionCount = 0;
    let foundRoot: string | null = null;
    const skipNext = new Set<string>();
    const KNOWN_OPT_VALS = ["-type", "-name", "-iname", "-path", "-ipath", "-size", "-mtime", "-atime", "-ctime",
      "-user", "-group", "-perm", "-exec", "-execdir", "-ok", "-delete", "-maxdepth", "-mindepth"];
    for (let i = 0; i < args.length; i++) {
      const val = args[i]!.value ?? "";
      if (val === "--") { i++; break; }
      if (val.startsWith("-")) {
        if (KNOWN_OPT_VALS.includes(val)) i++; // skip option value
        continue;
      }
      if (nonOptionCount === config.rootAtArgIndex) {
        foundRoot = val;
        break;
      }
      nonOptionCount++;
    }

    const root = foundRoot ?? config.defaultRoot;
    const isRecursive = config.recursiveOpts
      ? args.some((a) => config.recursiveOpts!.includes(a.value ?? ""))
      : true;

    // 对于需要递归标记的命令，没有递归标记时不产生搜索 intent
    if (config.needsRecursiveFlag && !isRecursive) {
      // 非递归 grep: 只读单文件，不产生搜索 intent
      return makeSemantics(config.class, {
        reason: config.reason,
        intents,
        opaque: false,
      });
    }

    intents.push({
      operation: "search",
      rawPath: root,
      source: "argument",
      span: { start: 0, end: 0 },
      confidence: "conservative",
    });

    return makeSemantics(config.class, {
      reason: config.reason,
      intents,
      opaque: false,
    });
  },
};
