import { scanSimpleShellFlow } from "./shell-flow";
import { analyzeProgramCommand } from "./program-semantics";
import type { ProgramCwdChange, ProgramPathBase } from "./program-semantics/types";
import type { ShellWord } from "./shell-language";
import type { ShellCommandStatus } from "./shell-flow";

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
    }>
  | Readonly<{
      readonly kind: "reject";
      readonly code: "security-boundary" | "unsupported-syntax" | "dynamic-value";
      readonly anchor: Readonly<{ readonly start: number; readonly end: number }>;
      readonly resourceClass: "security" | "syntax";
    }>;

const inspectionCommands = new Set(["cat", "head", "tail", "grep", "rg", "find", "ls", "od"]);
const modificationCommands = new Set(["mkdir", "touch", "cp", "mv"]);
const destructionCommands = new Set(["rm", "rmdir"]);
const executionCommands = new Set(["sh", "bash", "node", "python", "python3", "ruby", "perl", "tsx"]);
const interpreterCommands = new Set([...executionCommands]);
const interpreterInspectionOptions = new Set(["--version", "-v", "--help", "-h"]);
const findActionOptions = new Set(["-exec", "-execdir", "-ok", "-okdir", "-delete", "-fls", "-fprint", "-fprint0", "-fprintf"]);
const unsupportedCommandWords = new Set([
  "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "select", "then", "time", "until", "while",
]);
const wrappers = new Set(["env", "timeout", "command", "nohup", "exec"]);
const modeledCommandNames = new Set([
  ...inspectionCommands,
  ...modificationCommands,
  ...destructionCommands,
  ...executionCommands,
  "echo",
  "printf",
]);
const opaquePathAnalyses = new WeakSet<object>();
const hardBoundaryAnalyses = new WeakSet<object>();
const recursiveAnalyses = new WeakSet<object>();

type ShellCommandSemanticFacts = Readonly<{
  readonly pathBases: readonly ProgramPathBase[];
  readonly pathStarts: readonly number[];
  readonly cwdChanges: readonly ProgramCwdChange[];
}>;

const shellCommandSemanticFactsByAnalysis = new WeakMap<object, ShellCommandSemanticFacts>();

export function shellCommandHasOpaquePathAccess(value: unknown): boolean {
  return typeof value === "object" && value !== null && opaquePathAnalyses.has(value);
}

export function shellCommandIsRecursive(value: unknown): boolean {
  return typeof value === "object" && value !== null && recursiveAnalyses.has(value);
}

export function shellCommandHasHardBoundary(value: unknown): boolean {
  return typeof value === "object" && value !== null && hardBoundaryAnalyses.has(value);
}

export function shellCommandSemanticFacts(value: unknown): ShellCommandSemanticFacts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return shellCommandSemanticFactsByAnalysis.get(value);
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
  if (interpreterCommands.has(name) && words.length === 1 && interpreterInspectionOptions.has(words[0]!.text)) return "inspect";
  if (executable.includes("/")) return destructionCommands.has(name) ? "destroy" : "execute";
  if (inspectionCommands.has(name)) return "inspect";
  if (modificationCommands.has(name)) return "modify";
  if (destructionCommands.has(name)) return "destroy";
  if (executionCommands.has(name)) return "execute";
  if (name === "printf" || name === "echo") return "inspect";
  return "unknown";
}

function interpreterArguments(executable: string, words: readonly ShellWord[]): readonly ShellWord[] | undefined {
  if (interpreterCommands.has(executable)) return words;
  if (executable === "npx" && words[0]?.text === "tsx") return words.slice(1);
  return undefined;
}

function unsupportedInterpreterOption(executable: string, words: readonly ShellWord[]): ShellWord | undefined {
  const argumentsForInterpreter = interpreterArguments(executable, words);
  if (argumentsForInterpreter === undefined) return undefined;
  if (argumentsForInterpreter.length === 1 && interpreterInspectionOptions.has(argumentsForInterpreter[0]!.text)) return undefined;
  for (const word of argumentsForInterpreter) {
    if (word.text === "--") continue;
    if (word.text.startsWith("-")) return word;
  }
  return undefined;
}

