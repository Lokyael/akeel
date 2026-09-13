export {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "./authorization/index";
export {
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
  projectCompilationDisplay,
} from "./compilation/index";
export type { AuthorizationVerdict, UnifiedPolicySnapshot } from "./authorization/index";
export type {
  ManagedCall,
  PathEvidencePort,
  ResolvedPathEvidence,
  UnifiedDisplayView,
} from "./compilation/index";
export { projectAdmission, projectShellAdmission } from "./admission";
export {
  createCredentialBoundary,
  directAdmissionHitsCredentialBoundary,
  pathHitsCredentialBoundary,
  shellAdmissionHitsCredentialBoundary,
} from "./credential-boundary";
export type { CredentialBoundary } from "./credential-boundary";
export { compileDirect, isCanonicalReject } from "./canonical";
export { freezePolicySnapshot, evaluateAdmission } from "./policy";
export { projectDisplay, projectShellDisplay } from "./display";
export { renderDecision } from "./render";
export type { PolicySnapshot } from "./policy";
export type { CanonicalReject } from "./canonical";
export type { DirectDisplayView, ShellDisplayOperation, ShellDisplayView } from "./display";
export type { Decision, DirectEditEntry, DirectRequest, DirectSurface, PolicyInput, PolicyMode } from "./types";
export { scanShellWords } from "./shell-language";
export type { ShellPathKind, ShellQuoteMode, ShellWord, ShellWordScan } from "./shell-language";
export { analyzeProgramCommand } from "./compilation/shell/programs/index";
export type {
  ProgramCwdChange,
  ProgramPath,
  ProgramPathBase,
  ProgramSemantic,
} from "./compilation/shell/programs/index";
export { analyzeShellCommand, shellCommandOutcomes } from "./shell-words";
export type {
  ShellCommandAnalysis,
  ShellCommandClass,
  ShellEffect,
  ShellPath,
  ShellPathRole,
} from "./shell-words";
export { resolveExistingPath, resolveShellPath } from "./shell-paths";
export type { ShellPathContext } from "./shell-paths";
export { compileShell, isShellReject } from "./shell-compile";
export type { ShellReject, ShellRequest } from "./shell-compile";
export { evaluateShellAdmission, freezeShellPolicySnapshot } from "./shell-policy";
export type { ShellDecision, ShellPolicyInput, ShellPolicyMode, ShellPolicySnapshot } from "./shell-policy";
export { parseShellFlow, reachableShellCommands, scanSimpleShellFlow, traceShellFlowCwds } from "./shell-flow";
export type {
  ShellCommandStatus,
  ShellCwdState,
  ShellFlow,
  ShellFlowCommand,
  ShellFlowOperator,
  SimpleShellFlow,
} from "./shell-flow";
