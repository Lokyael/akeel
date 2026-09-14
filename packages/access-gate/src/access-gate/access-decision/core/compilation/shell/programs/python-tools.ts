import type { ShellWord } from "../language";
import { hasUnknownOption, scanOptionWords } from "./option-scanner";
import { firstCommand, path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

export const PYTHON_TOOLS = new Set(["ruff", "mypy", "black", "isort", "pylint", "pytest", "pyright"]);

const PYTHON_VALUE_OPTIONS = new Set([
  "--config", "--output-file", "--line-length", "--target-version", "--include", "--exclude", "--extend-exclude",
  "--force-exclude", "--workers", "--select", "--ignore", "--extend-select", "--extend-ignore", "--per-file-ignores",
  "--stdin-filename", "--cache-dir", "--python-version",
]);

export function analyzePythonToolProgram(name: string, args: readonly ShellWord[]): ProgramSemantic {
  const first = firstCommand(args, PYTHON_VALUE_OPTIONS);
  let commandClass: ProgramSemantic["commandClass"];
  if (name === "pytest") commandClass = "execute";
  else if (name === "black" || name === "isort") commandClass = "modify";
  else commandClass = "inspect";

  if (name === "ruff" && first === "format") commandClass = "modify";
  if (name === "ruff" && first === "clean") commandClass = "destroy";
  if (name === "ruff" && first === "check" && args.some((word) => word.text === "--fix")) commandClass = "modify";
  if (name === "ruff" && first === "format" && args.some((word) => ["--check", "--diff"].includes(word.text))) {
    commandClass = "inspect";
  }
  if ((name === "black" || name === "isort") &&
    args.some((word) => ["--check", "--check-only", "--diff"].includes(word.text))) {
    commandClass = "inspect";
  }
  if (name === "ruff" && args.some((word) => word.text === "--fix")) commandClass = "modify";

  const paths: ProgramPath[] = [];
  if (commandClass !== "execute") {
    const occurrences = scanOptionWords(args, { valueOptions: PYTHON_VALUE_OPTIONS });
    const optionIndices = new Set<number>();
    for (const occ of occurrences) {
      optionIndices.add(occ.index);
      if (!occ.attached && occ.valueIndex !== undefined) {
        optionIndices.add(occ.valueIndex);
      }
      if (occ.name === "--config" && occ.value !== undefined) {
        paths.push(path(occ.value, "source"));
      } else if (occ.name === "--output-file" && occ.value !== undefined) {
        paths.push(path(occ.value, "target"));
      }
    }

    let endOfOptions = false;
    let skippedSubcommand = false;
    let positionalCount = 0;
    for (let index = 0; index < args.length; index += 1) {
      const word = args[index]!;
      if (!endOfOptions && word.text === "--") {
        endOfOptions = true;
        continue;
      }
      if (!endOfOptions && (optionIndices.has(index) || word.text.startsWith("-"))) continue;
      if (name === "ruff" && !skippedSubcommand && ["check", "format", "rule", "linter", "clean"].includes(word.text)) {
        skippedSubcommand = true;
        continue;
      }
      positionalCount += 1;
      paths.push(path(word, commandClass === "modify" || commandClass === "destroy" ? "target" : "source"));
    }
    if (positionalCount === 0) {
      paths.push(path(
        { text: ".", start: 0, end: 0, quote: "bare" },
        commandClass === "modify" || commandClass === "destroy" ? "target" : "source",
        0,
      ));
    }
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
