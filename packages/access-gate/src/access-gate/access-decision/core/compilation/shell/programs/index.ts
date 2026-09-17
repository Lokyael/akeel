import type { ShellWord } from "../language";
import { analyzeCoreutilsProgram, isCoreutilsProgram } from "./coreutils";
import { analyzeFindProgram, analyzeFindProgramInvocation } from "./find";
import { analyzeGitProgram } from "./git";
import { analyzeHerdrProgram } from "./herdr";
import { analyzeInterpreterProgram, INTERPRETERS } from "./interpreters";
import { analyzePackageManagerProgram, PACKAGE_MANAGERS } from "./package-managers";
import { analyzePythonToolProgram, PYTHON_TOOLS } from "./python-tools";
import { result } from "./shared";
import type { ProgramAnalysis, ProgramInvocation, ProgramSemantic } from "./types";
import { analyzeUvProgram } from "./uv";
import { resolveExecutableIdentity } from "./identity";

export type { ExecutableIdentity } from "./identity";
export { resolveExecutableIdentity } from "./identity";

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

export function isKnownProgram(name: string): boolean {
  return isCoreutilsProgram(name) || PROGRAM_ANALYZERS.has(name);
}

export function analyzeProgramInvocation(invocation: ProgramInvocation): ProgramAnalysis | undefined {
  const identity = resolveExecutableIdentity(invocation.executable, isKnownProgram);

  if (identity.kind === "bare" || identity.kind === "system") {
    if (identity.kind === "system" && identity.name === "rm") {
      return { kind: "complete", semantic: result("destroy", ["delete"], [], { hardBoundary: true }) };
    }
    if (isCoreutilsProgram(identity.name)) {
      return analyzeCoreutilsProgram(identity.name, invocation.arguments);
    }
    const analyzer = PROGRAM_ANALYZERS.get(identity.name);
    if (analyzer !== undefined) {
      return { kind: "complete", semantic: analyzer(identity.name, invocation.arguments) };
    }
    return undefined;
  }

  const basename = identity.kind === "path-form" ? identity.basename.toLowerCase() : identity.name.toLowerCase();
  if (basename === "rm" || (isCoreutilsProgram(basename) && basename === "rm")) {
    return { kind: "complete", semantic: result("destroy", ["delete"], [], { hardBoundary: true }) };
  }
  if (isCoreutilsProgram(basename)) {
    return { kind: "complete", semantic: result("execute", ["execute"], [], { opaque: true }) };
  }
  const analyzer = PROGRAM_ANALYZERS.get(basename);
  if (analyzer === undefined) return undefined;
  const semantic = analyzer(basename, invocation.arguments);
  if (semantic.commandClass === "destroy") {
    return { kind: "complete", semantic };
  }
  return {
    kind: "complete",
    semantic: result("execute", ["execute"], [], { opaque: true, hardBoundary: semantic.hardBoundary }),
  };
}

export function analyzeProgramCommand(invocation: ProgramInvocation): ProgramSemantic | undefined {
  const analysis = analyzeProgramInvocation(invocation);
  if (analysis === undefined) return undefined;
  if (analysis.kind === "reject") return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  return analysis.semantic;
}
