import type { CommandClass, CwdCandidate, Effect } from "../command-semantics/types";
import type { SourceSpan } from "../shell-parse/types";
import type {
  AccessOperation,
  CompleteAccessPlan,
  PathOperationKind,
  ToolSurface,
} from "./access-request-types";
import {
  ANALYSIS_LIMITS,
  COMMAND_CLASSES,
  COMPILER_VERSION,
  EFFECTS,
  PATH_OPERATIONS,
  REQUEST_BRAND,
  TOOL_SURFACES,
} from "./access-request-types";

const ISSUED_PLANS = new WeakSet<object>();

export function issueAccessPlan<T extends object>(plan: T): T {
  ISSUED_PLANS.add(plan);
  return plan;
}

export function isCompleteAccessPlan(value: unknown): value is CompleteAccessPlan {
  try {
    return validateCompleteAccessPlan(value);
  } catch {
    return false;
  }
}

function validateCompleteAccessPlan(value: unknown): value is CompleteAccessPlan {
  if (!isRecord(value) || (value as Record<PropertyKey, unknown>)[REQUEST_BRAND] !== true || !ISSUED_PLANS.has(value)) return false;
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
  if (!Array.isArray(value.commands) || !Array.isArray(value.paths) || !Array.isArray(value.effects)
    || value.commands.length !== commandOperations.length
    || value.paths.length !== pathOperations.length
    || value.effects.length !== effectOperations.length
    || value.commands.some((operation, index) => operation !== commandOperations[index])
    || value.paths.some((operation, index) => operation !== pathOperations[index])
    || value.effects.some((operation, index) => operation !== effectOperations[index])) return false;
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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
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
