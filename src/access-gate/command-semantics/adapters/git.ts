// Git 命令语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent, SemanticContext } from "../types";
import { makeSemantics, optionIntent } from "./shared";

/** Git 子命令分类。 */
type GitClass = "inspect" | "modify" | "destroy";

interface GitDef {
  cls: GitClass;
  pattern: (subcmd: string) => boolean;
  paths?: (args: ShellArg[]) => { op: "read" | "write" | "list"; value: string }[];
  reason: string;
}

const GIT_CMDS: GitDef[] = [
  { cls: "inspect", pattern: (s) => /^status\b/.test(s), reason: "show working tree status" },
  { cls: "inspect", pattern: (s) => /^diff\b/.test(s), reason: "show changes" },
  { cls: "inspect", pattern: (s) => /^log\b/.test(s), reason: "show commit logs" },
  { cls: "inspect", pattern: (s) => /^rev-list\b/.test(s), reason: "list reachable commits" },
  { cls: "inspect", pattern: (s) => /^branch\b(?!.*(?:-[dDf]|--delete|--force)\b)/.test(s), reason: "list branches" },
  { cls: "inspect", pattern: (s) => /^clean\b.*(-n|--dry-run)\b/.test(s), reason: "preview untracked files" },
  { cls: "inspect", pattern: (s) => /^show\b/.test(s), reason: "show objects" },
  { cls: "inspect", pattern: (s) => /^grep\b/.test(s), reason: "search commit contents" },
  { cls: "inspect", pattern: (s) => /^blame\b/.test(s), reason: "show file blame" },
  { cls: "inspect", pattern: (s) => /^stash\s+(list|show)\b/.test(s), reason: "list/show stashes" },
  { cls: "inspect", pattern: (s) => /^ls-files\b/.test(s), reason: "list tracked files" },
  { cls: "inspect", pattern: (s) => /^ls-tree\b/.test(s), reason: "list tree contents" },
  { cls: "inspect", pattern: (s) => /^ls-remote\b/.test(s), reason: "list remote refs" },
  { cls: "inspect", pattern: (s) => /^fsck\b/.test(s), reason: "verify repository integrity" },
  { cls: "inspect", pattern: (s) => /^archive\b/.test(s), reason: "create repository archive" },
  { cls: "inspect", pattern: (s) => /^describe\b/.test(s), reason: "describe commit" },
  { cls: "modify", pattern: (s) => /^add\b/.test(s), paths: (args) => positionalArgs(args).map((a) => ({ op: "read" as const, value: a.value ?? "" })), reason: "stage files" },
  { cls: "modify", pattern: (s) => /^rm\b/.test(s), paths: (args) => positionalArgs(args).map((a) => ({ op: "write" as const, value: a.value ?? "" })), reason: "remove tracked files" },
  { cls: "modify", pattern: (s) => /^commit\b/.test(s), reason: "record changes" },
  { cls: "modify", pattern: (s) => /^push\b(?!.*(-f|--force)\b)/.test(s), reason: "push to remote" },
  { cls: "modify", pattern: (s) => /^(checkout|switch)\b/.test(s), paths: (args) => { const idx = args.findIndex((a) => a.value === "--"); return idx >= 0 ? args.slice(idx + 1).map((a) => ({ op: "write" as const, value: a.value ?? "" })) : []; }, reason: "switch branch/restore files" },
  { cls: "modify", pattern: (s) => /^restore\b/.test(s), paths: (args) => positionalArgs(args).map((a) => ({ op: "write" as const, value: a.value ?? "" })), reason: "restore files" },
  { cls: "modify", pattern: (s) => /^merge\b/.test(s), reason: "merge branches" },
  { cls: "modify", pattern: (s) => /^rebase\b/.test(s), reason: "rebase commits" },
  { cls: "modify", pattern: (s) => /^tag\b/.test(s), reason: "create/list/delete tags" },
  { cls: "modify", pattern: (s) => /^stash\s+(push|save|pop|apply|drop)\b/.test(s), reason: "modify stash" },
  { cls: "modify", pattern: (s) => /^reset\b(?!.*--hard\b)/.test(s), reason: "reset HEAD" },
  { cls: "modify", pattern: (s) => /^fetch\b/.test(s), reason: "fetch from remote" },
  { cls: "modify", pattern: (s) => /^pull\b/.test(s), reason: "pull from remote" },
  { cls: "modify", pattern: (s) => /^clone\b/.test(s), reason: "clone repository" },
  { cls: "modify", pattern: (s) => /^init\b/.test(s), reason: "initialize repository" },
  { cls: "modify", pattern: (s) => /^remote\b/.test(s), reason: "manage remotes" },
  { cls: "modify", pattern: (s) => /^mv\b/.test(s), paths: (args) => positionalArgs(args).map((a) => ({ op: "write" as const, value: a.value ?? "" })), reason: "move/rename tracked files" },
  { cls: "modify", pattern: (s) => /^(?:cherry-pick|revert)\b/.test(s), reason: "apply commits" },
  { cls: "modify", pattern: (s) => /^apply\b/.test(s), reason: "apply patch" },
  { cls: "modify", pattern: (s) => /^gc\b/.test(s), reason: "garbage collect repository" },
  { cls: "modify", pattern: (s) => /^submodule\b/.test(s), reason: "manage submodules" },
  { cls: "modify", pattern: (s) => /^branch\s+(?:-f|--force)\b/.test(s), reason: "force create/move branch" },
  { cls: "destroy", pattern: (s) => /^branch\s+(?:-[dD]|--delete)\b/.test(s), reason: "delete branch" },
  { cls: "destroy", pattern: (s) => /^clean\b/.test(s), reason: "delete untracked files" },
  { cls: "destroy", pattern: (s) => /^push\s+.*(-f|--force)\b/.test(s), reason: "force push" },
  { cls: "destroy", pattern: (s) => /^reset\s+--hard\b/.test(s), reason: "hard reset" },
  { cls: "destroy", pattern: (s) => /^stash\s+clear\b/.test(s), reason: "clear all stashes" },
];

