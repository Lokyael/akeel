// 搜索命令 — find, tree, grep, rg, ls 的路径 intent
//
// B 候选：选项遍历由统一引擎 option-parse 承担；本文件保留搜索语义
// （root 提取、递归判定、pattern 位置、破坏性检测——全部基于引擎输出）。
// 破坏性检测不再扫描 raw args：-delete/-okdir → flag+write（sawWrite 升级），
// -exec 族 → consumeUntil；选项值 token 天然不参与 flags（F2 根因消除）。

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent } from "../types";
import { makeSemantics } from "../semantics";
import { consumedFileIntents, SYNTHETIC_SPAN } from "../intent";
import { parseOptions, type Opt, type OptConfig } from "./option-parse";

// ─── find：值（测试表达式，非路径）/ 输出文件（write）/ 破坏性 / 运算符 / 常见 flag ───

const FIND_OPTS: Opt[] = [
  { names: ["-name", "-iname", "-path", "-ipath", "-regex", "-iregex", "-type", "-user", "-group", "-perm", "-size", "-mtime", "-atime", "-ctime", "-maxdepth", "-mindepth", "-newer", "-anewer", "-cnewer", "-samefile", "-inum", "-links", "-printf", "-uid", "-gid", "-D", "-O"], kind: "expression" },
  { names: ["-fprint", "-fprintf", "-fls", "-fwrite"], kind: "file", operation: "write", upgradeTo: "modify" },
  { names: ["-delete", "-okdir"], kind: "flag", operation: "write", upgradeTo: "modify" },
  { names: ["-exec", "-execdir", "-ok"], kind: "flag", operation: "write", upgradeTo: "modify", consumeUntil: ["+", ";"] },
  { names: ["-o", "-a", "-not", "-print", "-print0", "-ls", "-depth", "-xdev", "-L", "-P", "-H", "-noleaf", "-daystart", "-warn", "-nowarn", "-ignore_readdir_race", "-noignore_readdir_race"], kind: "flag" },
];

// ─── tree：层级/忽略/模式取值；-o 输出文件；常见 flag ───

const TREE_OPTS: Opt[] = [
  { names: ["-L", "--level", "-I", "--ignore", "-P", "--pattern", "--charset"], kind: "expression", forms: ["separated", "equals"] },
  { names: ["-o"], kind: "file", operation: "write", upgradeTo: "modify", forms: ["separated", "attached"] },
  { names: ["-a", "-d", "-f", "-i", "-s", "-h", "--dirsfirst", "--noreport", "--du"], kind: "flag" },
];

// ─── grep：-e/-f 是 pattern 提供者；-f 值是 pattern 文件（read intent）；-d recurse 等价递归 ───

const GREP_OPTS: Opt[] = [
  { names: ["-e", "--regexp"], kind: "expression", isPattern: true, forms: ["separated", "attached", "equals"] },
  { names: ["-f", "--file"], kind: "file", operation: "read", isPattern: true, forms: ["separated", "equals"] },
  { names: ["-m", "--max-count", "-A", "--after-context", "-B", "--before-context", "-C", "--context", "--include", "--exclude", "--exclude-dir", "-d", "--directories", "--label"], kind: "expression", forms: ["separated", "attached", "equals"] },
  { names: ["-r", "-R", "--recursive", "-i", "--ignore-case", "-n", "--line-number", "-l", "--files-with-matches", "-L", "--files-without-match", "-w", "--word-regexp", "-x", "--line-regexp", "-c", "--count", "-v", "--invert-match", "-h", "--no-filename", "-H", "--with-filename", "-s", "--no-messages", "-q", "--quiet", "-o", "--only-matching", "-a", "--text", "-I", "-z", "--null", "-b", "--byte-offset"], kind: "flag" },
];

// ─── rg：同 grep 的 pattern/glob/type 语义 ───

const RG_OPTS: Opt[] = [
  { names: ["-e", "--regexp"], kind: "expression", isPattern: true, forms: ["separated", "attached", "equals"] },
  { names: ["-f", "--file"], kind: "file", operation: "read", isPattern: true, forms: ["separated", "equals"] },
  { names: ["-g", "--glob", "--iglob", "-t", "--type", "--type-not", "-m", "--max-count", "-A", "--after-context", "-B", "--before-context", "-C", "--context", "--max-columns", "--max-depth", "--sort", "--sortr", "--max-filesize", "--min-filesize"], kind: "expression", forms: ["separated", "attached", "equals"] },
  { names: ["-i", "--ignore-case", "-n", "--line-number", "-l", "--files-with-matches", "-L", "--files-without-match", "-w", "--word-regexp", "-x", "--line-regexp", "-c", "--count", "-v", "--invert-match", "-h", "--no-filename", "-H", "--with-filename", "-s", "--no-messages", "-q", "--quiet", "-o", "--only-matching", "-F", "--fixed-strings", "-u", "--unrestricted", "-a", "--text", "-z", "--null", "--no-ignore", "--hidden"], kind: "flag" },
];

// ─── ls：-w 取值；常见 flag ───

const LS_OPTS: Opt[] = [
  { names: ["-w", "--width"], kind: "expression", forms: ["separated", "attached", "equals"] },
  { names: ["-a", "--all", "-A", "--almost-all", "-l", "-F", "--classify", "-h", "--human-readable", "-R", "--recursive", "-t", "-S", "-r", "--reverse", "-1", "-d", "--directory", "-C", "--color", "-i", "--inode", "-s", "--size", "-n", "--numeric-uid-gid"], kind: "flag" },
];

