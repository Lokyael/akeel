// access-gate/ui/profile-status.ts — /profile status 完整解析策略文本渲染（footer 安装见 footer-install.ts）

import { displayName } from "../profile/defaults";
import { COMMAND_CLASS_VALUES, PATH_OPERATION_VALUES } from "../domain";
import type { ResolvedProfiles } from "../profile/types";
import type { ProfileState } from "../session/profile-state";

export function profileStatus(state: ProfileState, profiles: ResolvedProfiles): string {
  const profile = state.getProfile();
  const pathRules = profile.pathPolicy.rules.length > 0
    ? profile.pathPolicy.rules.map((rule) => `  ${rule.path}: ${formatDecisions(PATH_OPERATION_VALUES, rule)}`)
    : ["  (none)"];
  return [
    `Profile: ${displayName(state.getName())}`,
    `Description: ${profile.description}`,
    "Shell:",
    `  ${formatDecisions(COMMAND_CLASS_VALUES, profile.shellPolicy)}`,
    "Path defaults:",
    `  ${formatDecisions(PATH_OPERATION_VALUES, profile.pathPolicy.default)}`,
    "Path rules:",
    ...pathRules,
    `Available profiles: ${Object.keys(profiles.profiles).map(displayName).join(", ")}`,
  ].join("\n");
}

function formatDecisions<T extends string>(keys: readonly T[], values: Partial<Record<T, string>>): string {
  return keys.flatMap((key) => values[key] ? [`${key}=${values[key]}`] : []).join(" ");
}
