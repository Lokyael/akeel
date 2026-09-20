import type { ShellWord } from "../language";
import { result } from "./shared";
import type { ProgramSemantic } from "./types";

const BARE_COMMAND_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/u;

export function isSupportedWhichInvocation(args: readonly ShellWord[]): boolean {
  return args.length === 1 && BARE_COMMAND_NAME.test(args[0]!.text);
}

/** Keep PATH lookup fail-closed until its filesystem roots can be bounded. */
export function analyzeWhichProgram(_args: readonly ShellWord[]): ProgramSemantic {
  return result("inspect", ["read"], [], { hardBoundary: true });
}
