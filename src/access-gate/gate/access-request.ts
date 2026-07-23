import type { CommandClass, CwdCandidate, Effect } from "../command-semantics/types";
import type { SourceSpan } from "../shell-parse/types";
import type { DecisionCode, GateEvidence } from "./decision-types";

export type { DecisionCode, GateEvidence } from "./decision-types";

const COMPILER_VERSION = "access-request/v1";
const REQUEST_BRAND = Symbol("complete-access-request");
const ISSUED_REQUESTS = new WeakSet<object>();
export const ANALYSIS_LIMITS = {
  maxInputLength: 65_536,
  maxCommands: 128,
  maxOperations: 1_024,
  maxCwdCandidates: 256,
  maxEvidenceSubjectLength: 1_024,
  maxArgumentLength: 65_536,
} as const;

const TOOL_SURFACES = new Set<ToolSurface>(["bash", "read", "write", "edit", "find", "grep", "ls"]);
const PATH_OPERATIONS = new Set<PathOperationKind>(["read", "list", "search", "write"]);
const COMMAND_CLASSES = new Set<CommandClass>(["readOnly", "mutating", "dangerous", "unclassified"]);
const EFFECTS = new Set<Effect>([
  "read",
  "search",
  "write",
  "delete",
  "permissionChange",
  "execute",
  "network",
  "cwdChange",
]);

export type ToolSurface = "bash" | "read" | "write" | "edit" | "find" | "grep" | "ls";
export type PathOperationKind = "read" | "list" | "search" | "write";
export type PathSource = "argument" | "option" | "redirection" | "cwd" | "wrapper";

export interface PathAccessOperation {
  readonly kind: "path";
  readonly operation: PathOperationKind;
  readonly input: string;
  readonly cwdCandidates: readonly CwdCandidate[];
  readonly source: PathSource;
  readonly confidence: "exact" | "conservative";
  readonly span: SourceSpan;
}

export interface CommandAccessOperation {
  readonly kind: "command";
  readonly origin: "shell" | "direct";
  readonly commandClass: CommandClass;
  readonly executable: string | null;
  readonly effects: readonly Effect[];
  readonly span: SourceSpan;
}

export interface EffectAccessOperation {
  readonly kind: "effect";
  readonly effect: Effect;
  readonly confidence: "exact" | "conservative";
  readonly span: SourceSpan;
}

export type AccessOperation = PathAccessOperation | CommandAccessOperation | EffectAccessOperation;

export interface RequestCoverage {
  readonly commandSpans: readonly SourceSpan[];
  readonly redirectionSpans: readonly SourceSpan[];
  readonly commandCount: number;
  readonly pathOperationCount: number;
  readonly effectOperationCount: number;
  readonly cwdCandidateCount: number;
}

export interface ResourceUsage {
  readonly inputLength: number;
  readonly commandCount: number;
  readonly operationCount: number;
  readonly cwdCandidateCount: number;
}

export interface CompleteAccessRequest {
  readonly [REQUEST_BRAND]: true;
  readonly source: ToolSurface;
  readonly projectRoot: string;
  readonly stagingDir: string;
  readonly operations: readonly AccessOperation[];
  readonly cwdCandidates: readonly CwdCandidate[];
  readonly coverage: RequestCoverage;
  readonly resourceUsage: ResourceUsage;
  readonly compilerVersion: string;
}

export type CompileResult =
  | { readonly kind: "complete"; readonly request: CompleteAccessRequest }
  | { readonly kind: "reject"; readonly code: DecisionCode; readonly evidence: readonly GateEvidence[] };

export interface CompilerContext {
  readonly cwd: string;
  readonly projectRoot: string;
  readonly stagingDir: string;
}

export interface ShellCompilerInput extends CompilerContext {
  readonly command: string;
}

export interface DirectToolCompilerInput extends CompilerContext {
  readonly surface: string;
  readonly args: unknown;
}

