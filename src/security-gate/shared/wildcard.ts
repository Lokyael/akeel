/**
 * shared/wildcard.ts — Glob-style pattern matching.
 *
 * Shared by the policy and pipeline layers.
 * Used by policy/path.ts (path decisions), policy/permission.ts (permission evaluation),
 * and pipeline/bash.ts (bash configuration matching).
 */

/**
 * Glob-to-regex matching. Supports * (any chars) and ? (single char).
 */
export function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(value);
}