function interpreterScriptPath(executable: string, words: readonly ShellWord[]): ShellWord | undefined {
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

function unmodeledPathOption(executable: string, words: readonly ShellWord[]): ShellWord | undefined {
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex]!;
    const shortOptions = word.text.startsWith("-") && !word.text.startsWith("--") ? word.text.slice(1) : "";
    if (executable === "rg" && (word.text === "--follow" || shortOptions.includes("L"))) return word;
    if ((executable === "cp" || executable === "mv") && (shortOptions.includes("L") || word.text === "--dereference")) return word;
    if (executable === "ls" && (shortOptions.includes("L") || word.text === "--dereference")) return word;
    if (executable === "grep" && (shortOptions.includes("R") || word.text === "--dereference-recursive")) return word;
    if (executable === "rg" && (rgValueOptionMissing(word.text, words[wordIndex + 1]) || isUnmodeledRgOption(word.text))) return word;
    if (executable === "grep" && (
      shortOptions.includes("f") || word.text === "-f" || word.text.startsWith("-f") || word.text === "--file" ||
      word.text.startsWith("--file=") || word.text === "--exclude-from" || word.text.startsWith("--exclude-from=") ||
      word.text === "-e" || word.text.startsWith("-e") || word.text === "--regexp" || word.text.startsWith("--regexp=")
    )) {
      return word;
    }
    if (executable === "rg" && (
      shortOptions.includes("f") || shortOptions.includes("e") || word.text === "-f" || word.text.startsWith("-f") || word.text === "--file" || word.text.startsWith("--file=") ||
      word.text === "--ignore-file" || word.text.startsWith("--ignore-file=") || word.text === "--regexp"
    )) {
      return word;
    }
    if (executable === "cat" && (word.text === "--files0-from" || word.text.startsWith("--files0-from="))) {
      return word;
    }
    if (executable === "find" && (word.text === "-files0-from" || word.text.startsWith("-files0-from="))) {
      return word;
    }
    if (executable === "touch" && (
      shortOptions.includes("r") || word.text === "-r" || word.text.startsWith("-r") || word.text === "--reference" || word.text.startsWith("--reference=")
    )) {
      return word;
    }
    if ((executable === "cp" || executable === "mv") &&
      (shortOptions.includes("t") || word.text === "-t" || word.text.startsWith("-t") || word.text === "--target-directory" || word.text.startsWith("--target-directory="))) {
      return word;
    }
    if (executable === "rg" && (word.text === "--pre" || word.text.startsWith("--pre="))) return word;
  }
  return undefined;
}

function isRecursiveCommand(executableName: string, words: readonly ShellWord[]): boolean {
  if (["rg", "find", "cp", "mv"].includes(executableName)) return true;
  if (executableName !== "ls" && executableName !== "grep") return false;
  if (words.some((word) =>
    word.text === "--recursive" || word.text === "--dereference-recursive" || word.text === "--directories=recurse" ||
    (word.text.startsWith("-") && !word.text.startsWith("--") &&
      (word.text.slice(1).includes("r") || word.text.slice(1).includes("R")))
  )) return true;
  return executableName === "grep" && words.some((word, index) =>
    (word.text === "-d" || word.text === "--directories") && words[index + 1]?.text === "recurse"
  );
}

const rgValueOptions = ["--max-columns", "--type-not", "--threads", "--engine", "--replace"] as const;
const rgShortValueOptions = ["M", "T", "j", "r"] as const;

function rgValueOption(value: string): boolean {
  if (rgValueOptions.some((option) => value === option || value.startsWith(`${option}=`))) return true;
  return rgShortValueOptions.some((option) => value === `-${option}` || value.startsWith(`-${option}`) && value.length > 2);
}

function rgValueOptionNeedsSeparateValue(value: string): boolean {
  return rgValueOptions.some((option) => value === option) || rgShortValueOptions.some((option) => value === `-${option}`);
}

function rgValueOptionMissing(value: string, next: ShellWord | undefined): boolean {
  if (rgValueOptionNeedsSeparateValue(value)) return next === undefined;
  return rgValueOptions.some((option) => value === `${option}=`);
}

