// 子代理档位（D-039）：T0 scratch / T1 project
// 档位差异仅在 Direct 写面（读全盘、shell 轴两档一致）；钳制 = 生效档 min(映射档, 父TIER)。

import { isProjectWritable } from "../path";
import type { ResolvedProfile, SubagentTierName } from "./types";

/** pi-subagents 子代理 env。 */
export const SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD";
export const SUBAGENT_CHILD_AGENT_ENV = "PI_SUBAGENT_CHILD_AGENT";
/** 父会话档位号（"0"|"1"）env 传播；父侧算好，子代理零解析。 */
export const PARENT_TIER_ENV = "PI_KEEL_PARENT_TIER";

const SUBAGENT_TIER_NUMBER: Record<SubagentTierName, 0 | 1> = { scratch: 0, project: 1 };

/** 档位名枚举（validate.ts 引用，单一来源防加档漏改）。 */
export const SUBAGENT_TIER_NAMES: readonly SubagentTierName[] = ["scratch", "project"];

export const SUBAGENT_TIER_PROFILE = {
  // T0 scratch 复用主档 keel-explore（explore 已含 /tmp/pi-work 写规则，D-049）
  scratch: "keel-explore",
  project: "keel-subagent-project",
} as const satisfies Record<SubagentTierName, string>;

/** 内置 agent→档位默认映射；未知 agent 回退 scratch。 */
const DEFAULT_SUBAGENT_TIERS: Readonly<Record<string, SubagentTierName>> = {
  worker: "project",
  delegate: "project",
  reviewer: "project",
  scout: "scratch",
  researcher: "scratch",
  oracle: "scratch",
};

/** 映射解析：显式（subagentProfiles[agent]）> 内置 > "*" 回退 > scratch。 */
export function resolveSubagentTier(
  agent: string | undefined,
  overrides: Readonly<Record<string, SubagentTierName>> | undefined,
): SubagentTierName {
  if (!agent) return "scratch";
  const explicit = overrides?.[agent];
  if (explicit) return explicit;
  const builtin = DEFAULT_SUBAGENT_TIERS[agent];
  if (builtin) return builtin;
  return overrides?.["*"] ?? "scratch";
}

/** 钳制：生效档 = min(映射档, 父TIER)；父TIER 缺失/非法 → fail-closed T0 scratch。 */
export function effectiveSubagentTier(mapped: SubagentTierName, parentTier: string | undefined): SubagentTierName {
  const parent = parentTier === "1" ? 1 : 0;
  return SUBAGENT_TIER_NUMBER[mapped] <= parent ? mapped : "scratch";
}

/** 父档位号：1 = pathPolicy 存在 write=allow 规则覆盖项目代码路径（H2：语义谓词，路径层单一来源）。 */
export function parentTierOf(profile: ResolvedProfile): "0" | "1" {
  return isProjectWritable(profile) ? "1" : "0";
}

/** 子代理进程检测：PI_SUBAGENT_CHILD 存在且非空。 */
export function isSubagentProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  const child = env[SUBAGENT_CHILD_ENV];
  return child !== undefined && child !== "";
}
