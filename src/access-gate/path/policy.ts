import { homedir } from "node:os";
import { relative } from "node:path";
import { DEFAULT_BLOCKED_PATHS } from "./blocked-paths";
import { compileGlob, globMatches, type CompiledGlob } from "./glob";
import { compileRules, firstCompiledRule, type CompiledRule } from "./match";
import type { ProfileDecision, PathOperation, PathRule, PathPolicy, ResolvedProfile } from "../profile/types";
import type { ResolvedPath } from "./resolve";

export { resolvePath } from "./resolve";
export type { ResolvedPath } from "./resolve";
export type { PathOperation } from "../profile/types";

/** Path 硬拒 reason 常量；reason → DecisionCode 的类型化映射在 evaluate-request.ts。 */
export const PATH_DENY_REASONS = {
  blocked: "blocked path",
  unclassifiable: "path cannot be classified",
  symlinkEscape: "symlink escapes an allowed root",
} as const;
export type PathDenyReason = (typeof PATH_DENY_REASONS)[keyof typeof PATH_DENY_REASONS];

export interface PathDecision {
  decision: ProfileDecision;
  hard: boolean;
  reason: string;
  pattern?: string;
}

/** 绝对路径在 home 下的 `~/` 形式（blocked 候选与规则匹配共用；home 自身无此形式）。 */
function homeForm(path: ResolvedPath): string | null {
  const home = homedir().replace(/\\/g, "/");
  if (!path.absolute.startsWith(home + "/")) return null;
  return `~/${relative(home, path.absolute).replace(/\\/g, "/")}`;
}

/** 拼写身份集合（blocked 捕获用）：virtualPath / absolute / input / home 四种形式去重。
 * 命名审计（C）：原 candidates。 */
function identityForms(path: ResolvedPath): string[] {
  const home = homeForm(path);
  return [...new Set([path.virtualPath, path.absolute, path.input.replace(/\\/g, "/"), ...(home ? [home] : [])])];
}

// ─── 编译制品记忆化（C 编译边界落点 B：path 层 WeakMap，引用稳定则一次编译） ───
// blocked 常量与 profile rules 数组在 session 内引用稳定 → 首次编译后全程命中；
// WeakMap 随对象 GC 自动回收，无泄漏。resetPathPolicyCache 供测试（仿 config.resetConfig）。

const _blockedCompile = new WeakMap<readonly string[], readonly CompiledGlob[]>();
let _rulesCompile = new WeakMap<readonly PathRule[], readonly CompiledRule[]>();

function compileBlockedOnce(blockedPaths: readonly string[]): readonly CompiledGlob[] {
  let compiled = _blockedCompile.get(blockedPaths);
  if (!compiled) {
    compiled = blockedPaths.map((pattern) => compileGlob(pattern));
    _blockedCompile.set(blockedPaths, compiled);
  }
  return compiled;
}

function compileRulesOnce(rules: readonly PathRule[]): readonly CompiledRule[] {
  let compiled = _rulesCompile.get(rules);
  if (!compiled) {
    compiled = compileRules(rules);
    _rulesCompile.set(rules, compiled);
  }
  return compiled;
}

/** 测试用：清空编译记忆化缓存（替换引用实现重置，仿 config.resetConfig）。 */
export function resetPathPolicyCache(): void {
  _blockedCompile.delete(DEFAULT_BLOCKED_PATHS as readonly string[]);
  _rulesCompile = new WeakMap();
}

function blockedPattern(path: ResolvedPath, blockedPaths: readonly string[]): string | undefined {
  const compiled = compileBlockedOnce(blockedPaths);
  const forms = identityForms(path);
  for (const entry of compiled) {
    if (forms.some((candidate) => globMatches(entry, candidate))) return entry.pattern;
  }
  return undefined;
}

function selectedRule(policy: PathPolicy, path: ResolvedPath, operation: PathOperation): PathRule | undefined {
  // 规则匹配与 blocked 候选同源但不对称：只试 virtualPath + home 两种拼写（契约，C 锁定）。
  const home = homeForm(path);
  const ruleCandidates = home ? [path.virtualPath, home] : [path.virtualPath];
  const compiled = compileRulesOnce(policy.rules);
  for (const candidate of ruleCandidates) {
    const rule = firstCompiledRule(compiled, candidate, operation);
    if (rule) return rule;
  }
  return undefined;
}

/** 项目虚拟前缀（path/resolve 的 scope 命名）：project/** 即项目根下（仅内部消费，不导出）。 */
const PROJECT_VIRTUAL_PREFIX = "project/" as const;

/**
 * 父档位判定（D-039/H2）：profile 是否有写规则覆盖项目代码路径（src/tests/项目根）。
 * 语义谓词替代 profile/tiers 的合成探针——路径布局知识归路径层。
 */
export function isProjectWritable(profile: ResolvedProfile): boolean {
  const probes = [
    PROJECT_VIRTUAL_PREFIX + "src/probe.ts",
    PROJECT_VIRTUAL_PREFIX + "tests/probe.ts",
    PROJECT_VIRTUAL_PREFIX,
  ];
  const compiled = compileRulesOnce(profile.pathPolicy.rules);
  return probes.some((probe) => firstCompiledRule(compiled, probe, "write")?.write === "allow");
}

export function decidePath(
  path: ResolvedPath,
  profile: ResolvedProfile,
  operation: PathOperation,
  blockedPaths: readonly string[] = DEFAULT_BLOCKED_PATHS,
): PathDecision {
  const blocked = blockedPattern(path, blockedPaths);
  if (blocked) return { decision: "deny", hard: true, reason: PATH_DENY_REASONS.blocked, pattern: blocked };
  if (!path.classifiable) return { decision: "deny", hard: true, reason: PATH_DENY_REASONS.unclassifiable };
  if (path.symlinkEscape) return { decision: "deny", hard: true, reason: PATH_DENY_REASONS.symlinkEscape };

  const rule = selectedRule(profile.pathPolicy, path, operation);
  const decision = rule?.[operation] ?? profile.pathPolicy.default[operation];
  return {
    decision,
    hard: false,
    reason: rule ? "profile path rule" : "profile path default",
    pattern: rule?.path,
  };
}
