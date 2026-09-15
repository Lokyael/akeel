import type { ShellWord } from "../language";
import { path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

export type FindProgramAnalysis =
  | Readonly<{ readonly kind: "complete"; readonly semantic: ProgramSemantic }>
  | Readonly<{ readonly kind: "reject"; readonly code: "security-boundary" | "unsupported-syntax"; readonly word: ShellWord }>;

type FindRejection = Extract<FindProgramAnalysis, { readonly kind: "reject" }>;

type ParsedFind = Readonly<{
  readonly paths: readonly ProgramPath[];
  readonly rejection?: FindRejection;
}>;

const valuePredicates: ReadonlyMap<string, "pattern" | "type" | "depth"> = new Map([
  ["-name", "pattern"],
  ["-iname", "pattern"],
  ["-path", "pattern"],
  ["-ipath", "pattern"],
  ["-type", "type"],
  ["-maxdepth", "depth"],
  ["-mindepth", "depth"],
]);

const typeValues = new Set(["b", "c", "d", "f", "l", "p", "s"]);
const dangerousActions = new Set([
  "-exec", "-execdir", "-ok", "-okdir", "-delete", "-fls", "-fprint", "-fprint0", "-fprintf",
]);

function rejection(code: FindRejection["code"], word: ShellWord): FindRejection {
  return Object.freeze({ kind: "reject", code, word });
}

function syntheticCurrentPath(args: readonly ShellWord[]): ShellWord {
  const start = args[0]?.start ?? 0;
  return Object.freeze({ text: ".", start, end: start + 1, quote: "bare" as const });
}

function validValue(kind: "pattern" | "type" | "depth", value: ShellWord | undefined): boolean {
  if (value === undefined || value.text.startsWith("-")) return false;
  if (kind === "pattern") return true;
  if (kind === "type") return typeValues.has(value.text);
  return /^(?:0|[1-9][0-9]*)$/u.test(value.text);
}

function parseFind(args: readonly ShellWord[]): ParsedFind {
  const paths: ProgramPath[] = [];
  let expressionStarted = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]!;
    if (!expressionStarted && !word.text.startsWith("-")) {
      paths.push(path(word, "source"));
      continue;
    }

    expressionStarted = true;
    if (dangerousActions.has(word.text)) {
      return Object.freeze({ paths: Object.freeze(paths), rejection: rejection("security-boundary", word) });
    }

    const valueKind = valuePredicates.get(word.text);
    if (valueKind === undefined) {
      return Object.freeze({ paths: Object.freeze(paths), rejection: rejection("unsupported-syntax", word) });
    }

    const value = args[index + 1];
    if (!validValue(valueKind, value)) {
      return Object.freeze({ paths: Object.freeze(paths), rejection: rejection("unsupported-syntax", word) });
    }
    index += 1;
  }

  if (paths.length === 0) paths.push(path(syntheticCurrentPath(args), "source"));
  return Object.freeze({ paths: Object.freeze(paths) });
}

function analyzeFindInvocation(args: readonly ShellWord[]): FindProgramAnalysis {
  const parsed = parseFind(args);
  if (parsed.rejection !== undefined) return parsed.rejection;
  return Object.freeze({
    kind: "complete" as const,
    semantic: result("inspect", ["read"], parsed.paths, { recursive: true }),
  });
}

export function analyzeFindProgramInvocation(args: readonly ShellWord[]): FindProgramAnalysis {
  return analyzeFindInvocation(args);
}

export function analyzeFindProgram(args: readonly ShellWord[]): ProgramSemantic {
  const analysis = analyzeFindInvocation(args);
  if (analysis.kind === "reject") return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  return analysis.semantic;
}
