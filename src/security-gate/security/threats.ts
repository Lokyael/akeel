/**
 * security/threats.ts — Threat injection and data exfiltration detection.
 *
 * THREAT_PATTERNS remain internal; only scanThreats is exported.
 *
 * Detection covers:
 *   - Prompt injection attempts
 *   - Role hijacking
 *   - Data exfiltration via curl/wget
 *   - Secret file reads (credentials, keys)
 *   - SSH backdoor installation
 */

const THREAT_PATTERNS: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i, id: "prompt_injection" },
  { pattern: /you\s+are\s+now\s+/i, id: "role_hijack" },
  { pattern: /do\s+not\s+tell\s+the\s+user/i, id: "deception_hide" },
  { pattern: /system\s+prompt\s+override/i, id: "sys_prompt_override" },
  { pattern: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, id: "disregard_rules" },
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: "exfil_curl" },
  { pattern: /wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: "exfil_wget" },
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i, id: "read_secrets" },
  { pattern: /authorized_keys/i, id: "ssh_backdoor" },
];

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
