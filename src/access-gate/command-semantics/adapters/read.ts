// Read-only file commands — cat, head, tail, wc, cut, diff, less, more, file, stat, du, df

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics, extractPositionalArgs } from "./shared";

interface ReadConfig {
  valueOptions: readonly string[];
  attachedOptions: readonly string[];
}

const READ_CONFIG: Record<string, ReadConfig> = {
  cat: {
    valueOptions: [],
    attachedOptions: [],
  },
  head: {
    valueOptions: ["-n", "--lines", "-c", "--bytes"],
    attachedOptions: ["-n", "--lines=", "-c", "--bytes="],
  },
  tail: {
    valueOptions: ["-n", "--lines", "-c", "--bytes"],
    attachedOptions: ["-n", "--lines=", "-c", "--bytes="],
  },
  wc: {
    valueOptions: [],
    attachedOptions: [],
  },
  cut: {
    valueOptions: ["-b", "--bytes", "-c", "--characters", "-d", "--delimiter", "-f", "--fields"],
    attachedOptions: ["-b", "--bytes=", "-c", "--characters=", "-d", "--delimiter=", "-f", "--fields="],
  },
  diff: {
    valueOptions: [],
    attachedOptions: [],
  },
  less: {
    valueOptions: [],
    attachedOptions: [],
  },
  more: {
    valueOptions: [],
    attachedOptions: [],
  },
  file: {
    valueOptions: [],
    attachedOptions: [],
  },
  stat: {
    valueOptions: ["-c", "--format"],
    attachedOptions: ["-c", "--format="],
  },
  du: {
    valueOptions: ["-d", "--max-depth", "-t", "--threshold", "--exclude"],
    attachedOptions: ["-d", "--max-depth=", "-t", "--threshold=", "--exclude="],
  },
  df: {
    valueOptions: ["-t", "--type"],
    attachedOptions: ["-t=", "--type="],
  },
};

function fileArgs(args: readonly ShellArg[], config: ReadConfig): ShellArg[] {
  const { positional } = extractPositionalArgs(args, config.valueOptions, config.attachedOptions);
  // "-" 是 stdin，不算文件
  return positional.filter((arg) => (arg.value ?? "") !== "-");
}

function readIntents(args: readonly ShellArg[], config: ReadConfig): PathIntent[] {
  return fileArgs(args, config).map((arg) => ({
    operation: "read" as const,
    rawPath: arg.value ?? "",
    source: "argument" as const,
    span: arg.span,
    confidence: "exact" as const,
  }));
}

export const readAdapter: CommandAdapter = {
  names: Object.keys(READ_CONFIG),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = READ_CONFIG[name];
    if (!config) return makeSemantics("unknown", { reason: `unknown read command: ${name}`, opaque: true });

    return makeSemantics("inspect", {
      reason: `${name} file read`,
      intents: readIntents(node.args, config),
    });
  },
};
