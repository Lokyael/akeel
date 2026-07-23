const HARD_FULL_PATTERNS: readonly { match: (command: string) => boolean; id: string }[] = [
  { match: (command) => /\bcurl\s+\S+\s*\|.*(?:sh|bash|dash|python|perl|ruby)/i.test(command), id: "curl-pipe-shell" },
  { match: (command) => /\bwget\s+\S+\s*-O\s*-\s*\|.*(?:sh|bash)/i.test(command), id: "wget-pipe-shell" },
];

export function hardCommandRule(command: string): string | null {
  return HARD_FULL_PATTERNS.find((pattern) => pattern.match(command))?.id ?? null;
}
