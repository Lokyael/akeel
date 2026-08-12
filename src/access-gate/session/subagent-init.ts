// 子代理会话初始化编排（D-039）
// 把"档位如何生效"收敛为两个函数：applySubagentProfile（检测→映射→钳制→生效档）
// 与 publishParentTier（父档位号传播）。env 参数化（默认 process.env）使其可独立测试。

import type { ResolvedProfiles } from "../profile/types";
import type { ProfileState } from "./profile-state";
import {
  effectiveSubagentTier,
  isSubagentProcess,
  PARENT_TIER_ENV,
  parentTierOf,
  resolveSubagentTier,
  SUBAGENT_CHILD_AGENT_ENV,
  SUBAGENT_TIER_PROFILE,
} from "../profile/tiers";

/**
 * 子代理会话初始化：pi-subagents env 检测 → 按 agent 映射档位 + 钳制
 * （生效档 = min(映射档, 父TIER)）。非子代理环境不改动 state。
 */
export function applySubagentProfile(
  profiles: ResolvedProfiles,
  state: ProfileState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isSubagentProcess(env)) return;
  const mapped = resolveSubagentTier(env[SUBAGENT_CHILD_AGENT_ENV], profiles.subagentProfiles);
  const tier = effectiveSubagentTier(mapped, env[PARENT_TIER_ENV]);
  const profileName = SUBAGENT_TIER_PROFILE[tier];
  if (profiles.profiles[profileName]) state.set(profileName);
}

/** 父档位号传播：普通会话=自身档位号；子代理=自身生效档（孙代理继承，链单调）。 */
export function publishParentTier(state: ProfileState, env: NodeJS.ProcessEnv = process.env): void {
  env[PARENT_TIER_ENV] = parentTierOf(state.getProfile());
}
