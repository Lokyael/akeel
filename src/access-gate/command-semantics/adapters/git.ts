// Git 命令语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent, SemanticContext } from "../types";
import { makeSemantics, optionIntent, consumedFileIntents, SYNTHETIC_SPAN, semanticsFromRules, type RuleDef } from "./shared";
import { parseOptions, type Opt } from "./option-parse";
import { parseConfigOptions, type ConfigOptionTable, type ConfigTarget } from "./config-parse";

/** Git 子命令分类。 */
type GitClass = "inspect" | "modify" | "destroy";

/** 调节标志：prefix 匹配（-o 命中 -oFILE；--force 命中 --force-with-lease，A2 确认）。 */
interface GitFlagSpec {
  name: string;
  prefix?: boolean;
}

/**
 * 分类声明表（A 候选，token 级）：每条 = 一个子命令（cmd 集合）的基础分类 +
 * 选项调节（upgrade/downgrade，升级优先 fail-closed）。表序无关（每 cmd 仅一行）；
 * 多 class 子命令族（stash/bundle/config/branch）在 GIT_SUBCOMMAND_PARSERS。
 * 调节 flag 检测基于 subArgs 值数组（主流程经引擎提取子命令后）；prefix 匹配
 * （--force 命中 --force-with-lease）是声明表语义（D-040 决策 1），非重复遍历。
 */
interface GitClassifyDef {
  cmd: string | readonly string[];
  cls: GitClass;
  upgrade?: {
    flags: readonly GitFlagSpec[];
    to: "modify" | "destroy";
    reason?: string;
    paths?: (args: readonly ShellArg[]) => { op: "read" | "write" | "list"; value: string }[];
  };
  downgrade?: {
    flags: readonly GitFlagSpec[];
    to: "inspect";
    reason?: string;
  };
  paths?: (args: readonly ShellArg[]) => { op: "read" | "write" | "list"; value: string }[];
  reason: string;
}