export function reject(code: DecisionCode, subject: string, span?: SourceSpan): CompileResult {
  return {
    kind: "reject",
    code,
    evidence: [{ kind: evidenceKind(code), subject: String(subject).slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength), span }],
  };
}

function evidenceKind(code: DecisionCode): GateEvidence["kind"] {
  if (code === "dynamic-shell" || code === "unsafe-syntax" || code === "uncertain-cwd") return "syntax";
  if (code === "threat") return "threat";
  if (code === "unknown-tool" || code === "invalid-tool-input") return "tool";
  if (code === "unsupported-redirection") return "redirection";
  return "command";
}

export function cwdCandidates(state: { cwd: string; candidates?: readonly CwdCandidate[] }): readonly CwdCandidate[] {
  return state.candidates ?? [{ cwd: state.cwd, certainty: "exact", branch: "current" }];
}

export function pathOperation(
  operation: PathOperationKind,
  input: string,
  state: { cwd: string; candidates?: readonly CwdCandidate[] },
  source: PathSource,
  confidence: "exact" | "conservative",
  span: SourceSpan,
): PathAccessOperation {
  return { kind: "path", operation, input, cwdCandidates: cwdCandidates(state), source, confidence, span };
}

export function createRequest(
  source: ToolSurface,
  operations: readonly AccessOperation[],
  candidates: readonly CwdCandidate[],
  coverage: RequestCoverage,
  inputLength: number,
  context: { readonly projectRoot: string; readonly stagingDir: string },
): CompileResult {
  const unique = uniqueCandidates(candidates);
  if (operations.length > ANALYSIS_LIMITS.maxOperations
    || coverage.commandCount > ANALYSIS_LIMITS.maxCommands
    || coverage.cwdCandidateCount > ANALYSIS_LIMITS.maxCwdCandidates
    || candidates.length > ANALYSIS_LIMITS.maxCwdCandidates
    || unique.length > ANALYSIS_LIMITS.maxCwdCandidates
    || inputLength > ANALYSIS_LIMITS.maxInputLength) {
    return reject("resource-limit", "request analysis budget exceeded");
  }
  const request = deepFreeze({
    [REQUEST_BRAND]: true as const,
    source,
    projectRoot: context.projectRoot,
    stagingDir: context.stagingDir,
    operations: operations.map(cloneOperation),
    cwdCandidates: unique.map(cloneCandidate),
    coverage: {
      ...coverage,
      commandSpans: coverage.commandSpans.map(cloneSpan),
      redirectionSpans: coverage.redirectionSpans.map(cloneSpan),
    },
    resourceUsage: {
      inputLength,
      commandCount: coverage.commandCount,
      operationCount: operations.length,
      cwdCandidateCount: coverage.cwdCandidateCount,
    },
    compilerVersion: COMPILER_VERSION,
  });
  ISSUED_REQUESTS.add(request);
  return { kind: "complete", request: request as CompleteAccessRequest };
}

