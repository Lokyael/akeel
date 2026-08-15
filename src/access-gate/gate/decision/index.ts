// access-gate/gate/decision — Policy Kernel 公共表面（唯一入口）
// 跨目录消费者（gate/index、tests）经此引用，不深入实现文件（AGENTS.md 目录 index 约定）。
// 决策类型（GateDecision/DecisionCode）在 gate 根 decision-types.ts（共享根），不在此再导出。

export { evaluateToolCall } from "./evaluate";
export { evaluateRequest } from "./evaluate-request";
