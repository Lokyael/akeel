// access-gate/gate/plan/builder.ts — 编译器助手（plan 内部）
// 跨目录消费者统一经 ../plan（目录 index）；本文件不承载 plan 类型再导出。

import type { CommandClass, CwdCandidate, Effect } from "../../command-semantics";
import type { SourceSpan } from "../../shell-parse";
import { evidenceKind } from "../decision-code-catalog";
import {
  ANALYSIS_LIMITS,
  type AccessOperation,
  type AccessPlanDraft,
  type CompilationReject,
  type CompilerDecisionCode,
  type CompilerDraftResult,
  type PathAccessOperation,
  type PlanCoverage,
} from "./access-request-types";
import { EFFECT_SET, COMMAND_CLASS_EFFECTS, WRITE_SIDE_EFFECTS } from "../../domain";
import type { PathOperation, PathSource, ToolSurface } from "../../domain";

export function reject(code: CompilerDecisionCode, subject: string, span?: SourceSpan): CompilationReject {
  // 响应分类（shell-form/security-boundary/generic）单一来源在 decision-code-catalog
  // denyResponseKindFor；此处只存 code + evidence，渲染侧按 code 派生（C）。
  const evidence = [{ kind: evidenceKind(code), subject: String(subject).slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength), span }] as const;
  return { kind: "reject", code, evidence };
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
  // 守卫查类语义模型（A）：requires = plan 完整性不变量——destroy/execute 必须带 execute
  //（shell 轴），modify 必须至少一个写面 effect（path 轴写检查）。与 verifier 证明侧同表。
  const requirement = COMMAND_CLASS_EFFECTS[commandClass].requires;
  if (requirement.includes("execute")) result.add("execute");
  if (requirement.includes("write-side") && ![...result].some((effect) => WRITE_SIDE_EFFECTS.includes(effect as Effect))) {
    result.add("write");
  }
  return [...result];
}

export function validateEffects(effects: readonly Effect[], span: SourceSpan): CompilationReject | null {
  for (const effect of effects) {
    if (!EFFECT_SET.has(effect)) return reject("unknown-effect", effect, span);
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
