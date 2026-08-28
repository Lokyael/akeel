// uv 命令族：项目环境执行与包管理
//
// 第一阶段只建模执行入口：
//   uv run ...       → execute
//   uv --version/... → inspect
// 其余子命令保持 unknown + opaque，避免把未分析的 uv 行为误放行。

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics } from "../types";
import { makeSemantics } from "../semantics";
import { semanticsFromRules, type RuleDef } from "../rules";
import { subcommandArgs } from "../args";
import { parseOptions, type Opt } from "./option-parse";

// uv 的全局/`run` 选项。这里只消费会遮蔽顶层子命令的值；run 后的未知选项
// 属于用户要执行的程序，不能因此把任意 pytest/cargo 等子命令误判为 opaque。
const UV_VALUE_OPTS: readonly Opt[] = [
  {
    names: [
      "--allow-insecure-host",
      "--cache-dir",
      "--config-file",
      "--directory",
      "--exclude-newer",
      "--exclude-newer-package",
      "--extra",
      "--extra-index-url",
      "--find-links",
      "--fork-strategy",
      "--group",
      "--index",
      "--index-strategy",
      "--index-url",
      "--link-mode",
      "--no-group",
      "--no-install-package",
      "--only-group",
      "--only-package",
      "--project",
      "--python",
      "--python-platform",
      "--resolution",
      "--with",
      "--with-editable",
      "--with-requirements",
      "--refresh-package",
      "--no-extra",
      "-C",
    ],
    kind: "expression",
    forms: ["separated", "equals"],
  },
];

const UV_FLAGS: readonly Opt[] = [
  {
    names: [
      "--all-extras",
      "--all-groups",
      "--compile-bytecode",
      "--exact",
      "--frozen",
      "--help",
      "--inexact",
      "--locked",
      "--managed-python",
      "--no-cache",
      "--no-config",
      "--no-default-groups",
      "--no-dev",
      "--no-editable",
      "--no-install-project",
      "--no-install-workspace",
      "--no-managed-python",
      "--no-progress",
      "--no-python-downloads",
      "--no-sync",
      "--offline",
      "--only-dev",
      "--no-project",
      "--refresh",
      "--reinstall",
      "--system-certs",
      "--version",
      "-h",
      "-q",
      "-v",
      "-V",
    ],
    kind: "flag",
  },
];

const UV_RULES: readonly RuleDef[] = [
  { cls: "inspect", pattern: (s) => /^(?:--version|-V|--help|-h|help)\b/.test(s), reason: "uv version/help" },
  { cls: "execute", pattern: (s) => /^run\b/.test(s), reason: "uv run command" },
  { cls: "unknown", pattern: () => true, reason: "uv unknown subcommand" },
];

const INFO_FLAGS = new Set(["--help", "-h", "--version", "-V"]);

/**
 * uv consumes help/version flags at the CLI level, including when they appear
 * after `run`; they request uv's own help rather than executing a child command.
 * A child command's flags are intentionally not inspected (`uv run pytest --help`
 * remains an execution request).
 */
function isUvInfoRequest(args: readonly { readonly value?: string | null }[]): boolean {
  let runSeen = false;
  let childSeen = false;
  for (const arg of args) {
    const value = arg.value ?? "";
    if (!runSeen && value === "run") {
      runSeen = true;
      continue;
    }
    if (runSeen && !value.startsWith("-")) {
      childSeen = true;
      continue;
    }
    if (INFO_FLAGS.has(value) && !childSeen) return true;
  }
  return false;
}

export const uvAdapter: CommandAdapter = {
  names: ["uv"],
  analyze(node: ShellCommandNode): CommandSemantics {
    if (isUvInfoRequest(node.args)) {
      return makeSemantics("inspect", { reason: "uv version/help" });
    }
    const { positional } = parseOptions(node.args, {
      opts: [...UV_VALUE_OPTS, ...UV_FLAGS],
      positional: "file",
      // run 后的命令由 uv 透明转发，未知选项不能吞掉其语义。
      opaqueOnUnknown: false,
    });
    const candidates = subcommandArgs(positional, node.args);
    return semanticsFromRules(candidates, UV_RULES)!;
  },
};