const GIT_CLASSIFY: readonly GitClassifyDef[] = [
  // ── inspect ──
  { cmd: "status", cls: "inspect", reason: "show working tree status" },
  { cmd: "diff", cls: "inspect", reason: "show changes" },
  { cmd: "log", cls: "inspect", reason: "show commit logs" },
  { cmd: "rev-list", cls: "inspect", reason: "list reachable commits" },
  { cmd: "show", cls: "inspect", reason: "show objects" },
  { cmd: "grep", cls: "inspect", reason: "search commit contents" },
  { cmd: "blame", cls: "inspect", reason: "show file blame" },
  { cmd: "ls-files", cls: "inspect", reason: "list tracked files" },
  { cmd: "ls-tree", cls: "inspect", reason: "list tree contents" },
  { cmd: "ls-remote", cls: "inspect", reason: "list remote refs" },
  { cmd: "fsck", cls: "inspect", reason: "verify repository integrity" },
  { cmd: "describe", cls: "inspect", reason: "describe commit" },
  { cmd: "check-attr", cls: "inspect", reason: "query gitattributes attributes" },
  { cmd: "check-ignore", cls: "inspect", reason: "query gitignore rules" },
  { cmd: "help", cls: "inspect", reason: "show help" },
  { cmd: "clean", cls: "destroy", downgrade: { flags: [{ name: "-n" }, { name: "--dry-run" }], to: "inspect", reason: "preview untracked files" }, reason: "delete untracked files" },
  // F1: -o/--output（含附着 -oFILE）升级 modify + 写路径 intent（prefix 匹配，A2）
  { cmd: "archive", cls: "inspect", upgrade: { flags: [{ name: "-o", prefix: true }, { name: "--output", prefix: true }], to: "modify", reason: "write repository archive to file", paths: (args) => writeOutputPaths(args, ARCHIVE_OUTPUT_OPTS) }, reason: "create repository archive" },
  // ── modify ──
  { cmd: "add", cls: "modify", paths: (args) => positionalArgs(args).map((a) => ({ op: "read" as const, value: a.value ?? "" })), reason: "stage files" },
  { cmd: "rm", cls: "modify", paths: (args) => positionalArgs(args).map((a) => ({ op: "write" as const, value: a.value ?? "" })), reason: "remove tracked files" },
  { cmd: "commit", cls: "modify", reason: "record changes" },
  { cmd: "push", cls: "modify", upgrade: { flags: [{ name: "-f" }, { name: "--force", prefix: true }], to: "destroy", reason: "force push" }, reason: "push to remote" },
  { cmd: ["checkout", "switch"], cls: "modify", paths: (args) => { const idx = args.findIndex((a) => a.value === "--"); return idx >= 0 ? args.slice(idx + 1).map((a) => ({ op: "write" as const, value: a.value ?? "" })) : []; }, reason: "switch branch/restore files" },
  { cmd: "restore", cls: "modify", paths: (args) => positionalArgs(args).map((a) => ({ op: "write" as const, value: a.value ?? "" })), reason: "restore files" },
  { cmd: "merge", cls: "modify", reason: "merge branches" },
  { cmd: "rebase", cls: "modify", reason: "rebase commits" },
  { cmd: "tag", cls: "modify", reason: "create/list/delete tags" },
  { cmd: "reset", cls: "modify", upgrade: { flags: [{ name: "--hard" }], to: "destroy", reason: "hard reset" }, reason: "reset HEAD" },
  { cmd: "fetch", cls: "modify", reason: "fetch from remote" },
  { cmd: "pull", cls: "modify", reason: "pull from remote" },
  { cmd: "clone", cls: "modify", reason: "clone repository" },
  { cmd: "init", cls: "modify", reason: "initialize repository" },
  { cmd: "remote", cls: "modify", reason: "manage remotes" },
  { cmd: "mv", cls: "modify", paths: (args) => positionalArgs(args).map((a) => ({ op: "write" as const, value: a.value ?? "" })), reason: "move/rename tracked files" },
  { cmd: ["cherry-pick", "revert"], cls: "modify", reason: "apply commits" },
  { cmd: "apply", cls: "modify", reason: "apply patch" },
  { cmd: "gc", cls: "modify", reason: "garbage collect repository" },
  { cmd: "submodule", cls: "modify", reason: "manage submodules" },
  // R3: format-patch 生成补丁文件（-o/--output-directory 目录；无 -o 时写 cwd，由保守 cwd fallback 承接）
  { cmd: "format-patch", cls: "modify", paths: (args) => writeOutputPaths(args, FORMAT_PATCH_OUTPUT_OPTS), reason: "generate patch files" },
];

/**
 * git 全局选项（T-059）：主流程经引擎提取子命令与路径意图。
 * -C <dir>（file，separated）、-c <key=val>（expression，separated，值非路径）、
 * --git-dir=<dir>（file，equals）、--work-tree=<dir>（file，equals）。
 * opaqueOnUnknown: false —— git 选项面开放（D-040 判据：大类 + catch-all 兜底）。
 */
const GIT_GLOBAL_OPTS: readonly Opt[] = [
  { names: ["-C"], kind: "file", forms: ["separated"] },
  { names: ["-c"], kind: "expression", forms: ["separated"] },
  { names: ["--git-dir"], kind: "file", forms: ["equals"] },
  { names: ["--work-tree"], kind: "file", forms: ["equals"] },
];

/** 全局路径选项的 consumed 值 → list intent（-C/--git-dir/--work-tree 是仓库目录，非读写目标）。 */
function gitGlobalIntents(consumed: ReadonlyArray<{ option: string; value: string; span: { start: number; end: number } }>): PathIntent[] {
  return consumed
    .filter((e) => e.option === "-C" || e.option === "--git-dir" || e.option === "--work-tree")
    .map((e) => ({ operation: "list" as const, rawPath: e.value, source: "option" as const, span: e.span, confidence: "conservative" as const }));
}

