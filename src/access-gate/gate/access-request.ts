import type { CommandClass, CwdCandidate, Effect } from "../command-semantics/types";
import type { SourceSpan } from "../shell-parse/types";
import type { DecisionCode, GateEvidence } from "./decision-types";
import type {
  AccessOperation,
  CompleteAccessPlan,
  CompleteAccessRequest,
  CompilationCategory,
  CompilationReject,
  CompilerDecisionCode,
  CompileResult,
  InvalidCompilationCode,
  PathAccessOperation,
  PlanCoverage,
  SecurityCompilationCode,
  UnsupportedCompilationCode,
  PathOperationKind,
  PathSource,
  RequestCoverage,
  ToolSurface,
} from "./access-request-types";
import { issueAccessPlan, isCompleteAccessPlan } from "./access-plan-verifier";
import {
  ANALYSIS_LIMITS,
  COMPILER_VERSION,
  EFFECTS,
  REQUEST_BRAND,
} from "./access-request-types";

// Re-export the public surface from the types module.
export { ANALYSIS_LIMITS } from "./access-request-types";
export type {
  AccessOperation,
  CommandAccessOperation,
  CompilationCategory,
  CompilationReject,
  CompilerDecisionCode,
  CompileResult,
  CompilerContext,
  CompleteAccessPlan,
  CompleteAccessRequest,
  DecisionCode,
  DirectToolCompilerInput,
  EffectAccessOperation,
  GateEvidence,
  InvalidCompilationCode,
  PlanCoverage,
  SecurityCompilationCode,
  UnsupportedCompilationCode,
  PathAccessOperation,
  PathOperationKind,
  PathSource,
  RequestCoverage,
  ResourceUsage,
  ShellCompilerInput,
  ToolSurface,
} from "./access-request-types";

// ── public api ──

export function reject(code: CompilerDecisionCode, subject: string, span?: SourceSpan): CompileResult {
  const category = compilationCategoryFor(code);
  const evidence = [{ kind: evidenceKind(code), subject: String(subject).slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength), span }] as const;
  if (category === "security-block") {
    return { kind: "reject", category, code: code as SecurityCompilationCode, evidence };
  }
  if (category === "invalid-request") {
    return { kind: "reject", category, code: code as InvalidCompilationCode, evidence };
  }
  return { kind: "reject", category, code: code as UnsupportedCompilationCode, evidence };
}

export function compilationCategoryFor(code: CompilerDecisionCode): CompilationCategory {
  if (code === "threat" || code === "hard-command-rule" || code === "destroy-command"
    || code === "blocked-path" || code === "symlink-escape" || code === "path-unclassifiable") {
    return "security-block";
  }
  if (code === "unknown-tool" || code === "invalid-tool-input" || code === "resource-limit") {
    return "invalid-request";
  }
  return "unsupported-form";
}

export function evidenceKind(code: DecisionCode): GateEvidence["kind"] {
  if (code === "dynamic-shell" || code === "unsafe-syntax" || code === "uncertain-cwd") return "syntax";
  if (code === "threat") return "threat";
  if (code === "unknown-tool" || code === "invalid-tool-input") return "tool";
  if (code === "unsupported-redirection") return "redirection";
  if (code === "blocked-path" || code === "symlink-escape" || code === "path-unclassifiable" || code === "path-denied") return "path";
  if (code === "destroy-command" || code === "hard-command-rule" || code === "shell-policy-denied" || code === "opaque-command") return "command";
  if (code === "resource-limit") return "tool";
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

export function createAccessPlan(
  source: ToolSurface,
  operations: readonly AccessOperation[],
  candidates: readonly CwdCandidate[],
  coverage: PlanCoverage,
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
  const copiedOperations = operations.map(cloneOperation);
  const plan = deepFreeze({
    [REQUEST_BRAND]: true as const,
    source,
    projectRoot: context.projectRoot,
    stagingDir: context.stagingDir,
    operations: copiedOperations,
    commands: copiedOperations.filter((operation): operation is Extract<AccessOperation, { kind: "command" }> => operation.kind === "command"),
    paths: copiedOperations.filter((operation): operation is Extract<AccessOperation, { kind: "path" }> => operation.kind === "path"),
    effects: copiedOperations.filter((operation): operation is Extract<AccessOperation, { kind: "effect" }> => operation.kind === "effect"),
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
  issueAccessPlan(plan);
  return { kind: "complete", plan: plan as CompleteAccessPlan };
}

export const createRequest = createAccessPlan;

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
  return isCompleteAccessPlan(value);
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
  if (commandClass === "destroy" || commandClass === "execute") result.add("execute");
  if (commandClass === "modify" && !["write", "delete", "permissionChange"].some((effect) => result.has(effect as Effect))) {
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

// ── internal helpers ──

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

function uniqueCandidates(values: readonly CwdCandidate[]): readonly CwdCandidate[] {
  const seen = new Set<string>();
  return values.filter((candidate) => {
    const key = `${candidate.branch}\0${candidate.cwd}\0${candidate.certainty}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
