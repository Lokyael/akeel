import type { CommandClass, ProfileDecision, PathOperation } from "../domain";

export type { CommandClass, ProfileDecision, PathOperation } from "../domain";

/** 子代理档位名（D-039）：T0 scratch / T1 project。 */
export type SubagentTierName = "scratch" | "project";

export type ShellPolicy = Record<CommandClass, ProfileDecision>;

export type PathDecisions = Partial<Record<PathOperation, ProfileDecision>>;

export interface PathRule extends PathDecisions {
  path: string;
}

export interface PathPolicy {
  default: Record<PathOperation, ProfileDecision>;
  rules: PathRule[];
}

export interface RawProfile {
  description: string;
  extends?: readonly string[];
  shellPolicy?: Partial<ShellPolicy>;
  pathPolicy?: {
    default?: PathDecisions;
    rules?: readonly PathRule[];
  };
}

export interface ResolvedProfile {
  name: string;
  description: string;
  shellPolicy: ShellPolicy;
  pathPolicy: PathPolicy;
}

export interface RawProfiles {
  defaultProfile?: string;
  profiles: Record<string, RawProfile>;
  /** 可选：agent 名→档位名覆盖子代理映射（"*" 回退），优先级 显式 > 内置 > "*"（D-039）。 */
  subagentProfiles?: Record<string, SubagentTierName>;
}

export interface ResolvedProfiles {
  defaultProfile: string;
  profiles: Record<string, ResolvedProfile>;
  subagentProfiles?: Record<string, SubagentTierName>;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
