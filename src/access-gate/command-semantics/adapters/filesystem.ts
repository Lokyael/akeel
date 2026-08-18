// 文件系统命令语义 — cp, mv, rm, touch, mkdir, chmod, chown, tee, dd, truncate, install, mktemp, shred
//
// B 候选：选项遍历由统一引擎 option-parse 承担（Opt 声明），本文件保留路径语义
// （copyLikePaths、模式/属主跳过、参考文件、-d mkdir 模式）。opaqueOnUnknown: true
// （B4 收紧）；高频 flag（cp -r、rm -rf、mkdir -p 等）已建模避免日常过拒。

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, Effect, PathIntent } from "../types";
import { makeSemantics } from "../semantics";
import { SYNTHETIC_SPAN } from "../intent";
import { parseOptions, type Opt } from "./option-parse";

// cp/mv/ln/install 共享路径语义：位置参数是源（cp/ln/install read、mv write），
// 目标目录来自 -t/--target-directory 值或末尾位置参数
function copyLikePaths(args: readonly ShellArg[], consumed: ReadonlyArray<{ option: string; value: string }>, srcOp: "read" | "write"): { op: "read" | "write"; value: string }[] {
  const targetDir = consumed.find((c) => c.option === "-t" || c.option === "--target-directory")?.value;
  if (targetDir) {
    return [...args.map((a) => ({ op: srcOp, value: a.value })), { op: "write", value: targetDir }];
  }
  if (args.length < 2) return [];
  const last = args[args.length - 1]!;
  return [
    ...args.slice(0, -1).map((a) => ({ op: srcOp, value: a.value })),
    { op: "write", value: last.value },
  ];
}

/** -t/--target-directory：目标是目录（write）。 */
const TARGET_DIR_OPTS: Opt[] = [{ names: ["-t", "--target-directory"], kind: "file", operation: "write", forms: ["separated", "equals"] }];
/** --reference：参考文件（read）。 */
const REFERENCE_OPTS: Opt[] = [{ names: ["--reference"], kind: "file", operation: "read", forms: ["separated", "equals"] }];

/**
 * 参考文件感知的写目标提取（chmod/chown/touch/truncate 共用）：
 * 参考文件值（--reference/-r）→ 前置 read intent；其余位置参数 → write intent。
 * skipFirstPositional 时（chmod/chown）首个位置参数是 mode/owner——参考文件出现时该参数不存在，不跳过。
 */
function referenceAwareFiles(
  args: readonly ShellArg[],
  consumed: ReadonlyArray<{ option: string; value: string }>,
  refOptions: readonly string[],
  skipFirstPositional: boolean,
): { op: "read" | "write"; value: string }[] {
  const ref = consumed.find((c) => refOptions.includes(c.option))?.value;
  const writes = args.slice(skipFirstPositional && !ref ? 1 : 0).map((a) => ({ op: "write" as const, value: a.value }));
  return ref ? [{ op: "read" as const, value: ref }, ...writes] : writes;
}

/** 位置参数全为写目标（rm/mkdir/tee/rmdir/shred 共用）：无选项值、无参考文件语义的命令族。 */
function writeAllArgs(args: readonly ShellArg[]): { op: "write"; value: string }[] {
  return args.map((a) => ({ op: "write" as const, value: a.value }));
}

