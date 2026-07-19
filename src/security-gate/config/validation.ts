/**
 * config/validation.ts — Configuration validation and cloning.
 */

import type { PermissionAction, SecurityConfig, SecurityLevel } from "../types";

const LEVELS: SecurityLevel[] = ["strict", "standard", "permissive"];
const ACTIONS: PermissionAction[] = ["allow", "deny", "ask"];
const MAX_RULES = 512;
const MAX_PATTERN_LENGTH = 512;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validAction(value: unknown): value is PermissionAction {
  return typeof value === "string" && ACTIONS.includes(value as PermissionAction);
}

function validPatternMap(value: unknown): value is Record<string, PermissionAction> {
  const record = objectRecord(value);
  if (!record || Object.keys(record).length > MAX_RULES) return false;
  return Object.entries(record).every(([pattern, action]) =>
    !RESERVED_KEYS.has(pattern) && pattern.length <= MAX_PATTERN_LENGTH && validAction(action));
}

/** Validate an untrusted config value. Returns null if invalid. */
export function validateConfig(value: unknown): SecurityConfig | null {
  const root = objectRecord(value);
  if (!root || !LEVELS.includes(root.level as SecurityLevel)) return null;
  const permission = objectRecord(root.permission);
  if (!permission) return null;
  const knownRoot = new Set(["level", "permission"]);
  if (Object.keys(root).some((key) => !knownRoot.has(key) || RESERVED_KEYS.has(key))) return null;

  const permissionKeys = new Set(["*", "path", "hardPath", "read", "write", "edit", "external_directory", "bash"]);
  if (Object.keys(permission).some((key) => !permissionKeys.has(key) || RESERVED_KEYS.has(key))) return null;
  if (!validAction(permission["*"]) || !validPatternMap(permission.path) ||
      !validAction(permission.external_directory) ||
      !validPatternMap(permission.bash)) return null;
  for (const key of ["read", "write", "edit"] as const) {
    const rules = permission[key];
    if (!(validAction(rules) || validPatternMap(rules))) return null;
  }

  return cloneConfig(value as SecurityConfig);
}

/** Deep-clone a SecurityConfig (mutation-safe copy). */
export function cloneConfig(config: SecurityConfig): SecurityConfig {
  return {
    level: config.level,
    permission: {
      "*": config.permission["*"],
      path: { ...config.permission.path },
      hardPath: config.permission.hardPath ? [...config.permission.hardPath] : undefined,
      read: typeof config.permission.read === "string" ? config.permission.read : { ...config.permission.read },
      write: typeof config.permission.write === "string" ? config.permission.write : { ...config.permission.write },
      edit: typeof config.permission.edit === "string" ? config.permission.edit : { ...config.permission.edit },
      external_directory: config.permission.external_directory,
      bash: { ...config.permission.bash },
    },
  };
}
