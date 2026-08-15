// script interpreter commands -- python, python3, node, ruby, perl

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics } from "../types";
import { makeSemantics } from "./shared";
import { parseOptions, type Opt } from "./option-parse";
import { LANGUAGE_RUNTIMES } from "../interpreter-names";

/**
 * 解释器信息选项（--version/-V/-v/--help）→ inspect；其余任何形态（脚本、-e/-c 代码、
 * stdin）→ execute。选项遍历由引擎承担（T-059 步骤 4）：flags 输出直接判断，
 * 不再用内联 finder + fallback 把信息选项当子命令候选（那是引擎缺席时的替代品）。
 * opaqueOnUnknown: false —— 解释器选项面开放，未知选项静默（执行脚本语义不变）。
 */
const INFO_OPTS: readonly Opt[] = [
  { names: ["--version", "-V", "-v", "--help"], kind: "flag" },
];

export const interpreterAdapter: CommandAdapter = {
  names: [...LANGUAGE_RUNTIMES],
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const { flags } = parseOptions(node.args, { opts: INFO_OPTS, positional: "file", opaqueOnUnknown: false });
    const isInfo = flags.some((f) => f === "--version" || f === "-V" || f === "-v" || f === "--help");
    return makeSemantics(isInfo ? "inspect" : "execute", {
      reason: isInfo ? `${name} version/help` : `${name} execute script`,
    });
  },
};
