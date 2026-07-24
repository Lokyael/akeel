// 包管理器命令 — npm, pnpm, yarn 的语义

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface PkgDef {
  cls: "inspect" | "modify" | "execute" | "unknown";
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

function buildPkgRules(cmd: string): PkgDef[] {
  const installPat = cmd === "yarn" ? /^(?:add|install)\b/ : /^install\b/;
  const removePat = cmd === "yarn" ? /^(?:remove|upgrade)\b/ : /^(?:remove|uninstall)\b/;
  return [
    { cls: "inspect", pattern: (s) => /^view\b/.test(s) || /^info\b/.test(s), reason: `${cmd} package info` },
    { cls: "inspect", pattern: (s) => /^outdated\b/.test(s), reason: `${cmd} outdated packages` },
    { cls: "inspect", pattern: (s) => /^(?:search|ls|list)\b/.test(s), reason: `${cmd} search/list` },
    { cls: "execute", pattern: (s) => installPat.test(s), reason: `${cmd} install`, network: true },
    { cls: "execute", pattern: (s) => removePat.test(s), reason: `${cmd} remove` },
    { cls: "execute", pattern: (s) => /^update\b/.test(s), reason: `${cmd} update`, network: true },
    { cls: "modify", pattern: (s) => /^init\b/.test(s), reason: `${cmd} init` },
    { cls: "execute", pattern: (s) => /^publish\b/.test(s), reason: `${cmd} publish`, network: true },
    { cls: "execute", pattern: (s) => /^run\b/.test(s), reason: `${cmd} run script` },
    { cls: "execute", pattern: (s) => /^exec\b/.test(s), reason: `${cmd} exec` },
    { cls: "execute", pattern: (s) => /^test\b/.test(s), reason: `${cmd} test` },
    { cls: "execute", pattern: (s) => /^build\b/.test(s), reason: `${cmd} build` },
    { cls: "unknown", pattern: () => true, reason: `${cmd} unknown subcommand`, network: true },
  ];
}

// npx always executes (potentially after download).  Flags like --version/--help
// are inspect; everything else is execute + network.
const NPX_RULES: PkgDef[] = [
  { cls: "inspect", pattern: (s) => /^(--version|-v|--help)$/.test(s), reason: "npx version/help" },
  { cls: "execute", pattern: () => true, reason: "npx execute package", network: true },
];

const PKG_RULES: Record<string, PkgDef[]> = {
  npm: buildPkgRules("npm"),
  pnpm: buildPkgRules("pnpm"),
  yarn: buildPkgRules("yarn"),
  npx: NPX_RULES,
};

export const packageAdapter: CommandAdapter = {
  names: Object.keys(PKG_RULES),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const rules = PKG_RULES[name];
    if (!rules) return makeSemantics("unknown", { reason: `unknown package manager: ${name}`, opaque: true });

    const args = [...node.args];
    let subcmd = args.find((a) => {
      const v = a.value ?? "";
      return !v.startsWith("-") && v !== "--";
    })?.value ?? "";
    // npx: when no subcommand (all args are flags), use the first flag
    if (name === "npx" && !subcmd && args.length > 0) {
      subcmd = args[0]!.value ?? "";
    }

    for (const def of rules) {
      if (def.pattern(subcmd)) {
        return makeSemantics(def.cls, {
          reason: def.reason,
          effects: def.network ? ["network"] : undefined,
          opaque: def.cls === "unknown",
        });
      }
    }

    return makeSemantics("unknown", { reason: `${name}: unrecognized command`, opaque: true });
  },
};
