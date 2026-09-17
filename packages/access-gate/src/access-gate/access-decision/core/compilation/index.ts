import {
  exceedsDirectPayloadBudget,
  exceedsPathBudget,
  exceedsShellCommandBudget,
  MAX_DIRECT_EDIT_ENTRIES,
  MAX_SHELL_COMMANDS,
  MAX_SHELL_CWD_STATES,
} from "../limits";
import { analyzeShellCommandWords, shellCommandOutcomes } from "./shell/invocation";
import type { ShellCommandAnalysis, ShellCommandClass, ShellEffect } from "./shell/invocation";
import { parseShellFlow } from "./shell/flow";
import type { ShellFlow } from "./shell/flow";

export { createLinuxPathEvidence } from "./path-evidence";

export type ResolvedPathEvidence = Readonly<{
  readonly candidate: string;
  readonly traversed: readonly string[];
}>;

export type PathEvidencePort = Readonly<{
  readonly resolve: (
    base: string,
    path: string,
    context?: Readonly<{ readonly pathKind?: "home-relative" | "literal"; readonly home?: string }>,
  ) => ResolvedPathEvidence | undefined;
}>;

export type DirectManagedCall = Readonly<{
  readonly surface: "read" | "write" | "edit" | "list" | "search";
  readonly arguments: Readonly<Record<string, unknown>>;
}>;

export type ShellManagedCall = Readonly<{
  readonly surface: "bash";
  readonly arguments: Readonly<{ readonly command: string }>;
}>;

export type ManagedCall = DirectManagedCall | ShellManagedCall;

export type UnifiedCanonicalReject = Readonly<{
  readonly kind: "reject";
  readonly code: "invalid-request" | "resource-limit" | "security-boundary" | "unsupported-syntax" | "dynamic-value";
  readonly anchor: "request" | Readonly<{ readonly start: number; readonly end: number }>;
  readonly resourceClass: "input" | "syntax" | "security";
}>;

type CompileEnvironmentFacts = Readonly<{
  readonly cwd: string;
  readonly home?: string;
  readonly pathEvidence: PathEvidencePort;
}>;

const ENVIRONMENT_ISSUER = Symbol("ENVIRONMENT_ISSUER");

export class CompileEnvironment {
  #facts: CompileEnvironmentFacts;

  private constructor(issuer: symbol, facts: CompileEnvironmentFacts) {
    if (issuer !== ENVIRONMENT_ISSUER) throw new TypeError("invalid compile environment");
    this.#facts = facts;
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: CompileEnvironmentFacts): CompileEnvironment {
    if (issuer !== ENVIRONMENT_ISSUER) throw new TypeError("unauthorized issuance");
    return new CompileEnvironment(ENVIRONMENT_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): CompileEnvironmentFacts | undefined {
    if (issuer !== ENVIRONMENT_ISSUER) return undefined;
    return typeof value === "object" && value !== null && #facts in value
      ? (value as CompileEnvironment).#facts
      : undefined;
  }
}

type DirectCompilationFacts = Readonly<{
  readonly kind: "direct";
  readonly operation: DirectManagedCall["surface"];
  readonly path: ResolvedPathEvidence;
}>;

type ShellCompilationPath = Readonly<{
  readonly role: "source" | "target";
  readonly evidence: ResolvedPathEvidence;
}>;

type ShellCompilationOperation = Readonly<{
  readonly commandClass: ShellCommandClass;
  readonly effects: readonly ShellEffect[];
  readonly paths: readonly ShellCompilationPath[];
  readonly recursive: boolean;
  readonly opaquePathAccess: boolean;
  readonly hardBoundary: boolean;
}>;

type ShellCompilationFacts = Readonly<{
  readonly kind: "shell";
  readonly command: string;
  readonly operations: readonly ShellCompilationOperation[];
}>;

export type CanonicalFacts = DirectCompilationFacts | ShellCompilationFacts;

const COMPILATION_ISSUER = Symbol("COMPILATION_ISSUER");

export class CanonicalCompilation {
  #facts: CanonicalFacts;

