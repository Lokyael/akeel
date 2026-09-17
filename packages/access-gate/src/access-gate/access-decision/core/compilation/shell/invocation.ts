import { scanSimpleShellFlow } from "./flow";
import { analyzeFindProgramInvocation, analyzeProgramInvocation } from "./programs/index";
import {
  INTERPRETERS,
  isInterpreterInspection,
  unsupportedInterpreterOption,
  interpreterScriptPath,
} from "./programs/interpreters";
import type { ProgramCwdChange, ProgramPathBase } from "./programs/index";
import type { ShellWord } from "./language";
import type { ShellCommandStatus } from "./flow";

export type ShellPathRole = "source" | "target";
export type ShellCommandClass = "inspect" | "modify" | "destroy" | "execute" | "unknown";
export type ShellEffect = "read" | "write" | "delete" | "execute" | "cwd-change";

export type ShellPath = Readonly<{
  readonly text: string;
  readonly role: ShellPathRole;
  readonly pathKind?: "home-relative" | "literal";
}>;

export type ShellCommandAnalysis =
  | Readonly<{
      readonly kind: "complete";
      readonly executable: string;
      readonly wrappers: readonly string[];
      readonly commandClass: ShellCommandClass;
      readonly effects: readonly ShellEffect[];
      readonly paths: readonly ShellPath[];
      readonly semantic: ShellCommandSemanticFacts;
    }>
  | Readonly<{
      readonly kind: "reject";
      readonly code: "security-boundary" | "unsupported-syntax" | "dynamic-value";
      readonly anchor: Readonly<{ readonly start: number; readonly end: number }>;
      readonly resourceClass: "security" | "syntax";
    }>;

const inspectionCommands = new Set(["cat", "head", "tail", "grep", "rg", "ls", "od"]);
const modificationCommands = new Set(["mkdir", "touch", "cp", "mv", "ln"]);
const destructionCommands = new Set(["rm", "rmdir", "unlink", "truncate"]);
const executionCommands = new Set([...INTERPRETERS]);
const unsupportedCommandWords = new Set([
  "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "select", "then", "time", "until", "while",
]);
const wrappers = new Set(["env", "timeout", "command", "nohup", "exec"]);

export type ShellCommandSemanticFacts = Readonly<{
  readonly pathBases: readonly ProgramPathBase[];
  readonly pathStarts: readonly number[];
  readonly cwdChanges: readonly ProgramCwdChange[];
  readonly opaquePathAccess: boolean;
  readonly hardBoundary: boolean;
  readonly recursive: boolean;
}>;

function explicitSemanticFacts(value: unknown): ShellCommandSemanticFacts | undefined {
  if (typeof value !== "object" || value === null || !("semantic" in value)) return undefined;
  const semantic = (value as { readonly semantic?: unknown }).semantic;
  return typeof semantic === "object" && semantic !== null ? semantic as ShellCommandSemanticFacts : undefined;
}

export function shellCommandHasOpaquePathAccess(value: unknown): boolean {
  return explicitSemanticFacts(value)?.opaquePathAccess === true;
}

export function shellCommandIsRecursive(value: unknown): boolean {
  return explicitSemanticFacts(value)?.recursive === true;
}

export function shellCommandHasHardBoundary(value: unknown): boolean {
  return explicitSemanticFacts(value)?.hardBoundary === true;
}

export function shellCommandSemanticFacts(value: unknown): ShellCommandSemanticFacts | undefined {
  return explicitSemanticFacts(value);
}

export function shellCommandOutcomes(analysis: ShellCommandAnalysis): readonly ShellCommandStatus[] {
  if (analysis.kind === "reject") return [];
  if (analysis.effects.length === 0 && analysis.executable === "true") return ["success"];
  if (analysis.effects.length === 0 && analysis.executable === "false") return ["failure"];
  return ["success", "failure"];
}

function rejectOperator(word: ShellWord): ShellCommandAnalysis {
  return Object.freeze({
    kind: "reject",
    code: "unsupported-syntax",
    anchor: Object.freeze({ start: word.start, end: word.end }),
    resourceClass: "syntax",
  });
}

function pathFromWord(word: ShellWord, role: ShellPathRole): ShellPath {
  const path: { text: string; role: ShellPathRole; pathKind?: "home-relative" | "literal" } = {
    text: word.text,
    role,
  };
  if (word.pathKind !== undefined) path.pathKind = word.pathKind;
  return Object.freeze(path);
}

function rejectSecurityBoundary(word: ShellWord): ShellCommandAnalysis {
  return Object.freeze({
    kind: "reject",
    code: "security-boundary",
    anchor: Object.freeze({ start: word.start, end: word.end }),
    resourceClass: "security",
  });
}

function addEffect(effects: ShellEffect[], effect: ShellEffect): void {
  if (!effects.includes(effect)) effects.push(effect);
}

