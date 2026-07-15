/**
 * security-gate/detection.ts — Threat/secret scanning and shell-write bypass detection.
 */

import { findRule, splitCommand } from "./command-taxonomy";
import { THREAT_PATTERNS, SECRET_PATTERNS } from "./patterns";
import { wildcardMatch } from "./rules";

// ─── Threat Scanning ───

/**
 * Scan command for threat patterns (prompt injection / data exfiltration).
 * Returns the first matched threat ID, or null.
 */
export function scanThreats(command: string): string | null {
  for (const { pattern, id } of THREAT_PATTERNS) {
    if (pattern.test(command)) {
      return id;
    }
  }
  return null;
}

// ─── Secret Scanning ───

/**
 * Scan command for secret patterns (API keys, tokens, credentials).
 * Returns all matched secret IDs (warning only — may be false positives).
 */
export function scanSecrets(command: string): string[] {
  const found: string[] = [];
  for (const { pattern, id } of SECRET_PATTERNS) {
    if (pattern.test(command)) {
      found.push(id);
    }
  }
  return found;
}

// ─── Shell File-Write Bypass Detection ───

/**
 * Check if a shell command writes to a protected path via redirect,
 * sed -i, cp, mv, tee, etc. Uses taxonomy shell-write rules for
 * detection and path extraction.
 *
 * Returns violation details, or null if safe (or command not a shell-write).
 */
export function detectShellFileWrite(
  command: string,
  protectedPaths: Record<string, string>,
): { path: string; pattern: string; method: string } | null {
  // Check segments for shell-write commands (sed -i, cp, tee, etc)
  const segments = splitCommand(command);
  for (const seg of segments) {
    const rule = findRule(seg);
    if (!rule || rule.category !== "shell-write" || !rule.extractPath) continue;
    const targetPath = rule.extractPath(seg);
    if (!targetPath) continue;
    for (const [pattern, action] of Object.entries(protectedPaths)) {
      if (action === "deny" && wildcardMatch(pattern, targetPath)) {
        return { path: targetPath, pattern, method: rule.id };
      }
    }
  }
  return null;
}
