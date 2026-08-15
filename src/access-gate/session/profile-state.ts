// access-gate/session/profile-state.ts — 会话级 Profile 状态（活动名持有）
// findProjectRoot 已提至 project-root.ts（H3）。

import type { ResolvedProfile, ResolvedProfiles } from "../profile/types";

export interface ProfileState {
  getName(): string;
  getProfile(): ResolvedProfile;
  set(name: string): boolean;
  reset(): void;
}

export function createProfileState(profiles: ResolvedProfiles): ProfileState {
  let activeName = profiles.defaultProfile;
  return {
    getName: () => activeName,
    getProfile: () => profiles.profiles[activeName]!,
    set(name) {
      if (!profiles.profiles[name]) return false;
      activeName = name;
      return true;
    },
    reset() {
      activeName = profiles.defaultProfile;
    },
  };
}
