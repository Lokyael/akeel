// command-semantics/interpreter-names.ts — 解释器名单唯一来源
//
// 语言运行时（interpreter adapter 注册名）与 preflight 硬规则解释器集
// （download → pipe → interpreter 无条件拦截，F1）共用同一名单，防止两侧漂移
// tsx 在运行时列表中，因此自动进入硬规则集——修复
// `curl … | tsx` 不命中硬规则而仅走 profile 决策的缺口。

/** 语言运行时：interpreter adapter 的注册名（D-031 封闭范畴之一）。 */
export const LANGUAGE_RUNTIMES = ["python", "python3", "node", "ruby", "perl", "tsx"] as const;

/** 能执行 stdin 任意代码的解释器（shell 与未注册为语言运行时的解释器），仅进入硬规则集。 */
const STDIN_EXECUTORS = ["sh", "bash", "dash", "zsh", "lua"] as const;

export const HARD_RULE_INTERPRETERS: ReadonlySet<string> = new Set([...LANGUAGE_RUNTIMES, ...STDIN_EXECUTORS]);
