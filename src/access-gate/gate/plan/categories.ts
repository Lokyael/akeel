// Gate 管辖分类 — 每个 tool surface 显式声明自己属于哪个分类。
// 分类决定评估路径：filesystem → pathPolicy，shell → shellPolicy+pathPolicy，
// passthrough → gate 不拦截。

import { TOOL_SURFACE_SET } from "../../domain";
import type { ToolSurface } from "../../domain";

const GATE_CATEGORY_VALUES = ["filesystem", "shell", "passthrough"] as const;

/** Gate 对 tool_call 的管辖分类。 */
export type GateCategory = typeof GATE_CATEGORY_VALUES[number];

/**
 * 将 tool surface 映射到 gate 分类。不在管辖范围内的工具 = passthrough。
 * 管辖面以 domain 的 TOOL_SURFACE_SET 为单一来源；TOOL_SCHEMAS 只做 schema 查询。
 */
export function classifyTool(surface: string): GateCategory {
  if (!TOOL_SURFACE_SET.has(surface as ToolSurface)) return "passthrough";
  return surface === "bash" ? "shell" : "filesystem";
}
