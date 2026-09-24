import type { ShellPath } from "../invocation";
import type { ShellWord } from "../language";
import { parseSegment, type OptionSpec, type SegmentContract } from "./segment-parser";
import type { ProgramCwdChange, ProgramPath, ProgramPathBase, ProgramSemantic } from "./types";

// --- Global Options Contract ---

type GitGlobalKey = "cwd" | "gitDir" | "workTree" | "config" | "flag";

const GIT_GLOBAL_OPTIONS: readonly OptionSpec<GitGlobalKey>[] = Object.freeze([
  { key: "cwd" as const, names: ["-C"], arity: "required" as const, forms: ["separate" as const, "attached" as const] },
  { key: "config" as const, names: ["-c"], arity: "required" as const, forms: ["separate" as const, "attached" as const] },
  { key: "gitDir" as const, names: ["--git-dir"], arity: "required" as const, forms: ["separate" as const, "equals" as const] },
  { key: "workTree" as const, names: ["--work-tree"], arity: "required" as const, forms: ["separate" as const, "equals" as const] },
  { key: "flag" as const, names: ["--no-pager", "--paginate", "--literal-pathspecs", "--no-optional-locks"], arity: "flag" as const },
]);

const GIT_GLOBAL_CONTRACT: SegmentContract<GitGlobalKey> = Object.freeze({
  options: GIT_GLOBAL_OPTIONS,
});

// --- Subcommand Option Contracts ---

type GitSubcommandKey =
  | "flag"
  | "scalar"
  | "path"
  | "output"
  | "file"
  | "message"
  | "source"
  | "branch"
  | "remote"
  | "numericLimit";

// Mutating / Creation Value Options
const MUTATING_VALUE_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  { key: "message", names: ["-m", "-F", "--message", "--file"], arity: "required" },
  { key: "branch", names: ["-b", "--branch"], arity: "required" },
  { key: "path", names: ["--template", "--reference", "--reference-if-able", "--separate-git-dir"], arity: "required" },
];

// Shared Value Options across inspect and common subcommands
const SHARED_VALUE_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  { key: "output", names: ["--output", "-o", "--output-directory"], arity: "required" },
  {
    key: "scalar",
    names: [
      "--depth",
      "--shallow-since",
      "--shallow-exclude",
      "--origin",
      "--upload-pack",
      "--config",
      "--server-option",
      "--jobs",
      "-j",
      "--filter",
      "--negotiation-tip",
    ],
    arity: "required",
  },
];

// Common Flag Options
const COMMON_FLAG_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  {
    key: "flag",
    names: [
      "-A", "-a", "-n", "-q", "-v", "-U", "--stat", "--oneline", "--cached", "--staged",
      "--porcelain", "--short", "--branch", "--show-current", "--name-only", "--name-status", "--dry-run",
      "--hard", "-d", "-D", "-f", "--force", "--delete", "--global", "--local", "--system",
      "--list", "-l", "--get", "--unset", "--add",
      "--local", "--no-hardlinks", "--shared", "--no-tags", "--tags", "--single-branch", "--no-single-branch",
      "--recurse-submodules", "--recursive", "--shallow-submodules", "--no-shallow-submodules", "--dissociate",
      "--no-checkout", "--bare", "--mirror", "--progress", "--no-progress", "--quiet", "--verbose",
      "--ipv4", "--ipv6", "--also-filter-submodules",
    ],
    arity: "flag",
  },
];

// Inspect Option Additions (T-0124)
const INSPECT_VALUE_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  {
    key: "scalar",
    names: [
      "-S", "-G", "--grep", "--author", "--committer",
      "--since", "--after", "--until", "--before",
      "--format", "--pretty", "-L", "--max-count", "--diff-filter",
    ],
    arity: "required",
  },
];

const INSPECT_FLAG_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  {
    key: "flag",
    names: [
      "-b",
      "--graph", "--follow", "--topo-order", "--date-order", "--author-date-order",
      "--reverse", "--no-merges", "--merges", "--first-parent",
      "-p", "--patch", "-s", "--no-patch", "--numstat", "--shortstat", "--summary",
      "--relative", "--abbrev-commit", "--no-abbrev-commit",
    ],
    arity: "flag",
  },
  {
    key: "flag",
    names: ["-u", "--untracked-files"],
    arity: "optional-attached",
  },
];

