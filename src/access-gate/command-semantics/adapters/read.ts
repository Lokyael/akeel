// Read-only file commands — cat, head, tail, wc, cut, diff, less, more, file, stat, du, df, od

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
  // od —— POSIX 只读检查（T-040）：-A/-j/-N/-t 为必选值选项；GNU 可选值选项
  // (-w/-S/-s) 不建模：不建模=按 flag 跳过，位置参数仍正确提取，避免分离值误吞文件路径。
  od: {
    valueOptions: ["-A", "-j", "-N", "-t"],
    attachedOptions: ["-A", "-j", "-N", "-t", "--address-radix=", "--skip-bytes=", "--read-bytes=", "--format=", "--width=", "--strings="],
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
