import type { ShellWord } from "../language";
import { parseBoundedOptions } from "./bounded-options";
import type { BoundedOptionContract, BoundedOptionSpec, ParsedBoundedOption } from "./bounded-options";
import { path, result } from "./shared";
import type { ProgramAnalysis, ProgramPath, ProgramSemantic } from "./types";

const flag = (...names: string[]): BoundedOptionSpec => ({ names, forms: ["separate"] });
const scalar = (...names: string[]): BoundedOptionSpec => ({ names, value: "scalar", forms: ["separate", "equals", "attached"] });
const optionalScalar = (...names: string[]): BoundedOptionSpec => ({ names, value: "scalar", forms: ["equals", "attached"], optionalValue: true });
const pattern = (...names: string[]): BoundedOptionSpec => ({ names, value: "pattern", forms: ["separate", "equals", "attached"] });
const unsupported = (...names: string[]): BoundedOptionSpec => ({ names, disposition: "unsupported" });

const contracts: ReadonlyMap<string, BoundedOptionContract> = new Map([
  ["cat", {
    options: [
      flag("-A", "-b", "-e", "-E", "-n", "-s", "-t", "-T", "-v"),
      unsupported("--files0-from"),
    ],
  }],
  ["head", {
    options: [
      scalar("-n", "--lines"), scalar("-c", "--bytes"),
      flag("-q", "--quiet", "-v", "--verbose", "-z", "--zero-terminated"),
    ],
  }],
  ["tail", {
    options: [
      scalar("-n", "--lines"), scalar("-c", "--bytes"), scalar("-s", "--sleep-interval"), scalar("--pid"),
      flag("-f", "--follow", "-F", "--retry", "-q", "--quiet", "-v", "--verbose", "-z", "--zero-terminated"),
    ],
  }],
  ["ls", {
    options: [
      flag("-a", "--all", "-A", "--almost-all", "-b", "--escape", "-B", "--ignore-backups", "-c", "-d", "--directory", "-f", "-F", "--classify", "-g", "-G", "-h", "--human-readable", "-H", "-i", "-l", "-m", "-n", "-N", "-p", "-q", "-Q", "-r", "--reverse", "-R", "--recursive", "-s", "-S", "-t", "-u", "-U", "-v", "-x", "-X", "-1", "--author", "--full-time", "--hide-control-chars", "--si"),
      scalar("--block-size", "--format", "--hide", "--ignore", "--indicator-style", "--quoting-style", "--sort", "--tabsize", "--time", "--time-style", "--width"),
      unsupported("-L", "--dereference"),
    ],
  }],
  ["grep", {
    options: [
      flag("-a", "--text", "-b", "--byte-offset", "-h", "--no-filename", "-H", "--with-filename", "-i", "--ignore-case", "-I", "-l", "--files-with-matches", "-L", "--files-without-match", "-n", "--line-number", "-o", "--only-matching", "-q", "--quiet", "-r", "--recursive", "-s", "--no-messages", "-v", "--invert-match", "-w", "--word-regexp", "-x", "--line-regexp", "-z", "--null-data"),
      scalar("-A", "--after-context", "-B", "--before-context", "-C", "--context", "-d", "--directories", "-m", "--max-count", "--binary-files", "--devices", "--label"),
      pattern("--include", "--exclude", "--exclude-dir"),
      flag("--color", "--colour"),
      unsupported("-e", "--regexp", "-f", "--file", "--exclude-from", "--only-matching=invalid"),
    ],
  }],
  ["rg", {
    options: [
      scalar("--max-columns", "--type-not", "--threads", "--engine", "--replace", "-M", "-T", "-j", "-r"),
      flag("--hidden", "--no-hidden", "--no-ignore", "--no-ignore-vcs", "--stats", "--count", "--count-matches", "--files-with-matches", "--files-without-match", "--line-number", "-n", "-i", "-v", "-w", "-x", "-a", "-l"),
      unsupported("--follow", "-g", "--glob", "--iglob", "--files-from", "--files", "--pre", "-f", "-e"),
    ],
  }],
  ["od", {
    options: [
      scalar("-A", "--address-radix", "-j", "--skip-bytes", "-N", "--read-bytes", "-S", "-t", "--format"),
      optionalScalar("-w", "--width", "--strings"),
      flag("-a", "-b", "-c", "-d", "-f", "-i", "-l", "-o", "-s", "-v", "-x"),
    ],
  }],
  ["mkdir", {
    options: [
      scalar("-m", "--mode"),
      unsupported("--context"),
      flag("-p", "--parents", "-v", "--verbose"),
    ],
  }],
  ["touch", {
    options: [
      scalar("-d", "--date", "-t"),
      flag("-a", "-c", "--no-create", "-f", "-h", "--no-dereference", "-m"),
      unsupported("-r", "--reference"),
    ],
  }],
  ["cp", {
    options: [
      flag("-a", "--archive", "-b", "--backup", "-d", "--no-dereference", "-f", "--force", "-i", "--interactive", "-l", "--link", "-n", "--no-clobber", "-P", "--preserve", "-p", "-R", "-r", "-T", "--no-target-directory", "-u", "--update", "-v", "--verbose"),
      unsupported("-t", "--target-directory", "-L", "--dereference", "-H", "--copy-contents", "--remove-destination", "--context"),
    ],
  }],
  ["mv", {
    options: [
      flag("-b", "--backup", "-f", "--force", "-i", "--interactive", "-n", "--no-clobber", "-r", "-T", "--no-target-directory", "-u", "--update", "-v", "--verbose"),
      unsupported("-t", "--target-directory", "--exchange", "--strip-trailing-slashes"),
    ],
  }],
  ["ln", {
    options: [
      flag("-b", "--backup", "-d", "-F", "-f", "--force", "-i", "--interactive", "-n", "--no-dereference", "-P", "--physical", "-s", "--symbolic", "-v", "--verbose", "-T", "--no-target-directory"),
      unsupported("-t", "--target-directory", "-r", "--relative", "-L", "--logical"),
    ],
  }],
]);

