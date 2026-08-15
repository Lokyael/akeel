// access-gate/gate/plan — 编译器公共表面（唯一入口）
// 跨目录消费者（decision/、gate/index、tests）经此引用，不深入实现文件（AGENTS.md 目录 index 约定）。
// plan 内部文件互相直连（D-022 物理分层）；域词汇（domain / decision-types）不在此再导出，保持单一来源。

export {
  compileToolCall,
  compileShellCall,
  compileDirectToolCall,
  isCompleteAccessPlan,
  hasPlanBrand,
  bashCommandFromArgs,
} from "./compiler-entry";
export { classifyTool } from "./categories";
export type { GateCategory } from "./categories";
export { ANALYSIS_LIMITS } from "./access-request-types";
export type {
  AccessOperation,
  CommandAccessOperation,
  PathAccessOperation,
  CompleteAccessPlan,
  AccessPlanDraft,
  PlanCoverage,
  CompilerDecisionCode,
  CompilationReject,
  CompilerDraftResult,
  CompileResult,
  CompilerContext,
  ShellCompilerInput,
  DirectToolCompilerInput,
} from "./access-request-types";
