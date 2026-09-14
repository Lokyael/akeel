import type { ShellWord } from "../language";
import { INFO_FLAGS, result } from "./shared";
import type { ProgramSemantic } from "./types";

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

export function analyzeInterpreterProgram(args: readonly ShellWord[]): ProgramSemantic {
  const information = args.length === 1 && INFO_FLAGS.has(args[0]!.text);
  return result(information ? "inspect" : "execute", information ? [] : ["execute"], [], {
    opaque: !information,
  });
}
