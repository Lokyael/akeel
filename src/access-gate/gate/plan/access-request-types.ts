import type { CwdCandidate } from "../../command-semantics";
import type { SourceSpan } from "../../shell-parse";
import type { DecisionCode, GateEvidence } from "../decision-types";
import type { CommandClass, Effect, PathOperation, PathSource, ToolSurface } from "../../domain";

export type { DecisionCode, GateEvidence } from "../decision-types";

// ── compiler identity ──
export const COMPILER_VERSION = "access-plan/v2";
export const REQUEST_BRAND = Symbol("complete-access-plan");

// ── analysis budgets ──
export const ANALYSIS_LIMITS = {
  maxInputLength: 65_536,
  maxCommands: 128,
  maxOperations: 1_024,
  maxCwdCandidates: 256,
  maxEvidenceSubjectLength: 1_024,
  maxArgumentLength: 65_536,
  maxEditEntries: 64,
} as const;

// ── closed-world registries（值同源于 domain.ts） ──
export {
  COMMAND_CLASS_SET as COMMAND_CLASSES,
  EFFECT_SET as EFFECTS,
  PATH_OPERATION_SET as PATH_OPERATIONS,
  TOOL_SURFACE_SET as TOOL_SURFACES,
} from "../../domain";

// ── domain types（类型同源于 domain.ts） ──
export type { CommandClass, Effect, PathOperation, PathSource, ToolSurface } from "../../domain";

export interface PathAccessOperation {
  readonly kind: "path";
  readonly operation: PathOperation;
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

// EffectAccessOperation 已删除：effect 只以 command.effects 承载，
// span 与 command span 相同，verifier 不再需要平行数组对账（D-022 措辞同步）。

export type AccessOperation = PathAccessOperation | CommandAccessOperation;

export interface PlanCoverage {
  readonly commandSpans: readonly SourceSpan[];
  readonly redirectionSpans: readonly SourceSpan[];
  readonly commandCount: number;
  readonly pathOperationCount: number;
  readonly cwdCandidateCount: number;
}

interface ResourceUsage {
  readonly inputLength: number;
  readonly commandCount: number;
  readonly operationCount: number;
  readonly cwdCandidateCount: number;
}

export interface CompleteAccessPlan {
  readonly [REQUEST_BRAND]: true;
  readonly source: ToolSurface;
  readonly projectRoot: string;
  readonly stagingDir: string;
  readonly operations: readonly AccessOperation[];
  readonly commands: readonly CommandAccessOperation[];
  readonly paths: readonly PathAccessOperation[];
  readonly cwdCandidates: readonly CwdCandidate[];
  readonly coverage: PlanCoverage;
  readonly resourceUsage: ResourceUsage;
  readonly compilerVersion: string;
}

export interface AccessPlanDraft {
  readonly source: ToolSurface;
  readonly projectRoot: string;
  readonly stagingDir: string;
  readonly operations: readonly AccessOperation[];
  readonly cwdCandidates: readonly CwdCandidate[];
  readonly coverage: PlanCoverage;
  readonly inputLength: number;
}

export type CompilationCategory = "unsupported-form" | "security-block" | "invalid-request";

export type SecurityCompilationCode =
  | "threat"
  | "hard-command-rule"
  | "destroy-command"
  | "blocked-path"
  | "symlink-escape"
  | "path-unclassifiable";

export type InvalidCompilationCode = "unknown-tool" | "invalid-tool-input" | "resource-limit";
export type CompilerDecisionCode = Exclude<DecisionCode, "path-denied" | "shell-policy-denied" | "approval-required" | "user-denied">;
export type UnsupportedCompilationCode = Exclude<CompilerDecisionCode, SecurityCompilationCode | InvalidCompilationCode>;

export type CompilationReject =
  | { readonly kind: "reject"; readonly category: "security-block"; readonly code: SecurityCompilationCode; readonly evidence: readonly GateEvidence[] }
  | { readonly kind: "reject"; readonly category: "invalid-request"; readonly code: InvalidCompilationCode; readonly evidence: readonly GateEvidence[] }
  | { readonly kind: "reject"; readonly category: "unsupported-form"; readonly code: UnsupportedCompilationCode; readonly evidence: readonly GateEvidence[] };

export type CompilerDraftResult =
  | { readonly kind: "draft"; readonly draft: AccessPlanDraft }
  | CompilationReject;

export type CompileResult =
  | { readonly kind: "complete"; readonly plan: CompleteAccessPlan }
  | CompilationReject;

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