function commandName(executable: string): string {
  const separator = executable.lastIndexOf("/");
  return separator < 0 ? executable : executable.slice(separator + 1);
}

function commandClass(executable: string, words: readonly ShellWord[] = []): ShellCommandClass {
  const name = commandName(executable);
  if (name === "npx" && words[0]?.text === "tsx") return "execute";
  if (name === "uv" && words[0]?.text === "run") return "execute";
  if (name === "uv" && (words[0]?.text === "help" ||
    (words.length === 1 && ["--version", "-V", "--help", "-h"].includes(words[0]!.text)))) return "inspect";
  if (isInterpreterInspection(name, words)) return "inspect";
  if (executable.includes("/")) return destructionCommands.has(name) ? "destroy" : "execute";
  if (inspectionCommands.has(name)) return "inspect";
  if (modificationCommands.has(name)) return "modify";
  if (destructionCommands.has(name)) return "destroy";
  if (executionCommands.has(name)) return "execute";
  if (name === "printf" || name === "echo") return "inspect";
  return "unknown";
}

function wrapperOption(
  words: readonly ShellWord[],
  name: string,
  index: number,
): ShellWord | undefined {
  if (name === "env") {
    for (let cursor = index; cursor < words.length; cursor += 1) {
      const value = words[cursor]!;
      if (!value.text.startsWith("-") && !value.text.includes("=")) break;
      if (value.text.startsWith("-") && value.text !== "-i") return value;
      if (value.text.includes("=")) return value;
    }
  }
  if ((name === "command" || name === "exec" || name === "timeout") && words[index]?.text.startsWith("-")) {
    return words[index];
  }
  if (name === "nohup" && words[index]?.text === "--") return words[index];
  if (name === "timeout" && words[index + 1]?.text.startsWith("-")) return words[index + 1];
  return undefined;
}

function wrapperArgumentCount(name: string, words: readonly ShellWord[], index: number): number {
  if (name === "env") {
    let consumed = 0;
    while (index + consumed < words.length) {
      const value = words[index + consumed]!.text;
      if (value.startsWith("-") || value.includes("=")) consumed += 1;
      else break;
    }
    return consumed;
  }
  if (name === "timeout") return index < words.length ? 1 : 0;
  return 0;
}

export function analyzeShellCommand(input: string): ShellCommandAnalysis {
  const scanned = scanSimpleShellFlow(input);
  if (scanned.kind === "reject") return scanned;
  return analyzeShellCommandWords(scanned.words);
}

