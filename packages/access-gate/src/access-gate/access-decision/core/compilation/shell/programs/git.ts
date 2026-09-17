import type { ShellPath } from "../invocation";
import type { ShellWord } from "../language";
import { firstNonOptionWord, hasUnknownOption, scanOptionWords } from "./option-scanner";
import type { ProgramCwdChange, ProgramPath, ProgramPathBase, ProgramSemantic } from "./types";

const GIT_CLONE_VALUE_OPTIONS = new Set([
  "--template", "--reference", "--reference-if-able", "--separate-git-dir", "--depth", "--shallow-since",
  "--shallow-exclude", "--origin", "-o", "--branch", "-b", "--upload-pack", "-u", "--config",
  "--server-option", "--jobs", "-j", "--filter",
]);
const GIT_CLONE_PATH_OPTIONS = new Set(["--template", "--reference", "--reference-if-able"]);
const GIT_CLONE_SAFE_OPTIONS = new Set([
  ...GIT_CLONE_VALUE_OPTIONS,
  "--local", "-l", "--no-hardlinks", "--shared", "--no-tags", "--tags", "--single-branch", "--no-single-branch",
  "--recurse-submodules", "--recursive", "--shallow-submodules", "--no-shallow-submodules", "--dissociate",
  "--no-checkout", "--bare", "--mirror", "--progress", "--no-progress", "--quiet", "-q", "--verbose", "-v",
  "--ipv4", "--ipv6", "--also-filter-submodules",
]);
const GIT_INSPECT = new Set([
  "status", "diff", "log", "rev-list", "show", "grep", "blame", "ls-files", "ls-tree", "ls-remote",
  "fsck", "describe", "check-attr", "check-ignore", "help",
]);
const GIT_MODIFY = new Set([
  "add", "rm", "commit", "push", "checkout", "switch", "restore", "merge", "rebase", "tag", "reset",
  "fetch", "pull", "clone", "init", "remote", "mv", "cherry-pick", "revert", "apply", "gc", "submodule",
  "stash", "format-patch", "archive", "config",
]);
const GIT_HELPER_COMMANDS = new Set([
  "push",
  "fetch",
  "pull",
  "clone",
  "init",
  "checkout",
  "switch",
  "restore",
  "merge",
  "rebase",
  "tag",
  "reset",
  "cherry-pick",
  "revert",
  "stash",
  "submodule",
  "config",
  "help",
  "grep",
  "blame",
  "gc",
  "apply",
]);
const GIT_GLOBAL_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree"]);
const GIT_REMOTE_VALUE_OPTIONS = new Set(["--upload-pack", "-u", "--depth", "--shallow-since", "--shallow-exclude", "--negotiation-tip", "--server-option", "--filter"]);
const GIT_SAFE_OPTIONS = new Set([
  ...GIT_CLONE_VALUE_OPTIONS,
  "--", "-A", "-a", "-n", "-q", "-v", "-u", "-U", "--stat", "--oneline", "--cached", "--staged",
  "--porcelain", "--short", "--branch", "--name-only", "--name-status", "--dry-run", "--hard", "-m", "-F",
  "--message", "--file", "-b", "-d", "-D", "-f", "--force", "--delete", "--dry-run", "--output", "-o",
  "--output-directory", "--global", "--local", "--system", "--list", "-l", "--get", "--unset", "--add",
]);
const GIT_VALUE_OPTIONS = new Set([
  ...GIT_CLONE_VALUE_OPTIONS,
  ...GIT_REMOTE_VALUE_OPTIONS,
  "-m", "-F", "-b", "--message", "--file", "--output", "-o", "--output-directory",
]);

const GIT_INSPECT_VALUE_OPTIONS = new Set([
  ...GIT_VALUE_OPTIONS,
  "-S", "-G", "--grep", "--author", "--committer",
  "--since", "--after", "--until", "--before",
  "--format", "--pretty", "-L", "--max-count", "--diff-filter",
]);

