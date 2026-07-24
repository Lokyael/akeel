// script interpreter commands -- python, python3, node, ruby, perl

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface InterpRule {
  cls: "readOnly" | "mutating";
  pattern: (firstArg: string) => boolean;
  reason: string;
}

function buildInterpRules(cmd: string): InterpRule[] {
  return [
    { cls: "readOnly", pattern: (s) => /^(--version|-V|-v|--help)$/.test(s), reason: cmd + " version/help" },
    { cls: "mutating", pattern: () => true, reason: cmd + " execute script" },
  ];
}

const INTERP_RULES: Record<string, InterpRule[]> = {
  python: buildInterpRules("python"),
  python3: buildInterpRules("python3"),
  node: buildInterpRules("node"),
  ruby: buildInterpRules("ruby"),
  perl: buildInterpRules("perl"),
};

export const interpreterAdapter: CommandAdapter = {
  names: Object.keys(INTERP_RULES),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const rules = INTERP_RULES[name];
    if (!rules) return makeSemantics("unclassified", { reason: "unknown interpreter: " + name, opaque: true });

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

    return makeSemantics("mutating", { reason: name + ": execute script" });
  },
};