export function validateInputLength(value: string, subject: string): CompileResult | null {
  return value.length > ANALYSIS_LIMITS.maxArgumentLength
    ? reject("resource-limit", subject)
    : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function isCompleteAccessRequest(value: unknown): value is CompleteAccessRequest {
  try {
    return validateCompleteAccessRequest(value);
  } catch {
    return false;
  }
}

function validateCompleteAccessRequest(value: unknown): value is CompleteAccessRequest {
  if (!isRecord(value) || (value as Record<PropertyKey, unknown>)[REQUEST_BRAND] !== true || !ISSUED_REQUESTS.has(value)) return false;
  if (typeof value.source !== "string" || !TOOL_SURFACES.has(value.source as ToolSurface)
    || typeof value.projectRoot !== "string" || typeof value.stagingDir !== "string"
    || value.compilerVersion !== COMPILER_VERSION) return false;
  if (!Array.isArray(value.operations) || !Array.isArray(value.cwdCandidates)) return false;
  if (!isRecord(value.coverage) || !isRecord(value.resourceUsage)) return false;
  if (!isDeepFrozen(value)) return false;
  if (value.operations.length > ANALYSIS_LIMITS.maxOperations || value.cwdCandidates.length > ANALYSIS_LIMITS.maxCwdCandidates) return false;

  const commandOperations = value.operations.filter((operation) => isRecord(operation) && operation.kind === "command");
  const pathOperations = value.operations.filter((operation) => isRecord(operation) && operation.kind === "path");
  const effectOperations = value.operations.filter((operation) => isRecord(operation) && operation.kind === "effect");
  const coverage = value.coverage as Record<string, unknown>;
  const usage = value.resourceUsage as Record<string, unknown>;
  const coverageCounts = [coverage.commandCount, coverage.pathOperationCount, coverage.effectOperationCount, coverage.cwdCandidateCount];
  const usageCounts = [usage.inputLength, usage.commandCount, usage.operationCount, usage.cwdCandidateCount];
  if (!coverageCounts.every(isNonNegativeInteger) || !usageCounts.every(isNonNegativeInteger)) return false;
  const inputLength = usage.inputLength;
  if (!isNonNegativeInteger(inputLength)) return false;
  if (!Array.isArray(coverage.commandSpans) || !Array.isArray(coverage.redirectionSpans)) return false;
  if (coverage.commandCount !== commandOperations.length || coverage.commandSpans.length !== commandOperations.length) return false;
  if (!coverage.commandSpans.every((span, index) => isSameSpan(span, commandOperations[index]?.span))) return false;
  if (coverage.pathOperationCount !== pathOperations.length || coverage.effectOperationCount !== effectOperations.length) return false;
  const redirectionPaths = pathOperations.filter((operation) => operation.source === "redirection");
  if (coverage.redirectionSpans.length !== redirectionPaths.length
    || !coverage.redirectionSpans.every((span, index) => isSameSpan(span, redirectionPaths[index]?.span))) return false;
  if (coverage.cwdCandidateCount !== pathOperations.reduce((count, operation) => count + (Array.isArray(operation.cwdCandidates) ? operation.cwdCandidates.length : 0), 0)) return false;
  const declaredEffects = commandOperations.flatMap((operation) => Array.isArray(operation.effects) ? operation.effects : []);
  const effectValues = effectOperations.map((operation) => operation.effect);
  if (declaredEffects.length !== effectValues.length || declaredEffects.some((effect, index) => effect !== effectValues[index])) return false;
  const declaredEffectSpans = commandOperations.flatMap((operation) => Array.isArray(operation.effects) ? operation.effects.map(() => operation.span) : []);
  if (!effectOperations.every((operation, index) => isSameSpan(operation.span, declaredEffectSpans[index]))) return false;
  if (inputLength > ANALYSIS_LIMITS.maxInputLength
    || usage.commandCount !== coverage.commandCount
    || usage.operationCount !== value.operations.length
    || usage.cwdCandidateCount !== coverage.cwdCandidateCount) return false;
  const uniquePathCandidates = uniqueCandidates(pathOperations.flatMap((operation) => operation.cwdCandidates ?? []));
  return value.operations.every(isValidOperation)
    && value.cwdCandidates.every(isCwdCandidate)
    && value.cwdCandidates.length === uniquePathCandidates.length
    && value.cwdCandidates.every((candidate, index) => isSameCandidate(candidate, uniquePathCandidates[index]))
    && coverage.commandSpans.every(isSourceSpan)
    && coverage.redirectionSpans.every(isSourceSpan);
}

export function effectsFor(
  commandClass: CommandClass,
  effects: readonly Effect[],
  intents: readonly { operation: PathOperationKind }[],
  hasRedirection: boolean,
): readonly Effect[] {
  const result = new Set<Effect>(effects);
  for (const intent of intents) result.add(intent.operation === "list" ? "read" : intent.operation);
  if (hasRedirection) result.add("write");
  if (commandClass === "dangerous") result.add("execute");
  if (commandClass === "mutating" && !["write", "delete", "permissionChange"].some((effect) => result.has(effect as Effect))) {
    result.add("write");
  }
  return [...result];
}

export function validateEffects(effects: readonly Effect[], span: SourceSpan): CompileResult | null {
  for (const effect of effects) {
    if (!EFFECTS.has(effect)) return reject("unknown-effect", effect, span);
  }
  return null;
}

function cloneSpan(span: SourceSpan): SourceSpan {
  return { start: span.start, end: span.end };
}

function cloneCandidate(candidate: CwdCandidate): CwdCandidate {
  return { cwd: candidate.cwd, certainty: candidate.certainty, branch: candidate.branch };
}

function cloneOperation(operation: AccessOperation): AccessOperation {
  if (operation.kind === "path") return { ...operation, cwdCandidates: operation.cwdCandidates.map(cloneCandidate), span: cloneSpan(operation.span) };
  if (operation.kind === "command") return { ...operation, effects: [...operation.effects], span: cloneSpan(operation.span) };
  return { ...operation, span: cloneSpan(operation.span) };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    for (const symbol of Object.getOwnPropertySymbols(value)) deepFreeze((value as Record<PropertyKey, unknown>)[symbol]);
    Object.freeze(value);
  }
  return value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (!isDeepFrozen(child, seen)) return false;
  }
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    if (!isDeepFrozen((value as Record<PropertyKey, unknown>)[symbol], seen)) return false;
  }
  return true;
}