function gitPathOpts(args: ShellArg[]): PathIntent[] {
  const intents: PathIntent[] = [];
  for (let i = 0; i < args.length; i++) {
    const val = args[i]!.value ?? "";
    if (val === "-C" && i + 1 < args.length) {
      const p = args[i + 1]!.value ?? "";
      if (p) intents.push({ operation: "list", rawPath: p, source: "option", span: { start: 0, end: 0 }, confidence: "conservative" });
      i++;
    } else if (val.startsWith("--git-dir=") || val.startsWith("--work-tree=")) {
      const eq = val.indexOf("=");
      const p = val.slice(eq + 1);
      if (p) intents.push({ operation: "list", rawPath: p, source: "option", span: { start: 0, end: 0 }, confidence: "conservative" });
    }
  }
  return intents;
}

function gitEffects(def: GitDef, subcmd: string): readonly Effect[] {
  const effects = new Set<Effect>(def.cls === "inspect" ? ["read"] : def.cls === "destroy" ? ["execute"] : ["write"]);
  if (/^rm\b/.test(subcmd)) effects.add("delete");
  if (/^(fetch|pull|push|clone|remote|ls-remote|submodule)\b/.test(subcmd)) effects.add("network");
  return [...effects];
}

// ─── git config 子命令：读写分类 + 配置层级目标解析（T-037） ───

/** git config 目标层级 → 配置文件路径（confidence 区分确定/环境依赖目标）。 */
interface ConfigTarget {
  rawPath: string;
  confidence: "exact" | "conservative";
}

const CONFIG_DEFAULT_TARGET: ConfigTarget = { rawPath: ".git/config", confidence: "conservative" };

/** 读特征选项（改变输出格式/过滤，不改变文件访问；含消费值的 --type/-t/--default）。 */
const CONFIG_READ_FLAGS = new Set([
  "--list", "-l", "-z", "--null", "--get", "--get-all", "--get-regexp", "--get-color", "--get-colorbool",
  "--show-origin", "--show-scope", "--name-only", "--bool", "--int", "--bool-or-int", "--path",
  "--expiry-date", "--no-type", "--fixed-value", "--includes", "--no-includes",
]);

/** 写特征选项。 */
const CONFIG_WRITE_FLAGS = new Set(["--add", "--unset", "--unset-all", "--remove-section", "--rename-section", "--edit", "-e"]);

/** 消费下一个 token 作为值的读选项（值非路径：--type bool、--default "fallback"）。 */
const CONFIG_CONSUME_READ = new Set(["--type", "-t", "--default"]);

/**
 * 解析 git config 参数，产出读写分类与配置目标（T-037）。
 * - 写特征（写 flag 或 key+value 双 positional）→ modify + write intent
 * - 读特征（读 flag 或单 key）→ inspect + read intent
 * - 无法判定（如孤立层级选项）→ 保守 modify（fail-closed，D-025）
 * - 未知层级/未知选项 → opaque（目标不确定不猜，不产生 intent）
 */
