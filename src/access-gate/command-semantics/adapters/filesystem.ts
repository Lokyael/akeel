// 文件系统命令语义 — cp, mv, rm, touch, mkdir, chmod, chown, tee, dd, truncate

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent, SemanticContext } from "../types";
import { makeSemantics, extractPositionalArgs } from "./shared";

// cp/mv/ln 共享路径语义：位置参数是源（cp/ln read、mv write），目标目录来自 -t/--target-directory 值或末尾位置参数
function copyLikePaths(args: readonly ShellArg[], consumed: ReadonlyArray<{ option: string; value: string }>, srcOp: "read" | "write"): { op: "read" | "write"; value: string }[] {
  const targetDir = consumed.find((c) => c.option === "-t" || c.option === "--target-directory")?.value;
  if (targetDir) {
    return [...args.map((a) => ({ op: srcOp, value: a.value ?? "" })), { op: "write", value: targetDir }];
  }
  if (args.length < 2) return [];
  const last = args[args.length - 1]!;
  return [
    ...args.slice(0, -1).map((a) => ({ op: srcOp, value: a.value ?? "" })),
    { op: "write", value: last.value ?? "" },
  ];
}

const FILESYSTEM_CMDS: Record<string, {
  class: "inspect" | "modify" | "destroy";
  paths: (args: readonly ShellArg[], consumed: ReadonlyArray<{ option: string; value: string }>, flags?: readonly string[]) => { op: "read" | "write"; value: string }[];
  effects: readonly Effect[];
  reason: string;
  /** 取值选项：值被消费，不是路径（如 truncate -s SIZE、install -m MODE）。 */
  valueOptions?: readonly string[];
  /** 长选项附加值前缀（--size= 形式）。 */
  attachedOptions?: readonly string[];
}> = {
  rm: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["delete"],
    reason: "remove files",
  },
  touch: {
    class: "modify",
    // touch [-t STAMP] [-r REF] <file>... — 时间戳/日期被消费；-r/--reference 的参考文件是 read 源
    paths: (args, consumed) => {
      const ref = consumed.find((c) => c.option === "-r" || c.option === "--reference")?.value;
      const writes = args.map((a) => ({ op: "write" as const, value: a.value ?? "" }));
      return ref ? [{ op: "read" as const, value: ref }, ...writes] : writes;
    },
    effects: ["write"],
    reason: "create/update files",
    valueOptions: ["-t", "-d", "--date", "-r", "--reference"],
    attachedOptions: ["--date=", "--reference="],
  },
  mkdir: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["write"],
    reason: "create directories",
    valueOptions: ["-m", "--mode"],
    attachedOptions: ["--mode="],
  },
  chmod: {
    class: "modify",
    // chmod <mode> <file>... — skip first positional arg (mode)；--reference= 出现时无 mode 位置参数，参考文件是 read 源
    paths: (args, consumed) => {
      const hasReference = consumed.some((c) => c.option === "--reference");
      const ref = consumed.find((c) => c.option === "--reference")?.value;
      const files = args.slice(hasReference ? 0 : 1).map((a) => ({ op: "write" as const, value: a.value ?? "" }));
      return ref ? [{ op: "read" as const, value: ref }, ...files] : files;
    },
    effects: ["permissionChange"],
    reason: "change file permissions",
    attachedOptions: ["--reference="],
  },
  chown: {
    class: "modify",
    // chown <owner> <file>... — skip first positional arg (owner)；--reference= 出现时无 owner 位置参数，参考文件是 read 源
    paths: (args, consumed) => {
      const hasReference = consumed.some((c) => c.option === "--reference");
      const ref = consumed.find((c) => c.option === "--reference")?.value;
      const files = args.slice(hasReference ? 0 : 1).map((a) => ({ op: "write" as const, value: a.value ?? "" }));
      return ref ? [{ op: "read" as const, value: ref }, ...files] : files;
    },
    effects: ["permissionChange"],
    reason: "change file ownership",
    attachedOptions: ["--reference="],
  },
  cp: {
    class: "modify",
    // cp <src>... <dst>；-t/--target-directory 时目标目录来自选项值，位置参数全是 src
    paths: (args, consumed) => copyLikePaths(args, consumed, "read"),
    effects: ["read", "write"],
    reason: "copy files",
    valueOptions: ["-t", "--target-directory"],
    attachedOptions: ["--target-directory="],
  },
  ln: {
    class: "modify",
    // ln [-s] <target> <link>；-t/--target-directory 时位置参数全是 target，链接目录来自选项值
    paths: (args, consumed) => copyLikePaths(args, consumed, "read"),
    effects: ["read", "write"],
    reason: "create links",
    valueOptions: ["-t", "--target-directory"],
    attachedOptions: ["--target-directory="],
  },
  rmdir: {
    class: "modify",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["delete"],
    reason: "remove empty directories",
  },
  mv: {
    class: "modify",
    // mv <src>... <dst>；-t/--target-directory 时目标目录来自选项值，位置参数全是 src
    paths: (args, consumed) => copyLikePaths(args, consumed, "write"),
    effects: ["write", "delete"],
    reason: "move/rename files",
    valueOptions: ["-t", "--target-directory"],
    attachedOptions: ["--target-directory="],
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
    valueOptions: ["-s", "--size"],
    attachedOptions: ["--size="],
  },
  install: {
    class: "modify",
    // install [opts] <src>... <dst> — 同 cp 的 src read + dst write；
    // -t/--target-directory 时位置参数全是 src，目标目录来自选项值（F3，与 cp/mv/ln 对齐）；
    // -d/--directory（mkdir 模式）时位置参数全是目录创建目标（R1）
    paths: (args, consumed, flags) => {
      if (flags?.includes("-d") || flags?.includes("--directory")) {
        return args.map((a) => ({ op: "write" as const, value: a.value ?? "" }));
      }
      return copyLikePaths(args, consumed, "read");
    },
    effects: ["read", "write"],
    reason: "install files",
    valueOptions: ["-m", "--mode", "-o", "--owner", "-g", "--group", "-t", "--target-directory"],
    attachedOptions: ["--mode=", "--owner=", "--group=", "--target-directory="],
  },
  mktemp: {
    class: "modify",
    // 目标路径由工具动态生成，无法静态提取 → 依赖编译器 cwd 保守写 fallback
    paths: () => [],
    effects: ["write"],
    reason: "create temporary files",
  },
  dd: {
    class: "modify",
    // if=/of= 形式参数难以静态解析 → 依赖编译器 cwd 保守写 fallback
    paths: () => [],
    effects: ["read", "write"],
    reason: "convert/copy data",
  },
  shred: {
    class: "destroy",
    paths: (args) => args.map((a) => ({ op: "write", value: a.value ?? "" })),
    effects: ["delete"],
    reason: "securely delete files",
    valueOptions: ["-n", "--iterations"],
    attachedOptions: ["--iterations="],
  },
};

export const filesystemAdapter: CommandAdapter = {
  names: Object.keys(FILESYSTEM_CMDS),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const def = FILESYSTEM_CMDS[name];
    if (!def) return makeSemantics("unknown", { reason: `unknown filesystem command: ${name}`, opaque: true });

    // 提取位置参数与消费的选项值：跳过选项与选项值（-s SIZE、--size= 等），-- 后全部按位置参数
    const { positional, consumed, flags } = extractPositionalArgs(node.args, def.valueOptions ?? [], def.attachedOptions ?? []);

    const rawPaths = def.paths(positional, consumed, flags);
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
