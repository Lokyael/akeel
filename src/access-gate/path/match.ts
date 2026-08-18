// access-gate/path/match.ts — 编译制品的规则/阻断匹配（深化 C）
// 依赖 glob.ts 的 ComplileGlob；规则集经 compilePathPolicyOnce 一次编译（WeakMap 记忆化），
// 判定为纯查找。改名族：selectPathRule → firstRuleFor。
import { compileGlob, globMatches, type CompiledGlob } from "./glob";
import type { PathOperation, PathRule } from "../profile/types";

/** 编译后的规则条目（rule.path 预编译，判定零编译）。 */
export interface CompiledRule {
  readonly rule: PathRule;
  readonly glob: CompiledGlob;
}

/** 预编译规则集（供 compileRulesOnce 使用；每条 rule.path 编译一次）。 */
export function compileRules(rules: readonly PathRule[]): readonly CompiledRule[] {
  return rules.map((rule) => ({ rule, glob: compileGlob(rule.path) }));
}

/** 对已编译规则集的 first-match 查找（零编译）。 */
export function firstCompiledRule(
  compiled: readonly CompiledRule[],
  path: string,
  operation: PathOperation,
): PathRule | undefined {
  return compiled.find((entry) => entry.rule[operation] !== undefined && globMatches(entry.glob, path))?.rule;
}
