import type { ShellWord } from "../language";
import { path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

export const INTERPRETERS = new Set([
  "sh",
  "bash",
  "python",
  "python3",
  "python3.11",
  "python3.12",
  "node",
  "nodejs",
  "ruby",
  "perl",
  "tsx",
]);

export const INTERPRETER_INSPECTION_OPTIONS = new Set(["--version", "-v", "--help", "-h"]);

export function isInterpreterCommand(name: string): boolean {
  return INTERPRETERS.has(name);
}

export function isInterpreterInspection(executable: string, words: readonly ShellWord[]): boolean {
  const name = executable.lastIndexOf("/") >= 0 ? executable.slice(executable.lastIndexOf("/") + 1) : executable;
  return (INTERPRETERS.has(name) || name === "") && words.length === 1 && INTERPRETER_INSPECTION_OPTIONS.has(words[0]!.text);
}

export function interpreterArguments(executable: string, words: readonly ShellWord[]): readonly ShellWord[] | undefined {
  if (INTERPRETERS.has(executable)) return words;
  if (executable === "npx" && words[0]?.text === "tsx") return words.slice(1);
  return undefined;
}

export function unsupportedInterpreterOption(executable: string, words: readonly ShellWord[]): ShellWord | undefined {
  const argumentsForInterpreter = interpreterArguments(executable, words);
  if (argumentsForInterpreter === undefined) return undefined;
  if (argumentsForInterpreter.length === 1 && INTERPRETER_INSPECTION_OPTIONS.has(argumentsForInterpreter[0]!.text)) return undefined;
  for (const word of argumentsForInterpreter) {
    if (word.text === "--") continue;
    if (word.text.startsWith("-")) return word;
  }
  return undefined;
}

export function interpreterScriptPath(executable: string, words: readonly ShellWord[]): ShellWord | undefined {
  const argumentsForInterpreter = interpreterArguments(executable, words);
  if (argumentsForInterpreter === undefined) return undefined;
  let optionsEnded = false;
  for (const word of argumentsForInterpreter) {
    if (optionsEnded) return word;
    if (word.text === "--") {
      optionsEnded = true;
      continue;
    }
    if (word.text.startsWith("-")) continue;
    return word;
  }
  return undefined;
}

export function analyzeInterpreterProgram(args: readonly ShellWord[]): ProgramSemantic {
  const information = isInterpreterInspection("", args);
  const script = interpreterScriptPath("", args);
  const paths: ProgramPath[] = [];
  if (script !== undefined) {
    paths.push(path(script, "source"));
  }
  return result(information ? "inspect" : "execute", information ? [] : ["execute"], paths, {
    opaque: !information,
  });
}
