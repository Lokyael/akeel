import type { ShellWord } from "../language";
import { analyzeCoreutilsProgram, isCoreutilsProgram } from "./coreutils";
import { analyzeFindProgram, analyzeFindProgramInvocation } from "./find";
import { analyzeGitProgram } from "./git";
import { analyzeHerdrProgram } from "./herdr";
import { analyzeInterpreterProgram, INTERPRETERS } from "./interpreters";
import { analyzePackageManagerProgram, PACKAGE_MANAGERS } from "./package-managers";
import { analyzePythonToolProgram, PYTHON_TOOLS } from "./python-tools";
import { commandName, result } from "./shared";
import type { ProgramAnalysis, ProgramInvocation, ProgramSemantic } from "./types";
import { analyzeUvProgram } from "./uv";

export type {
  ProgramAnalysis,
  ProgramCwdChange,
  ProgramInvocation,
  ProgramPath,
  ProgramPathBase,
  ProgramSemantic,
} from "./types";

export {
  analyzeCoreutilsProgram,
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

export function analyzeProgramInvocation(invocation: ProgramInvocation): ProgramAnalysis | undefined {
  const name = commandName(invocation.executable).toLowerCase();
  if (isCoreutilsProgram(name)) {
    if (invocation.executable.includes("/")) {
      return { kind: "complete", semantic: result("execute", ["execute"], [], { opaque: true }) };
    }
    return analyzeCoreutilsProgram(name, invocation.arguments);
  }
  const analyzer = PROGRAM_ANALYZERS.get(name);
  if (analyzer === undefined) return undefined;
  const semantic = analyzer(name, invocation.arguments);
  if (!invocation.executable.includes("/") || semantic.commandClass === "destroy" || isTrustedSystemGit(invocation.executable, name)) {
    return { kind: "complete", semantic };
  }
  return { kind: "complete", semantic: result("execute", ["execute"], [], { opaque: true, hardBoundary: semantic.hardBoundary }) };
}

export function analyzeProgramCommand(invocation: ProgramInvocation): ProgramSemantic | undefined {
  const analysis = analyzeProgramInvocation(invocation);
  if (analysis === undefined) return undefined;
  if (analysis.kind === "reject") return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  return analysis.semantic;
}