const GIT_LOG_INSPECT_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  { key: "flag", names: ["--decorate"], arity: "flag" },
];

const GIT_DIFF_INSPECT_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  { key: "flag", names: ["--check"], arity: "flag" },
  { key: "flag", names: ["--find-renames", "--find-copies"], arity: "optional-attached" },
];

const GIT_REV_PARSE_INSPECT_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = [
  {
    key: "flag",
    names: ["--show-toplevel", "--abbrev-ref", "--symbolic-full-name"],
    arity: "flag",
  },
];

const GIT_STATUS_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = Object.freeze([
  {
    key: "flag",
    names: [
      "-s", "--short",
      "-b", "--branch",
      "-v", "--verbose",
      "-z",
      "--show-stash",
      "--ahead-behind", "--no-ahead-behind",
      "--renames", "--no-renames",
      "--long",
    ],
    arity: "flag",
  },
  {
    key: "flag",
    names: ["-u", "--untracked-files", "--ignored", "--porcelain", "--find-renames"],
    arity: "optional-attached",
  },
  {
    key: "scalar",
    names: ["--ignore-submodules"],
    arity: "optional-attached",
  },
  ...COMMON_FLAG_OPTIONS,
]);

const GIT_STATUS_CONTRACT: SegmentContract<GitSubcommandKey> = Object.freeze({
  options: GIT_STATUS_OPTIONS,
});

const GIT_INSPECT_CONTRACT: SegmentContract<GitSubcommandKey> = Object.freeze({
  options: Object.freeze([
    ...SHARED_VALUE_OPTIONS,
    ...COMMON_FLAG_OPTIONS,
    ...INSPECT_VALUE_OPTIONS,
    ...INSPECT_FLAG_OPTIONS,
  ]),
  matchExtraOption: (token: ShellWord) => {
    if (/^-[1-9][0-9]*$/u.test(token.text)) {
      return { key: "numericLimit" as const, name: token.text };
    }
    return undefined;
  },
});

function gitInspectContract(extraOptions: readonly OptionSpec<GitSubcommandKey>[]): SegmentContract<GitSubcommandKey> {
  return Object.freeze({
    ...GIT_INSPECT_CONTRACT,
    options: Object.freeze([...GIT_INSPECT_CONTRACT.options, ...extraOptions]),
  });
}

const GIT_LOG_CONTRACT = gitInspectContract(GIT_LOG_INSPECT_OPTIONS);
const GIT_DIFF_CONTRACT = gitInspectContract(GIT_DIFF_INSPECT_OPTIONS);
const GIT_REV_PARSE_CONTRACT = gitInspectContract(GIT_REV_PARSE_INSPECT_OPTIONS);

const GIT_RESTORE_OPTIONS: readonly OptionSpec<GitSubcommandKey>[] = Object.freeze([
  { key: "source" as const, names: ["--source", "-s"], arity: "required" as const },
  {
    key: "flag" as const,
    names: ["--worktree", "-W", "--staged", "-S", "-q", "--quiet", "--progress", "--no-progress", "--ignore-unmerged", "--ignore-skip-worktree-bits"],
    arity: "flag" as const,
  },
]);

const GIT_RESTORE_CONTRACT: SegmentContract<GitSubcommandKey> = Object.freeze({
  options: GIT_RESTORE_OPTIONS,
});

const GIT_COMMON_CONTRACT: SegmentContract<GitSubcommandKey> = Object.freeze({
  options: Object.freeze([
    ...MUTATING_VALUE_OPTIONS,
    ...SHARED_VALUE_OPTIONS,
    ...COMMON_FLAG_OPTIONS,
  ]),
});

// --- Constants ---

const GIT_INSPECT = new Set([
  "status", "diff", "log", "rev-list", "rev-parse", "show", "grep", "blame", "ls-files", "ls-tree", "ls-remote",
  "fsck", "describe", "check-attr", "check-ignore", "help",
]);

const GIT_OPAQUE_INSPECT = new Set([
  "status", "diff", "log", "show", "rev-list",
]);

const GIT_MODIFY = new Set([
  "add", "rm", "commit", "push", "checkout", "switch", "restore", "merge", "rebase", "tag", "reset",
  "fetch", "pull", "clone", "init", "remote", "mv", "cherry-pick", "revert", "apply", "gc", "submodule",
  "stash", "format-patch", "archive", "config",
]);

