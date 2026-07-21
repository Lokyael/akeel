import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";

export type PathScope = "project" | "staging" | "external";

export interface ResolvedPath {
  input: string;
  absolute: string;
  virtualPath: string;
  scope: PathScope;
  classifiable: boolean;
  symlinkEscape: boolean;
  existingRealPath: string | null;
  parentRealPath: string | null;
}

function canonical(path: string): string {
  return realpathSync(path);
}

function normalizeInput(input: string): string | null {
  if (input.startsWith("@")) input = input.slice(1);
  if (input.includes("\0") || /[\r\n]/.test(input)) return null;
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(input)) return null;
  return input;
}

function nearestExisting(path: string): { realPath: string; unresolved: string[] } | null {
  let cursor = path;
  const unresolved: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    unresolved.unshift(cursor.slice(parent.length + 1));
    cursor = parent;
  }
  try {
    return { realPath: canonical(cursor), unresolved };
  } catch {
    return null;
  }
}

function inspectTarget(absolute: string): { realPath: string | null; parentRealPath: string | null; classifiable: boolean } {
  try {
    if (existsSync(absolute)) {
      return { realPath: canonical(absolute), parentRealPath: canonical(dirname(absolute)), classifiable: true };
    }
    const ancestor = nearestExisting(absolute);
    if (!ancestor) return { realPath: null, parentRealPath: null, classifiable: false };
    const unresolvedParent = ancestor.unresolved.slice(0, -1);
    const parent = unresolvedParent.length > 0 ? resolve(ancestor.realPath, ...unresolvedParent) : ancestor.realPath;
    return { realPath: null, parentRealPath: parent, classifiable: true };
  } catch {
    return { realPath: null, parentRealPath: null, classifiable: false };
  }
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function virtualPath(scope: PathScope, base: string, target: string): string {
  if (scope === "external") return target.split("\\").join("/");
  const rel = relative(base, target).split("\\").join("/");
  return rel === "" ? scope : `${scope}/${rel}`;
}

export function resolvePath(cwd: string, projectRoot: string, stagingDir: string, input: string): ResolvedPath {
  const normalizedInput = normalizeInput(input);
  if (normalizedInput === null) {
    return { input, absolute: input, virtualPath: input, scope: "external", classifiable: false, symlinkEscape: false, existingRealPath: null, parentRealPath: null };
  }

  let canonicalCwd: string;
  let canonicalProject: string;
  let canonicalStaging: string;
  try {
    canonicalCwd = canonical(cwd);
    canonicalProject = canonical(projectRoot);
    canonicalStaging = canonical(stagingDir);
  } catch {
    return { input, absolute: input, virtualPath: input, scope: "external", classifiable: false, symlinkEscape: false, existingRealPath: null, parentRealPath: null };
  }

  const absolute = normalize(isAbsolute(normalizedInput) ? normalizedInput : resolve(canonicalCwd, normalizedInput));
  const inspected = inspectTarget(absolute);
  const realTarget = inspected.realPath ?? inspected.parentRealPath ?? absolute;
  const lexicalProject = inside(canonicalProject, absolute);
  const lexicalStaging = inside(canonicalStaging, absolute);
  const realProject = inside(canonicalProject, realTarget);
  const realStaging = inside(canonicalStaging, realTarget);
  const symlinkEscape = (lexicalProject && !realProject) || (lexicalStaging && !realStaging);
  const scope: PathScope = realProject ? "project" : realStaging ? "staging" : "external";
  const virtualTarget = inspected.realPath ?? absolute;
  return {
    input,
    absolute,
    virtualPath: virtualPath(scope, scope === "project" ? canonicalProject : canonicalStaging, virtualTarget),
    scope,
    classifiable: inspected.classifiable,
    symlinkEscape,
    existingRealPath: inspected.realPath,
    parentRealPath: inspected.parentRealPath,
  };
}
