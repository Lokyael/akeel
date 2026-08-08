/**
 * security/threat-scan.ts — Threat injection and data exfiltration detection.
 *
 * THREAT_PATTERNS remain internal; only scanThreats is exported.
 *
 * Detection covers:
 *   - Prompt injection attempts
 *   - Role hijacking
 *   - Data exfiltration via curl/wget
 *   - Secret file reads (credentials, keys)
 *
 * 输入是 token 级拼接文本（注释已被 lexer 丢弃，不参与匹配；F1）。
 * SSH authorized_keys 后门安装不在此列：写路径由 blocked-paths
 * （~/.ssh 全子树、任意层级 authorized_keys*）硬拒，威胁模式重复覆盖只会误伤
 * 检索/提及该词的命令（F1，gate 无法检索自身 pattern）。
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
];

/**
 * Scan token-level command text for threat patterns (prompt injection / data exfiltration).
 * Returns the first matched threat ID, or null.
 */
export function scanThreats(text: string): string | null {
  for (const { pattern, id } of THREAT_PATTERNS) {
    if (pattern.test(text)) {
      return id;
    }
  }
  return null;
}
