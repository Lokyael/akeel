import type { CommandClass, CwdCandidate, Effect } from "../command-semantics/types";
import type { SourceSpan } from "../shell-parse/types";
import type { DecisionCode, GateEvidence } from "./decision-types";

export type { DecisionCode, GateEvidence } from "./decision-types";

// ── compiler identity ──
export const COMPILER_VERSION = "access-request/v1";
export const REQUEST_BRAND = Symbol("complete-access-request");

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

// ── closed-world registries ──
export const TOOL_SURFACES = new Set<ToolSurface>(["bash", "read", "write", "edit", "find", "grep", "ls"]);
export const PATH_OPERATIONS = new Set<PathOperationKind>(["read", "list", "search", "write"]);
export const COMMAND_CLASSES = new Set<CommandClass>(["readOnly", "mutating", "dangerous", "unclassified"]);
export const EFFECTS = new Set<Effect>([
  "read",
  "search",
  "write",
  "delete",
  "permissionChange",
  "execute",
  "network",
  "cwdChange",
]);

// ── domain types ──
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
