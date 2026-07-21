// command-semantics/index.ts — 公共入口

export { normalizeCommand } from "./normalize";
export { analyzeControlFlow, analyzeCd, initialCwd } from "./control-flow";
export type {
  CommandClass,
  Effect,
  PathIntent,
  CwdTransition,
  CommandSemantics,
  SemanticContext,
  CommandAdapter,
  NormalizedCommand,
  CwdState,
} from "./types";
