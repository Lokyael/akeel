// 包管理器命令 — npm, pnpm, yarn 的语义

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics, extractSubcommand } from "./shared";

interface PkgDef {
  cls: "inspect" | "modify" | "execute" | "unknown";
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

function buildPkgRules(cmd: string): PkgDef[] {
  // npm 用 install；pnpm/yarn 用 add/install（pnpm add 是核心安装命令）
  const installPat = cmd === "npm" ? /^install\b/ : /^(?:add|install)\b/;
  const removePat = cmd === "yarn" ? /^(?:remove|upgrade)\b/ : /^(?:remove|uninstall)\b/;
  const rules: PkgDef[] = [
    { cls: "inspect", pattern: (s) => /^view\b/.test(s) || /^info\b/.test(s), reason: `${cmd} package info` },
    { cls: "inspect", pattern: (s) => /^outdated\b/.test(s), reason: `${cmd} outdated packages` },
    { cls: "inspect", pattern: (s) => /^(?:search|ls|list)\b/.test(s), reason: `${cmd} search/list` },
    { cls: "execute", pattern: (s) => installPat.test(s), reason: `${cmd} install`, network: true },
    { cls: "execute", pattern: (s) => removePat.test(s), reason: `${cmd} remove` },
    { cls: "execute", pattern: (s) => /^update\b/.test(s), reason: `${cmd} update`, network: true },
    { cls: "modify", pattern: (s) => /^init\b/.test(s), reason: `${cmd} init` },
    { cls: "execute", pattern: (s) => /^publish\b/.test(s), reason: `${cmd} publish`, network: true },
    { cls: "execute", pattern: (s) => /^(?:run|start|stop|restart)\b/.test(s), reason: `${cmd} run script` },
    { cls: "execute", pattern: (s) => /^exec\b/.test(s), reason: `${cmd} exec` },
    { cls: "execute", pattern: (s) => /^test\b/.test(s), reason: `${cmd} test` },
    { cls: "execute", pattern: (s) => /^build\b/.test(s), reason: `${cmd} build` },
    { cls: "execute", pattern: (s) => /^(?:prune|pack|link|unlink)\b/.test(s), reason: `${cmd} prune/pack/link` },
    { cls: "inspect", pattern: (s) => /^config\s+(?:get|list)\b/.test(s), reason: `${cmd} read config` },
    { cls: "inspect", pattern: (s) => /^(?:audit|whoami|ping)\b/.test(s), reason: `${cmd} audit/whoami/ping`, network: true },
    { cls: "inspect", pattern: (s) => /^(?:help|root)\b/.test(s), reason: `${cmd} help/root` },
    { cls: "modify", pattern: (s) => /^(?:config|version|dedupe|cache)\b/.test(s), reason: `${cmd} config/version/dedupe/cache` },
  ];
  // npm/pnpm 有 ci（按 lockfile 精确安装）；yarn 的等价物是 install --frozen-lockfile，没有独立 ci 子命令
  if (cmd !== "yarn") {
    rules.push({ cls: "execute", pattern: (s) => /^ci\b/.test(s), reason: `${cmd} ci`, network: true });
  }
  rules.push({ cls: "unknown", pattern: () => true, reason: `${cmd} unknown subcommand`, network: true });
  return rules;
}

// 取值选项：选项之后的下一个 token 是值而非子命令。不穷举，未覆盖的选项导致 unknown（安全降级）。
const PKG_VALUE_OPTS = [
  "--prefix", "--registry", "--cache", "--userconfig", "--globalconfig",
  "--cafile", "--cert", "--key", "--proxy", "--https-proxy", "--noproxy",
  "--scope", "--tag", "--workspace", "--dir", "--filter", "--cwd",
  "-w", "-C", "-F",
];

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
    let subcmd = extractSubcommand(args, PKG_VALUE_OPTS);
    // npx: 当没有子命令（全为选项）时，用第一个选项作为候选
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
