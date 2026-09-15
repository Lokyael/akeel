import type { ShellWord } from "../language";
import { analyzeFindProgram, analyzeFindProgramInvocation } from "./find";
import { analyzeGitProgram } from "./git";
import { analyzeHerdrProgram } from "./herdr";
import { analyzeInterpreterProgram, INTERPRETERS } from "./interpreters";
import { analyzePackageManagerProgram, PACKAGE_MANAGERS } from "./package-managers";
import { analyzePythonToolProgram, PYTHON_TOOLS } from "./python-tools";
import { commandName, result } from "./shared";
import type { ProgramInvocation, ProgramSemantic } from "./types";
import { analyzeUvProgram } from "./uv";

export type {
  ProgramCwdChange,
  ProgramInvocation,
  ProgramPath,
  ProgramPathBase,
  ProgramSemantic,
} from "./types";

export {
  analyzeFindProgram,
  analyzeFindProgramInvocation,
  analyzeGitProgram,
  analyzeHerdrProgram,
  analyzeInterpreterProgram,
  analyzePackageManagerProgram,
  analyzePythonToolProgram,
  analyzeUvProgram,
};

type ProgramAnalyzer = (name: string, args: readonly ShellWord[]) => ProgramSemantic;

const PROGRAM_ANALYZERS: ReadonlyMap<string, ProgramAnalyzer> = new Map([
  ["find", (_name, args) => analyzeFindProgram(args)],
  ["git", (_name, args) => analyzeGitProgram(args)],
  ["herdr", (_name, args) => analyzeHerdrProgram(args)],
  ["uv", (_name, args) => analyzeUvProgram(args)],
  ...[...INTERPRETERS].map((name) => [name, (_name: string, args: readonly ShellWord[]) => analyzeInterpreterProgram(args)] as const),
  ...[...PYTHON_TOOLS].map((name) => [name, (_name: string, args: readonly ShellWord[]) => analyzePythonToolProgram(name, args)] as const),
  ...[...PACKAGE_MANAGERS].map((name) => [name, (_name: string, args: readonly ShellWord[]) => analyzePackageManagerProgram(name, args)] as const),
]);

function isTrustedSystemGit(executable: string, name: string): boolean {
  return name === "git" && (executable === "/bin/git" || executable === "/usr/bin/git");
}

export function analyzeProgramCommand(invocation: ProgramInvocation): ProgramSemantic | undefined {
  const name = commandName(invocation.executable).toLowerCase();
  const analyzer = PROGRAM_ANALYZERS.get(name);
  if (analyzer === undefined) return undefined;
  const semantic = analyzer(name, invocation.arguments);
  if (!invocation.executable.includes("/") || semantic.commandClass === "destroy" || isTrustedSystemGit(invocation.executable, name)) {
    return semantic;
  }
  return result("execute", ["execute"], [], { opaque: true, hardBoundary: semantic.hardBoundary });
}
