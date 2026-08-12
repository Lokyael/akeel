// system 命令语义 — date
// date 读取/设置系统时间：默认 inspect；-r/--reference、-f/--file 读取文件（read intent）；
// -s/--set 修改系统时钟（modify）；+FORMAT 与选项值是格式/时间字符串，不产生路径 intent。
//
// 选项遍历由统一引擎 option-parse 承担（与其余 adapter 同构）。
// 引擎无「取值选项升级 class」原语——-s/--set 的 modify 升级由 adapter 对 consumed 后扫判定；
// +FORMAT 等位置参数用 positional: "set"（非文件，消费不输出）。

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics, consumedFileIntents } from "./shared";
import { parseOptions, type Opt } from "./option-parse";

const DATE_OPTS: Opt[] = [
  { names: ["-d", "--date"], kind: "expression", forms: ["separated", "equals", "attached"] },
  { names: ["-r", "--reference", "-f", "--file"], kind: "file", operation: "read", forms: ["separated", "equals", "attached"] },
  // -s/--set 取值但非路径（kind expression，无 intent）；modify 升级由引擎 classAdjust 承担（T-059/B1）
  { names: ["-s", "--set"], kind: "expression", upgradeTo: "modify", forms: ["separated", "equals", "attached"] },
  // -I[FMT] 可选附加格式值（-Iseconds）；--iso-8601/--rfc-3339 仅 = 形式（GNU 必选 SPEC，
  // 裸 --rfc-3339 无 = 时按取值缺值 → opaque，与既有行为一致）
  { names: ["-I"], kind: "flag", forms: ["suffix", "equals"] },
  { names: ["-u", "-R", "--utc", "--universal", "--rfc-822", "--version", "--help"], kind: "flag" },
  { names: ["--iso-8601"], kind: "flag", forms: ["equals"] },
  { names: ["--rfc-3339"], kind: "expression", forms: ["equals"] },
];

export const dateAdapter: CommandAdapter = {
  names: ["date"],
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const { consumed, opaque, classAdjust } = parseOptions([...node.args], {
      opts: DATE_OPTS,
      positional: "set",
      opaqueOnUnknown: true,
    });

    const fileIntents: PathIntent[] = consumedFileIntents(consumed);
    // 引擎 classAdjust：-s/--set → modify（T-059/B1）；未命中 → 基础 inspect
    return makeSemantics(classAdjust === "modify" ? "modify" : "inspect", {
      reason: "system time",
      intents: fileIntents,
      opaque,
    });
  },
};