function syntheticPath(): ShellWord {
  return Object.freeze({ text: ".", start: 0, end: 0, quote: "bare" as const });
}

function complete(semantic: ProgramSemantic): ProgramAnalysis {
  return Object.freeze({ kind: "complete" as const, semantic });
}

function pathsFor(words: readonly ShellWord[], role: "source" | "target"): ProgramPath[] {
  return words.map((word) => path(word, role));
}

function rejectFrom(value: Extract<ReturnType<typeof parseBoundedOptions>, { readonly kind: "reject" }>): ProgramAnalysis {
  return Object.freeze({ kind: "reject" as const, code: value.code, word: value.word });
}

function hasOption(options: readonly ParsedBoundedOption[], ...names: string[]): boolean {
  return options.some((option) => names.includes(option.name));
}

function analyzeCoreutilsComplete(name: string, options: readonly ParsedBoundedOption[], operands: readonly ShellWord[]): ProgramSemantic {
  const inspection = new Set(["cat", "head", "tail", "grep", "rg", "ls", "od"]);
  const modification = new Set(["mkdir", "touch", "cp", "mv", "ln"]);
  const commandClass = inspection.has(name) ? "inspect" : modification.has(name) ? "modify" : "unknown";
  const paths: ProgramPath[] = [];
  let recursive = false;

  if (name === "grep" || name === "rg") {
    if (operands.length > 1) paths.push(...pathsFor(operands.slice(1), "source"));
    if (operands.length <= 1 || hasOption(options, "-r", "-R", "--recursive")) {
      paths.push(path(syntheticPath(), "source"));
    }
    recursive = name === "rg" || hasOption(options, "-r", "-R", "--recursive") ||
      options.some((option) => (option.name === "-d" || option.name === "--directories") && option.value?.text === "recurse");
  } else if (name === "ls") {
    paths.push(...pathsFor(operands.length === 0 ? [syntheticPath()] : operands, "source"));
    recursive = hasOption(options, "-R", "--recursive");
  } else if (name === "cp" || name === "mv" || name === "ln") {
    if (operands.length > 0) {
      paths.push(...pathsFor(operands.slice(0, -1), "source"));
      paths.push(...pathsFor(operands.slice(-1), "target"));
    }
  } else {
    paths.push(...pathsFor(operands, commandClass === "modify" ? "target" : "source"));
  }

  if (name === "cp" || name === "mv" || name === "ln") recursive = true;
  const effects: ProgramSemantic["effects"] = commandClass === "inspect" ? ["read"] : name === "mkdir" || name === "touch" ? ["write"] : ["read", "write"];
  return result(commandClass, effects, paths, { recursive });
}

export function analyzeCoreutilsProgram(name: string, args: readonly ShellWord[]): ProgramAnalysis | undefined {
  const contract = contracts.get(name);
  if (contract === undefined) return undefined;
  const parsed = parseBoundedOptions(args, contract);
  if (parsed.kind === "reject") return rejectFrom(parsed);
  return complete(analyzeCoreutilsComplete(name, parsed.options, parsed.operands));
}

export function isCoreutilsProgram(name: string): boolean {
  return contracts.has(name);
}