  private constructor(issuer: symbol, facts: CanonicalFacts) {
    if (issuer !== COMPILATION_ISSUER) throw new TypeError("invalid canonical compilation");
    this.#facts = facts;
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: CanonicalFacts): CanonicalCompilation {
    if (issuer !== COMPILATION_ISSUER) throw new TypeError("unauthorized issuance");
    return new CanonicalCompilation(COMPILATION_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): CanonicalFacts | undefined {
    if (issuer !== COMPILATION_ISSUER) return undefined;
    return typeof value === "object" && value !== null && #facts in value
      ? (value as CanonicalCompilation).#facts
      : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function validResolvedPath(value: unknown): value is ResolvedPathEvidence {
  return isRecord(value) && isAbsolutePath(value.candidate) && Array.isArray(value.traversed) &&
    value.traversed.every(isAbsolutePath);
}

function reject(code: "invalid-request" | "resource-limit"): UnifiedCanonicalReject {
  return Object.freeze({ kind: "reject", code, anchor: "request", resourceClass: "input" });
}

function rejectShell(
  code: "invalid-request" | "resource-limit",
  end: number,
): UnifiedCanonicalReject {
  return Object.freeze({
    kind: "reject",
    code,
    anchor: Object.freeze({ start: 0, end }),
    resourceClass: "input",
  });
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => typeof key === "string" && allowed.includes(key));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function createCompileEnvironment(input: unknown): CompileEnvironment {
  if (!isRecord(input) || !isAbsolutePath(input.cwd) || !isRecord(input.pathEvidence) ||
    typeof input.pathEvidence.resolve !== "function") {
    throw new TypeError("invalid compile environment");
  }
  if (input.home !== undefined && !isAbsolutePath(input.home)) throw new TypeError("invalid compile environment");
  return CompileEnvironment.issue(ENVIRONMENT_ISSUER, Object.freeze({
    cwd: input.cwd,
    home: input.home as string | undefined,
    pathEvidence: input.pathEvidence as PathEvidencePort,
  }));
}

export function compileManagedCall(
  request: unknown,
  environment: unknown,
): CanonicalCompilation | UnifiedCanonicalReject {
  const compileEnvironment = CompileEnvironment.read(environment, ENVIRONMENT_ISSUER);
  if (!compileEnvironment || !isRecord(request) || !hasExactKeys(request, ["surface", "arguments"]) ||
    !isRecord(request.arguments)) {
    return reject("invalid-request");
  }
  if (request.surface === "bash") return compileShellCall(request.arguments, compileEnvironment);
  if (!["read", "write", "edit", "list", "search"].includes(request.surface as string)) return reject("invalid-request");

  const surface = request.surface as DirectManagedCall["surface"];
  const argumentsValue = request.arguments;
  const argumentKeys = Reflect.ownKeys(argumentsValue);
  const hasPath = argumentKeys.includes("path");
  if (surface === "read") {
    if (!hasAllowedKeys(argumentsValue, ["path"], ["path", "offset", "limit"]) ||
      argumentKeys.includes("offset") && !isPositiveInteger(argumentsValue.offset) ||
      argumentKeys.includes("limit") && !isPositiveInteger(argumentsValue.limit)) {
      return reject("invalid-request");
    }
  } else if (surface === "write") {
    if (!hasExactKeys(argumentsValue, ["path", "content"]) || typeof argumentsValue.content !== "string") {
      return reject("invalid-request");
    }
    if (exceedsDirectPayloadBudget([argumentsValue.content])) return reject("resource-limit");
  } else if (surface === "edit") {
    if (!hasExactKeys(argumentsValue, ["path", "edits"]) || !Array.isArray(argumentsValue.edits) ||
      argumentsValue.edits.length === 0) {
      return reject("invalid-request");
    }
    if (argumentsValue.edits.length > MAX_DIRECT_EDIT_ENTRIES) return reject("resource-limit");
    const editTexts: string[] = [];
    for (const edit of argumentsValue.edits) {
      if (!isRecord(edit) || !hasExactKeys(edit, ["oldText", "newText"]) ||
        typeof edit.oldText !== "string" || edit.oldText.includes("\u0000") ||
        typeof edit.newText !== "string" || edit.newText.includes("\u0000")) {
        return reject("invalid-request");
      }
      editTexts.push(edit.oldText, edit.newText);
    }
    if (exceedsDirectPayloadBudget(editTexts)) return reject("resource-limit");
  } else if (surface === "list") {
    if (!hasExactKeys(argumentsValue, hasPath ? ["path"] : [])) return reject("invalid-request");
  } else if (!hasExactKeys(argumentsValue, hasPath ? ["path", "pattern"] : ["pattern"]) ||
    typeof argumentsValue.pattern !== "string" || argumentsValue.pattern.length === 0 ||
    argumentsValue.pattern.includes("\u0000")) {
    return reject("invalid-request");
  }

  const path = hasPath ? argumentsValue.path : ".";
  if (typeof path !== "string" || path.length === 0 || path.includes("\u0000")) return reject("invalid-request");
  const pathValues = [path, compileEnvironment.cwd];
  if (surface === "search") pathValues.push(argumentsValue.pattern as string);
  if (exceedsPathBudget(pathValues)) return reject("resource-limit");

  const resolved = compileEnvironment.pathEvidence.resolve(compileEnvironment.cwd, path, { pathKind: "literal" });
  if (!validResolvedPath(resolved)) return reject("invalid-request");
  const evidence = Object.freeze({
    candidate: resolved.candidate,
    traversed: Object.freeze([...resolved.traversed]),
  });
  return CanonicalCompilation.issue(COMPILATION_ISSUER, Object.freeze({ kind: "direct", operation: surface, path: evidence }));
}

type CompleteShellAnalysis = Extract<ShellCommandAnalysis, { readonly kind: "complete" }>;
type CompleteShellFlow = Extract<ShellFlow, { readonly kind: "complete" }>;

function compileShellCall(
  argumentsValue: Record<string, unknown>,
  environment: CompileEnvironmentFacts,
): CanonicalCompilation | UnifiedCanonicalReject {
  const argumentKeys = Reflect.ownKeys(argumentsValue);
  if (!hasAllowedKeys(argumentsValue, ["command"], ["command", "timeout"]) ||
    typeof argumentsValue.command !== "string" || argumentsValue.command.length === 0 ||
    argumentsValue.command.includes("\u0000") ||
    argumentKeys.includes("timeout") && !isPositiveNumber(argumentsValue.timeout)) {
    return rejectShell("invalid-request", 0);
  }
  const command = argumentsValue.command;
  if (exceedsShellCommandBudget(command, environment.cwd, environment.home ?? "")) {
    return rejectShell("resource-limit", command.length);
  }
  const flow = parseShellFlow(command);
  if (flow.kind === "reject") return flow;
  if (flow.commands.length > MAX_SHELL_COMMANDS) return rejectShell("resource-limit", command.length);

  const analyses: CompleteShellAnalysis[] = [];
  for (const flowCommand of flow.commands) {
    const analysis = analyzeShellCommandWords(flowCommand.words);
    if (analysis.kind === "reject") return analysis;
    analyses.push(analysis);
  }
  if (environment.home === undefined && flow.commands.some((entry) =>
    entry.words.some((word) => word.pathKind === "home-relative"))) {
    return rejectShell("invalid-request", command.length);
  }

  const operations: ShellCompilationOperation[] = [];
  const seen = new Set<string>();
  const queued = new Set<string>([`0\u0000${environment.cwd}`]);
  const pending = [{ commandIndex: 0, cwd: environment.cwd }];
  while (pending.length > 0) {
    const state = pending.shift()!;
    const key = `${state.commandIndex}\u0000${state.cwd}`;
    if (seen.has(key)) continue;
    if (seen.size >= MAX_SHELL_CWD_STATES) return rejectShell("resource-limit", command.length);
    seen.add(key);

    const analysis = analyses[state.commandIndex]!;
    const operation = compileShellOperation(analysis, state.cwd, environment);
    if (operation === undefined) return rejectShell("invalid-request", command.length);
    operations.push(operation);

    for (const outcome of shellCommandOutcomes(analysis)) {
      const nextIndex = nextReachableCommand(flow, state.commandIndex, outcome);
      if (nextIndex === undefined) continue;
      const nextCwd = outcome === "success" && analysis.executable === "cd"
        ? operation.paths[0]?.evidence.candidate ?? state.cwd
        : state.cwd;
      const nextKey = `${nextIndex}\u0000${nextCwd}`;
      if (seen.has(nextKey) || queued.has(nextKey)) continue;
      if (seen.size + pending.length >= MAX_SHELL_CWD_STATES) return rejectShell("resource-limit", command.length);
      queued.add(nextKey);
      pending.push({ commandIndex: nextIndex, cwd: nextCwd });
    }
  }

  return CanonicalCompilation.issue(COMPILATION_ISSUER, Object.freeze({
    kind: "shell",
    command,
    operations: Object.freeze(operations),
  }));
}

function compileShellOperation(
  analysis: CompleteShellAnalysis,
  invocationCwd: string,
  environment: CompileEnvironmentFacts,
): ShellCompilationOperation | undefined {
  const semantic = analysis.semantic;
  const pathBases = semantic.pathBases;
  if (pathBases.length !== analysis.paths.length) return undefined;

  let commandCwd = invocationCwd;
  const cwdChanges = new Map<number, ResolvedPathEvidence>();
  const cwdTimeline: Array<Readonly<{ readonly start: number; readonly cwd: string }>> = [];
  for (const change of semantic.cwdChanges) {
    const base = change.base === "command-cwd" ? commandCwd : invocationCwd;
    const evidence = resolveEvidence(environment, base, change.path.text, change.path.pathKind);
    if (!evidence) return undefined;
    cwdChanges.set(change.start, evidence);
    commandCwd = evidence.candidate;
    cwdTimeline.push(Object.freeze({ start: change.start, cwd: commandCwd }));
  }

  const pathIntents = analysis.paths;
  const paths: ShellCompilationPath[] = [];
  for (let index = 0; index < pathIntents.length; index += 1) {
    const intent = pathIntents[index]!;
    const start = semantic.pathStarts[index] ?? 0;
    const baseKind = pathBases[index] ?? "invocation-cwd";
    const timelineCwd = start === 0 && intent.text === "."
      ? commandCwd
      : cwdTimeline.reduce((cwd, entry) => entry.start < start ? entry.cwd : cwd, invocationCwd);
    const evidence = cwdChanges.get(start) ?? resolveEvidence(
      environment,
      baseKind === "command-cwd" ? timelineCwd : invocationCwd,
      intent.text,
      intent.pathKind,
    );
    if (!evidence) return undefined;
    paths.push(Object.freeze({ role: intent.role, evidence }));
  }
  return Object.freeze({
    commandClass: analysis.commandClass,
    effects: Object.freeze([...analysis.effects]),
    paths: Object.freeze(paths),
    recursive: semantic.recursive,
    opaquePathAccess: semantic.opaquePathAccess,
    hardBoundary: semantic.hardBoundary,
  });
}

function resolveEvidence(
  environment: CompileEnvironmentFacts,
  base: string,
  path: string,
  pathKind?: "home-relative" | "literal",
): ResolvedPathEvidence | undefined {
  const evidence = environment.pathEvidence.resolve(base, path, { home: environment.home, pathKind });
  if (!validResolvedPath(evidence)) return undefined;
  return Object.freeze({
    candidate: evidence.candidate,
    traversed: Object.freeze([...evidence.traversed]),
  });
}

function nextReachableCommand(
  flow: CompleteShellFlow,
  commandIndex: number,
  status: "success" | "failure",
): number | undefined {
  for (let nextIndex = commandIndex + 1; nextIndex < flow.commands.length; nextIndex += 1) {
    const operator = flow.operators[nextIndex - 1]!;
    if (operator.kind === "sequence" || operator.kind === "and" && status === "success" ||
      operator.kind === "or" && status === "failure") {
      return nextIndex;
    }
  }
  return undefined;
}

export type UnifiedDisplayView =
  | Readonly<{
      readonly kind: "direct";
      readonly operation: DirectManagedCall["surface"];
      readonly path: string;
    }>
  | Readonly<{
      readonly kind: "shell";
      readonly command: string;
      readonly operations: readonly Readonly<{
        readonly commandClass: ShellCommandClass;
        readonly effects: readonly ShellEffect[];
        readonly opaque?: true;
      }>[];
    }>;

export function projectCompilationDisplay(compilation: unknown): UnifiedDisplayView | undefined {
  const facts = CanonicalCompilation.read(compilation, COMPILATION_ISSUER);
  if (!facts) return undefined;
  if (facts.kind === "direct") {
    return Object.freeze({ kind: "direct", operation: facts.operation, path: facts.path.candidate });
  }
  return Object.freeze({
    kind: "shell",
    command: facts.command,
    operations: Object.freeze(facts.operations.map((operation) => Object.freeze({
      commandClass: operation.commandClass,
      effects: operation.effects,
      ...(operation.opaquePathAccess ? { opaque: true as const } : {}),
    }))),
  });
}

export function canonicalCompilationFacts(value: unknown): CanonicalFacts | undefined {
  return CanonicalCompilation.read(value, COMPILATION_ISSUER);
}
