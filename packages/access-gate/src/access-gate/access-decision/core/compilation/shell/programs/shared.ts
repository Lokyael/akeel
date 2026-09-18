import type { ShellPath } from "../invocation";
import type { ShellWord } from "../language";
import type { ProgramPath, ProgramPathBase, ProgramSemantic } from "./types";

export const INFO_FLAGS = new Set(["--help", "-h", "--version", "-V", "-v"]);

export function commandName(executable: string): string {
  const separator = executable.lastIndexOf("/");
  return separator < 0 ? executable : executable.slice(separator + 1);
}

export function pathFromWord(word: ShellWord, role: "source" | "target"): ShellPath {
  const path: { text: string; role: "source" | "target"; pathKind?: "home-relative" | "literal" } = {
    text: word.text,
    role,
  };
  if (word.pathKind !== undefined) path.pathKind = word.pathKind;
  return Object.freeze(path);
}

export function path(
  word: ShellWord,
  role: "source" | "target",
  start = word.start,
  base: ProgramPathBase = "invocation-cwd",
): ProgramPath {
  return Object.freeze({ path: pathFromWord(word, role), start, base });
}

export function result(
  commandClass: ProgramSemantic["commandClass"],
  effects: ProgramSemantic["effects"],
  paths: readonly ProgramPath[] = [],
  options: Readonly<{
    cwdChanges?: ProgramSemantic["cwdChanges"];
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