const FILESYSTEM_CMDS: Record<string, {
  class: "inspect" | "modify" | "destroy";
  paths: (args: readonly ShellArg[], consumed: ReadonlyArray<{ option: string; value: string }>, flags?: readonly string[]) => { op: "read" | "write"; value: string }[];
  effects: readonly Effect[];
  reason: string;
  opts: readonly Opt[];
}> = {
  rm: {
    class: "modify",
    paths: writeAllArgs,
    effects: ["delete"],
    reason: "remove files",
    opts: [{ names: ["-r", "-R", "-f", "-i", "-v", "-d", "--dir", "--no-preserve-root", "-I", "-P", "-x", "--one-file-system"], kind: "flag" }],
  },
  touch: {
    class: "modify",
    // touch [-t STAMP] [-r REF] <file>... — 时间戳/日期被消费；-r/--reference 的参考文件是 read 源
    paths: (args, consumed) => referenceAwareFiles(args, consumed, ["-r", "--reference"], false),
    effects: ["write"],
    reason: "create/update files",
    opts: [
      { names: ["-r", "--reference"], kind: "file", operation: "read", forms: ["separated", "equals"] },
      { names: ["-t", "-d", "--date"], kind: "expression", forms: ["separated", "equals"] },
      { names: ["-a", "-c", "-m", "-h"], kind: "flag" },
    ],
  },
  mkdir: {
    class: "modify",
    paths: writeAllArgs,
    effects: ["write"],
    reason: "create directories",
    opts: [
      { names: ["-m", "--mode"], kind: "expression", forms: ["separated", "equals"] },
      { names: ["-p", "-v"], kind: "flag" },
    ],
  },
  chmod: {
    class: "modify",
    // chmod <mode> <file>... — skip first positional arg (mode)；--reference= 出现时无 mode 位置参数，参考文件是 read 源
    paths: (args, consumed) => referenceAwareFiles(args, consumed, ["--reference"], true),
    effects: ["permissionChange"],
    reason: "change file permissions",
    opts: [
      ...REFERENCE_OPTS,
      { names: ["-R", "-v", "-c", "-f"], kind: "flag" },
    ],
  },
  chown: {
    class: "modify",
    // chown <owner> <file>... — skip first positional arg (owner)；--reference= 出现时无 owner 位置参数，参考文件是 read 源
    paths: (args, consumed) => referenceAwareFiles(args, consumed, ["--reference"], true),
    effects: ["permissionChange"],
    reason: "change file ownership",
    opts: [
      ...REFERENCE_OPTS,
      { names: ["-R", "-v", "-c", "-f", "-h"], kind: "flag" },
    ],
  },
  cp: {
    class: "modify",
    // cp <src>... <dst>；-t/--target-directory 时目标目录来自选项值，位置参数全是 src
    paths: (args, consumed) => copyLikePaths(args, consumed, "read"),
    effects: ["read", "write"],
    reason: "copy files",
    opts: [
      ...TARGET_DIR_OPTS,
      { names: ["-r", "-R", "-a", "-p", "-u", "-v", "-n", "-f", "-l", "-s", "-L", "-P", "-d", "-H"], kind: "flag" },
    ],
  },
  ln: {
    class: "modify",
    // ln [-s] <target> <link>；-t/--target-directory 时位置参数全是 target，链接目录来自选项值
    paths: (args, consumed) => copyLikePaths(args, consumed, "read"),
    effects: ["read", "write"],
    reason: "create links",
    opts: [
      ...TARGET_DIR_OPTS,
      { names: ["-s", "-f", "-n", "-v", "-r", "-i", "-L", "-P"], kind: "flag" },
    ],
  },
  rmdir: {
    class: "modify",
    paths: writeAllArgs,
    effects: ["delete"],
    reason: "remove empty directories",
    opts: [{ names: ["-p", "-v"], kind: "flag" }],
  },
  mv: {
    class: "modify",
    // mv <src>... <dst>；-t/--target-directory 时目标目录来自选项值，位置参数全是 src
    paths: (args, consumed) => copyLikePaths(args, consumed, "write"),
    effects: ["write", "delete"],
    reason: "move/rename files",
    opts: [
      ...TARGET_DIR_OPTS,
      { names: ["-i", "-n", "-f", "-u", "-v"], kind: "flag" },
    ],
  },
  tee: {
    class: "modify",
    paths: writeAllArgs,
    effects: ["write"],
    reason: "write to files",
    opts: [{ names: ["-a", "-i"], kind: "flag" }],
  },
  truncate: {
    class: "modify",
    // truncate [-s SIZE] [--reference=RFILE] <file>... — 参考文件是 read 源（与 chmod/chown/touch 一致）
    paths: (args, consumed) => referenceAwareFiles(args, consumed, ["--reference"], false),
    effects: ["write"],
    reason: "truncate files",
    opts: [
      { names: ["-s", "--size"], kind: "expression", forms: ["separated", "equals"] },
      { names: ["--reference"], kind: "file", operation: "read", forms: ["separated", "equals"] },
      { names: ["-c"], kind: "flag" },
    ],
  },
  install: {
    class: "modify",
    // install [opts] <src>... <dst> — 同 cp 的 src read + dst write；
    // -t/--target-directory 时位置参数全是 src，目标目录来自选项值（与 cp/mv/ln 对齐）；
    // -d/--directory（mkdir 模式）时位置参数全是目录创建目标
    paths: (args, consumed, flags) => {
      if (flags?.includes("-d") || flags?.includes("--directory")) {
        return args.map((a) => ({ op: "write" as const, value: a.value }));
      }
      return copyLikePaths(args, consumed, "read");
    },
    effects: ["read", "write"],
    reason: "install files",
    opts: [
      { names: ["-m", "--mode", "-o", "--owner", "-g", "--group"], kind: "expression", forms: ["separated", "equals"] },
      ...TARGET_DIR_OPTS,
      { names: ["-d", "--directory", "-v", "-C", "-S"], kind: "flag" },
    ],
  },
  mktemp: {
    class: "modify",
    // 目标路径由工具动态生成，无法静态提取 → 依赖编译器 cwd 保守写 fallback
    paths: () => [],
    effects: ["write"],
    reason: "create temporary files",
    opts: [
      { names: ["-p", "--tmpdir"], kind: "expression", forms: ["separated", "equals"] },
      { names: ["-d", "-u", "-q", "-t"], kind: "flag" },
    ],
  },
  dd: {
    class: "modify",
    // if=/of= 是 key=value 形式参数（不以 - 开头，被引擎当位置参数）——提取读写目标；
    // 其余（bs/count/skip/seek 等）非路径，忽略
    paths: (args) => {
      const out: { op: "read" | "write"; value: string }[] = [];
      for (const a of args) {
        const v = a.value;
        if (v.startsWith("of=")) out.push({ op: "write", value: v.slice(3) });
        else if (v.startsWith("if=")) out.push({ op: "read", value: v.slice(3) });
      }
      return out;
    },
    effects: ["read", "write"],
    reason: "convert/copy data",
    opts: [],
  },
  shred: {
    class: "destroy",
    paths: writeAllArgs,
    effects: ["delete"],
    reason: "securely delete files",
    opts: [
      { names: ["-n", "--iterations", "-s", "--size"], kind: "expression", forms: ["separated", "equals"] },
      { names: ["-u", "-z", "-v", "-f"], kind: "flag" },
    ],
  },
};

export const filesystemAdapter: CommandAdapter = {
  names: Object.keys(FILESYSTEM_CMDS),
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const def = FILESYSTEM_CMDS[name];
    if (!def) return makeSemantics("unknown", { reason: `unknown filesystem command: ${name}`, opaque: true });

    // 引擎遍历：positional + consumed（含 -t 目标目录、--reference 参考文件）+ flags（-d 等）+ opaque
    // 收紧：未知选项 → opaque（B4；高频 flag 已建模避免日常过拒）
    const { positional, consumed, flags, opaque } = parseOptions(node.args, { opts: def.opts, positional: "file", opaqueOnUnknown: true });

    const rawPaths = def.paths(positional, consumed, flags);
    const intents: PathIntent[] = rawPaths
      .filter((p) => p.value.length > 0)
      .map((p) => ({
        operation: p.op,
        rawPath: p.value,
        source: "argument" as const,
        span: SYNTHETIC_SPAN,
        confidence: "exact" as const,
      }));

    return makeSemantics(def.class, {
      reason: def.reason,
      effects: def.effects,
      intents,
      opaque,
    });
  },
};
