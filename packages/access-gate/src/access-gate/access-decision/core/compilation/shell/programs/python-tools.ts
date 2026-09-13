import type { ShellWord } from "../language";
import { hasUnknownOption } from "./option-scanner";
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
    paths.push(path(
      { text: ".", start: 0, end: 0, quote: "bare" },
      commandClass === "modify" || commandClass === "destroy" ? "target" : "source",
      0,
    ));
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
