import type { ShellWord } from "../language";
import { parseSegment, type OptionSpec, type ParsedOption, type SegmentContract } from "./segment-parser";
import { path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

export const PYTHON_TOOLS = new Set(["ruff", "mypy", "black", "isort", "pylint", "pytest", "pyright"]);

const PYTHON_OPTIONS: readonly OptionSpec<string>[] = Object.freeze([
  // Safe flags
  { key: "fix", names: ["--fix"], arity: "flag" },
  { key: "check", names: ["--check", "--check-only"], arity: "flag" },
  { key: "diff", names: ["--diff"], arity: "flag" },
  { key: "quiet", names: ["-q", "--quiet"], arity: "flag" },
  { key: "verbose", names: ["-v", "--verbose"], arity: "flag" },
  { key: "help", names: ["-h", "--help"], arity: "flag" },

  // Valued options (paths & configuration)
  { key: "config", names: ["--config"], arity: "required" },
  { key: "outputFile", names: ["--output-file"], arity: "required" },
  { key: "lineLength", names: ["--line-length"], arity: "required" },
  { key: "targetVersion", names: ["--target-version"], arity: "required" },
  { key: "include", names: ["--include"], arity: "required" },
  { key: "exclude", names: ["--exclude"], arity: "required" },
  { key: "extendExclude", names: ["--extend-exclude"], arity: "required" },
  { key: "forceExclude", names: ["--force-exclude"], arity: "required" },
  { key: "workers", names: ["--workers"], arity: "required" },
  { key: "select", names: ["--select"], arity: "required" },
  { key: "ignore", names: ["--ignore"], arity: "required" },
  { key: "extendSelect", names: ["--extend-select"], arity: "required" },
  { key: "extendIgnore", names: ["--extend-ignore"], arity: "required" },
  { key: "perFileIgnores", names: ["--per-file-ignores"], arity: "required" },
  { key: "stdinFilename", names: ["--stdin-filename"], arity: "required" },
  { key: "cacheDir", names: ["--cache-dir"], arity: "required" },
  { key: "pythonVersion", names: ["--python-version"], arity: "required" },
]);

const PYTHON_CONTRACT: SegmentContract<string> = Object.freeze({
  options: PYTHON_OPTIONS,
});

const RUFF_SUBCOMMANDS = new Set(["check", "format", "rule", "linter", "clean"]);

export function analyzePythonToolProgram(name: string, args: readonly ShellWord[]): ProgramSemantic {
  if (name === "pytest") {
    return result("execute", ["execute"], [], { recursive: true, opaque: true });
  }

  const parsed = parseSegment(args, PYTHON_CONTRACT);
  const isMalformed = parsed.kind === "malformed";
  const isUnknown = parsed.kind === "indeterminate";

  const options = parsed.kind === "complete" || parsed.kind === "indeterminate" ? parsed.options : [];
  const rawOperands = parsed.kind === "complete" || parsed.kind === "indeterminate" ? parsed.operands : [];
  const pathspecOperands = parsed.kind === "complete" ? parsed.pathspecOperands : [];

  const hasFix = options.some((opt: ParsedOption<string>) => opt.key === "fix");
  const hasCheck = options.some((opt: ParsedOption<string>) => opt.key === "check" || opt.key === "diff");

  let firstSubcommand: string | undefined;
  const fileOperands: ShellWord[] = [];

  for (let i = 0; i < rawOperands.length; i += 1) {
    const operand = rawOperands[i]!;
    if (name === "ruff" && firstSubcommand === undefined && RUFF_SUBCOMMANDS.has(operand.text)) {
      firstSubcommand = operand.text;
      continue;
    }
    fileOperands.push(operand);
  }
  for (const operand of pathspecOperands) {
    fileOperands.push(operand);
  }

  let commandClass: ProgramSemantic["commandClass"];
  if (name === "black" || name === "isort") {
    commandClass = hasCheck ? "inspect" : "modify";
  } else if (name === "ruff") {
    if (firstSubcommand === "format") {
      commandClass = hasCheck ? "inspect" : "modify";
    } else if (firstSubcommand === "clean") {
      commandClass = "destroy";
    } else if (firstSubcommand === "check") {
      commandClass = hasFix ? "modify" : "inspect";
    } else {
      commandClass = hasFix ? "modify" : "inspect";
    }
  } else {
    commandClass = "inspect";
  }

  const paths: ProgramPath[] = [];
  for (const opt of options) {
    if (opt.kind === "valued") {
      if (opt.key === "config") {
        paths.push(path(opt.value, "source"));
      } else if (opt.key === "outputFile") {
        paths.push(path(opt.value, "target"));
      }
    }
  }

  const fileRole = commandClass === "modify" || commandClass === "destroy" ? "target" : "source";
  if (fileOperands.length === 0) {
    paths.push(path({ text: ".", start: 0, end: 0, quote: "bare" }, fileRole, 0));
  } else {
    for (const fileWord of fileOperands) {
      paths.push(path(fileWord, fileRole));
    }
  }

  const effects: ProgramSemantic["effects"] = commandClass === "inspect"
    ? ["read"]
    : commandClass === "destroy"
      ? ["delete"]
      : ["read", "write"];

  return result(commandClass, effects, paths, {
    recursive: true,
    opaque: isUnknown || isMalformed,
  });
}
