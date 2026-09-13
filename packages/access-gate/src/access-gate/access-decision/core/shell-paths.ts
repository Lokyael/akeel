import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export type ShellPathContext = Readonly<{
  readonly home?: string;
  readonly pathKind?: "home-relative" | "literal";
}>;

const MAX_SYMLINK_DEPTH = 40;

export type ResolvedShellPath = Readonly<{
  readonly candidate: string;
  readonly traversed: readonly string[];
}>;

export function resolveShellPath(
  cwd: string,
  path: string,
  context: ShellPathContext = {},
): string | undefined {
  return resolveShellPathWithTraversal(cwd, path, context)?.candidate;
}

export function resolveShellPathWithTraversal(
  cwd: string,
  path: string,
  context: ShellPathContext = {},
): ResolvedShellPath | undefined {
  const pathKind = context.pathKind ?? (path === "~" || path.startsWith("~/") ? "home-relative" : "literal");
  if (pathKind === "home-relative") {
    if (context.home === undefined) return undefined;
    path = path === "~" ? context.home : `${context.home}/${path.slice(2)}`;
  }
  const combined = path.startsWith("/") ? path : `${cwd}/${path}`;
  return resolveExistingPathWithTraversal(combined);
}

export function resolveExistingPath(path: string): string | undefined {
  return resolveExistingPathWithTraversal(path)?.candidate;
}

export function resolveExistingPathWithTraversal(path: string): ResolvedShellPath | undefined {
  let current = "/";
  const traversed: string[] = [current];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      traversed.push(current);
      continue;
    }
    current = join(current, part);
    traversed.push(current);
    if (!appendSymlinkTraversal(traversed, current)) return undefined;
    try {
      current = realpathSync.native(current);
    } catch {
      try {
        if (lstatSync(current).isSymbolicLink()) return undefined;
      } catch {
        // A missing non-symlink component remains lexical until a later component resolves.
      }
    }
    traversed.push(current);
  }
  return Object.freeze({ candidate: current, traversed: Object.freeze(traversed) });
}

type RawSymlinkTarget = Readonly<{
  readonly target: string;
  readonly base: string;
}>;

function readlinkTarget(path: string): RawSymlinkTarget | undefined {
  try {
    return Object.freeze({ target: readlinkSync(path), base: dirname(path) });
  } catch {
    return undefined;
  }
}

function appendSymlinkTraversal(
  traversed: string[],
  path: string,
  seen = new Set<string>(),
  depth = 0,
): boolean {
  if (depth > MAX_SYMLINK_DEPTH) return false;
  let current = "/";
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    current = join(current, part);
    const target = readlinkTarget(current);
    if (target === undefined || seen.has(current)) continue;
    if (depth >= MAX_SYMLINK_DEPTH) return false;
    const targetPath = target.target.startsWith("/") ? target.target : `${target.base}/${target.target}`;
    seen.add(current);
    appendLexicalPrefixes(traversed, targetPath);
    if (!appendSymlinkTraversal(traversed, targetPath, seen, depth + 1)) return false;
  }
  return true;
}

function appendLexicalPrefixes(traversed: string[], path: string): void {
  let current = "/";
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
    } else {
      current = join(current, part);
    }
    traversed.push(current);
  }
}
