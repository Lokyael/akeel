import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
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

export function findProjectRoot(cwd: string): string {
  // cwd 可能在会话中被删除（session_start 竞态）——回退到字面 cwd，不让启动崩溃
  let current: string;
  try {
    current = realpathSync(cwd);
  } catch {
    return cwd;
  }
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}