const GIT_INSPECT_SAFE_OPTIONS = new Set([
  ...GIT_SAFE_OPTIONS,
  ...GIT_INSPECT_VALUE_OPTIONS,
  "--graph", "--follow", "--topo-order", "--date-order", "--author-date-order",
  "--reverse", "--no-merges", "--merges", "--first-parent",
  "-p", "--patch", "-s", "--no-patch", "--numstat", "--shortstat",
  "--relative", "--abbrev-commit", "--no-abbrev-commit",
]);

const GIT_RESTORE_VALUE_OPTIONS = new Set(["--source", "-s"]);
const GIT_RESTORE_SAFE_OPTIONS = new Set([
  ...GIT_RESTORE_VALUE_OPTIONS,
  "--worktree", "-W", "--staged", "-S", "-q", "--quiet", "--progress", "--no-progress",
  "--ignore-unmerged", "--ignore-skip-worktree-bits", "--",
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

function optionPaths(
  words: readonly ShellWord[],
  options: ReadonlySet<string>,
  role: "source" | "target",
  base: ProgramPathBase = "invocation-cwd",
): ProgramPath[] {
  return scanOptionWords(words, { valueOptions: options })
    .filter((occurrence) => options.has(occurrence.name) && occurrence.value !== undefined)
    .map((occurrence) => path(occurrence.value!, role, occurrence.value!.start, base));
}

function gitPathArguments(
  args: readonly ShellWord[],
  role: "source" | "target",
  afterSeparatorOnly = false,
  base: ProgramPathBase = "invocation-cwd",
  valueOptions: ReadonlySet<string> = GIT_VALUE_OPTIONS,
): ProgramPath[] {
  const valueIndexes = new Set(
    scanOptionWords(args, { valueOptions })
      .flatMap((occurrence) => occurrence.valueIndex === undefined ? [] : [occurrence.valueIndex]),
  );
  const paths: ProgramPath[] = [];
  let afterSeparator = false;
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]!;
    if (valueIndexes.has(index)) continue;
    if (word.text === "--") {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && word.text.startsWith("-")) continue;
    if (afterSeparatorOnly && !afterSeparator) continue;
    paths.push(path(word, role, word.start, base));
  }
  return paths;
}

function gitOptionPaths(
  args: readonly ShellWord[],
  options: ReadonlySet<string>,
  role: "source" | "target",
  base: ProgramPathBase = "invocation-cwd",
): ProgramPath[] {
  return optionPaths(args, options, role, base);
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

function firstGitPositionalWord(args: readonly ShellWord[]): ShellWord | undefined {
  return firstNonOptionWord(args, GIT_REMOTE_VALUE_OPTIONS);
}

function firstGitPositionalArgument(args: readonly ShellWord[]): string | undefined {
  return firstGitPositionalWord(args)?.text;
}

type GitClonePathAnalysis = Readonly<{
  readonly paths: readonly ProgramPath[];
  readonly positionalCount: number;
  readonly source?: ShellWord;
}>;

function gitClonePaths(
  args: readonly ShellWord[],
  base: ProgramPathBase = "invocation-cwd",
): GitClonePathAnalysis {
  const occurrences = new Map(scanOptionWords(args, { valueOptions: GIT_CLONE_VALUE_OPTIONS }).map((entry) => [entry.index, entry]));
  const valueIndexes = new Set(
    [...occurrences.values()]
      .flatMap((entry) => entry.valueIndex === undefined || entry.valueIndex === entry.index ? [] : [entry.valueIndex]),
  );
  const positional: ShellWord[] = [];
  const paths: ProgramPath[] = [];
  let afterSeparator = false;
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]!;
    if (word.text === "--") {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator && word.text.startsWith("-")) {
      const occurrence = occurrences.get(index);
      if (occurrence !== undefined && GIT_CLONE_PATH_OPTIONS.has(occurrence.name) && occurrence.value !== undefined) {
        paths.push(path(occurrence.value, "source", occurrence.value.start, base));
      }
      continue;
    }
    if (valueIndexes.has(index)) continue;
    positional.push(word);
  }
  const source = positional[0];
  if (positional.length === 2) {
    if (!isRemoteGitReference(source!.text)) paths.push(path(source!, "source", source!.start, base));
    paths.push(path(positional[1]!, "target", positional[1]!.start, base));
  } else if (positional.length < 2) {
    if (source !== undefined && !isRemoteGitReference(source.text)) paths.push(path(source, "source", source.start, base));
    paths.push(path({ text: ".", start: 0, end: 0, quote: "bare" }, "target", 0, base));
  }
  return { paths: Object.freeze(paths), positionalCount: positional.length, source };
}

