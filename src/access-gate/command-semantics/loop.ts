// command-semantics/loop.ts — verifyLoopScope strict 守卫矩阵（T-062 Phase 2 / Task 5）
// 判定一个 for-scope 是否可静态归约。返回 null = 不可建模（fail-closed，→ compound-command）。
// body 命令唯一来源 = scope.body（R3，region pass 装配，防双源漂移）。
// 守卫：词表静态 / 无循环变量重赋值 / 无状态变异内建 / 无早期退出 / 无循环级管道与重定向动态目标。

import type { ShellCommandNode, ShellArg, LoopScope } from "../shell-parse/types";
import { denoteWord, type Binding } from "./denote";
import { prefixedCommand } from "./prefix";

export interface LoopLimits {
  maxCommands: number;
}

export interface VerifiedLoop {
  wordValues: string[];
}

const EMPTY_ENV: ReadonlyMap<string, Binding> = new Map();

/** 状态变异 / 早期退出 / cwd 变异内建（统一覆盖 builtin|command 前缀经 prefixedCommand 展开）。 */
const BODY_FORBIDDEN = new Set([
  "cd", "pushd", "popd",
  "eval", "source", ".", "exec", "export", "readonly", "declare", "typeset", "local",
  "unset", "read", "shift", "set", "trap", "alias", "unalias",
  "break", "continue", "exit", "return",
]);

const TILDE_SPECIAL = /^~[^/]/; // ~user / ~+ / ~-（未引用，bash 会展开为用户/目录 → 不建模）

/** 词表词是否含未引用 `~user` 等特殊形态（bash 展开，gate 无法精确建模）。 */
function isTildeSpecial(w: ShellArg): boolean {
  return !w.quoted && TILDE_SPECIAL.test(w.value);
}

/** 单条 body 命令守卫。env 绑定循环变量为词表字面值（供 `"$f"` 展开）。 */
function verifyBodyCommand(cmd: ShellCommandNode, loopVar: string, env: ReadonlyMap<string, Binding>): boolean {
  // O3：wrapper 含 exec → 拒（exec 是 wrapper 成员，永不出现于 executable 位，按其名检查）
  if (cmd.wrapper.some((w) => w.value === "exec")) return false;

  // 命令名（builtin 前缀经 prefixedCommand 展开；command 前缀被 parser 坍缩为 executable）
  const prefixed = prefixedCommand(cmd);
  if (prefixed?.kind === "opaque-options") return false; // builtin -x 等 → 保守拒
  const name = prefixed?.kind === "command" ? prefixed.cmd : cmd.executable?.value?.toLowerCase() ?? null;

  // 循环变量重赋值（`f=evil`：executable 为 null 的 env 赋值命令；赋值词形如 `f=evil`）
  for (const a of cmd.envAssignments) {
    const eq = a.value.indexOf("=");
    const assignedVar = eq >= 0 ? a.value.slice(0, eq) : a.value;
    if (assignedVar === loopVar) return false;
  }

  if (name !== null && BODY_FORBIDDEN.has(name)) return false;

  // 词级静态检查：executable + args + wrapperPositionals + env 赋值值 + 本命令重定向目标
  // 裸 `$f` / `$HOME` / 命令替换 / 未引用动态 / 未绑定 env 值 → denoteWord opaque → 拒（G10）
  const words: ShellArg[] = [];
  if (cmd.executable) words.push(cmd.executable);
  words.push(...cmd.args, ...cmd.wrapperPositionals, ...cmd.envAssignments);
  for (const r of cmd.redirections) {
    if (r.kind === "heredoc" || r.kind === "hereString") return false;
    if (r.target) words.push(r.target);
  }
  for (const w of words) {
    if (denoteWord(w, env).kind !== "static") return false;
  }
  return true;
}

export function verifyLoopScope(scope: LoopScope, limits: LoopLimits): VerifiedLoop | null {
  // 词表：需 `in` 且非空；每词须静态字面（tilde 单源；~user/~+ 拒；glob/动态拒）
  if (!scope.hasIn) return null;
  const wordValues: string[] = [];
  for (const w of scope.words) {
    if (isTildeSpecial(w)) return null;
    const r = denoteWord(w, EMPTY_ENV);
    if (r.kind !== "static") return null;
    for (const v of r.values) wordValues.push(v);
  }
  if (wordValues.length === 0) return null; // 空表

  // 循环级管道一律不建模（判定==展开逐字成立；opBefore / trailingOperator 由 region pass 装配，孤立 `&` 已并入 trailingOperator）
  if (scope.opBefore === "|" || scope.opBefore === "&") return null;
  if (scope.trailingOperator === "|" || scope.trailingOperator === "&") return null;

  // 循环级重定向：目标须静态（EMPTY_ENV 下 `$f` 必 opaque → 覆盖 N2 病态语义；heredoc/hereString 干净拒）
  for (const redir of scope.redirections) {
    if (redir.kind === "heredoc" || redir.kind === "hereString") return null;
    if (!redir.target) continue;
    if (denoteWord(redir.target, EMPTY_ENV).kind !== "static") return null;
  }

  // body 空 → 钉死 compound-command（不让 compileFlat 意外落 unsafe-syntax）
  if (scope.body.length === 0) return null;

  // 展开命令数预算
  if (wordValues.length * scope.body.length > limits.maxCommands) return null;

  // 构造 body env：f → literals(wordValues)
  const env = new Map<string, Binding>([[scope.variable.value, { kind: "literals", values: wordValues }]]);
  for (const cmd of scope.body) {
    if (!verifyBodyCommand(cmd, scope.variable.value, env)) return null;
  }
  return { wordValues };
}