export function analyzeShellCommandWords(words: readonly ShellWord[]): ShellCommandAnalysis {
  if (words.length === 0) {
    return Object.freeze({
      kind: "reject",
      code: "unsupported-syntax",
      anchor: Object.freeze({ start: 0, end: 0 }),
      resourceClass: "syntax",
    });
  }

  const commandWords: ShellWord[] = [];
  const paths: Array<{ readonly path: ShellPath; readonly start: number; readonly base: ProgramPathBase }> = [];
  const addPath = (path: ShellPath, start: number, base: ProgramPathBase = "invocation-cwd"): void => {
    paths.push({ path, start, base });
  };
  let redirectRole: ShellPathRole | undefined;
  let hasInputRedirection = false;
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex]!;
    if (redirectRole !== undefined) {
      if (word.text === "/dev/null") {
        redirectRole = undefined;
        continue;
      }
      if (redirectRole === "source") hasInputRedirection = true;
      addPath(pathFromWord(word, redirectRole), word.start);
      redirectRole = undefined;
      continue;
    }
    if (word.text === ">" || word.text === ">>" || word.text === "<>") {
      redirectRole = "target";
      continue;
    }
    if (word.text === "<") {
      redirectRole = "source";
      continue;
    }
    const next = words[wordIndex + 1];
    if (
      /^\d+$/u.test(word.text) &&
      word.quote === "bare" &&
      next !== undefined &&
      next.quote === "bare" &&
      (next.text === ">" || next.text === ">>" || next.text === "<" || next.text === "<>") &&
      word.end === next.start
    ) {
      continue;
    }
    commandWords.push(word);
  }
  if (redirectRole !== undefined) {
    const last = words[words.length - 1]!;
    return rejectOperator(last);
  }
  if (commandWords.length === 0) return rejectOperator(words[0]!);
  const firstCommand = commandWords[0]!;
  if (
    /^[A-Za-z_][A-Za-z0-9_]*(?:\+)?=/u.test(firstCommand.text) ||
    unsupportedCommandWords.has(firstCommand.text) ||
    ["builtin", "!", "coproc"].includes(firstCommand.text)
  ) {
    return rejectOperator(firstCommand);
  }

  let index = 0;
  const wrapperNames: string[] = [];
  while (index < commandWords.length && wrappers.has(commandWords[index]!.text)) {
    const wrapper = commandWords[index]!.text;
    const unsupportedOption = wrapperOption(commandWords, wrapper, index + 1);
    if (unsupportedOption !== undefined) return rejectOperator(unsupportedOption);
    wrapperNames.push(wrapper);
    index += 1;
    index += wrapperArgumentCount(wrapper, commandWords, index);
  }
  const executableWord = commandWords[index];
  if (!executableWord) return rejectOperator(commandWords[commandWords.length - 1]!);
  const executable = executableWord.text;
  const executableName = commandName(executable);
  if (executable.includes("/") && wrappers.has(executableName)) return rejectOperator(executableWord);
  if (executable === "eval" || executable === "source" || executable === ".") {
    return rejectSecurityBoundary(executableWord);
  }
  const commandArguments = commandWords.slice(index + 1);
  const scriptOption = unsupportedInterpreterOption(executableName, commandArguments);
  if (scriptOption !== undefined) return rejectSecurityBoundary(scriptOption);
  const scriptPath = interpreterScriptPath(executableName, commandArguments);
  const hasRedirection = words.some((word) =>
    word.quote === "bare" && (word.text === ">" || word.text === ">>" || word.text === "<" || word.text === "<>")
  );
  if (executable === "cd" && (index !== 0 || hasRedirection || commandArguments.length !== 1 || commandArguments[0]!.text.startsWith("-"))) {
    return rejectOperator(commandArguments[0] ?? executableWord);
  }
  const findAnalysis = executableName === "find" ? analyzeFindProgramInvocation(commandArguments) : undefined;
  if (findAnalysis?.kind === "reject") {
    if (findAnalysis.code === "security-boundary") return rejectSecurityBoundary(findAnalysis.word);
    return rejectOperator(findAnalysis.word);
  }
  const effects: ShellEffect[] = [];
  if (hasInputRedirection) addEffect(effects, "read");
  if (scriptPath !== undefined) {
    addPath(pathFromWord(scriptPath, "source"), scriptPath.start);
    addEffect(effects, "read");
  }
  if (executable === "cd") {
    addEffect(effects, "cwd-change");
    addPath(pathFromWord(commandArguments[0]!, "source"), commandArguments[0]!.start);
  }
  const programAnalysis = findAnalysis?.kind === "complete"
    ? { kind: "complete" as const, semantic: findAnalysis.semantic }
    : analyzeProgramInvocation({ executable, arguments: commandArguments });
  if (programAnalysis?.kind === "reject") {
    return programAnalysis.code === "security-boundary"
      ? rejectSecurityBoundary(programAnalysis.word)
      : rejectOperator(programAnalysis.word);
  }
  const programSemantic = programAnalysis?.kind === "complete" ? programAnalysis.semantic : undefined;
  const classification = programSemantic?.commandClass ?? commandClass(executable, commandArguments);
  if (programSemantic !== undefined) {
    for (const effect of programSemantic.effects) addEffect(effects, effect);
    for (const programPath of programSemantic.paths) addPath(programPath.path, programPath.start, programPath.base);
  }
  const opaquePathForm = executable.includes("/") && classification !== "destroy";
  if (!opaquePathForm && inspectionCommands.has(executableName)) addEffect(effects, "read");
  if (classification === "modify") addEffect(effects, "write");
  if (classification === "destroy") addEffect(effects, "delete");
  if (classification === "execute") addEffect(effects, "execute");
  if (paths.some(({ path }) => path.role === "target")) addEffect(effects, "write");
  if ((executableName === "cp" || executableName === "mv" || executableName === "ln" || executableName === "cd") &&
    paths.some(({ path }) => path.role === "source")) {
    addEffect(effects, "read");
  }

  const orderedPaths = paths.slice().sort((left, right) => left.start - right.start);
  const semantic = Object.freeze({
    pathBases: Object.freeze(orderedPaths.map(({ base }) => base)),
    pathStarts: Object.freeze(orderedPaths.map(({ start }) => start)),
    cwdChanges: Object.freeze([...(programSemantic?.cwdChanges ?? [])]),
    opaquePathAccess: programSemantic?.opaque === true || classification === "unknown" ||
      executable.includes("/") && classification !== "destroy" ||
      executableName === "uv" && classification === "execute",
    hardBoundary: programSemantic?.hardBoundary === true,
    recursive: programSemantic?.recursive === true,
  });
  const result = {
    kind: "complete" as const,
    executable,
    wrappers: Object.freeze(wrapperNames),
    commandClass: classification,
    effects: Object.freeze(effects),
    paths: Object.freeze(orderedPaths.map(({ path }) => Object.freeze(path))),
  };
  Object.defineProperty(result, "semantic", {
    value: semantic,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(result) as Extract<ShellCommandAnalysis, { readonly kind: "complete" }>;
}