function isSameSpan(left: unknown, right: unknown): boolean {
  return isSourceSpan(left) && isSourceSpan(right) && left.start === right.start && left.end === right.end;
}

function isSameCandidate(left: CwdCandidate, right: CwdCandidate): boolean {
  return left.cwd === right.cwd && left.certainty === right.certainty && left.branch === right.branch;
}

function isSourceSpan(value: unknown): value is SourceSpan {
  return isRecord(value)
    && isNonNegativeInteger(value.start)
    && isNonNegativeInteger(value.end)
    && value.end >= value.start;
}

function isCwdCandidate(value: unknown): value is CwdCandidate {
  return isRecord(value)
    && typeof value.cwd === "string"
    && (value.certainty === "exact" || value.certainty === "conservative")
    && typeof value.branch === "string";
}

function isValidOperation(value: unknown): value is AccessOperation {
  if (!isRecord(value) || !isSourceSpan(value.span)) return false;
  if (value.kind === "path") {
    return typeof value.input === "string"
      && value.input.length <= ANALYSIS_LIMITS.maxArgumentLength
      && typeof value.operation === "string"
      && PATH_OPERATIONS.has(value.operation as PathOperationKind)
      && Array.isArray(value.cwdCandidates)
      && value.cwdCandidates.every(isCwdCandidate)
      && (value.source === "argument" || value.source === "option" || value.source === "redirection" || value.source === "cwd" || value.source === "wrapper")
      && (value.confidence === "exact" || value.confidence === "conservative");
  }
  if (value.kind === "command") {
    return (value.origin === "shell" || value.origin === "direct")
      && (value.executable === null || (typeof value.executable === "string" && value.executable.length <= ANALYSIS_LIMITS.maxArgumentLength))
      && typeof value.commandClass === "string"
      && COMMAND_CLASSES.has(value.commandClass as CommandClass)
      && Array.isArray(value.effects)
      && value.effects.every((effect) => typeof effect === "string" && EFFECTS.has(effect as Effect));
  }
  if (value.kind === "effect") {
    return typeof value.effect === "string"
      && EFFECTS.has(value.effect as Effect)
      && (value.confidence === "exact" || value.confidence === "conservative");
  }
  return false;
}

function uniqueCandidates(values: readonly CwdCandidate[]): readonly CwdCandidate[] {
  const seen = new Set<string>();
  return values.filter((candidate) => {
    const key = `${candidate.branch}\0${candidate.cwd}\0${candidate.certainty}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
