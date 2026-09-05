import type { ShellPath } from "../shell-words";
import type { ShellWord } from "../shell-language";
import { firstNonOptionWord, hasUnknownOption, scanOptionWords } from "./option-scanner";
import type {
  ProgramCwdChange,
  ProgramInvocation,
  ProgramPath,
  ProgramPathBase,
  ProgramSemantic,
} from "./types";

const INFO_FLAGS = new Set(["--help", "-h", "--version", "-V", "-v"]);
const INTERPRETERS = new Set(["python", "python3", "python3.11", "python3.12", "node", "nodejs", "ruby", "perl", "tsx"]);
const PYTHON_TOOLS = new Set(["ruff", "mypy", "black", "isort", "pylint", "pytest", "pyright"]);
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "npx"]);
const PACKAGE_VALUE_OPTIONS = new Set(["--prefix", "--registry", "--cache", "--userconfig", "--globalconfig", "--cwd", "--dir", "--filter", "--workspace", "-w", "-C", "-F"]);
const PACKAGE_PATH_OPTIONS = new Set(["--prefix", "--cache", "--userconfig", "--globalconfig", "--cwd", "--dir", "--workspace", "-C"]);
const PACKAGE_SAFE_OPTIONS = new Set([
  ...PACKAGE_VALUE_OPTIONS,
  "--global", "-g", "--workspaces", "--json", "--parseable", "--long", "--all", "--depth",
  "--include", "--omit", "--prod", "--production", "--dry-run", "--ignore-scripts", "--offline",
  "--frozen-lockfile", "--lockfile-only", "--no-fund", "--no-audit", "--silent", "--verbose", "--help",
  "-h", "--version", "-v",
]);
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
const PYTHON_VALUE_OPTIONS = new Set([
  "--config", "--output-file", "--line-length", "--target-version", "--include", "--exclude", "--extend-exclude",
  "--force-exclude", "--workers", "--select", "--ignore", "--extend-select", "--extend-ignore", "--per-file-ignores",
  "--stdin-filename", "--cache-dir", "--python-version",
]);

function commandName(executable: string): string {
  const separator = executable.lastIndexOf("/");
  return separator < 0 ? executable : executable.slice(separator + 1);
}

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

function firstCommand(words: readonly ShellWord[], valueOptions: ReadonlySet<string>): string {
  return firstNonOptionWord(words, valueOptions)?.text ?? "";
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

function analyzeInterpreter(args: readonly ShellWord[]): ProgramSemantic {
  const information = args.length === 1 && INFO_FLAGS.has(args[0]!.text);
  return result(information ? "inspect" : "execute", information ? [] : ["execute"], [], { opaque: !information });
}

function analyzePythonTool(name: string, args: readonly ShellWord[]): ProgramSemantic {
  const first = firstCommand(args, PYTHON_VALUE_OPTIONS);
  let commandClass: ProgramSemantic["commandClass"];
  if (name === "pytest") commandClass = "execute";
  else if (name === "black" || name === "isort") commandClass = "modify";
  else commandClass = "inspect";

  if (name === "ruff" && first === "format") commandClass = "modify";
  if (name === "ruff" && first === "clean") commandClass = "destroy";
  if (name === "ruff" && first === "check" && args.some((word) => word.text === "--fix")) commandClass = "modify";
  if (name === "ruff" && first === "format" && args.some((word) => ["--check", "--diff"].includes(word.text))) commandClass = "inspect";
  if ((name === "black" || name === "isort") && args.some((word) => ["--check", "--check-only", "--diff"].includes(word.text))) {
    commandClass = "inspect";
  }
  if (name === "ruff" && args.some((word) => word.text === "--fix")) commandClass = "modify";

  const paths: ProgramPath[] = [];
  if (commandClass !== "execute") {
    let skippedSubcommand = false;
    for (const word of args) {
      if (word.text === "--" || word.text.startsWith("-")) continue;
      if (name === "ruff" && !skippedSubcommand && ["check", "format", "rule", "linter", "clean"].includes(word.text)) {
        skippedSubcommand = true;
        continue;
      }
      paths.push(path(word, commandClass === "modify" || commandClass === "destroy" ? "target" : "source"));
    }
  }
  if (paths.length === 0) {
    paths.push(path({ text: ".", start: 0, end: 0, quote: "bare" }, commandClass === "modify" || commandClass === "destroy" ? "target" : "source", 0));
  }
  return result(
    commandClass,
    commandClass === "inspect" ? ["read"] : commandClass === "destroy" ? ["delete"] : ["read", "write"],
    paths,
    {
      recursive: true,
      opaque: name === "pytest" || hasUnknownOption(
        args,
        new Set(["--fix", "--check", "--check-only", "--diff", "--", "-q", "-v"]),
        PYTHON_VALUE_OPTIONS,
      ),
    },
  );
}

function analyzeUv(args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 1 && INFO_FLAGS.has(args[0]!.text)) return result("inspect", ["read"]);
  const valueOptions = new Set(["--directory", "--project", "--cache-dir", "--config-file", "--python", "-C"]);
  const knownOptions = new Set([
    ...valueOptions, "--no-project", "--no-config", "--isolated", "--offline", "--allow-insecure-host", "--verbose",
    "--quiet", "--color", "--native-tls", "--no-native-tls", "--help", "-h", "--version", "-V",
  ]);
  const unknownOption = hasUnknownOption(args, knownOptions, valueOptions);
  const first = firstCommand(args, valueOptions);
  if (first === "run") return result("execute", ["execute"], [], { opaque: true });
  if (first === "help" || first === "--help") {
    return result("inspect", ["read"], optionPaths(args, valueOptions, "source"), { opaque: unknownOption });
  }
  return result("unknown", [], [], { opaque: true });
}

