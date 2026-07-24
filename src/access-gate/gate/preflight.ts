import { scanThreats } from "../security/threat-scan";
import { reject, type CompileResult } from "./access-request";

// ── hard command rules ──
// Patterns that are unconditionally blocked regardless of Profile or user approval.
// New patterns can be added inline in HARD_FULL_PATTERNS.

const HARD_FULL_PATTERNS: readonly { match: (command: string) => boolean; id: string }[] = [
  // ── download + pipe to interpreter ──
  { match: (command) => /\bcurl\s+\S+\s*\|.*(?:sh|bash|dash|zsh|python|python3|perl|ruby|lua|node)\b/i.test(command), id: "curl-pipe-interpreter" },
  { match: (command) => /\bwget\s+\S+\s+-O\s*-\s*\|.*(?:sh|bash|dash|zsh|python|python3|perl|ruby|lua|node)\b/i.test(command), id: "wget-pipe-interpreter" },
  // ── download then execute (no pipe) ──
  { match: (command) => /\bcurl\s+\S+\s+-o\s+\S+\s*&&\s*(?:sudo\s+)?(?:sh|bash|\/bin\/bash|\.\/\S+)/i.test(command), id: "curl-download-exec" },
  { match: (command) => /\bwget\s+\S+\s+-O\s+\S+\s*&&\s*(?:sudo\s+)?(?:sh|bash|\/bin\/bash|\.\/\S+)/i.test(command), id: "wget-download-exec" },
  // ── eval on remote content ──
  { match: (command) => /\beval\s+"?\$?\s*\(.*(?:curl|wget)/i.test(command), id: "eval-remote-content" },
];

function hardCommandRule(command: string): string | null {
  return HARD_FULL_PATTERNS.find((pattern) => pattern.match(command))?.id ?? null;
}

// ── preflight orchestrator ──
// Stateless checks that run before shell compilation.
// Each check returns a string id on match, or null.
// Add new checks to PREFLIGHT_CHECKS — the compiler pipeline picks them up automatically.

interface PreflightCheck {
  name: string;
  check: (command: string) => string | null;
  code: "threat" | "hard-command-rule";
}

const PREFLIGHT_CHECKS: readonly PreflightCheck[] = [
  { name: "threat", check: scanThreats, code: "threat" },
  { name: "hard-rule", check: hardCommandRule, code: "hard-command-rule" },
];

export function runPreflight(command: string): CompileResult | null {
  for (const check of PREFLIGHT_CHECKS) {
    const result = check.check(command);
    if (result) return reject(check.code, result);
  }
  return null;
}
