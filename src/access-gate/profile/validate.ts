import type { RawProfile, RawProfiles, ValidationResult } from "./types";

const DECISIONS = new Set(["allow", "ask", "deny"]);
const OPERATIONS = new Set(["read", "list", "search", "write"]);
const PROFILE_KEYS = new Set(["description", "extends", "shellPolicy", "pathPolicy"]);
const ROOT_KEYS = new Set(["defaultProfile", "profiles"]);
const SHELL_KEYS = new Set(["inspect", "modify", "execute", "destroy", "unknown"]);
const PATH_POLICY_KEYS = new Set(["default", "rules"]);
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_PROFILES = 128;
const MAX_RULES = 512;
const MAX_PATTERN_LENGTH = 512;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function fail(error: string): ValidationResult<RawProfiles> {
  return { ok: false, error };
}

function validDecision(value: unknown): boolean {
  return typeof value === "string" && DECISIONS.has(value);
}

function validateDecisionMap(value: unknown, label: string): string | null {
  const object = record(value);
  if (!object) return `${label} must be an object`;
  for (const [key, decision] of Object.entries(object)) {
    if (!OPERATIONS.has(key)) return `${label} has unknown operation '${key}'`;
    if (!validDecision(decision)) return `${label}.${key} has invalid decision`;
  }
  return null;
}

function validateProfile(value: unknown, name: string): string | null {
  const profile = record(value);
  if (!profile) return `profile '${name}' must be an object`;
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
    const shell = record(profile.shellPolicy);
    if (!shell || Object.keys(shell).some((key) => RESERVED_KEYS.has(key) || !SHELL_KEYS.has(key))) {
      return `profile '${name}'.shellPolicy is invalid`;
    }
    for (const key of SHELL_KEYS) {
      if (shell[key] !== undefined && !validDecision(shell[key])) return `profile '${name}'.shellPolicy.${key} is invalid`;
    }
  }

  if (profile.pathPolicy !== undefined) {
    const pathPolicy = record(profile.pathPolicy);
    if (!pathPolicy || Object.keys(pathPolicy).some((key) => RESERVED_KEYS.has(key) || !PATH_POLICY_KEYS.has(key))) {
      return `profile '${name}'.pathPolicy is invalid`;
    }
    if (pathPolicy.default !== undefined) {
      const error = validateDecisionMap(pathPolicy.default, `profile '${name}'.pathPolicy.default`);
      if (error) return error;
    }
    if (pathPolicy.rules !== undefined) {
      if (!Array.isArray(pathPolicy.rules) || pathPolicy.rules.length > MAX_RULES) {
        return `profile '${name}'.pathPolicy.rules is invalid`;
      }
      for (const [index, rawRule] of pathPolicy.rules.entries()) {
        const rule = record(rawRule);
        if (!rule || typeof rule.path !== "string" || rule.path.length === 0 || rule.path.length > MAX_PATTERN_LENGTH) {
          return `profile '${name}'.pathPolicy.rules[${index}] has an invalid path`;
        }
        for (const [key, decision] of Object.entries(rule)) {
          if (key === "path") continue;
          if (!OPERATIONS.has(key)) return `profile '${name}'.pathPolicy.rules[${index}] has unknown operation '${key}'`;
          if (!validDecision(decision)) return `profile '${name}'.pathPolicy.rules[${index}].${key} is invalid`;
        }
      }
    }
  }
  return null;
}

export function validateProfiles(value: unknown): ValidationResult<RawProfiles> {
  const root = record(value);
  if (!root) return fail("profiles config must be an object");
  if (Object.keys(root).some((key) => RESERVED_KEYS.has(key) || !ROOT_KEYS.has(key))) return fail("profiles config has an unknown field");
  const profiles = record(root.profiles);
  if (!profiles || Object.keys(profiles).length === 0 || Object.keys(profiles).length > MAX_PROFILES) return fail("profiles must be a non-empty object");
  for (const [name, profile] of Object.entries(profiles)) {
    if (RESERVED_KEYS.has(name) || name.trim() === "") return fail("profile name is invalid");
    const error = validateProfile(profile, name);
    if (error) return fail(error);
  }
  if (root.defaultProfile !== undefined && (typeof root.defaultProfile !== "string" || !Object.hasOwn(profiles, root.defaultProfile))) {
    return fail("defaultProfile must reference an existing profile");
  }
  return { ok: true, value: structuredClone(value) as RawProfiles };
}
