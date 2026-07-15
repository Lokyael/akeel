/**
 * security-gate/patterns.ts — Threat injection and secret key detection patterns.
 * Command classification has been migrated to command-taxonomy.ts.
 */

// ─── Threat Patterns (prompt injection / exfiltration) ───

export const THREAT_PATTERNS: Array<{ pattern: RegExp; id: string }> = [
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

// ─── Secret Patterns (API keys, tokens, credentials) ───

export const SECRET_PATTERNS: Array<{ pattern: RegExp; id: string; severity: "high" | "medium" }> = [
  { pattern: /\bsk-ant-api\S{10,}\b/, id: "anthropic_api_key", severity: "high" },
  { pattern: /\bsk-or-v1-\S{10,}\b/, id: "openrouter_api_key", severity: "high" },
  { pattern: /\bsk-\S{20,}\b/, id: "openai_api_key", severity: "high" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, id: "aws_access_key", severity: "high" },
  { pattern: /\bghp_\S{10,}\b/, id: "github_personal_token", severity: "high" },
  { pattern: /\bghu_\S{10,}\b/, id: "github_user_token", severity: "high" },
  { pattern: /\bxoxb-\S{10,}\b/, id: "slack_bot_token", severity: "high" },
  { pattern: /\bxapp-\S{10,}\b/, id: "slack_app_token", severity: "high" },
  { pattern: /\bntn_\S{10,}\b/, id: "notion_token", severity: "high" },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\sKEY-----/, id: "private_key_block", severity: "high" },
  { pattern: /\bANTHROPIC_API_KEY\b/, id: "env_anthropic_key", severity: "medium" },
  { pattern: /\bOPENAI_API_KEY\b/, id: "env_openai_key", severity: "medium" },
  { pattern: /\bDATABASE_URL\b/, id: "env_database_url", severity: "medium" },
  { pattern: /\bpassword\s*[=:]\s*\S{6,}\b/i, id: "password_assignment", severity: "medium" },
  { pattern: /\bsecret\s*[=:]\s*\S{6,}\b/i, id: "secret_assignment", severity: "medium" },
  { pattern: /\btoken\s*[=:]\s*\S{10,}\b/i, id: "token_assignment", severity: "medium" },
];
