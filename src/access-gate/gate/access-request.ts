import type { CommandClass, CwdCandidate, Effect } from "../command-semantics/types";
import type { SourceSpan } from "../shell-parse/types";
import { denyResponseKindFor, evidenceKind } from "./guidance-catalog";

export { isRecord } from "../util";
import type {
  AccessOperation,
  AccessPlanDraft,
  CompilationCategory,
  CompilationReject,
  CompilerDecisionCode,
  CompilerDraftResult,
  InvalidCompilationCode,
  PathAccessOperation,
  PlanCoverage,
  SecurityCompilationCode,
  UnsupportedCompilationCode,
  PathOperation,
  PathSource,
  ToolSurface,
} from "./access-request-types";
import {
  ANALYSIS_LIMITS,
  EFFECTS,
} from "./access-request-types";

// Re-export the public surface from the types module（T-046 R8：类型再导出改为通配，删手工墙）。
export { ANALYSIS_LIMITS } from "./access-request-types";
export type * from "./access-request-types";
// evidenceKind 单一来源在 guidance-catalog（T-047 #3），此处 re-export 保持 consumers 兼容。
export { evidenceKind } from "./guidance-catalog";

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

// code → 类别单一来源（T-046 R5）：编译分类由渲染侧的 denyResponseKindFor 推导，
// 两份平行的 code 列表合一；unknown-effect 从 unsupported-form 移入 invalid-request，
// 与 kernel 侧（evaluate-request 的 hardDeny）响应一致。
function compilationCategoryFor(code: CompilerDecisionCode): CompilationCategory {
  const kind = denyResponseKindFor(code);
  if (kind === "security-boundary") return "security-block";
  if (kind === "shell-form") return "unsupported-form";
  return "invalid-request";
}

function cwdCandidates(state: { cwd: string; candidates?: readonly CwdCandidate[] }): readonly CwdCandidate[] {
  return state.candidates ?? [{ cwd: state.cwd, certainty: "exact", branch: "current" }];
}

export function pathOperation(
  operation: PathOperation,
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

export function effectsFor(
  commandClass: CommandClass,
  effects: readonly Effect[],
  intents: readonly { operation: PathOperation }[],
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
// uniqueCandidates 由 createPlanDraft（编译器侧）与 access-plan-verifier（验证侧）共用，
// 保证 plan.cwdCandidates 的去重键与校验键始终一致（单一来源）。

export function uniqueCandidates(values: readonly CwdCandidate[]): readonly CwdCandidate[] {
  const seen = new Set<string>();
  return values.filter((candidate) => {
    const key = `${candidate.branch}\0${candidate.cwd}\0${candidate.certainty}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
