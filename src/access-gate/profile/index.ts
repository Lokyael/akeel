// access-gate/profile — Profile 定义、加载、解析与验证（D-017/D-041）
// 目录公共表面：Session/扩展入口经此引用，不直接深入实现文件。

export { loadProfiles } from "./load";
export type { ProfileLoadOptions } from "./load";
export { displayName, PROFILE_PREFIX } from "./defaults";
export type { RawProfiles, RawProfile, ResolvedProfiles, ResolvedProfile } from "./types";