const GIT_HELPER_COMMANDS = new Set([
  "push", "fetch", "pull", "clone", "init", "checkout", "switch", "restore", "merge", "rebase",
  "tag", "reset", "cherry-pick", "revert", "stash", "submodule", "config", "help", "grep",
  "blame", "gc", "apply",
]);

function isFileTransportReference(value: string): boolean {
  return value.slice(0, "file://".length).toLowerCase() === "file://";
}

function localFileTransportPath(value: string): string | undefined {
  if (!isFileTransportReference(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "file:" || (url.hostname !== "" && url.hostname !== "localhost")) return undefined;
    const pathname = decodeURIComponent(url.pathname);
    return pathname.includes("\u0000") ? undefined : pathname;
  } catch {
    return undefined;
  }
}

function pathFromWord(word: ShellWord, role: "source" | "target"): ShellPath {
  const path: { text: string; role: "source" | "target"; pathKind?: "home-relative" | "literal" } = {
    text: localFileTransportPath(word.text) ?? word.text,
    role,
  };
  if (word.pathKind !== undefined) path.pathKind = word.pathKind;
  return Object.freeze(path);
}

function path(
  word: ShellWord,
  role: "source" | "target",
  start = word.start,
  base: ProgramPathBase = "invocation-cwd",
): ProgramPath {
  return Object.freeze({ path: pathFromWord(word, role), start, base });
}

function result(
  commandClass: ProgramSemantic["commandClass"],
  effects: ProgramSemantic["effects"],
  paths: readonly ProgramPath[] = [],
  options: Readonly<{
    cwdChanges?: readonly ProgramCwdChange[];
    recursive?: boolean;
    opaque?: boolean;
    hardBoundary?: boolean;
  }> = {},
): ProgramSemantic {
  return Object.freeze({
    commandClass,
    effects: Object.freeze([...effects]),
    paths: Object.freeze([...paths]),
    cwdChanges: Object.freeze([...(options.cwdChanges ?? [])]),
    recursive: options.recursive ?? false,
    opaque: options.opaque ?? false,
    hardBoundary: options.hardBoundary ?? false,
  });
}

function isRemoteGitReference(value: string): boolean {
  if (isFileTransportReference(value)) return false;
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value) || /^(?:[^/@:]+@)?[^/:]+:/u.test(value);
}

function isGitPathReference(value: string): boolean {
  return value.startsWith("/") || value === "." || value === ".." || value.startsWith("./") || value.startsWith("../") || value.startsWith("~") || isFileTransportReference(value);
}

