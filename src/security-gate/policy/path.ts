/**
 * policy/path.ts — Path resolution and access decision engine.
 *
 * Owns path resolution and path access decisions.
 * Responsibilities:
 *   1. Resolve an input path against cwd, handling symlinks, homedir, etc.
 *   2. Decide whether a resolved path is allowed/denied/ask for a given operation.
 *
 * Shared dependency: wildcardMatch from shared/wildcard.ts
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import type { PermissionAction, SecurityConfig } from "../types";
import { wildcardMatch } from "../shared/wildcard";

export type PathOperation = "read" | "write" | "edit" | "list" | "search";

export interface ResolvedPath {
  input: string;
  absolute: string;
  relative: string | null;
  insideCwd: boolean;
  existingRealPath: string | null;
  parentRealPath: string | null;
  symlinkEscape: boolean;
  classifiable: boolean;
}

export interface PathDecision {
  action: PermissionAction;
  hard: boolean;
  reason: string;
  pattern?: string;
}

/**
 * Default immutable patterns — used when config.permission.hardPath is not set.
 * Matches strict/standard presets for backward compatibility.
 */
const DEFAULT_HARD_PATH = [
  ".env", ".env.*", "*.env", "*.env.example",
  "*.pem", "*.key", "*.pfx", "*.p12", "*.ppk", "*.cred", "*.credentials",
  ".netrc", ".npmrc", ".pypirc",
  "~/.ssh/*", "~/.aws/*", "~/.gnupg/*", "~/.kube/*", "~/.docker/config.json", "~/.config/gcloud/*",
  "**/id_rsa*", "**/id_ed25519*", "**/id_ecdsa*",
  "/etc/passwd", "/etc/shadow", "**/.git/config",
];

function getHardPath(config: SecurityConfig): string[] {
  return config.permission.hardPath ?? DEFAULT_HARD_PATH;
}

function hasSeparatorPrefix(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function normalizeInput(input: string): string | null {
  if (input.startsWith("@")) input = input.slice(1);
  if (input.includes("\0") || /[\r\n]/.test(input)) return null;
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(input)) return null;
  return input;
}

function nearestExistingAncestor(path: string): { realPath: string; unresolved: string[] } | null {
  let cursor = path;
  const unresolved: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    unresolved.unshift(cursor.slice(parent.length + 1));
    cursor = parent;
  }
  try {
    return { realPath: realpathSync(cursor), unresolved };
  } catch {
    return null;
  }
}

function resolveRealTarget(absolute: string): { existingRealPath: string | null; parentRealPath: string | null; symlinkEscape: boolean; classifiable: boolean } {
  try {
    if (existsSync(absolute)) {
      const real = realpathSync(absolute);
      return {
        existingRealPath: real,
        parentRealPath: realpathSync(dirname(absolute)),
        symlinkEscape: false,
        classifiable: true,
      };
    }

    const ancestor = nearestExistingAncestor(absolute);
    if (!ancestor) return { existingRealPath: null, parentRealPath: null, symlinkEscape: false, classifiable: false };
    const resolvedParent = ancestor.unresolved.length === 0
      ? ancestor.realPath
      : resolve(ancestor.realPath, ...ancestor.unresolved.slice(0, -1));
    const candidateParent = realpathSync(resolvedParent);
    const symlinkEscape = candidateParent !== ancestor.realPath && !hasSeparatorPrefix(ancestor.realPath, candidateParent);
    return { existingRealPath: null, parentRealPath: candidateParent, symlinkEscape, classifiable: true };
  } catch {
    return { existingRealPath: null, parentRealPath: null, symlinkEscape: false, classifiable: false };
  }
}