export function analyzeGitProgram(args: readonly ShellWord[]): ProgramSemantic {
  let index = 0;
  const globalPaths: ProgramPath[] = [];
  let unsafeGlobalOption = false;
  const cwdChanges: ProgramCwdChange[] = [];
  let hasCommandCwd = false;
  let hasUncanonicalizedRepositoryLocation = false;
  let hardBoundary = false;
  const globalOptions = new Map(
    scanOptionWords(args, {
      valueOptions: GIT_GLOBAL_VALUE_OPTIONS,
      attachedOptions: new Set(["-C", "-c"]),
    }).map((entry) => [entry.index, entry]),
  );
  while (index < args.length && args[index]!.text.startsWith("-")) {
    const option = args[index]!;
    if (option.text === "--") break;
    const occurrence = globalOptions.get(index);
    const optionName = occurrence?.name ?? option.text;
    if (occurrence === undefined || !GIT_GLOBAL_VALUE_OPTIONS.has(optionName) &&
      !["--no-pager", "--paginate", "--literal-pathspecs"].includes(optionName)) {
      unsafeGlobalOption = true;
      hardBoundary = true;
      index += 1;
      continue;
    }
    if (GIT_GLOBAL_VALUE_OPTIONS.has(optionName)) {
      const value = occurrence.value;
      if (!value) return result("unknown", [], [], { opaque: true, hardBoundary: true });
      if (optionName === "-c") hardBoundary = true;
      else if (optionName === "-C") {
        const base: ProgramPathBase = hasCommandCwd ? "command-cwd" : "invocation-cwd";
        globalPaths.push(path(value, "source", option.start, base));
        cwdChanges.push(Object.freeze({ path: pathFromWord(value, "source"), start: option.start, base }));
        hasCommandCwd = true;
      } else if (optionName === "--git-dir" || optionName === "--work-tree") {
        globalPaths.push(path(value, "source", option.start, "command-cwd"));
      } else {
        globalPaths.push(path(value, "source", option.start, "command-cwd"));
        hasUncanonicalizedRepositoryLocation = true;
        hardBoundary = true;
      }
      index = occurrence.valueIndex === undefined || occurrence.valueIndex === occurrence.index
        ? occurrence.index + 1
        : occurrence.valueIndex + 1;
      continue;
    }
    index += 1;
  }
  const subcommand = args[index]?.text;
  if (!subcommand) return result("unknown", [], globalPaths, { cwdChanges, opaque: true, hardBoundary: true });
  if (globalPaths.some((entry) => isFileTransportReference(entry.path.text))) hardBoundary = true;
  const rest = args.slice(index + 1);
  const pathBase: ProgramPathBase = hasCommandCwd ? "command-cwd" : "invocation-cwd";
  const isInspectSubcommand = GIT_INSPECT.has(subcommand);
  const isRestoreSubcommand = subcommand === "restore";
  const effectiveSafeOptions = isInspectSubcommand
    ? GIT_INSPECT_SAFE_OPTIONS
    : isRestoreSubcommand
      ? GIT_RESTORE_SAFE_OPTIONS
      : GIT_SAFE_OPTIONS;
  const effectiveValueOptions = isInspectSubcommand
    ? GIT_INSPECT_VALUE_OPTIONS
    : isRestoreSubcommand
      ? GIT_RESTORE_VALUE_OPTIONS
      : GIT_VALUE_OPTIONS;
  const optionOccurrences = scanOptionWords(rest, { valueOptions: effectiveValueOptions });
  const missingOptionValue = optionOccurrences.some((occurrence) => occurrence.missingValue);
  const optionWordIndices = new Set(
    optionOccurrences.flatMap((occ) => [
      occ.index,
      ...(occ.valueIndex !== undefined && !occ.attached ? [occ.valueIndex] : []),
    ]),
  );
  const positionalWords = rest.filter((_, idx) => !optionWordIndices.has(idx));
  if (positionalWords.some((word) => isUnsupportedGitPathspec(word.text))) hardBoundary = true;
  if (rest.some((word) => word.text === "--pathspec-from-file" || word.text.startsWith("--pathspec-from-file=") ||
    word.text === "--pathspec-file-nul")) hardBoundary = true;
  if (rest.some((word) => isFileTransportReference(word.text) && localFileTransportPath(word.text) === undefined)) {
    hardBoundary = true;
  }
  if (rest.some((word) => word.text === "--upload-pack" || word.text.startsWith("--upload-pack=") ||
    word.text === "-u" || word.text.startsWith("-u=") || word.text.startsWith("-u") && word.text.length > 2 ||
    word.text === "--receive-pack" || word.text.startsWith("--receive-pack=") ||
    word.text === "--exec" || word.text.startsWith("--exec=") ||
    word.text === "--ext-diff" || word.text.startsWith("--ext-diff=") ||
    word.text === "--textconv" || word.text.startsWith("--textconv="))) {
    hardBoundary = true;
  }
  const known = GIT_INSPECT.has(subcommand) || GIT_MODIFY.has(subcommand) || subcommand === "clean" || subcommand === "branch";
  if (!known) return result("unknown", [], globalPaths, { cwdChanges, opaque: true, hardBoundary: true });
  if (GIT_HELPER_COMMANDS.has(subcommand) && subcommand !== "restore" && subcommand !== "checkout") {
    hardBoundary = true;
  }

  if (subcommand === "commit") {
    const commitOptions = scanOptionWords(rest, { valueOptions: GIT_VALUE_OPTIONS });
    const hasMessage = commitOptions.some(
      (opt) => (opt.name === "-m" || opt.name === "--message" || opt.name === "-F" || opt.name === "--file") &&
        opt.value !== undefined && opt.value.text.length > 0,
    );
    if (!hasMessage || hasUnknownOption(rest, GIT_SAFE_OPTIONS, GIT_VALUE_OPTIONS)) hardBoundary = true;
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
    if (hasUnknownOption(rest, GIT_SAFE_OPTIONS, GIT_VALUE_OPTIONS) || rest.some((word) =>
      word.text === "-i" || word.text === "--interactive" ||
      word.text === "-p" || word.text === "--patch" ||
      word.text === "-e" || word.text === "--edit",
    )) {
      hardBoundary = true;
    }
  }
  if (subcommand === "restore") {
    const restoreOptions = scanOptionWords(rest, { valueOptions: GIT_RESTORE_VALUE_OPTIONS });
    if (hasUnknownOption(rest, GIT_RESTORE_SAFE_OPTIONS, GIT_RESTORE_VALUE_OPTIONS)) {
      hardBoundary = true;
    }
    for (const opt of restoreOptions) {
      if (opt.name === "--source" || opt.name === "-s") {
        const text = opt.value?.text;
        if (!text || !/^HEAD(?:~\d+|\^\d*)?$/u.test(text)) {
          hardBoundary = true;
        }
      }
    }
    const pathArgs = gitPathArguments(rest, "target", false, pathBase, GIT_RESTORE_VALUE_OPTIONS);
    if (pathArgs.length !== 1 || pathArgs[0]!.path.text === "." || isUnsupportedGitPathspec(pathArgs[0]!.path.text)) {
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
      const hasUnknown = hasUnknownOption(
        beforeSeparator,
        new Set(["-q", "--quiet", "--progress", "--no-progress"]),
        new Set(),
      );
      if (hasUnknown) {
        hardBoundary = true;
      }
      const nonOptionBefore = beforeSeparator.filter((w) => !w.text.startsWith("-"));
      if (nonOptionBefore.length > 1) {
        hardBoundary = true;
      } else if (nonOptionBefore.length === 1 && !/^HEAD(?:~\d+|\^\d*)?$/u.test(nonOptionBefore[0]!.text)) {
        hardBoundary = true;
      }
      const pathArgs = gitPathArguments(afterSeparator, "target", false, pathBase);
      if (pathArgs.length !== 1 || pathArgs[0]!.path.text === "." || isUnsupportedGitPathspec(pathArgs[0]!.path.text)) {
        hardBoundary = true;
      }
    }
  }

  let commandClass: ProgramSemantic["commandClass"] = GIT_INSPECT.has(subcommand) ? "inspect" : "modify";
  if (subcommand === "branch" && !rest.some((word) => ["-d", "-D", "--delete", "-f", "--force", "-m", "-M", "--move", "--rename", "-c", "-C", "--copy"].includes(word.text))) {
    commandClass = rest.some((word) => !word.text.startsWith("-")) ? "modify" : "inspect";
  }
  if (subcommand === "clean") commandClass = rest.some((word) => ["-n", "--dry-run"].includes(word.text)) ? "inspect" : "destroy";
  if (subcommand === "rm") commandClass = "destroy";
  if (subcommand === "stash" && ["list", "show"].includes(rest.find((word) => !word.text.startsWith("-"))?.text ?? "")) commandClass = "inspect";
  if (subcommand === "config" && rest.some((word) => ["--list", "-l", "--get", "--get-all", "--get-regexp"].includes(word.text))) commandClass = "inspect";
  if (subcommand === "config" && rest.some((word) => ["--global", "--system"].includes(word.text))) hardBoundary = true;
  if (subcommand === "reset" && rest.some((word) => word.text === "--hard")) commandClass = "destroy";
  if (subcommand === "push" && rest.some((word) => word.text === "-f" || word.text.startsWith("--force"))) commandClass = "destroy";
  if (subcommand === "branch" && rest.some((word) => ["-d", "-D", "--delete"].includes(word.text))) commandClass = "destroy";
  if (subcommand === "stash" && rest.some((word) => word.text === "clear")) commandClass = "destroy";
  if (subcommand === "remote") hardBoundary = true;
  if (subcommand === "archive" && rest.some((word) => word.text === "--remote" || word.text.startsWith("--remote="))) {
    hardBoundary = true;
  }
  if (subcommand === "ls-remote") {
    const remote = firstGitPositionalArgument(rest);
    if (remote === undefined || (!isRemoteGitReference(remote) && !isGitPathReference(remote))) hardBoundary = true;
    if (remote !== undefined && isRemoteGitReference(remote)) hardBoundary = true;
  }

  const paths = [...globalPaths];
  if (subcommand !== "clone") {
    const repositoryRole = commandClass === "destroy" || subcommand === "init" ? "target" : "source";
    paths.push(path({ text: ".", start: 0, end: 0, quote: "bare" }, repositoryRole, 0, pathBase));
  }
  if (["diff", "show", "log", "grep", "blame", "ls-files", "ls-remote", "check-attr", "check-ignore"].includes(subcommand)) {
    if (subcommand === "ls-remote") {
      const remote = firstGitPositionalWord(rest);
      if (remote !== undefined && isGitPathReference(remote.text)) {
        paths.push(path(remote, "source", remote.start, pathBase));
      }
    } else {
      const requiresSeparator = ["diff", "show", "log", "grep", "blame"].includes(subcommand);
      paths.push(...gitPathArguments(rest, "source", requiresSeparator, pathBase, effectiveValueOptions));
    }
    if (["diff", "show", "log", "blame"].includes(subcommand)) {
      paths.push(...gitOptionPaths(rest, new Set(["--output", "-o"]), "target", pathBase));
    }
  } else if (["add", "rm", "mv"].includes(subcommand)) {
    paths.push(...gitPathArguments(rest, subcommand === "add" ? "source" : "target", false, pathBase));
  } else if (subcommand === "restore") {
    paths.push(...gitPathArguments(rest, "target", false, pathBase, GIT_RESTORE_VALUE_OPTIONS));
  } else if (["checkout", "switch"].includes(subcommand)) {
    paths.push(...gitPathArguments(rest, "target", true, pathBase));
  } else if (subcommand === "archive" || subcommand === "format-patch") {
    const outputIndex = rest.findIndex((word) => ["-o", "--output", "--output-directory"].includes(word.text) || word.text.startsWith("--output=") || word.text.startsWith("--output-directory="));
    const outputToken = outputIndex >= 0 ? rest[outputIndex]! : undefined;
    const output = outputToken?.text.includes("=")
      ? Object.freeze({ ...outputToken, text: outputToken.text.slice(outputToken.text.indexOf("=") + 1) })
      : outputToken !== undefined
        ? rest[outputIndex + 1]
        : undefined;
    if (output) paths.push(path(output, "target", output.start, pathBase));
  } else if (subcommand === "init") {
    paths.push(...gitOptionPaths(rest, new Set(["--template"]), "source", pathBase));
    paths.push(...gitOptionPaths(rest, new Set(["--separate-git-dir"]), "target", pathBase));
    paths.push(...gitPathArguments(rest, "target", false, pathBase));
  } else if (subcommand === "commit") {
    paths.push(...gitOptionPaths(rest, new Set(["-F", "--file"]), "source", pathBase));
  } else if (subcommand === "clone") {
    const clone = gitClonePaths(rest, pathBase);
    const cloneOptions = scanOptionWords(rest, { valueOptions: GIT_CLONE_VALUE_OPTIONS });
    paths.push(...clone.paths);
    if (clone.source !== undefined && isRemoteGitReference(clone.source.text)) hardBoundary = true;
    if (clone.positionalCount > 2 || hasUnknownOption(rest, GIT_CLONE_SAFE_OPTIONS) ||
      cloneOptions.some((option) => option.name === "--recurse-submodules" || option.name === "--recursive") ||
      rest.some((word) => word.text === "--separate-git-dir" || word.text.startsWith("--separate-git-dir=") ||
        word.text === "--upload-pack" || word.text.startsWith("--upload-pack=") || word.text === "-u" || word.text.startsWith("-u=") || word.text.startsWith("-u") && word.text.length > 2 ||
        word.text === "--config" || word.text.startsWith("--config="))) {
      hardBoundary = true;
    }
  } else if (["fetch", "pull", "push"].includes(subcommand)) {
    const remote = firstGitPositionalWord(rest);
    if (remote === undefined || (!isRemoteGitReference(remote.text) && !isGitPathReference(remote.text))) {
      hardBoundary = true;
    } else if (isRemoteGitReference(remote.text)) {
      hardBoundary = true;
    } else if (isGitPathReference(remote.text)) {
      paths.push(path(remote, subcommand === "push" ? "target" : "source", remote.start, pathBase));
    }
  } else if (subcommand === "submodule") {
    const action = firstGitPositionalArgument(rest);
    const positionalPaths = gitPathArguments(rest, "source", false, pathBase);
    paths.push(...positionalPaths);
    if (action === "add") {
      const source = positionalPaths[1]?.path.text;
      if (source === undefined || isRemoteGitReference(source) || !isGitPathReference(source)) hardBoundary = true;
      paths.push(...gitOptionPaths(rest, new Set(["--reference", "--reference-if-able"]), "source", pathBase));
    }
    if (action === "foreach" || action === "update" || action === "init" || action === "sync") hardBoundary = true;
  } else if (subcommand === "config") {
    paths.push(...gitOptionPaths(rest, new Set(["--file", "-f"]), commandClass === "inspect" ? "source" : "target", pathBase));
    if (rest.some((word, index) =>
      ["--file", "-f"].includes(word.text) && rest[index + 1] === undefined && !word.text.includes("="))) {
      hardBoundary = true;
    }
  }

  if (rest.some((word) => word.text === "--output" || word.text.startsWith("--output=") || word.text === "--output-directory" || word.text.startsWith("--output-directory=")) &&
    !["diff", "show", "log", "blame", "archive", "format-patch"].includes(subcommand)) {
    hardBoundary = true;
  }

  const hasWritePath = paths.some((value) => value.path.role === "target");
  const effects: ProgramSemantic["effects"] = commandClass === "inspect"
    ? hasWritePath ? ["read", "write"] : ["read"]
    : commandClass === "destroy" ? ["delete"] : ["read", "write"];
  return result(commandClass, effects, paths, {
    cwdChanges,
    recursive: true,
    opaque: unsafeGlobalOption || hasUncanonicalizedRepositoryLocation || hasUnknownOption(rest, effectiveSafeOptions, effectiveValueOptions),
    hardBoundary: hardBoundary || missingOptionValue,
  });
}