/**
 * 写路径选项提取（引擎子集遍历）：-o/--output 类分离/等号/短附着三形式 → write paths。
 * 返回 GIT_CLASSIFY paths 契约的 {op, value} 形状（非 PathIntent——无 source/span/confidence，
 * 由 extractGitPaths 在分类时补齐）；opaqueOnUnknown: false —— git 选项面开放
 * （archive --format、format-patch --numbered 等合法），子集提取只关心写路径，其余选项静默（B4 决策）。
 */
function writeOutputPaths(args: readonly ShellArg[], opts: readonly Opt[]): { op: "write"; value: string }[] {
  const { consumed } = parseOptions(args, { opts, positional: "file", opaqueOnUnknown: false });
  // 共享 file→intent 映射 + write 过滤 + 类型降级（GIT_CLASSIFY paths 契约）
  return consumedFileIntents(consumed)
    .filter((i) => i.operation === "write")
    .map((i) => ({ op: "write" as const, value: i.rawPath }));
}

/** git archive 输出：-o（分离/附着）、--output（分离/等号）——跨名差异拆条（B2）。 */
const ARCHIVE_OUTPUT_OPTS: readonly Opt[] = [
  { names: ["-o"], kind: "file", operation: "write", forms: ["separated", "attached"] },
  { names: ["--output"], kind: "file", operation: "write", forms: ["separated", "equals"] },
];

/** git format-patch 输出目录：-o（分离/附着）、--output-directory（分离/等号）。 */
const FORMAT_PATCH_OUTPUT_OPTS: readonly Opt[] = [
  { names: ["-o"], kind: "file", operation: "write", forms: ["separated", "attached"] },
  { names: ["--output-directory"], kind: "file", operation: "write", forms: ["separated", "equals"] },
];


/** git bundle create <file> 的 bundle 文件：create 之后的第一个位置参数（create 本身由 pattern 保证）。 */
function bundleCreateFile(args: readonly ShellArg[]): { op: "write"; value: string }[] {
  const pos = positionalArgs(args);
  const file = pos[1];
  return file?.value ? [{ op: "write", value: file.value }] : [];
}

function gitEffects(cls: GitClass, first: string): readonly Effect[] {
  const effects = new Set<Effect>(cls === "inspect" ? ["read"] : cls === "destroy" ? ["execute"] : ["write"]);
  if (first === "rm") effects.add("delete");
  if (["fetch", "pull", "push", "clone", "remote", "ls-remote", "submodule"].includes(first)) effects.add("network");
  return [...effects];
}

// ─── 分类匹配器（token 级，A 候选） ───

function cmdMatches(cmd: GitClassifyDef["cmd"], first: string): boolean {
  return typeof cmd === "string" ? cmd === first : cmd.includes(first);
}

function flagHits(values: readonly string[], flags: readonly GitFlagSpec[]): boolean {
  return flags.some((spec) => values.some((t) => (spec.prefix ? t.startsWith(spec.name) : t === spec.name)));
}

interface GitClassifyResult {
  cls: GitClass;
  reason: string;
  paths?: GitClassifyDef["paths"];
}

/** 表序无关（每 cmd 一行）：cmd 命中后按 upgrade（fail-closed 优先）→ downgrade → 基础 裁决。
 * 调节 flag 检测基于 subArgs 值数组（主流程经引擎提取子命令后传入）。 */
function classifyGit(subArgs: readonly string[], defs: readonly GitClassifyDef[]): GitClassifyResult | null {
  const first = subArgs[0] ?? "";
  for (const def of defs) {
    if (!cmdMatches(def.cmd, first)) continue;
    if (def.upgrade && flagHits(subArgs, def.upgrade.flags)) {
      return { cls: def.upgrade.to, reason: def.upgrade.reason ?? def.reason, paths: def.upgrade.paths };
    }
    if (def.downgrade && flagHits(subArgs, def.downgrade.flags)) {
      return { cls: def.downgrade.to, reason: def.downgrade.reason ?? def.reason };
    }
    return { cls: def.cls!, reason: def.reason, paths: def.paths };
  }
  return null;
}

