// 包管理器命令 — npm, pnpm, yarn 的语义

import type { ShellArg, ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent } from "../types";
import { makeSemantics, optionIntent, semanticsFromRules, type RuleDef } from "./shared";
import { parseOptions, type Opt } from "./option-parse";
import { parseConfigOptions, type ConfigOptionTable } from "./config-parse";

// 规则表类型统一由 shared.ts 的 RuleDef 承担：本地不再有平行规则接口。

function buildPkgRules(cmd: string): RuleDef[] {
  // npm 用 install；pnpm/yarn 用 add/install（pnpm add 是核心安装命令）
  const installPat = cmd === "npm" ? /^install\b/ : /^(?:add|install)\b/;
  const removePat = cmd === "yarn" ? /^(?:remove|upgrade)\b/ : /^(?:remove|uninstall)\b/;
  const rules: RuleDef[] = [
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

// 取值选项：选项之后的下一个 token 是值而非子命令（值非路径，kind: expression，T-059）。
// 不穷举，未覆盖的选项导致 unknown（安全降级）。
const PKG_VALUE_OPTS: readonly Opt[] = [
  { names: ["--prefix", "--registry", "--cache", "--userconfig", "--globalconfig", "--cafile", "--cert", "--key", "--proxy", "--https-proxy", "--noproxy", "--scope", "--tag", "--workspace", "--dir", "--filter", "--cwd"], kind: "expression", forms: ["separated", "equals"] },
  { names: ["-w", "-C", "-F"], kind: "expression", forms: ["separated", "attached", "equals"] },
];

// npx always executes (potentially after download).  Flags like --version/--help
// are inspect; everything else is execute + network.
const NPX_RULES: RuleDef[] = [
  { cls: "inspect", pattern: (s) => /^(--version|-v|--help)$/.test(s), reason: "npx version/help" },
  { cls: "execute", pattern: () => true, reason: "npx execute package", network: true },
];

const PKG_RULES: Record<string, RuleDef[]> = {
  npm: buildPkgRules("npm"),
  pnpm: buildPkgRules("pnpm"),
  yarn: buildPkgRules("yarn"),
  npx: NPX_RULES,
};

// ─── npm/pnpm config 子命令：写目标层级解析 ───

const NPM_CONFIG_TABLE: ConfigOptionTable = {
  readFlags: new Set(),
  writeFlags: new Set(),
  readConsume: new Set(),
  readEquals: [],
  ignoreFlags: new Set(["-g", "--global"]),
  consumeTargets: new Set(["--userconfig", "--globalconfig"]),
  equalsTargets: ["--userconfig", "--globalconfig"],
  staticTargets: {},
  defaultTarget: { rawPath: "~/.npmrc", confidence: "exact" },
};

/**
 * 解析 config 子命令后的参数。写操作（set/delete/edit）→ modify + 配置目标 write intent；
 * 其余（get/list/未知）返回 null 交回规则循环。未知选项 → opaque（fail-closed，D-025）。
 */
function analyzePkgConfig(rest: readonly ShellArg[]): { cls: "modify"; intents: PathIntent[]; opaque: boolean } | null {
  const r = parseConfigOptions(rest, NPM_CONFIG_TABLE);
  if (r.op === "set" || r.op === "delete" || r.op === "edit") {
    const t = r.target ?? NPM_CONFIG_TABLE.defaultTarget;
    return {
      cls: "modify",
      intents: r.sawUnknown ? [] : [optionIntent("write", t.rawPath, t.confidence)],
      opaque: r.sawUnknown,
    };
  }
  return null;
}

export const packageAdapter: CommandAdapter = {
  names: Object.keys(PKG_RULES),
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const rules = PKG_RULES[name];
    if (!rules) return makeSemantics("unknown", { reason: `unknown package manager: ${name}`, opaque: true });

    // 引擎投影：取值选项被消费，positional = 子命令 token（T-059）；
    // opaqueOnUnknown: false（D-040 判据：大类 + catch-all 保守兜底）
    const { positional } = parseOptions(node.args, { opts: PKG_VALUE_OPTS, positional: "file", opaqueOnUnknown: false });
    // 子命令 token（取值选项已消费）；npx 全选项输入（--version/--help）用首个选项作候选
    const subcmdArgs = positional.length > 0
      ? positional
      : (name === "npx" && node.args.length > 0 ? [{ value: node.args[0]!.value ?? "" }] : []);
    const subcmd = subcmdArgs.map((a) => a.value).join(" ");

    // npm/pnpm config 写命令（set/delete/edit）→ modify + 配置目标 write intent；
    // get/list/未知交回规则循环（yarn config 不在范围，维持 modify 无 intent）。
    // config rest 取原始 args 切片（--userconfig 等目标选项不能被顶层 PKG_VALUE_OPTS
    // 消费——由 analyzePkgConfig 的 ConfigOptionTable 自己解析，T-059）。
    if (name !== "yarn" && subcmd.startsWith("config")) {
      const configIdx = positional.length > 0 ? node.args.indexOf(positional[0]!) : -1;
      const rest = configIdx >= 0 ? node.args.slice(configIdx + 1) : [];
      const cfg = analyzePkgConfig(rest);
      if (cfg) {
        return makeSemantics(cfg.cls, { reason: `${name} config`, intents: cfg.intents, opaque: cfg.opaque });
      }
    }

    const matched = semanticsFromRules(subcmdArgs, rules);
    if (matched) return matched;

    return makeSemantics("unknown", { reason: `${name}: unrecognized command`, opaque: true });
  },
};