function gitPathArguments(
  args: readonly ShellWord[],
  role: "source" | "target",
  afterSeparatorOnly = false,
  base: ProgramPathBase = "invocation-cwd",
): ProgramPath[] {
  const valueIndexes = new Set(
    scanOptionWords(args, { valueOptions: GIT_VALUE_OPTIONS })
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

function analyzeGit(args: readonly ShellWord[]): ProgramSemantic {
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
  if (!subcommand) return result("unknown", [], globalPaths, { cwdChanges, opaque: true });
  if (globalPaths.some((entry) => isFileTransportReference(entry.path.text))) hardBoundary = true;
  const rest = args.slice(index + 1);
  const missingOptionValue = scanOptionWords(rest, { valueOptions: GIT_VALUE_OPTIONS })
    .some((occurrence) => occurrence.missingValue);
  if (rest.some((word) => isUnsupportedGitPathspec(word.text))) hardBoundary = true;
  if (rest.some((word) => word.text === "--pathspec-from-file" || word.text.startsWith("--pathspec-from-file=") ||
    word.text === "--pathspec-file-nul")) hardBoundary = true;
  if (rest.some((word) => isFileTransportReference(word.text) && localFileTransportPath(word.text) === undefined)) {
    hardBoundary = true;
  }
  if (rest.some((word) => word.text === "--upload-pack" || word.text.startsWith("--upload-pack=") ||
    word.text === "-u" || word.text.startsWith("-u=") || word.text.startsWith("-u") && word.text.length > 2 ||
    word.text === "--receive-pack" || word.text.startsWith("--receive-pack=") ||
    word.text === "--exec" || word.text.startsWith("--exec="))) {
    hardBoundary = true;
  }
  const known = GIT_INSPECT.has(subcommand) || GIT_MODIFY.has(subcommand) || subcommand === "clean" || subcommand === "branch";
  if (!known) return result("unknown", [], globalPaths, { cwdChanges, opaque: true, hardBoundary });

  let commandClass: ProgramSemantic["commandClass"] = GIT_INSPECT.has(subcommand) ? "inspect" : "modify";
  if (subcommand === "branch" && !rest.some((word) => ["-d", "-D", "--delete", "-f", "--force", "-m", "-M", "--move", "--rename", "-c", "-C", "--copy"].includes(word.text))) {
    commandClass = rest.some((word) => !word.text.startsWith("-")) ? "modify" : "inspect";
  }
  if (subcommand === "clean") commandClass = rest.some((word) => ["-n", "--dry-run"].includes(word.text)) ? "inspect" : "destroy";
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
  const pathBase: ProgramPathBase = hasCommandCwd ? "command-cwd" : "invocation-cwd";
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
      paths.push(...gitPathArguments(rest, "source", subcommand !== "ls-remote", pathBase));
    }
    if (["diff", "show", "log", "blame"].includes(subcommand)) {
      paths.push(...gitOptionPaths(rest, new Set(["--output", "-o"]), "target", pathBase));
    }
  } else if (["add", "rm", "mv"].includes(subcommand)) {
    paths.push(...gitPathArguments(rest, subcommand === "add" ? "source" : "target", false, pathBase));
  } else if (["checkout", "switch", "restore"].includes(subcommand)) {
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
    opaque: unsafeGlobalOption || hasUncanonicalizedRepositoryLocation || hasUnknownOption(rest, GIT_SAFE_OPTIONS, GIT_VALUE_OPTIONS),
    hardBoundary: hardBoundary || missingOptionValue,
  });
}