function extractGitPaths(
  paths: NonNullable<GitClassifyDef["paths"]>,
  subArgs: readonly ShellArg[],
): PathIntent[] {
  return paths(subArgs).map((p) => ({
    operation: p.op,
    rawPath: p.value,
    source: "argument" as const,
    span: SYNTHETIC_SPAN,
    confidence: "exact" as const,
  }));
}

// ─── git config 子命令：读写分类 + 配置层级目标解析 ───

const GIT_CONFIG_TABLE: ConfigOptionTable = {
  readFlags: new Set([
    "--list", "-l", "-z", "--null", "--get", "--get-all", "--get-regexp", "--get-urlmatch",
    "--get-color", "--get-colorbool", "--show-origin", "--show-scope", "--name-only", "--show-secrets",
    "--bool", "--int", "--bool-or-int", "--path", "--expiry-date", "--no-type", "--fixed-value",
    "--includes", "--no-includes", "--no-global", "--no-system", "--no-local", "--no-worktree",
  ]),
  writeFlags: new Set(["--add", "--unset", "--unset-all", "--remove-section", "--rename-section", "--edit", "-e"]),
  readConsume: new Set(["--type", "-t", "--default"]),
  readEquals: ["--value"],
  ignoreFlags: new Set(),
  consumeTargets: new Set(["-f", "--file"]),
  equalsTargets: ["--file"],
  staticTargets: {
    "--global": { rawPath: "~/.gitconfig", confidence: "exact" },
    "--system": { rawPath: "/etc/gitconfig", confidence: "exact" },
    "--local": { rawPath: ".git/config", confidence: "conservative" },
  },
  defaultTarget: { rawPath: ".git/config", confidence: "conservative" },
};

/**
 * git config 读写判定：显式写标志 > 显式读标志 > positional 推断（key+value 写 / 单 key 读）> 保守 modify。
 * 显式读标志优先于 positional 推断：--get-urlmatch/--get-colorbool 等读命令可携带 2+ 位置参数。
 */
function analyzeGitConfig(configArgs: readonly ShellArg[]): { cls: "inspect" | "modify"; intents: PathIntent[]; opaque: boolean } {
  const r = parseConfigOptions(configArgs, GIT_CONFIG_TABLE);
  const t = r.target ?? GIT_CONFIG_TABLE.defaultTarget;
  const writeIntents = (target: ConfigTarget) => (r.sawUnknown ? [] : [optionIntent("write", target.rawPath, target.confidence)]);

  if (r.sawWrite) {
    return { cls: "modify", intents: writeIntents(t), opaque: r.sawUnknown };
  }
  if (r.sawRead) {
    // 读型 config 不产生路径 intent：与 git status/log 等 inspect 命令一致（.git/config 在 blocked
    // paths，产生 intent 会硬拒读型 config，制造新摩擦）；靠 shellPolicy inspect 决策放行
    return { cls: "inspect", intents: [], opaque: r.sawUnknown };
  }
  if (r.positional.length >= 2) {
    return { cls: "modify", intents: writeIntents(t), opaque: r.sawUnknown };
  }
  if (r.positional.length === 1) {
    return { cls: "inspect", intents: [], opaque: r.sawUnknown };
  }
  // 无法判定（如孤立层级选项）→ 保守 modify；有显式目标才给 intent
  return { cls: "modify", intents: r.target ? writeIntents(r.target) : [], opaque: r.sawUnknown };
}

function positionalArgs(args: readonly ShellArg[]): ShellArg[] {
  const result: ShellArg[] = [];
  let optionsDone = false;
  for (const a of args) {
    const val = a.value ?? "";
    if (!optionsDone && val === "--") { optionsDone = true; continue; }
    if (!optionsDone && val.startsWith("-")) continue;
    result.push(a);
  }
  return result;
}

// ─── git branch 子命令：正向标志解析（T-059：BRANCH_OPTS 声明 + 引擎 flags 输出） ───
// 分类优先级（保守）：delete > force > move > upstream > copy > list/plain。
// 纯列表标志即使带位置参数（过滤模式）仍为 inspect。

