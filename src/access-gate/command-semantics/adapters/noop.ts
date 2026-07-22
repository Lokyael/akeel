// POSIX 无副作用内置命令 — true, false, : (noop), echo, printf

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

const NAMES = ["true", "false", ":", "echo", "printf"];

export const noopAdapter: CommandAdapter = {
  names: NAMES,
  analyze(_node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    return makeSemantics("readOnly", {
      reason: "posix noop/builtin",
    });
  },
};
