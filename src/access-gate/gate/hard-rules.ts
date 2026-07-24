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

export function hardCommandRule(command: string): string | null {
  return HARD_FULL_PATTERNS.find((pattern) => pattern.match(command))?.id ?? null;
}
