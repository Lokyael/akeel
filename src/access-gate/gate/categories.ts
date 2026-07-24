// Gate 管辖分类 — 每个 tool surface 显式声明自己属于哪个分类。
// 分类决定评估路径：filesystem → pathPolicy，shell → shellPolicy+pathPolicy，
// passthrough → gate 不拦截。

export const GATE_CATEGORY_VALUES = ["filesystem", "shell", "passthrough"] as const;

/** Gate 对 tool_call 的管辖分类。 */
export type GateCategory = typeof GATE_CATEGORY_VALUES[number];
