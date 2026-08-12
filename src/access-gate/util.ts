// access-gate/util.ts — 共享运行时工具
// isRecord 由 request-builder 与 profile/validate 共用，消除两份平行实现。

/** 严格 plain object 判定：排除 null、数组与非 Object.prototype 原型（原型链注入防护）。 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}