export function resolveToolPath(cwd: string, input: string): ResolvedPath {
  const normalizedInput = normalizeInput(input);
  if (normalizedInput === null) {
    return { input, absolute: input, relative: null, insideCwd: false, existingRealPath: null, parentRealPath: null, symlinkEscape: false, classifiable: false };
  }

  const canonicalCwd = realpathSync(cwd);
  const absolute = normalize(isAbsolute(normalizedInput) ? normalizedInput : resolve(canonicalCwd, normalizedInput));
  const lexicalRelative = relative(canonicalCwd, absolute);
  const insideCwd = lexicalRelative === "" || (!lexicalRelative.startsWith(".." + sep) && lexicalRelative !== "..");
  const real = resolveRealTarget(absolute);
  const realTarget = real.existingRealPath ?? real.parentRealPath ?? absolute;
  const realOutside = (real.existingRealPath !== null && !hasSeparatorPrefix(canonicalCwd, real.existingRealPath)) ||
    (real.existingRealPath === null && real.parentRealPath !== null && !hasSeparatorPrefix(canonicalCwd, real.parentRealPath));
  const symlinkEscape = real.symlinkEscape || (insideCwd && realOutside);
  const relativePath = lexicalRelative === "" ? "" : lexicalRelative.split(sep).join("/");

  return {
    input,
    absolute,
    relative: relativePath || null,
    insideCwd: insideCwd && hasSeparatorPrefix(canonicalCwd, absolute),
    existingRealPath: real.existingRealPath,
    parentRealPath: real.parentRealPath,
    symlinkEscape,
    classifiable: real.classifiable && realTarget.length > 0,
  };
}

function pathCandidates(path: ResolvedPath): string[] {
  const candidates = [path.absolute, path.relative ?? ""];
  const home = homedir();
  if (path.input.startsWith("~")) candidates.push(path.input);
  if (hasSeparatorPrefix(home, path.absolute)) candidates.push(`~/${relative(home, path.absolute).split(sep).join("/")}`);
  return candidates.filter(Boolean);
}

function matchesImmutable(path: ResolvedPath, config: SecurityConfig): string | null {
  const candidates = pathCandidates(path);
  for (const pattern of getHardPath(config)) {
    if (candidates.some((candidate) => wildcardMatch(pattern, candidate) || wildcardMatch(pattern, candidate.replace(/^.*[\\/]/, "")))) {
      return pattern;
    }
  }
  return null;
}

function configuredAction(config: SecurityConfig, path: ResolvedPath, operation: PathOperation): { action: PermissionAction; pattern?: string } {
  const candidates = pathCandidates(path);
  const pathRules = Object.entries(config.permission.path ?? {});
  const exactRules = pathRules.filter(([pattern]) => pattern !== "*");
  const sshConfigException = operation === "read" && candidates.includes("~/.ssh/config") &&
    exactRules.some(([pattern, action]) => pattern === "~/.ssh/config" && action === "allow");
  if (sshConfigException) return { action: "allow", pattern: "~/.ssh/config" };

  // Immutable path denies and exact safety exceptions precede operation rules.
  for (let i = exactRules.length - 1; i >= 0; i--) {
    const [pattern, action] = exactRules[i];
    if (candidates.some((candidate) => wildcardMatch(pattern, candidate)) && action === "deny") return { action, pattern };
  }
  if (!path.insideCwd) return { action: config.permission.external_directory };

  const toolRules = operation === "read" || operation === "list" || operation === "search"
    ? config.permission.read
    : operation === "write" || operation === "edit"
      ? config.permission[operation]
      : undefined;
  if (typeof toolRules === "string") return { action: toolRules };
  if (toolRules) {
    for (const [pattern, action] of Object.entries(toolRules)) {
      if (candidates.some((candidate) => wildcardMatch(pattern, candidate))) return { action, pattern };
    }
  }

  for (let i = exactRules.length - 1; i >= 0; i--) {
    const [pattern, action] = exactRules[i];
    if (candidates.some((candidate) => wildcardMatch(pattern, candidate))) return { action, pattern };
  }
  const generic = pathRules.find(([pattern]) => pattern === "*");
  return generic ? { action: generic[1], pattern: "*" } : { action: config.permission["*"] };
}

export function decidePath(path: ResolvedPath, config: SecurityConfig, operation: PathOperation): PathDecision {
  const immutable = matchesImmutable(path, config);
  const sshConfigException = operation === "read" && pathCandidates(path).some((candidate) => candidate === "~/.ssh/config");
  if (immutable && !sshConfigException) return { action: "deny", hard: true, reason: "immutable protected path", pattern: immutable };
  if (!path.classifiable) return { action: "deny", hard: true, reason: "path cannot be classified" };
  if (path.symlinkEscape) return { action: "deny", hard: true, reason: "symlink escapes cwd" };

  const configured = configuredAction(config, path, operation);
  if (configured.action === "deny") {
    return { action: "deny", hard: false, reason: "path denied by configuration", pattern: configured.pattern };
  }
  return { action: configured.action, hard: false, reason: path.insideCwd ? "path policy" : "external directory policy", pattern: configured.pattern };
}
