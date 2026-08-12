import type { CwdCandidate } from "../../command-semantics";
import { compileDirectToolDraft } from "./direct-tool-compiler";
import { compileShellDraft } from "./shell-compiler";
import { validateCompleteAccessPlan } from "./access-plan-verifier";
import {
  COMPILER_VERSION,
  REQUEST_BRAND,
} from "./access-request-types";
import {
  isRecord,
  reject,
  type CompilerContext,
  type CompilerDraftResult,
  type CompileResult,
  type DirectToolCompilerInput,
  type ShellCompilerInput,
} from "./request-builder";
import type {
  AccessOperation,
  AccessPlanDraft,
  CompleteAccessPlan,
} from "./access-request-types";

type ToolCompilerInput = CompilerContext & {
  readonly surface: string;
  readonly args: unknown;
};

// The only code that can turn a compiler draft into a Kernel-acceptable plan.
const ISSUED_PLANS = new WeakSet<object>();

export function compileShellCall(input: ShellCompilerInput): CompileResult {
  return finalize(compileShellDraft(input));
}

export function compileDirectToolCall(input: DirectToolCompilerInput): CompileResult {
  return finalize(compileDirectToolDraft(input));
}

export function compileToolCall(input: ToolCompilerInput): CompileResult {
  if (input.surface === "bash") {
    return compileShellCall({
      ...input,
      command: bashCommandFromArgs(input.surface, input.args) ?? "",
    });
  }
  return compileDirectToolCall(input);
}

/**
 * 从 tool 参数中提取 bash 命令字符串。
 * 非 bash surface、参数非 record、或 command 非 string 时返回 undefined。
 * 单一来源：compileToolCall（编译侧，缺省空串）与 evaluate（渲染侧，需要原始文本或 undefined）
 * 共享同一窄化逻辑，避免两处重复。
 */
export function bashCommandFromArgs(surface: string, args: unknown): string | undefined {
  if (surface !== "bash") return undefined;
  const record = isRecord(args) ? args : {};
  return typeof record.command === "string" ? record.command : undefined;
}

export function isCompleteAccessPlan(value: unknown): value is CompleteAccessPlan {
  try {
    return validateCompleteAccessPlan(value, ISSUED_PLANS);
  } catch {
    return false;
  }
}

function finalize(result: CompilerDraftResult): CompileResult {
  if (result.kind === "reject") return result;
  const plan = sealPlan(result.draft);
  if (!validateCompleteAccessPlan(plan, ISSUED_PLANS)) {
    return reject("invalid-tool-input", "compiler produced an invalid access plan");
  }
  return { kind: "complete", plan };
}

function sealPlan(draft: AccessPlanDraft): CompleteAccessPlan {
  const copiedOperations = draft.operations.map(cloneOperation);
  const plan = deepFreeze({
    [REQUEST_BRAND]: true as const,
    source: draft.source,
    projectRoot: draft.projectRoot,
    stagingDir: draft.stagingDir,
    operations: copiedOperations,
    commands: copiedOperations.filter((operation): operation is Extract<AccessOperation, { kind: "command" }> => operation.kind === "command"),
    paths: copiedOperations.filter((operation): operation is Extract<AccessOperation, { kind: "path" }> => operation.kind === "path"),
    cwdCandidates: draft.cwdCandidates.map(cloneCandidate),
    coverage: {
      ...draft.coverage,
      commandSpans: draft.coverage.commandSpans.map(cloneSpan),
      redirectionSpans: draft.coverage.redirectionSpans.map(cloneSpan),
    },
    resourceUsage: {
      inputLength: draft.inputLength,
      commandCount: draft.coverage.commandCount,
      operationCount: draft.operations.length,
      cwdCandidateCount: draft.coverage.cwdCandidateCount,
    },
    compilerVersion: COMPILER_VERSION,
  });
  ISSUED_PLANS.add(plan);
  return plan as CompleteAccessPlan;
}

function cloneSpan(span: { readonly start: number; readonly end: number }): { start: number; end: number } {
  return { start: span.start, end: span.end };
}

function cloneCandidate(candidate: CwdCandidate): CwdCandidate {
  return { cwd: candidate.cwd, certainty: candidate.certainty, branch: candidate.branch };
}

function cloneOperation(operation: AccessOperation): AccessOperation {
  if (operation.kind === "path") {
    return { ...operation, cwdCandidates: operation.cwdCandidates.map(cloneCandidate), span: cloneSpan(operation.span) };
  }
  return { ...operation, effects: [...operation.effects], span: cloneSpan(operation.span) };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    for (const symbol of Object.getOwnPropertySymbols(value)) deepFreeze((value as Record<PropertyKey, unknown>)[symbol]);
    Object.freeze(value);
  }
  return value;
}
