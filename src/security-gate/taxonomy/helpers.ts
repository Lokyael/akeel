/**
 * taxonomy/helpers.ts — Internal helper functions for command extraction and analysis.
 *
 * Extracted from taxonomy/index.ts as part of the taxonomy/ module split.
 * These functions are used by both parser.ts (shell parsing) and index.ts (rule lookup).
 * Not exported from the taxonomy public API.
 */

/**
 * Normalize an executable word: strip quotes and leading backslash.
 */
export function normalizeExecutable(word: string): string {
  const quoted = word.match(/^(['"])(.*)\1$/);
  const unquoted = quoted ? quoted[2] : word;
  return unquoted.startsWith("\\") ? unquoted.slice(1) : unquoted;
}

/**
 * Extract the command name (first executable word) from a shell segment.
 * Strips leading variable assignments, resolves basename, normalizes to lowercase.
 * Returns null if the executable is dynamic ($, ./) or not a recognizable command.
 */
export function cmdName(seg: string): string | null {
  const clean = seg.replace(/^\s*(?:\w+=\S+\s+)*/, "").trim();
  const word = clean.split(/\s+/)[0];
  const executable = normalizeExecutable(word);
  if (!executable || executable.startsWith("./") || executable.startsWith("../") || executable.includes("$")) return null;
  const basename = executable.replace(/^.*[\\/]/, "");
  return /^[a-z][\w.-]*$/i.test(basename) ? basename.toLowerCase() : null;
}

/**
 * Check if a character position is outside single/double quotes.
 * Returns true if the character at targetIndex is in an unquoted region.
 */
export function isUnquotedAt(text: string, targetIndex: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < targetIndex; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && !inSingle) { escaped = true; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
  }
  return !inSingle && !inDouble;
}

/**
 * Check if a position is a valid file descriptor boundary (preceded by whitespace or operator).
 */
export function isFdBoundary(text: string, start: number): boolean {
  return start === 0 || /[\s;|&<>]/.test(text[start - 1]);
}

/**
 * Iterate over a command string and check if any unquoted character satisfies a predicate.
 * The predicate receives (character, nextCharacter, inDoubleQuote).
 */
export function containsUnquoted(
  command: string,
  predicate: (ch: string, next: string, inDouble: boolean) => boolean
): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1] ?? "";
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && !inSingle) { escaped = true; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (!inSingle && predicate(ch, next, inDouble)) return true;
  }
  return false;
}

/**
 * Extract the first command name from a token list,
 * skipping leading variable assignments (KEY=value).
 */
export function commandFromTokens(tokens: string[]): string | null {
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    const word = normalizeExecutable(token);
    if (word.startsWith("./") || word.startsWith("../") || word.includes("$")) return null;
    const basename = word.replace(/^.*[\\/]/, "");
    return /^[a-z][\w.-]*$/i.test(basename) ? basename.toLowerCase() : null;
  }
  return null;
}
