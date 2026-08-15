// access-gate/command-semantics — 命令语义公共表面
// 跨目录消费者（gate/compiler 等）经此引用；registry 内部导出（如 buildCommandIndex）仅供测试。

export { analyzeSemantics } from "./registry";
export { analyzeCd, analyzeControlFlow, initialCwd } from "./control-flow";
export type { CdInfo, ControlFlowAnalysis } from "./control-flow";
export { normalizeCommand } from "./normalize";
export { LANGUAGE_RUNTIMES, HARD_RULE_INTERPRETERS } from "./interpreter-names";
export { canonicalExecutableName } from "./adapters/shared";
export type {
  CommandSemantics,
  CommandAdapter,
  PathIntent,
  CwdCandidate,
  CwdState,
  NormalizedCommand,
  CommandClass,
  Effect,
  PathOperation,
  PathSource,
} from "./types";