function analyzeGitConfig(configArgs: readonly ShellArg[]): { cls: "inspect" | "modify"; intents: PathIntent[]; opaque: boolean } {
  let target: ConfigTarget | null = null;
  let sawUnknown = false;
  let sawRead = false;
  let sawWrite = false;
  const positional: string[] = [];

  for (let i = 0; i < configArgs.length; i++) {
    const val = configArgs[i]!.value ?? "";
    if (val === "--") {
      for (let j = i + 1; j < configArgs.length; j++) positional.push(configArgs[j]!.value ?? "");
      break;
    }
    if (!val.startsWith("-")) { positional.push(val); continue; }

    if (CONFIG_READ_FLAGS.has(val)) { sawRead = true; continue; }
    if (CONFIG_WRITE_FLAGS.has(val)) { sawWrite = true; continue; }
    if (val === "--global") { target = { rawPath: "~/.gitconfig", confidence: "exact" }; continue; }
    if (val === "--system") { target = { rawPath: "/etc/gitconfig", confidence: "exact" }; continue; }
    if (val === "--local") { target = CONFIG_DEFAULT_TARGET; continue; }
    if (val.startsWith("--file=")) {
      const filePath = val.slice("--file=".length);
      if (!filePath) { sawUnknown = true; continue; }  // 空目标不猜，避免空路径 intent
      target = { rawPath: filePath, confidence: "exact" };
      continue;
    }
    if (val.startsWith("--value=")) { sawRead = true; continue; }
    if (CONFIG_CONSUME_READ.has(val) && i + 1 < configArgs.length) { sawRead = true; i++; continue; }
    if (val === "-f" && i + 1 < configArgs.length) {
      target = { rawPath: configArgs[i + 1]!.value ?? "", confidence: "exact" };
      i++;
      continue;
    }
    // 未知层级/未知选项（含 --worktree）：目标不确定 → opaque，不猜
    sawUnknown = true;
  }

  const isWrite = sawWrite || positional.length >= 2;
  const isRead = sawRead || positional.length === 1;
  const t = target ?? CONFIG_DEFAULT_TARGET;

  if (isWrite) {
    return { cls: "modify", intents: sawUnknown ? [] : [optionIntent("write", t.rawPath, t.confidence)], opaque: sawUnknown };
  }
  if (isRead) {
    // 读型 config 不产生路径 intent：与 git status/log 等 inspect 命令一致（.git/config 在 blocked
    // paths，产生 intent 会硬拒读型 config，制造新摩擦）；靠 shellPolicy inspect 决策放行
    return { cls: "inspect", intents: [], opaque: sawUnknown };
  }
  // 无法判定 → 保守 modify；有显式目标才给 intent
  return { cls: "modify", intents: target && !sawUnknown ? [optionIntent("write", target.rawPath, target.confidence)] : [], opaque: sawUnknown };
}

function positionalArgs(args: ShellArg[]): ShellArg[] {
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

export const gitAdapter: CommandAdapter = {
  names: ["git"],
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const args = [...node.args];

    // extract git repo path options
    const pathIntents: PathIntent[] = gitPathOpts(args);

    // find subcommand (skip git path options like -C <path>)
    let subcmdIndex = -1;
    for (let i = 0; i < args.length; i++) {
      const v = args[i]!.value ?? "";
      if (v === "--") break;
      // skip git repo path options and their values
      if (v === "-C") { i++; continue; }
      if (v.startsWith("--git-dir=") || v.startsWith("--work-tree=")) continue;
      if (!v.startsWith("-")) {
        subcmdIndex = i;
        break;
      }
    }
    const subcmd = subcmdIndex >= 0 ? args.slice(subcmdIndex).map((a) => a.value ?? "").join(" ") : "";

    // git config 子命令走专用读写分类与层级目标解析（T-037）
    if (/^config\b/.test(subcmd)) {
      const configArgs = subcmdIndex >= 0 ? args.slice(subcmdIndex + 1) : [];
      const config = analyzeGitConfig(configArgs);
      return makeSemantics(config.cls, {
        reason: config.cls === "inspect" ? "read git config" : "set repository/user config",
        intents: [...pathIntents, ...config.intents],
        opaque: config.opaque,
      });
    }

    // match subcommand classification
    for (const def of GIT_CMDS) {
      if (def.pattern(subcmd)) {
        if (def.paths) {
          const subcmdArgs = subcmdIndex >= 0 ? args.slice(subcmdIndex + 1) : [];
          for (const p of def.paths(subcmdArgs)) {
            pathIntents.push({
              operation: p.op,
              rawPath: p.value,
              source: "argument",
              span: { start: 0, end: 0 },
              confidence: "exact",
            });
          }
        }
        return makeSemantics(def.cls, { reason: def.reason, intents: pathIntents, effects: gitEffects(def, subcmd) });
      }
    }

    return makeSemantics("unknown", { reason: `unrecognized git subcommand: ${subcmd}`, opaque: true });
  },
};