function isUnsupportedGitPathspec(value: string): boolean {
  return value.startsWith(":") || value.startsWith("!") || value.startsWith("^") || /[*?\[]/u.test(value);
}

export function analyzeGitProgram(args: readonly ShellWord[]): ProgramSemantic {
  // 1. Stage 1: Parse Global Prefix Options
  const globalPaths: ProgramPath[] = [];
  const cwdChanges: ProgramCwdChange[] = [];
  let hasCommandCwd = false;
  let hasUncanonicalizedRepositoryLocation = false;
  let hardBoundary = false;
  let unsafeGlobalOption = false;

  let globalParsed = parseSegment(args, GIT_GLOBAL_CONTRACT, { stopAtFirstOperand: true });

  if (globalParsed.kind === "malformed") {
    return result("unknown", [], [], { opaque: true, hardBoundary: true });
  }

  if (globalParsed.kind === "indeterminate") {
    unsafeGlobalOption = true;
    hardBoundary = true;
  }

  const globalOptions = globalParsed.options;
  const suppressesOptionalLocks = globalOptions.some((option) => option.name === "--no-optional-locks");
  for (const opt of globalOptions) {
    if (opt.kind === "valued") {
      const val = opt.value;
      if (opt.key === "config") {
        hardBoundary = true;
      } else if (opt.key === "cwd") {
        const base: ProgramPathBase = hasCommandCwd ? "command-cwd" : "invocation-cwd";
        globalPaths.push(path(val, "source", opt.token.start, base));
        cwdChanges.push(Object.freeze({ path: pathFromWord(val, "source"), start: opt.token.start, base }));
        hasCommandCwd = true;
      } else if (opt.key === "gitDir" || opt.key === "workTree") {
        globalPaths.push(path(val, "source", opt.token.start, "command-cwd"));
      } else {
        globalPaths.push(path(val, "source", opt.token.start, "command-cwd"));
        hasUncanonicalizedRepositoryLocation = true;
        hardBoundary = true;
      }
    }
  }

  const subcommand = globalParsed.operands[0]?.text;
  if (!subcommand) {
    return result("unknown", [], globalPaths, { cwdChanges, opaque: true, hardBoundary: true });
  }

  if (globalPaths.some((entry) => isFileTransportReference(entry.path.text))) {
    hardBoundary = true;
  }

  const rest = globalParsed.remainder;
  const pathBase: ProgramPathBase = hasCommandCwd ? "command-cwd" : "invocation-cwd";

  const isStatusSubcommand = subcommand === "status";
  const isInspectSubcommand = GIT_INSPECT.has(subcommand);
  const isRestoreSubcommand = subcommand === "restore";
  const isStashInspect = subcommand === "stash" && ["list", "show"].includes(rest[0]?.text ?? "");

  const contract = isStatusSubcommand
    ? GIT_STATUS_CONTRACT
    : subcommand === "log"
      ? GIT_LOG_CONTRACT
      : subcommand === "diff"
        ? GIT_DIFF_CONTRACT
        : subcommand === "rev-parse"
          ? GIT_REV_PARSE_CONTRACT
          : (isInspectSubcommand || isStashInspect)
            ? GIT_INSPECT_CONTRACT
            : isRestoreSubcommand
        ? GIT_RESTORE_CONTRACT
        : GIT_COMMON_CONTRACT;

  // 2. Stage 2: Parse Subcommand Scoped Options & Operands
  const parsedRest = parseSegment(rest, contract);
  const missingOptionValue = parsedRest.kind === "malformed";
  const hasUnknownSubcommandOption = parsedRest.kind === "indeterminate";

  const options = parsedRest.kind === "complete" || parsedRest.kind === "indeterminate" ? parsedRest.options : [];
  const rawOperands = parsedRest.kind === "complete" || parsedRest.kind === "indeterminate" ? parsedRest.operands : [];
  const pathspecOperands = parsedRest.kind === "complete" ? parsedRest.pathspecOperands : [];

  // Security checks across raw tokens
  if (rawOperands.some((word) => isUnsupportedGitPathspec(word.text))) hardBoundary = true;
  if (pathspecOperands.some((word) => isUnsupportedGitPathspec(word.text))) hardBoundary = true;

  if (rest.some((word) => word.text === "--pathspec-from-file" || word.text.startsWith("--pathspec-from-file=") ||
    word.text === "--pathspec-file-nul")) hardBoundary = true;
  if (rest.some((word) => isFileTransportReference(word.text) && localFileTransportPath(word.text) === undefined)) {
    hardBoundary = true;
  }
  const isUploadPackCommand = subcommand === "clone" || subcommand === "fetch" || subcommand === "pull";
  if (isUploadPackCommand && rest.some((word) =>
    word.text === "-u" || word.text.startsWith("-u=") || (word.text.startsWith("-u") && word.text.length > 2)
  )) {
    hardBoundary = true;
  }

  if (rest.some((word) => word.text === "--upload-pack" || word.text.startsWith("--upload-pack=") ||
    word.text === "--receive-pack" || word.text.startsWith("--receive-pack=") ||
    word.text === "--exec" || word.text.startsWith("--exec=") ||
    word.text === "--ext-diff" || word.text.startsWith("--ext-diff=") ||
    word.text === "--textconv" || word.text.startsWith("--textconv="))) {
    hardBoundary = true;
  }

  const known = GIT_INSPECT.has(subcommand) || GIT_MODIFY.has(subcommand) || subcommand === "clean" || subcommand === "branch";
  if (!known) {
    return result("unknown", [], globalPaths, { cwdChanges, opaque: true, hardBoundary: true });
  }

  if (GIT_HELPER_COMMANDS.has(subcommand) && subcommand !== "restore" && subcommand !== "checkout" && !isStashInspect) {
    hardBoundary = true;
  }

  // Subcommand-specific constraints
  if (subcommand === "status") {
    for (const opt of options) {
      if ((opt.name === "-u" || opt.name === "--untracked-files") && opt.kind === "valued") {
        if (!["no", "normal", "all"].includes(opt.value.text)) {
          hardBoundary = true;
        }
      }
      if (opt.name === "--ignored" && opt.kind === "valued") {
        if (!["traditional", "no", "matching"].includes(opt.value.text)) {
          hardBoundary = true;
        }
      }
      if (opt.name === "--porcelain" && opt.kind === "valued") {
        if (!["v1", "v2", "1", "2"].includes(opt.value.text)) {
          hardBoundary = true;
        }
      }
    }
  }

  if (isStashInspect) {
    if (hasUnknownSubcommandOption) hardBoundary = true;
    const action = rawOperands[0]?.text;
    if (action === "list") {
      if (rawOperands.length > 1) hardBoundary = true;
    } else if (action === "show") {
      if (rawOperands.length > 2) hardBoundary = true;
      if (rawOperands.length === 2 && isUnsupportedGitPathspec(rawOperands[1]!.text)) {
        hardBoundary = true;
      }
    }
  }

  // Subcommand-specific constraints
  if (subcommand === "commit") {
    const hasMessage = options.some(
      (opt) => (opt.name === "-m" || opt.name === "--message" || opt.name === "-F" || opt.name === "--file") &&
        opt.kind === "valued" && opt.value.text.length > 0,
    );
    if (!hasMessage || hasUnknownSubcommandOption) hardBoundary = true;
    if (rest.some((word) =>
      word.text === "-e" || word.text === "--edit" ||
      word.text === "-i" || word.text === "--interactive" ||
      word.text === "-p" || word.text === "--patch" ||
      word.text === "-c" || word.text.startsWith("-c=") || (word.text.startsWith("-c") && word.text.length > 2),
    )) {
      hardBoundary = true;
    }
  }

  if (subcommand === "add") {
    if (hasUnknownSubcommandOption || rest.some((word) =>
      word.text === "-i" || word.text === "--interactive" ||
      word.text === "-p" || word.text === "--patch" ||
      word.text === "-e" || word.text === "--edit",
    )) {
      hardBoundary = true;
    }
  }

  if (subcommand === "restore") {
    if (hasUnknownSubcommandOption) hardBoundary = true;
    for (const opt of options) {
      if (opt.key === "source" && opt.kind === "valued") {
        const text = opt.value.text;
        if (!text || !/^HEAD(?:~\d+|\^\d*)?$/u.test(text)) {
          hardBoundary = true;
        }
      }
    }
    const allOperands = [...rawOperands, ...pathspecOperands];
    if (allOperands.length !== 1 || allOperands[0]!.text === "." || isUnsupportedGitPathspec(allOperands[0]!.text)) {
      hardBoundary = true;
    }
  }

  if (subcommand === "checkout") {
    const separatorIndex = rest.findIndex((word) => word.text === "--");
    if (separatorIndex === -1) {
      hardBoundary = true;
    } else {
      const beforeSeparator = rest.slice(0, separatorIndex);
      const afterSeparator = rest.slice(separatorIndex + 1);
      const beforeParsed = parseSegment(beforeSeparator, {
        options: [{ key: "flag", names: ["-q", "--quiet", "--progress", "--no-progress"], arity: "flag" }],
      });
      if (beforeParsed.kind !== "complete") {
        hardBoundary = true;
      }
      const nonOptionBefore = beforeParsed.kind === "complete" ? beforeParsed.operands : [];
      if (nonOptionBefore.length > 1) {
        hardBoundary = true;
      } else if (nonOptionBefore.length === 1 && !/^HEAD(?:~\d+|\^\d*)?$/u.test(nonOptionBefore[0]!.text)) {
        hardBoundary = true;
      }
      const afterOperands = afterSeparator.filter((w) => !w.text.startsWith("-"));
      if (afterOperands.length !== 1 || afterOperands[0]!.text === "." || isUnsupportedGitPathspec(afterOperands[0]!.text)) {
        hardBoundary = true;
      }
    }
  }

  // Determine command class
  let commandClass: ProgramSemantic["commandClass"] = GIT_INSPECT.has(subcommand) ? "inspect" : "modify";
  if (subcommand === "branch" && !options.some((o) => ["-d", "-D", "--delete", "-f", "--force", "-m", "-M", "--move", "--rename", "-c", "-C", "--copy"].includes(o.name))) {
    commandClass = rawOperands.length > 0 ? "modify" : "inspect";
  }
  if (subcommand === "clean") {
    commandClass = options.some((o) => o.name === "-n" || o.name === "--dry-run") ? "inspect" : "destroy";
  }
  if (subcommand === "rm") commandClass = "destroy";
  if (subcommand === "stash" && ["list", "show"].includes(rawOperands[0]?.text ?? "")) commandClass = "inspect";
  if (subcommand === "config" && options.some((o) => ["--list", "-l", "--get", "--get-all", "--get-regexp"].includes(o.name))) {
    commandClass = "inspect";
  }
  if (subcommand === "config" && options.some((o) => o.name === "--global" || o.name === "--system")) {
    hardBoundary = true;
  }
  if (subcommand === "reset" && options.some((o) => o.name === "--hard")) commandClass = "destroy";
  if (subcommand === "push" && options.some((o) => o.name === "-f" || o.name === "--force")) commandClass = "destroy";
  if (subcommand === "branch" && options.some((o) => o.name === "-d" || o.name === "-D" || o.name === "--delete")) commandClass = "destroy";
  if (subcommand === "stash" && rawOperands[0]?.text === "clear") commandClass = "destroy";
  if (subcommand === "remote") hardBoundary = true;
  if (subcommand === "archive" && rest.some((word) => word.text === "--remote" || word.text.startsWith("--remote="))) hardBoundary = true;

  if (subcommand === "ls-remote") {
    const remote = rawOperands[0]?.text;
    if (remote === undefined || (!isRemoteGitReference(remote) && !isGitPathReference(remote))) hardBoundary = true;
    if (remote !== undefined && isRemoteGitReference(remote)) hardBoundary = true;
  }

  // 3. Stage 3: Collect Paths
  const paths = [...globalPaths];
  if (subcommand !== "clone") {
    const repositoryRole = commandClass === "destroy" || subcommand === "init" ? "target" : "source";
    paths.push(path({ text: ".", start: 0, end: 0, quote: "bare" }, repositoryRole, 0, pathBase));
  }

  if (["diff", "show", "log", "grep", "blame", "ls-files", "ls-remote", "check-attr", "check-ignore"].includes(subcommand)) {
    if (subcommand === "ls-remote") {
      const remote = rawOperands[0];
      if (remote !== undefined && isGitPathReference(remote.text)) {
        paths.push(path(remote, "source", remote.start, pathBase));
      }
    } else {
      const requiresSeparator = ["diff", "show", "log", "grep", "blame"].includes(subcommand);
      if (requiresSeparator) {
        for (const op of pathspecOperands) {
          paths.push(path(op, "source", op.start, pathBase));
        }
      } else {
        for (const op of [...rawOperands, ...pathspecOperands]) {
          paths.push(path(op, "source", op.start, pathBase));
        }
      }
    }
    if (["diff", "show", "log", "blame"].includes(subcommand)) {
      for (const opt of options) {
        if (opt.key === "output" && opt.kind === "valued") {
          paths.push(path(opt.value, "target", opt.value.start, pathBase));
        }
      }
    }
  } else if (["add", "rm", "mv"].includes(subcommand)) {
    const role = subcommand === "add" ? "source" : "target";
    for (const op of [...rawOperands, ...pathspecOperands]) {
      paths.push(path(op, role, op.start, pathBase));
    }
  } else if (subcommand === "restore") {
    for (const op of [...rawOperands, ...pathspecOperands]) {
      paths.push(path(op, "target", op.start, pathBase));
    }
  } else if (["checkout", "switch"].includes(subcommand)) {
    for (const op of pathspecOperands) {
      paths.push(path(op, "target", op.start, pathBase));
    }
  } else if (subcommand === "archive" || subcommand === "format-patch") {
    for (const opt of options) {
      if (opt.key === "output" && opt.kind === "valued") {
        paths.push(path(opt.value, "target", opt.value.start, pathBase));
      }
    }
  } else if (subcommand === "init") {
    for (const opt of options) {
      if (opt.name === "--template" && opt.kind === "valued") {
        paths.push(path(opt.value, "source", opt.value.start, pathBase));
      } else if (opt.name === "--separate-git-dir" && opt.kind === "valued") {
        paths.push(path(opt.value, "target", opt.value.start, pathBase));
      }
    }
    for (const op of [...rawOperands, ...pathspecOperands]) {
      paths.push(path(op, "target", op.start, pathBase));
    }
  } else if (subcommand === "commit") {
    for (const opt of options) {
      if ((opt.name === "-F" || opt.name === "--file") && opt.kind === "valued") {
        paths.push(path(opt.value, "source", opt.value.start, pathBase));
      }
    }
  } else if (subcommand === "clone") {
    for (const opt of options) {
      if (["--template", "--reference", "--reference-if-able"].includes(opt.name) && opt.kind === "valued") {
        paths.push(path(opt.value, "source", opt.value.start, pathBase));
      }
    }
    const sourceWord = rawOperands[0];
    if (sourceWord !== undefined && isRemoteGitReference(sourceWord.text)) {
      hardBoundary = true;
    }
    if (rawOperands.length === 2) {
      if (sourceWord !== undefined && !isRemoteGitReference(sourceWord.text)) {
        paths.push(path(sourceWord, "source", sourceWord.start, pathBase));
      }
      paths.push(path(rawOperands[1]!, "target", rawOperands[1]!.start, pathBase));
    } else if (rawOperands.length < 2) {
      if (sourceWord !== undefined && !isRemoteGitReference(sourceWord.text)) {
        paths.push(path(sourceWord, "source", sourceWord.start, pathBase));
      }
      paths.push(path({ text: ".", start: 0, end: 0, quote: "bare" }, "target", 0, pathBase));
    }
    if (rawOperands.length > 2 || hasUnknownSubcommandOption ||
      options.some((o) => o.name === "--recurse-submodules" || o.name === "--recursive") ||
      rest.some((word) => word.text === "--separate-git-dir" || word.text.startsWith("--separate-git-dir=") ||
        word.text === "--upload-pack" || word.text.startsWith("--upload-pack=") || word.text === "-u" || word.text.startsWith("-u=") || (word.text.startsWith("-u") && word.text.length > 2) ||
        word.text === "--config" || word.text.startsWith("--config="))) {
      hardBoundary = true;
    }
  } else if (["fetch", "pull", "push"].includes(subcommand)) {
    const remote = rawOperands[0];
    if (remote === undefined || (!isRemoteGitReference(remote.text) && !isGitPathReference(remote.text))) {
      hardBoundary = true;
    } else if (isRemoteGitReference(remote.text)) {
      hardBoundary = true;
    } else if (isGitPathReference(remote.text)) {
      paths.push(path(remote, subcommand === "push" ? "target" : "source", remote.start, pathBase));
    }
  } else if (subcommand === "submodule") {
    const action = rawOperands[0]?.text;
    const positionalPaths = rawOperands.map((op) => path(op, "source", op.start, pathBase));
    paths.push(...positionalPaths);
    if (action === "add") {
      const source = rawOperands[1]?.text;
      if (source === undefined || isRemoteGitReference(source) || !isGitPathReference(source)) hardBoundary = true;
      for (const opt of options) {
        if (["--reference", "--reference-if-able"].includes(opt.name) && opt.kind === "valued") {
          paths.push(path(opt.value, "source", opt.value.start, pathBase));
        }
      }
    }
    if (action === "foreach" || action === "update" || action === "init" || action === "sync") hardBoundary = true;
  } else if (subcommand === "config") {
    for (const opt of options) {
      if ((opt.name === "--file" || opt.name === "-f") && opt.kind === "valued") {
        paths.push(path(opt.value, commandClass === "inspect" ? "source" : "target", opt.value.start, pathBase));
      }
    }
    if (rest.some((word, idx) =>
      ["--file", "-f"].includes(word.text) && rest[idx + 1] === undefined && !word.text.includes("="))) {
      hardBoundary = true;
    }
  }

  if (options.some((o) => o.key === "output") && !["diff", "show", "log", "blame", "archive", "format-patch"].includes(subcommand)) {
    hardBoundary = true;
  }

  const hasWritePath = paths.some((value) => value.path.role === "target");
  const statusMayRefreshIndex = subcommand === "status" && !suppressesOptionalLocks;
  const helperSensitiveInspect = GIT_OPAQUE_INSPECT.has(subcommand) ||
    (subcommand === "stash" && rawOperands[0]?.text === "show");
  const effects: ProgramSemantic["effects"] = commandClass === "inspect"
    ? hasWritePath || statusMayRefreshIndex ? ["read", "write"] : ["read"]
    : commandClass === "destroy" ? ["delete"] : ["read", "write"];

  return result(commandClass, effects, paths, {
    cwdChanges,
    recursive: true,
    opaque: unsafeGlobalOption || hasUncanonicalizedRepositoryLocation || hasUnknownSubcommandOption || helperSensitiveInspect,
    hardBoundary: hardBoundary || missingOptionValue,
  });
}
