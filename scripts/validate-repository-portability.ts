import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WINDOWS_FORBIDDEN_CHARS = /[<>:"|?*\x00-\x1F]/u;
const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export type TrackedEntry = Readonly<{
  readonly mode: string;
  readonly path: string;
}>;

export type PortabilityViolation = Readonly<{
  readonly path: string;
  readonly rule:
    | "windows-forbidden-character"
    | "windows-trailing-character"
    | "windows-reserved-name"
    | "case-fold-collision"
    | "utf8-bom-disallowed"
    | "crlf-or-cr-disallowed";
  readonly message: string;
}>;

export function parseTrackedEntries(stageOutput: string): readonly TrackedEntry[] {
  const raw = stageOutput.split("\0").filter((item) => item.length > 0);
  const entries: TrackedEntry[] = [];
  for (const item of raw) {
    const tabIndex = item.indexOf("\t");
    if (tabIndex === -1) continue;
    const meta = item.slice(0, tabIndex);
    const path = item.slice(tabIndex + 1);
    const [mode] = meta.split(" ");
    if (mode && path) entries.push(Object.freeze({ mode, path }));
  }
  return Object.freeze(entries);
}

export function validateTrackedPortability(
  entries: readonly TrackedEntry[],
  readFile: (path: string) => Buffer,
): readonly PortabilityViolation[] {
  const violations: PortabilityViolation[] = [];
  const seenFolds = new Map<string, string>();

  for (const entry of entries) {
    const components = entry.path.split("/");
    for (const component of components) {
      if (WINDOWS_FORBIDDEN_CHARS.test(component)) {
        violations.push(Object.freeze({
          path: entry.path,
          rule: "windows-forbidden-character",
          message: `Path component "${component}" contains characters forbidden on Windows (<>:\"|?* or control).`,
        }));
      }
      if (component.endsWith(" ") || component.endsWith(".")) {
        violations.push(Object.freeze({
          path: entry.path,
          rule: "windows-trailing-character",
          message: `Path component "${component}" ends with a space or dot which is illegal on Windows.`,
        }));
      }
      if (WINDOWS_RESERVED_NAMES.test(component)) {
        violations.push(Object.freeze({
          path: entry.path,
          rule: "windows-reserved-name",
          message: `Path component "${component}" matches a reserved Windows device name (e.g. CON, NUL, COM1).`,
        }));
      }
    }

    const fold = entry.path.toLowerCase();
    const existing = seenFolds.get(fold);
    if (existing !== undefined && existing !== entry.path) {
      violations.push(Object.freeze({
        path: entry.path,
        rule: "case-fold-collision",
        message: `Path collides case-insensitively with "${existing}".`,
      }));
    } else {
      seenFolds.set(fold, entry.path);
    }

    if (entry.mode === "120000") continue;

    try {
      const buffer = readFile(entry.path);
      if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
        violations.push(Object.freeze({
          path: entry.path,
          rule: "utf8-bom-disallowed",
          message: "Tracked text file contains a UTF-8 BOM; modern cross-platform text must be UTF-8 no BOM.",
        }));
      }

      const isBinary = buffer.includes(0);
      if (!isBinary && buffer.includes(0x0d)) {
        violations.push(Object.freeze({
          path: entry.path,
          rule: "crlf-or-cr-disallowed",
          message: "Tracked text file contains CRLF or CR line endings; all repository text must be deterministic LF.",
        }));
      }
    } catch {
      // Disappeared or unreadable files will be reported by git status
    }
  }

  return Object.freeze(violations);
}

function runGitLsFiles(repoRoot: string): string {
  return execFileSync("git", ["ls-files", "-z", "--stage"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function validateRepositoryPortability(repoRoot = resolve(import.meta.dirname!, "..")): void {
  const output = runGitLsFiles(repoRoot);
  const entries = parseTrackedEntries(output);
  const violations = validateTrackedPortability(entries, (relativePath) => readFileSync(resolve(repoRoot, relativePath)));

  if (violations.length > 0) {
    console.error(`Repository portability violations found (${violations.length}):`);
    for (const v of violations) {
      console.error(`  - [${v.rule}] ${v.path}: ${v.message}`);
    }
    throw new Error(`Repository portability validation failed with ${violations.length} violations.`);
  }

  console.log(`✅ All ${entries.length} tracked repository paths satisfy Windows and LF portability constraints.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    validateRepositoryPortability();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
