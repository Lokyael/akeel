import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PathEvidencePort, ResolvedPathEvidence } from "./index";

const MAX_SYMLINK_DEPTH = 40;
const LINUX_PATH_EVIDENCE = Object.freeze({ resolve });

export function createLinuxPathEvidence(): PathEvidencePort {
  return LINUX_PATH_EVIDENCE;
}

function resolve(
  base: string,
  path: string,
  context: Readonly<{ readonly pathKind?: "home-relative" | "literal"; readonly home?: string }> = {},
): ResolvedPathEvidence | undefined {
  const pathKind = context.pathKind ?? (path === "~" || path.startsWith("~/") ? "home-relative" : "literal");
  if (pathKind === "home-relative") {
    if (context.home === undefined) return undefined;
    path = path === "~" ? context.home : `${context.home}/${path.slice(2)}`;
  }
  return resolveAbsolute(path.startsWith("/") ? path : `${base}/${path}`);
}

function resolveAbsolute(path: string): ResolvedPathEvidence | undefined {
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
        // Missing non-symlink components remain lexical until a later component resolves.
      }
    }
    traversed.push(current);
  }
  return Object.freeze({ candidate: current, traversed: Object.freeze(traversed) });
}

function readlinkTarget(path: string): Readonly<{ readonly target: string; readonly base: string }> | undefined {
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
    current = part === ".." ? dirname(current) : join(current, part);
    traversed.push(current);
  }
}
