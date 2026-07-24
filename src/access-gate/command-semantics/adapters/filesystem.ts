// 文件系统命令语义 — cp, mv, rm, touch, mkdir, chmod, chown, tee, dd, truncate

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

const FILESYSTEM_CMDS: Record<string, {
  class: "inspect" | "modify" | "destroy";
  paths: (args: ShellArg[]) => { op: "read" | "write"; value: string }[];
  effects: readonly Effect[];
  reason: string;
}> = {
  rm: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["delete"],
    reason: "remove files",
  },
  touch: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["write"],
    reason: "create/update files",
  },
  mkdir: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["write"],
    reason: "create directories",
  },
  chmod: {
    class: "modify",
    // chmod <mode> <file>... — skip first positional arg (mode)
    paths: (args) => args.slice(1).map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["permissionChange"],
    reason: "change file permissions",
  },
  chown: {
    class: "modify",
    // chown <owner> <file>... — skip first positional arg (owner)
    paths: (args) => args.slice(1).map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["permissionChange"],
    reason: "change file ownership",
  },
  cp: {
    class: "modify",
    // cp <src>... <dst>
    paths: (args) => {
      if (args.length < 2) return [];
      const last = args[args.length - 1]!;
      return [
        ...args.slice(0, -1).map((a) => ({ op: "read" as const, value: a.value ?? "" })),
        { op: "write" as const, value: last.value ?? "" },
      ];
    },
    effects: ["read", "write"],
    reason: "copy files",
  },
  mv: {
    class: "modify",
    // mv <src>... <dst>
    paths: (args) => {
      if (args.length < 2) return [];
      const last = args[args.length - 1]!;
      return [
        ...args.slice(0, -1).map((a) => ({ op: "write" as const, value: a.value ?? "" })),
        { op: "write" as const, value: last.value ?? "" },
      ];
    },
    effects: ["write", "delete"],
    reason: "move/rename files",
  },
  tee: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["write"],
    reason: "write to files",
  },
  truncate: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["write"],
    reason: "truncate files",
  },
};

export const filesystemAdapter: CommandAdapter = {
  names: Object.keys(FILESYSTEM_CMDS),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const def = FILESYSTEM_CMDS[name];
    if (!def) return makeSemantics("unknown", { reason: `unknown filesystem command: ${name}`, opaque: true });

    // 跳过命令行选项（以 - 开头）
    const positionalArgs = [...node.args].filter((a) => a.value && !a.value.startsWith("-"));

    const rawPaths = def.paths(positionalArgs);
    const intents: PathIntent[] = rawPaths
      .filter((p) => p.value.length > 0)
      .map((p) => ({
        operation: p.op,
        rawPath: p.value,
        source: "argument" as const,
        span: { start: 0, end: 0 },
        confidence: "exact" as const,
      }));

    return makeSemantics(def.class, {
      reason: def.reason,
      effects: def.effects,
      intents,
    });
  },
};
