// script interpreter commands -- python, python3, node, ruby, perl

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";
import { LANGUAGE_RUNTIMES } from "../interpreters";

interface InterpRule {
  cls: "inspect" | "execute";
  pattern: (firstArg: string) => boolean;
  reason: string;
}

function buildInterpRules(cmd: string): InterpRule[] {
  return [
    { cls: "inspect", pattern: (s) => /^(--version|-V|-v|--help)$/.test(s), reason: cmd + " version/help" },
    { cls: "execute", pattern: () => true, reason: cmd + " execute script" },
  ];
}

// 注册名单与共享解释器列表同源（LANGUAGE_RUNTIMES，T-046 R3）：
// 新增语言运行时只需改 interpreters.ts，adapter 注册与 preflight 硬规则自动对齐。
const INTERP_RULES: Record<string, InterpRule[]> = Object.fromEntries(
  LANGUAGE_RUNTIMES.map((runtime) => [runtime, buildInterpRules(runtime)]),
);

export const interpreterAdapter: CommandAdapter = {
  names: Object.keys(INTERP_RULES),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const rules = INTERP_RULES[name];
    if (!rules) return makeSemantics("unknown", { reason: "unknown interpreter: " + name, opaque: true });

    const args = [...node.args];
    const subcmd = args.find((a) => {
      const v = a.value ?? "";
      return !v.startsWith("-") && v !== "--";
    })?.value ?? "";
    const firstArg = !subcmd && args.length > 0 ? args[0]!.value ?? "" : subcmd;

    for (const def of rules) {
      if (def.pattern(firstArg)) {
        return makeSemantics(def.cls, { reason: def.reason });
      }
    }

    return makeSemantics("execute", { reason: name + ": execute script" });
  },
};
