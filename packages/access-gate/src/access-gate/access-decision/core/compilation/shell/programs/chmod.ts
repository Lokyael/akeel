import type { ShellWord } from "../language";
import { path, result } from "./shared";
import type { ProgramAnalysis, ProgramPath, ProgramSemantic } from "./types";

const SAFE_SHORT_FLAGS = new Set(["v", "c", "f"]);
const SAFE_LONG_FLAGS = new Set(["--verbose", "--changes", "--silent", "--quiet"]);

function isPureSafeShortFlags(text: string): boolean {
  if (!text.startsWith("-") || text.length <= 1 || text.startsWith("--")) return false;
  for (let i = 1; i < text.length; i += 1) {
    if (!SAFE_SHORT_FLAGS.has(text[i]!)) return false;
  }
  return true;
}

function rejection(
  code: "security-boundary" | "unsupported-syntax",
  word: ShellWord,
): ProgramAnalysis {
  return Object.freeze({ kind: "reject" as const, code, word });
}

export function analyzeChmodProgram(args: readonly ShellWord[]): ProgramAnalysis {
  if (args.length === 0) {
    return rejection("unsupported-syntax", { text: "chmod", start: 0, end: 0, quote: "bare" });
  }

  let index = 0;
  let endOfOptions = false;

  // 1. Scan Options
  while (index < args.length && !endOfOptions) {
    const word = args[index]!;
    if (word.text === "--") {
      endOfOptions = true;
      index += 1;
      break;
    }

    // Check recursive option
    if (
      word.text === "-R" ||
      word.text === "--recursive" ||
      (word.text.startsWith("-") && !word.text.startsWith("--") && word.text.includes("R"))
    ) {
      return rejection("security-boundary", word);
    }

    // Check reference option
    if (word.text === "--reference" || word.text.startsWith("--reference=")) {
      return rejection("unsupported-syntax", word);
    }

    // Check safe long flags
    if (SAFE_LONG_FLAGS.has(word.text)) {
      index += 1;
      continue;
    }

    // Check safe short flags (e.g. -v, -c, -f, -vf)
    if (isPureSafeShortFlags(word.text)) {
      index += 1;
      continue;
    }

    // If it starts with "--", it's an unrecognized long option
    if (word.text.startsWith("--")) {
      return rejection("unsupported-syntax", word);
    }

    // Otherwise, this token is not an option; it's the start of Mode!
    break;
  }

  // 2. Mode validation
  if (index >= args.length) {
    return rejection("unsupported-syntax", args[args.length - 1]!);
  }

  const modeWord = args[index]!;
  index += 1;

  // Check special privilege bits: SUID/SGID/Sticky
  // A. Octal check: leading non-zero in 4-digit octal (1-7)
  if (/^[1-7][0-7]{3}$/u.test(modeWord.text)) {
    return rejection("security-boundary", modeWord);
  }

  // B. Symbolic check for s or t bits
  if (/[st]/u.test(modeWord.text)) {
    return rejection("security-boundary", modeWord);
  }

  const isOctal = /^0?[0-7]{3}$/u.test(modeWord.text);
  const isSymbolic = /^[ugoa]*[+-=][rwxX]+(,[ugoa]*[+-=][rwxX]+)*$/u.test(modeWord.text);

  if (!isOctal && !isSymbolic) {
    return rejection("unsupported-syntax", modeWord);
  }

  // 3. Targets validation
  const targetWords = args.slice(index);
  if (targetWords.length === 0) {
    return rejection("unsupported-syntax", modeWord);
  }

  const paths: ProgramPath[] = [];
  for (const targetWord of targetWords) {
    paths.push(path(targetWord, "target"));
  }

  const semantic: ProgramSemantic = result("modify", ["write"], paths, {
    recursive: false,
    opaque: false,
    hardBoundary: false,
  });

  return Object.freeze({
    kind: "complete" as const,
    semantic,
  });
}