function isUnmodeledRgOption(value: string): boolean {
  if (!value.startsWith("-") || value === "--") return false;
  if (value.startsWith("--")) {
    if (value.includes("=")) return !rgValueOption(value);
    return ["--glob", "--iglob", "--type", "--type-add", "--files-from", "--files", "--max-count", "--after-context", "--before-context", "--context", "--pre"].includes(value);
  }
  return value.slice(1).includes("g") || value.slice(1).includes("t") || value.slice(1).includes("m") ||
    value.slice(1).includes("A") || value.slice(1).includes("B") || value.slice(1).includes("C") ||
    value.slice(1).includes("S") || value.slice(1).includes("f");
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
  if (executableName === "find") {
    const action = commandArguments.find((word) => findActionOptions.has(word.text));
    if (action !== undefined) return rejectSecurityBoundary(action);
    const unsupportedOption = commandArguments.find((word) => word.text.startsWith("-"));
    if (unsupportedOption !== undefined) return rejectOperator(unsupportedOption);
  }
  const pathOption = unmodeledPathOption(executableName, commandArguments);
  if (pathOption !== undefined) return rejectOperator(pathOption);
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
  const programSemantic = analyzeProgramCommand({ executable, arguments: commandArguments });
  const classification = programSemantic?.commandClass ?? commandClass(executable, commandArguments);
  if (programSemantic !== undefined) {
    for (const effect of programSemantic.effects) addEffect(effects, effect);
    for (const programPath of programSemantic.paths) addPath(programPath.path, programPath.start, programPath.base);
  }
  if (inspectionCommands.has(executableName)) addEffect(effects, "read");
  if (classification === "modify") addEffect(effects, "write");
  if (classification === "destroy") addEffect(effects, "delete");
  if (classification === "execute") addEffect(effects, "execute");
  if (paths.some(({ path }) => path.role === "target")) addEffect(effects, "write");
  if (
    inspectionCommands.has(executableName) ||
    modificationCommands.has(executableName) ||
    destructionCommands.has(executableName)
  ) {
    let optionsEnded = false;
    let hasPathOperand = false;
    let patternSeen = executableName !== "rg" && executableName !== "grep";
    const argumentWords = commandWords.slice(index + 1);
    for (let argumentIndex = 0; argumentIndex < argumentWords.length; argumentIndex += 1) {
      const word = argumentWords[argumentIndex]!;
      if (!optionsEnded && word.text === "--") {
        optionsEnded = true;
        continue;
      }
      if (!optionsEnded && executableName === "rg" && rgValueOption(word.text)) {
        if (rgValueOptionNeedsSeparateValue(word.text)) argumentIndex += 1;
        continue;
      }
      if (!optionsEnded && word.text.startsWith("-") && word.text !== "-") continue;
      if (!patternSeen) {
        patternSeen = true;
        continue;
      }
      hasPathOperand = true;
      addPath(pathFromWord(word, "source"), word.start);
    }
    if ((executableName === "ls" || executableName === "find" || executableName === "rg" || executableName === "grep") && !hasPathOperand) {
      addPath(Object.freeze({ text: ".", role: "source" }), executableWord.end);
    }
  }
  if ((executableName === "cp" || executableName === "mv" || executableName === "cd") &&
    paths.some(({ path }) => path.role === "source")) {
    addEffect(effects, "read");
  }

  const orderedPaths = paths.slice().sort((left, right) => left.start - right.start);
  const result = Object.freeze({
    kind: "complete" as const,
    executable,
    wrappers: Object.freeze(wrapperNames),
    commandClass: classification,
    effects: Object.freeze(effects),
    paths: Object.freeze(orderedPaths.map(({ path }) => Object.freeze(path))),
  });
  shellCommandSemanticFactsByAnalysis.set(result, Object.freeze({
    pathBases: Object.freeze(orderedPaths.map(({ base }) => base)),
    pathStarts: Object.freeze(orderedPaths.map(({ start }) => start)),
    cwdChanges: Object.freeze([...(programSemantic?.cwdChanges ?? [])]),
  }));
  if (programSemantic?.opaque === true || classification === "unknown" ||
    (executable.includes("/") && !modeledCommandNames.has(executableName)) ||
    (executableName === "uv" && classification === "execute")) {
    opaquePathAnalyses.add(result);
  }
  if (programSemantic?.hardBoundary === true) hardBoundaryAnalyses.add(result);
  if (programSemantic?.recursive === true || isRecursiveCommand(executableName, commandWords)) recursiveAnalyses.add(result);
  return result;
}
