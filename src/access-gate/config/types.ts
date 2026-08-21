// access-gate/config/types.ts — 集中用户配置 schema（D-041）
// pi-keel 所有用户配置集中在 ~/.pi/agent/pi-keel/config.yaml；
// 本文件定义其顶层结构（profile 段与命令覆盖段）。

import type { CommandClass, Effect } from "../domain";

/** 单个命令的声明式定义（commands 段，D-024）。 */
export interface CommandDef {
  class: CommandClass;
  effects?: Effect[];
  /** 子命令覆盖。key 是第一个非选项参数值。 */
  subcommands?: Record<string, { class: CommandClass; effects?: Effect[] }>;
}

/** 分类微调规则。pattern 是正则表达式，匹配命令的子命令部分。 */
export interface ReclassifyEntry {
  command: string;
  pattern: string;
  class: CommandClass;
}

/** 命令覆盖段（原 command-overrides.yaml 结构，D-024 语义不变）。 */
export interface CommandOverrides {
  aliases?: Record<string, string>;
  commands?: Record<string, CommandDef>;
  reclassify?: ReclassifyEntry[];
}

/** config.yaml 的顶层结构（唯一用户配置入口）。 */
export interface KeelConfig {
  defaultProfile?: string;
  /** 用户 Profile 定义（不含内置；与内置同名则覆盖，D-018）。 */
  profiles?: Record<string, unknown>;
  /** 子代理档位映射：agent 名→档位名（scratch/project，"*" 回退），D-039。 */
  subagentProfiles?: Record<string, string>;
  /** 命令语义覆盖段（D-024）。 */
  commands?: CommandOverrides;
}