interface SearchConfig {
  class: "inspect" | "modify" | "unknown";
  /** 默认搜索根（. 表示当前 cwd）。 */
  defaultRoot: string;
  /** 识别搜索根：从第几个位置参数起（0 = 第一个；grep/rg 第一个是 pattern）。 */
  rootAtArgIndex: number;
  /** 路径 intent 操作类型（默认 "search"）。ls 使用 "list"。 */
  operation?: "search" | "list";
  /** 是否需要递归标记才视为搜索。 */
  needsRecursiveFlag?: boolean;
  /** 递归选项（在引擎 flags 中检查）。 */
  recursiveOpts?: readonly string[];
  /** 提供 pattern 的选项（-e/-f）：命中时位置参数起点左移。 */
  patternOpts?: readonly string[];
  opts: readonly Opt[];
  reason: string;
}

const SEARCH_CONFIG: Record<string, SearchConfig> = {
  find: {
    class: "inspect",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    opts: FIND_OPTS,
    reason: "search files",
  },
  tree: {
    class: "inspect",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    opts: TREE_OPTS,
    reason: "list directory tree",
  },
  grep: {
    class: "inspect",
    defaultRoot: ".",
    rootAtArgIndex: 1, // 第一个非选项参数是 pattern，第二个起是 targets
    needsRecursiveFlag: true,
    recursiveOpts: ["-r", "-R", "--recursive"],
    patternOpts: ["-e", "--regexp", "-f", "--file"],
    opts: GREP_OPTS,
    reason: "search file contents",
  },
  rg: {
    class: "inspect",
    defaultRoot: ".",
    rootAtArgIndex: 1, // pattern 在第一个非选项参数，targets 从第二个起
    patternOpts: ["-e", "--regexp", "-f", "--file"],
    opts: RG_OPTS,
    reason: "ripgrep search",
  },
  ls: {
    class: "inspect",
    defaultRoot: ".",
    rootAtArgIndex: 0,
    operation: "list",
    opts: LS_OPTS,
    reason: "list directory",
  },
};

/** 位置参数 → 搜索/列表/读取根 intent（保守置信度）。 */
function rootIntent(operation: "search" | "list" | "read", rawPath: string, span: ShellArg["span"]): PathIntent {
  return { operation, rawPath, source: "argument", span, confidence: "conservative" };
}

export const searchAdapter: CommandAdapter = {
  names: Object.keys(SEARCH_CONFIG),
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = SEARCH_CONFIG[name];
    if (!config) return makeSemantics("unknown", { reason: `unknown search command: ${name}`, opaque: true });

    // 引擎遍历：consumed（值，含文件/表达式）+ flags（无值标志）+ sawWrite + classAdjust + opaque
    // search 收紧：未知选项 → opaque（B4；-okdir 等未建模破坏项因此被堵）
    const optsConfig: OptConfig = { opts: config.opts, positional: "file", opaqueOnUnknown: true };
    const { positional, consumed, flags, opaque, classAdjust } = parseOptions([...node.args], optsConfig);

    // kind=file 的值 → 路径 intent（-f 的 pattern 文件 read、-fprint/-o 的输出文件 write）
    const fileIntents = consumedFileIntents(consumed);

    // 写文件选项值（find -fprint、tree -o 等）→ 检测升级 modify；intent 在搜索根之后 push
    const writeValues = fileIntents.filter((i) => i.operation === "write");

    const hasPatternOption = consumed.some((e) => config.patternOpts?.includes(e.option));
    const rootIndex = Math.max(0, config.rootAtArgIndex - (hasPatternOption ? 1 : 0));
    const rootArgs = positional.slice(rootIndex);
    // grep -d recurse / --directories=recurse 等价递归
    const directoriesRecurse = consumed.some((e) => (e.option === "-d" || e.option === "--directories") && e.value === "recurse");
    const isRecursive = config.recursiveOpts
      ? config.recursiveOpts.some((option) => flags.includes(option)) || directoriesRecurse
      : true;

    // 对于需要递归标记的命令，没有递归标记时不产生搜索 intent：非递归 grep 读取文件参数
    if (config.needsRecursiveFlag && !isRecursive) {
      const readIntents: PathIntent[] = rootArgs.map((arg) => rootIntent("read", arg.value, arg.span));
      return makeSemantics(config.class, {
        reason: config.reason,
        // 类别固定顺序：pattern 文件（-f read）在前、文件参数在后（与既有测试契约一致）
        intents: [...fileIntents, ...readIntents],
        opaque,
      });
    }

    const pathOperation = config.operation ?? "search";
    const rootIntents: PathIntent[] = rootArgs.length > 0
      ? rootArgs.map((arg) => rootIntent(pathOperation, arg.value, arg.span))
      : [rootIntent(pathOperation, config.defaultRoot, SYNTHETIC_SPAN)];

    // 破坏性/写选项（-delete/-exec/-o/-fprint…，T-059/B1：声明 upgradeTo: modify）→ 升级 modify
    const cls = classAdjust === "modify" ? "modify" : config.class;

    // 类别固定顺序（既有契约）：pattern 文件（-f read）→ 搜索根 → 输出文件（-fprint/-o write，从 fileIntents 去重）
    const otherFileIntents = fileIntents.filter((i) => i.operation !== "write");
    const intents = [...otherFileIntents, ...rootIntents, ...writeValues];

    return makeSemantics(cls, {
      reason: config.reason,
      intents,
      opaque,
    });
  },
};