function analyzePackageManager(name: string, args: readonly ShellWord[]): ProgramSemantic {
  if (name !== "npx" && args.length === 1 && INFO_FLAGS.has(args[0]!.text)) return result("inspect", ["read"]);
  if (name === "npx" && args.length === 1 && INFO_FLAGS.has(args[0]!.text)) return result("inspect", ["read"]);
  const first = firstCommand(args, PACKAGE_VALUE_OPTIONS);
  if (name === "npx") return result("execute", ["execute"], [], { opaque: true });
  const globalScope = args.some((word) =>
    word.text === "-g" || word.text === "--global" || word.text.startsWith("--global=") || word.text.startsWith("-g="));
  const unknownOption = hasUnknownOption(args, PACKAGE_SAFE_OPTIONS, PACKAGE_VALUE_OPTIONS);
  if (["view", "info", "outdated", "ls", "list", "search", "audit", "whoami", "ping", "root", "help"].includes(first)) {
    return result("inspect", ["read"], optionPaths(args, PACKAGE_PATH_OPTIONS, "source"), { opaque: globalScope || unknownOption });
  }
  if (["init", "version", "dedupe"].includes(first)) {
    return result("modify", ["read", "write"], [
      path({ text: ".", start: 0, end: 0, quote: "bare" }, "target", 0),
      ...optionPaths(args, PACKAGE_PATH_OPTIONS, "target"),
    ], { recursive: true, opaque: unknownOption });
  }
  if (["config", "cache"].includes(first)) {
    return result("modify", ["read", "write"], optionPaths(args, PACKAGE_PATH_OPTIONS, "target"), { opaque: true });
  }
  if (["install", "ci", "update", "remove", "uninstall", "run", "start", "stop", "restart", "exec", "test", "build", "publish", "pack", "link", "unlink", "prune"].includes(first)) {
    return result("execute", ["execute"], optionPaths(args, PACKAGE_PATH_OPTIONS, "source"), { opaque: true });
  }
  return result("unknown", [], [], { opaque: true });
}

type ProgramAnalyzer = (name: string, args: readonly ShellWord[]) => ProgramSemantic;

const PROGRAM_ANALYZERS: ReadonlyMap<string, ProgramAnalyzer> = new Map([
  ["git", (_name, args) => analyzeGit(args)],
  ["uv", (_name, args) => analyzeUv(args)],
  ...[...INTERPRETERS].map((name) => [name, (_name: string, args: readonly ShellWord[]) => analyzeInterpreter(args)] as const),
  ...[...PYTHON_TOOLS].map((name) => [name, (_name: string, args: readonly ShellWord[]) => analyzePythonTool(name, args)] as const),
  ...[...PACKAGE_MANAGERS].map((name) => [name, (_name: string, args: readonly ShellWord[]) => analyzePackageManager(name, args)] as const),
]);

export function analyzeProgramCommand(invocation: ProgramInvocation): ProgramSemantic | undefined {
  const name = commandName(invocation.executable).toLowerCase();
  return PROGRAM_ANALYZERS.get(name)?.(name, invocation.arguments);
}
