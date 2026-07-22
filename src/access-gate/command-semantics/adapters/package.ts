// 包管理器命令 — npm, pnpm, yarn 的语义

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface PkgDef {
  cls: "readOnly" | "mutating" | "unclassified";
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

function buildPkgRules(cmd: string): PkgDef[] {
  const installPat = cmd === "yarn" ? /^(?:add|install)\b/ : /^install\b/;
  const removePat = cmd === "yarn" ? /^(?:remove|upgrade)\b/ : /^(?:remove|uninstall)\b/;
  return [
    { cls: "readOnly", pattern: (s) => /^view\b/.test(s) || /^info\b/.test(s), reason: `${cmd} package info` },
    { cls: "readOnly", pattern: (s) => /^outdated\b/.test(s), reason: `${cmd} outdated packages` },
    { cls: "readOnly", pattern: (s) => /^(?:search|ls|list)\b/.test(s), reason: `${cmd} search/list` },
    { cls: "mutating", pattern: (s) => installPat.test(s), reason: `${cmd} install`, network: true },
    { cls: "mutating", pattern: (s) => removePat.test(s), reason: `${cmd} remove` },
    { cls: "mutating", pattern: (s) => /^update\b/.test(s), reason: `${cmd} update`, network: true },
    { cls: "mutating", pattern: (s) => /^init\b/.test(s), reason: `${cmd} init` },
    { cls: "mutating", pattern: (s) => /^publish\b/.test(s), reason: `${cmd} publish`, network: true },
    { cls: "mutating", pattern: (s) => /^run\b/.test(s), reason: `${cmd} run script` },
    { cls: "mutating", pattern: (s) => /^exec\b/.test(s), reason: `${cmd} exec` },
    { cls: "mutating", pattern: (s) => /^test\b/.test(s), reason: `${cmd} test` },
    { cls: "mutating", pattern: (s) => /^build\b/.test(s), reason: `${cmd} build` },
    { cls: "unclassified", pattern: () => true, reason: `${cmd} unknown subcommand`, network: true },
  ];
}

const PKG_RULES: Record<string, PkgDef[]> = {
  npm: buildPkgRules("npm"),
  pnpm: buildPkgRules("pnpm"),
  yarn: buildPkgRules("yarn"),
};

export const packageAdapter: CommandAdapter = {
  names: Object.keys(PKG_RULES),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const rules = PKG_RULES[name];
    if (!rules) return makeSemantics("unclassified", { reason: `unknown package manager: ${name}`, opaque: true });

    const args = [...node.args];
    const subcmd = args.find((a) => {
      const v = a.value ?? "";
      return !v.startsWith("-") && v !== "--";
    })?.value ?? "";

    for (const def of rules) {
      if (def.pattern(subcmd)) {
        return makeSemantics(def.cls, {
          reason: def.reason,
          opaque: def.cls === "unclassified",
        });
      }
    }

    return makeSemantics("unclassified", { reason: `${name}: unrecognized command`, opaque: true });
  },
};
