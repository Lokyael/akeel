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
  let current = realpathSync(cwd);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return realpathSync(cwd);
    current = parent;
  }
}
