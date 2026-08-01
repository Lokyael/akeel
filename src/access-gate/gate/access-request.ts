import type { CommandClass, CwdCandidate, Effect } from "../command-semantics/types";
import type { SourceSpan } from "../shell-parse/types";
import type { DecisionCode, GateEvidence } from "./decision-types";
import type {
  AccessOperation,
  AccessPlanDraft,
  CompilationCategory,
  CompilationReject,
  CompilerDecisionCode,
  CompilerDraftResult,
  CompileResult,
  InvalidCompilationCode,
  PathAccessOperation,
  PlanCoverage,
  SecurityCompilationCode,
  UnsupportedCompilationCode,
  PathOperationKind,
  PathSource,
  ToolSurface,
} from "./access-request-types";
import {
  ANALYSIS_LIMITS,
  EFFECTS,
} from "./access-request-types";

// Re-export the public surface from the types module.
export { ANALYSIS_LIMITS } from "./access-request-types";
export type {
  AccessOperation,
  AccessPlanDraft,
  CommandAccessOperation,
  CompilationCategory,
  CompilationReject,
  CompilerDecisionCode,
  CompilerDraftResult,
  CompileResult,
  CompilerContext,
  CompleteAccessPlan,
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
  ResourceUsage,
  ShellCompilerInput,
  ToolSurface,
} from "./access-request-types";

// ── public api ──

export function reject(code: CompilerDecisionCode, subject: string, span?: SourceSpan): CompilationReject {
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

export function createPlanDraft(
  source: ToolSurface,
  operations: readonly AccessOperation[],
  candidates: readonly CwdCandidate[],
  coverage: PlanCoverage,
  inputLength: number,
  context: { readonly projectRoot: string; readonly stagingDir: string },
): CompilerDraftResult {
  const unique = uniqueCandidates(candidates);
  if (operations.length > ANALYSIS_LIMITS.maxOperations
    || coverage.commandCount > ANALYSIS_LIMITS.maxCommands
    || coverage.cwdCandidateCount > ANALYSIS_LIMITS.maxCwdCandidates
    || candidates.length > ANALYSIS_LIMITS.maxCwdCandidates
    || unique.length > ANALYSIS_LIMITS.maxCwdCandidates
    || inputLength > ANALYSIS_LIMITS.maxInputLength) {
    return reject("resource-limit", "request analysis budget exceeded");
  }
  const draft: AccessPlanDraft = {
    source,
    projectRoot: context.projectRoot,
    stagingDir: context.stagingDir,
    operations,
    cwdCandidates: unique,
    coverage,
    inputLength,
  };
  return { kind: "draft", draft };
}

export function validateInputLength(value: string, subject: string): CompilationReject | null {
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

export function validateEffects(effects: readonly Effect[], span: SourceSpan): CompilationReject | null {
  for (const effect of effects) {
    if (!EFFECTS.has(effect)) return reject("unknown-effect", effect, span);
  }
  return null;
}

// ── internal helpers ──

function uniqueCandidates(values: readonly CwdCandidate[]): readonly CwdCandidate[] {
  const seen = new Set<string>();
  return values.filter((candidate) => {
    const key = `${candidate.branch}\0${candidate.cwd}\0${candidate.certainty}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
