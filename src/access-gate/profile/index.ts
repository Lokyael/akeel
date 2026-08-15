// access-gate/profile — Profile 定义、加载、解析与验证（D-017/D-041）+ 子代理档位（D-039）
// 目录公共表面：Session/扩展入口经此引用，不直接深入实现文件。

export { loadProfiles } from "./load";
export type { ProfileLoadOptions } from "./load";
export { displayName, PROFILE_PREFIX } from "./defaults";
export type { RawProfiles, RawProfile, ResolvedProfiles, ResolvedProfile } from "./types";
// 档位面（D-039）：session/subagent-init 等跨目录消费方经此引用，不深入 tiers 实现文件。
export {
  effectiveSubagentTier,
  isSubagentProcess,
  PARENT_TIER_ENV,
  parentTierOf,
  resolveSubagentTier,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_CHILD_AGENT_ENV,
  SUBAGENT_TIER_NAMES,
  SUBAGENT_TIER_PROFILE,
} from "./tiers";
