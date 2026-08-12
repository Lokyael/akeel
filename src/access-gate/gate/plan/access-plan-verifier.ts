import type { CommandClass, CwdCandidate, Effect } from "../../command-semantics";
import type { SourceSpan } from "../../shell-parse";
import type {
  AccessOperation,
  CompleteAccessPlan,
  PathOperation,
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
import { PATH_SOURCE_SET } from "../../domain";
import type { PathSource } from "../../domain";
import { isRecord, uniqueCandidates } from "./request-builder";

export function validateCompleteAccessPlan(
  value: unknown,
  issuedPlans: WeakSet<object>,
): value is CompleteAccessPlan {
  if (!isRecord(value) || (value as Record<PropertyKey, unknown>)[REQUEST_BRAND] !== true || !issuedPlans.has(value)) return false;
  if (typeof value.source !== "string" || !TOOL_SURFACES.has(value.source as ToolSurface)
    || typeof value.projectRoot !== "string" || typeof value.stagingDir !== "string"
    || value.compilerVersion !== COMPILER_VERSION) return false;
  if (!Array.isArray(value.operations) || !Array.isArray(value.cwdCandidates)) return false;
  if (!isRecord(value.coverage) || !isRecord(value.resourceUsage)) return false;
  if (!isDeepFrozen(value)) return false;
  if (value.operations.length > ANALYSIS_LIMITS.maxOperations || value.cwdCandidates.length > ANALYSIS_LIMITS.maxCwdCandidates) return false;

  const commandOperations = value.operations.filter((operation) => isRecord(operation) && operation.kind === "command");
  const pathOperations = value.operations.filter((operation) => isRecord(operation) && operation.kind === "path");
  if (!Array.isArray(value.commands) || !Array.isArray(value.paths)
    || value.commands.length !== commandOperations.length
    || value.paths.length !== pathOperations.length
    || value.commands.some((operation, index) => operation !== commandOperations[index])
    || value.paths.some((operation, index) => operation !== pathOperations[index])) return false;
  const coverage = value.coverage as Record<string, unknown>;
  const usage = value.resourceUsage as Record<string, unknown>;
  const coverageCounts = [coverage.commandCount, coverage.pathOperationCount, coverage.cwdCandidateCount];
  const usageCounts = [usage.inputLength, usage.commandCount, usage.operationCount, usage.cwdCandidateCount];
  const commandCount = coverage.commandCount;
  const cwdCandidateCount = coverage.cwdCandidateCount;
  if (!coverageCounts.every(isNonNegativeInteger) || !usageCounts.every(isNonNegativeInteger)
    || !isNonNegativeInteger(commandCount) || !isNonNegativeInteger(cwdCandidateCount)) return false;
  if (commandCount > ANALYSIS_LIMITS.maxCommands
    || cwdCandidateCount > ANALYSIS_LIMITS.maxCwdCandidates
    || commandCount > value.operations.length) return false;
  const inputLength = usage.inputLength;
  if (!isNonNegativeInteger(inputLength)) return false;
  if (!Array.isArray(coverage.commandSpans) || !Array.isArray(coverage.redirectionSpans)) return false;
  if (coverage.commandCount !== commandOperations.length || coverage.commandSpans.length !== commandOperations.length) return false;
  if (!coverage.commandSpans.every((span, index) => isSameSpan(span, commandOperations[index]?.span))) return false;
  if (coverage.pathOperationCount !== pathOperations.length) return false;
  const redirectionPaths = pathOperations.filter((operation) => operation.source === "redirection");
  if (coverage.redirectionSpans.length !== redirectionPaths.length
    || !coverage.redirectionSpans.every((span, index) => isSameSpan(span, redirectionPaths[index]?.span))) return false;
  if (coverage.cwdCandidateCount !== pathOperations.reduce((count, operation) => count + (Array.isArray(operation.cwdCandidates) ? operation.cwdCandidates.length : 0), 0)) return false;
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
      && PATH_OPERATIONS.has(value.operation as PathOperation)
      && Array.isArray(value.cwdCandidates)
      && value.cwdCandidates.every(isCwdCandidate)
      && PATH_SOURCE_SET.has(value.source as PathSource)
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
  return false;
}

