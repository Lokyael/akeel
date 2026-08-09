import type { RawProfiles, ValidationResult } from "./types";
import { COMMAND_CLASS_SET, COMMAND_CLASS_VALUES, DECISION_SET, PATH_OPERATION_SET } from "../domain";
import type { CommandClass, ProfileDecision, PathOperation } from "../domain";
import { isRecord } from "../util";
import { SUBAGENT_TIER_NAMES } from "./tiers";

const PROFILE_KEYS = new Set(["description", "extends", "shellPolicy", "pathPolicy"]);
const ROOT_KEYS = new Set(["defaultProfile", "profiles", "subagentProfiles"]);
const PATH_POLICY_KEYS = new Set(["default", "rules"]);
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SUBAGENT_TIER_NAMES_SET = new Set<string>(SUBAGENT_TIER_NAMES);
const MAX_PROFILES = 128;
const MAX_RULES = 512;
const MAX_PATTERN_LENGTH = 512;

function fail(error: string): ValidationResult<RawProfiles> {
  return { ok: false, error };
}

function validDecision(value: unknown): boolean {
  return typeof value === "string" && DECISION_SET.has(value as ProfileDecision);
}

function validateDecisionMap(value: unknown, label: string): string | null {
  if (!isRecord(value)) return `${label} must be an object`;
  for (const [key, decision] of Object.entries(value)) {
    if (!PATH_OPERATION_SET.has(key as PathOperation)) return `${label} has unknown operation '${key}'`;
    if (!validDecision(decision)) return `${label}.${key} has invalid decision`;
  }
  return null;
}

function validateProfile(value: unknown, name: string): string | null {
  if (!isRecord(value)) return `profile '${name}' must be an object`;
  const profile = value;
  if (Object.keys(profile).some((key) => RESERVED_KEYS.has(key) || !PROFILE_KEYS.has(key))) {
    return `profile '${name}' has an unknown field`;
  }
  if (typeof profile.description !== "string" || profile.description.trim() === "") {
    return `profile '${name}' requires a description`;
  }
  if (profile.extends !== undefined && (!Array.isArray(profile.extends) ||
      profile.extends.some((parent) => typeof parent !== "string" || parent.trim() === ""))) {
    return `profile '${name}'.extends must be an array of names`;
  }

  if (profile.shellPolicy !== undefined) {
    if (!isRecord(profile.shellPolicy) || Object.keys(profile.shellPolicy).some((key) => RESERVED_KEYS.has(key) || !COMMAND_CLASS_SET.has(key as CommandClass))) {
      return `profile '${name}'.shellPolicy is invalid`;
    }
    for (const key of COMMAND_CLASS_VALUES) {
      if (profile.shellPolicy[key] !== undefined && !validDecision(profile.shellPolicy[key])) return `profile '${name}'.shellPolicy.${key} is invalid`;
    }
  }

  if (profile.pathPolicy !== undefined) {
    if (!isRecord(profile.pathPolicy) || Object.keys(profile.pathPolicy).some((key) => RESERVED_KEYS.has(key) || !PATH_POLICY_KEYS.has(key))) {
      return `profile '${name}'.pathPolicy is invalid`;
    }
    if (profile.pathPolicy.default !== undefined) {
      const error = validateDecisionMap(profile.pathPolicy.default, `profile '${name}'.pathPolicy.default`);
      if (error) return error;
    }
    if (profile.pathPolicy.rules !== undefined) {
      if (!Array.isArray(profile.pathPolicy.rules) || profile.pathPolicy.rules.length > MAX_RULES) {
        return `profile '${name}'.pathPolicy.rules is invalid`;
      }
      for (const [index, rawRule] of profile.pathPolicy.rules.entries()) {
        if (!isRecord(rawRule) || typeof rawRule.path !== "string" || rawRule.path.length === 0 || rawRule.path.length > MAX_PATTERN_LENGTH) {
          return `profile '${name}'.pathPolicy.rules[${index}] has an invalid path`;
        }
        for (const [key, decision] of Object.entries(rawRule)) {
          if (key === "path") continue;
          if (!PATH_OPERATION_SET.has(key as PathOperation)) return `profile '${name}'.pathPolicy.rules[${index}] has unknown operation '${key}'`;
          if (!validDecision(decision)) return `profile '${name}'.pathPolicy.rules[${index}].${key} is invalid`;
        }
      }
    }
  }
  return null;
}

export function validateProfiles(value: unknown): ValidationResult<RawProfiles> {
  // 校验基于局部 root（isRecord 就地窄化），value 参数保持 unknown：
  // 结构化克隆后单转即可（本函数即 JSON → RawProfiles 类型边界）。
  const root = value;
  if (!isRecord(root)) return fail("profiles config must be an object");
  if (Object.keys(root).some((key) => RESERVED_KEYS.has(key) || !ROOT_KEYS.has(key))) return fail("profiles config has an unknown field");
  if (!isRecord(root.profiles) || Object.keys(root.profiles).length === 0 || Object.keys(root.profiles).length > MAX_PROFILES) return fail("profiles must be a non-empty object");
  for (const [name, profile] of Object.entries(root.profiles)) {
    if (RESERVED_KEYS.has(name) || name.trim() === "") return fail("profile name is invalid");
    const error = validateProfile(profile, name);
    if (error) return fail(error);
  }
  if (root.defaultProfile !== undefined && (typeof root.defaultProfile !== "string" || !Object.hasOwn(root.profiles, root.defaultProfile))) {
    return fail("defaultProfile must reference an existing profile");
  }
  if (root.subagentProfiles !== undefined) {
    if (!isRecord(root.subagentProfiles) || Object.keys(root.subagentProfiles).length === 0) {
      return fail("subagentProfiles must be a non-empty object");
    }
    for (const [agent, tier] of Object.entries(root.subagentProfiles)) {
      if (RESERVED_KEYS.has(agent) || agent.trim() === "") return fail("subagentProfiles agent name is invalid");
      if (typeof tier !== "string" || !SUBAGENT_TIER_NAMES_SET.has(tier)) {
        return fail(`subagentProfiles['${agent}'] must be 'scratch' or 'project'`);
      }
    }
  }
  return { ok: true, value: structuredClone(value) as RawProfiles };
}
