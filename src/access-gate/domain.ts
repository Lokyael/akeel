// access-gate/domain.ts — 封闭世界领域常量唯一来源
//
// access-gate 的封闭世界枚举（命令类、路径操作、effect、路径来源、决策、工具面）
// 在此定义一次（as-const 数组 → 派生类型 + Set），profile / command-semantics /
// gate / ui 各层统一 import 同源。新增枚举成员 = 单点修改 + 全仓类型 fail-fast，
// 消除六处平行定义的历史漂移。
//
// 导出面契约：每个概念统一导出三形态（VALUES 数组 / SET / TYPE），即使某形态
// 暂无外部消费者（如 EFFECT_VALUES 当前仅内部构建 SET）——本模块是封闭世界
// 注册表而非业务模块，全量导出是公共 API 设计；消费者随需求出现，禁止因"无人用"
// 逐形态私有化（评审结论 2026-08）。
//
// 本模块不 import 任何 access-gate 内部模块（无依赖，避免环）。

// ─── 命令分类 ───
// 5 个互斥类，按风险严格递增：inspect < modify < execute < destroy。
// unknown 为找不到匹配适配器的回退分类。

export const COMMAND_CLASS_VALUES = ["inspect", "modify", "execute", "destroy", "unknown"] as const;
export type CommandClass = (typeof COMMAND_CLASS_VALUES)[number];
export const COMMAND_CLASS_SET: ReadonlySet<CommandClass> = new Set(COMMAND_CLASS_VALUES);

// ─── 路径操作 ───

export const PATH_OPERATION_VALUES = ["read", "list", "search", "write"] as const;
export type PathOperation = (typeof PATH_OPERATION_VALUES)[number];
export const PATH_OPERATION_SET: ReadonlySet<PathOperation> = new Set(PATH_OPERATION_VALUES);

// ─── Effect ───

export const EFFECT_VALUES = ["read", "search", "write", "delete", "permissionChange", "execute", "network", "cwdChange"] as const;
export type Effect = (typeof EFFECT_VALUES)[number];
export const EFFECT_SET: ReadonlySet<Effect> = new Set(EFFECT_VALUES);

// ─── 路径意图来源 ───

export const PATH_SOURCE_VALUES = ["argument", "option", "redirection", "cwd", "wrapper"] as const;
export type PathSource = (typeof PATH_SOURCE_VALUES)[number];
export const PATH_SOURCE_SET: ReadonlySet<PathSource> = new Set(PATH_SOURCE_VALUES);

// ─── 决策（Profile 层） ───

export const DECISION_VALUES = ["allow", "ask", "deny"] as const;
export type ProfileDecision = (typeof DECISION_VALUES)[number];
export const DECISION_SET: ReadonlySet<ProfileDecision> = new Set(DECISION_VALUES);

// ─── 工具面 ───
// Shell surface 与 Direct tool surfaces；Direct 面必须与 TOOL_SCHEMAS 键集一致
//（tool-schemas.ts 以 DirectToolSurface 约束 Record 键）。

const SHELL_SURFACE = "bash" as const;
export const DIRECT_TOOL_SURFACES = ["read", "write", "edit", "find", "grep", "ls"] as const;
export type DirectToolSurface = (typeof DIRECT_TOOL_SURFACES)[number];
export const TOOL_SURFACE_VALUES = [SHELL_SURFACE, ...DIRECT_TOOL_SURFACES] as const;
export type ToolSurface = (typeof TOOL_SURFACE_VALUES)[number];
export const TOOL_SURFACE_SET: ReadonlySet<ToolSurface> = new Set(TOOL_SURFACE_VALUES);
