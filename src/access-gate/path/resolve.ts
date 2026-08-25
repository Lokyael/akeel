import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { ShellArg } from "../shell-parse/types";

type PathScope = "project" | "staging" | "external";

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

/**
 * 唯一 tilde 词级归一源（T-062 A0-1）：quoted 或 raw 前导 `\~`（转义）→ 原样不展开；
 * 仅未引用词首 `~` / `~/x` → homedir；其余（`~user`/`~+`/`~-`）原样。
 * 消费方：cd 目标（control-flow）、重定向 target、归约引擎（Phase 2）——均持有 ShellArg（token 级）。
 */
export function expandTildeArg(arg: ShellArg): string {
  if (arg.quoted || arg.raw.startsWith("\\~")) return arg.value;
  if (arg.value === "~") return homedir();
  if (arg.value.startsWith("~/")) return join(homedir(), arg.value.slice(2));
  return arg.value;
}

/**
 * cd 目标解析统一服务（T-062 A0-3）：resolve + 存在性单一实现（与 resolvePath 共享 canonical/exists 语义），
 * 供 control-flow 的 D-045 候选解析与后续 loop 展开（Phase 2）同源使用；控制流不再手写 isDirectory/resolve。
 */
export function resolveTargetForCwd(
  currentCwd: string,
  target: string,
): { absolute: string; exists: boolean } {
  // 兼容直接传 "~" 的调用方（analyzeCd 已词级展开，恒等路径仍守恒）
  const expanded = target === "~" ? homedir() : target;
  const absolute = isAbsolute(expanded) ? expanded : resolve(currentCwd, expanded);
  let exists = false;
  try {
    exists = statSync(absolute).isDirectory();
  } catch {
    exists = false;
  }
  return { absolute, exists };
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
  // cwd 是分析时点假设（cd 目标可能由链内命令先建后 cd，D-045）：不存在时词法解析，
  // 不硬拒——幻影 cwd 是合法分析候选而非垃圾输入；词法近似在目标存在时由 inspectTarget 的 realpath 兜底。
  try {
    canonicalCwd = canonical(cwd);
  } catch {
    canonicalCwd = resolve(cwd);
  }
  try {
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