const BRANCH_OPTS: readonly Opt[] = [
  { names: ["-d", "-D", "--delete"], kind: "flag" },
  { names: ["-f", "--force"], kind: "flag" },
  { names: ["-m", "-M", "--move", "--rename"], kind: "flag" },
  { names: ["--set-upstream-to"], kind: "flag", forms: ["equals"] },
  { names: ["--track", "--unset-upstream"], kind: "flag" },
  { names: ["-c", "-C", "--copy"], kind: "flag" },
  { names: ["-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--list", "--merged", "--no-merged", "--contains", "--no-contains"], kind: "flag" },
];

const BRANCH_FLAG_SETS = {
  delete: new Set(["-d", "-D", "--delete"]),
  force: new Set(["-f", "--force"]),
  move: new Set(["-m", "-M", "--move", "--rename"]),
  upstream: new Set(["--set-upstream-to", "--track", "--unset-upstream"]),
  copy: new Set(["-c", "-C", "--copy"]),
  list: new Set(["-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--list", "--merged", "--no-merged", "--contains", "--no-contains"]),
};

function analyzeGitBranch(subArgs: readonly ShellArg[]): CommandSemantics {
  // 引擎 flags 输出（T-059）：-d/-m 等分离 flag、--set-upstream-to= 等号形式统一识别
  const { flags } = parseOptions(subArgs, { opts: BRANCH_OPTS, positional: "file", opaqueOnUnknown: false });
  const flagSet = new Set(flags);
  const has = (set: Set<string>) => [...set].some((flag) => flagSet.has(flag));
  const positionals = subArgs.filter((a) => {
    const v = a.value ?? "";
    return v !== "--" && !v.startsWith("-");
  }).length;
  if (has(BRANCH_FLAG_SETS.delete)) return makeSemantics("destroy", { reason: "delete branch" });
  if (has(BRANCH_FLAG_SETS.force)) return makeSemantics("modify", { reason: "force create/move branch" });
  if (has(BRANCH_FLAG_SETS.move)) return makeSemantics("modify", { reason: "rename branch" });
  if (has(BRANCH_FLAG_SETS.upstream)) return makeSemantics("modify", { reason: "set/change branch upstream" });
  if (has(BRANCH_FLAG_SETS.copy)) return makeSemantics("modify", { reason: "copy branch" });
  if (has(BRANCH_FLAG_SETS.list)) return makeSemantics("inspect", { reason: "list branches" });
  if (positionals > 0) return makeSemantics("modify", { reason: "create/move branch" });
  return makeSemantics("inspect", { reason: "list branches" });
}

// ─── stash/bundle：规则表化（T-059） ───
// 前缀模式（semanticsFromRules 吃 positional 数组）：与 package/build 同构。
// stash 未命中 → 保守 modify（bare stash / 带消息 stash 均改动工作树，F4）。
// bundle 未命中 → unknown opaque（catch-all，semanticsFromRules 自动 opaque）。

const STASH_RULES: readonly RuleDef[] = [
  { cls: "inspect", pattern: (s) => /^(?:list|show)\b/.test(s), reason: "list/show stashes" },
  { cls: "inspect", pattern: (s) => /^(?:--help|-h|--version)$/.test(s), reason: "stash help/version" },
  { cls: "destroy", pattern: (s) => /^clear\b/.test(s), reason: "clear all stashes" },
];

const BUNDLE_RULES: readonly RuleDef[] = [
  { cls: "modify", pattern: (s) => /^(?:create|unpack)\b/.test(s), reason: "create/unpack bundle" },
  { cls: "inspect", pattern: (s) => /^(?:verify|list|header)\b/.test(s), reason: "inspect bundle" },
  { cls: "unknown", pattern: () => true, reason: "unrecognized git subcommand" },
];

// 专用子命令解析器注册表：复杂子命令族（config/branch/stash/bundle）走专用解析，
// GIT_CLASSIFY 表兜底。全部 token 级；接口统一 (subArgs, pathIntents)（T-059，删 tokens）。
type GitSubcommandParser = (subArgs: readonly ShellArg[], pathIntents: PathIntent[]) => CommandSemantics;

