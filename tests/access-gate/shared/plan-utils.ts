// 消费者：gate/plan/decision 各目录测试。

import assert from "node:assert/strict";
import type { CompleteAccessPlan, CompileResult } from "../../../src/access-gate/gate/plan";

/** 断言编译器返回 complete 并返回 plan（reject 时直接失败）。 */
export function complete(result: CompileResult): CompleteAccessPlan {
  assert.equal(result.kind, "complete");
  return result.plan;
}

/** 深度冻结对象图（含 Symbol 属性），返回原值。 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    for (const symbol of Object.getOwnPropertySymbols(value)) deepFreeze((value as Record<PropertyKey, unknown>)[symbol]);
    Object.freeze(value);
  }
  return value;
}
