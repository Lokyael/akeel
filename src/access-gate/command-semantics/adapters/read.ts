// Read-only file commands — cat, head, tail, wc, cut

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

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
};

function isAttachedValue(value: string, options: readonly string[]): boolean {
  return options.some((option) => value.startsWith(option) && value.length > option.length);
}

function fileArgs(args: readonly ShellArg[], config: ReadConfig): ShellArg[] {
  const files: ShellArg[] = [];
  let parseOptions = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const value = arg.value ?? "";

    if (parseOptions && value === "--") {
      parseOptions = false;
      continue;
    }
    if (parseOptions && value.startsWith("-")) {
      if (config.valueOptions.includes(value)) i++;
      else if (!isAttachedValue(value, config.attachedOptions)) continue;
      continue;
    }
    if (value !== "-") files.push(arg);
  }

  return files;
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