const GIT_SUBCOMMAND_PARSERS: ReadonlyMap<string, GitSubcommandParser> = new Map([
    ["config", (subArgs, pathIntents) => {
      const config = analyzeGitConfig(subArgs);
      return makeSemantics(config.cls, {
        reason: config.cls === "inspect" ? "read git config" : "set repository/user config",
        intents: [...pathIntents, ...config.intents],
        opaque: config.opaque,
      });
    }],
    ["branch", (subArgs) => analyzeGitBranch(subArgs)],
    // F4: 裸 stash / 未知 stash 子命令（-m/-u/branch 等）→ modify（规则表未命中保守兜底）；list/show → inspect；clear → destroy；--help/--version → inspect
    ["stash", (subArgs, pathIntents) => {
      const matched = semanticsFromRules(subArgs, STASH_RULES);
      if (matched) return { ...matched, intents: pathIntents };
      return makeSemantics("modify", { reason: "modify stash", intents: pathIntents });
    }],
    // R3: bundle — create（bundle 文件 write intent）/unpack 写；verify/list/header 只读；未知 → opaque
    ["bundle", (subArgs, pathIntents) => {
      const matched = semanticsFromRules(subArgs, BUNDLE_RULES);
      if (matched) {
        const create = matched.commandClass === "modify" && (subArgs[0]?.value ?? "") === "create";
        const intents = create ? [...pathIntents, ...extractGitPaths(bundleCreateFile, subArgs)] : pathIntents;
        return { ...matched, intents };
      }
      // BUNDLE_RULES 的 catch-all 保证语义必非 null；此处为类型收窄（规则表演化时防静默漏兜底）
      return makeSemantics("unknown", { reason: "unrecognized git subcommand", opaque: true });
    }],
  ]);

export const gitAdapter: CommandAdapter = {
  names: ["git"],
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    // 主流程经引擎定位子命令词（T-059）：-C/-c/--git-dir/--work-tree 被消费，
    // positional[0] = 子命令词（ShellArg 引用）；全局路径选项 → list intent。
    // subArgs 取子命令词之后的原始 args 切片——引擎只用于定位，子命令 flag
    // （--force/-n 等）必须原样保留供 GIT_CLASSIFY 调节与子命令 parser 检测
    // （引擎 positional 会跳过未知选项，直接用它作 subArgs 会丢 flag）。
    const { positional, consumed } = parseOptions(node.args, { opts: GIT_GLOBAL_OPTS, positional: "file", opaqueOnUnknown: false });
    const pathIntents: PathIntent[] = gitGlobalIntents(consumed);
    const subcmdArg = positional[0];
    const subcmd = subcmdArg?.value ?? "";
    if (!subcmdArg) {
      return makeSemantics("unknown", { reason: `unrecognized git command: ${node.args.map((a) => a.value ?? "").join(" ") || "(none)"}`, opaque: true });
    }
    const subArgs = node.args.slice(node.args.indexOf(subcmdArg) + 1);
    const subArgsValues = subArgs.map((a) => a.value ?? "");

    // 专用子命令解析器（config/branch/stash/bundle 复杂族）；未命中走 GIT_CLASSIFY 表
    const firstWord = subcmdArg.value ?? "";
    const parser = GIT_SUBCOMMAND_PARSERS.get(firstWord);
    if (parser) return parser(subArgs, pathIntents);

    // 分类表匹配（token 级；调节 flag 检测基于子命令词 + 原始子命令参数）
    const result = classifyGit([firstWord, ...subArgsValues], GIT_CLASSIFY);
    if (!result) return makeSemantics("unknown", { reason: `unrecognized git subcommand: ${subcmd}`, opaque: true });

    const intents = result.paths
      ? [...pathIntents, ...extractGitPaths(result.paths, subArgs)]
      : pathIntents;
    return makeSemantics(result.cls, {
      reason: result.reason,
      intents,
      effects: gitEffects(result.cls, firstWord),
    });
  },
};
