// Git 命令语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

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
  { cls: "inspect", pattern: (s) => /^branch\b(?!.*-[dD]\b)/.test(s), reason: "list branches" },
  { cls: "inspect", pattern: (s) => /^show\b/.test(s), reason: "show objects" },
  { cls: "inspect", pattern: (s) => /^grep\b/.test(s), reason: "search commit contents" },
  { cls: "inspect", pattern: (s) => /^blame\b/.test(s), reason: "show file blame" },
  { cls: "inspect", pattern: (s) => /^stash\s+(list|show)\b/.test(s), reason: "list/show stashes" },
  { cls: "inspect", pattern: (s) => /^ls-files\b/.test(s), reason: "list tracked files" },
  { cls: "inspect", pattern: (s) => /^ls-tree\b/.test(s), reason: "list tree contents" },
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
  if (/^rm\\b/.test(subcmd)) effects.add("delete");
  if (/^(fetch|pull|push|clone|remote)\\b/.test(subcmd)) effects.add("network");
  return [...effects];
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
