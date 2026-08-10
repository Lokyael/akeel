// Git 命令语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent, SemanticContext } from "../types";
import { makeSemantics, optionIntent } from "./shared";
import { parseConfigOptions, type ConfigOptionTable, type ConfigTarget } from "./config-parse";

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
  { cls: "inspect", pattern: (s) => /^check-attr\b/.test(s), reason: "query gitattributes attributes" },
  { cls: "inspect", pattern: (s) => /^check-ignore\b/.test(s), reason: "query gitignore rules" },
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

// ─── git branch 子命令：正向标志解析（T-052 C2） ───
// 分类优先级（保守）：delete > force > move > upstream > copy > list/plain。
// 标志枚举见 DECLARE_BRANCH_FLAGS；纯列表标志即使带位置参数（过滤模式）仍为 inspect。

const BRANCH_FLAG_SETS = {
  delete: new Set(["-d", "-D", "--delete"]),
  force: new Set(["-f", "--force"]),
  move: new Set(["-m", "-M", "--move", "--rename"]),
  upstream: new Set(["--set-upstream-to", "--track", "--unset-upstream"]),
  copy: new Set(["-c", "-C", "--copy"]),
  list: new Set(["-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--list", "--merged", "--no-merged", "--contains", "--no-contains"]),
};

function analyzeGitBranch(subcmd: string): CommandSemantics {
  const tokens = subcmd.replace(/^branch\s*/, "").split(/\s+/).filter(Boolean);
  const flags = new Set<string>();
  let positionals = 0;
  for (const token of tokens) {
    if (token === "--set-upstream-to" || token.startsWith("--set-upstream-to=")) {
      flags.add("--set-upstream-to");
    } else if (token.startsWith("-")) {
      flags.add(token);
    } else {
      positionals++;
    }
  }
  const has = (set: Set<string>) => [...flags].some((flag) => set.has(flag));
  if (has(BRANCH_FLAG_SETS.delete)) return makeSemantics("destroy", { reason: "delete branch" });
  if (has(BRANCH_FLAG_SETS.force)) return makeSemantics("modify", { reason: "force create/move branch" });
  if (has(BRANCH_FLAG_SETS.move)) return makeSemantics("modify", { reason: "rename branch" });
  if (has(BRANCH_FLAG_SETS.upstream)) return makeSemantics("modify", { reason: "set/change branch upstream" });
  if (has(BRANCH_FLAG_SETS.copy)) return makeSemantics("modify", { reason: "copy branch" });
  if (has(BRANCH_FLAG_SETS.list)) return makeSemantics("inspect", { reason: "list branches" });
  if (positionals > 0) return makeSemantics("modify", { reason: "create/move branch" });
  return makeSemantics("inspect", { reason: "list branches" });
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

    // git branch 子命令：正向标志解析（T-052 C2），从 GIT_CMDS 摘出
    if (/^branch\b/.test(subcmd)) {
      return analyzeGitBranch(subcmd);
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
