// shell-parse/wrappers.ts — wrapper 命令名单唯一来源
//
// parser 把 wrapper 命令解析进 node.wrapper，normalize 负责递归解包；
// 两者共用同一名单与 skip 计数，防止新增 wrapper 时解析与解包不同步（T-046 R2）。

export const WRAPPER_CMDS = ["env", "command", "nohup", "exec", "timeout"] as const;
export const WRAPPER_CMDS_SET: ReadonlySet<string> = new Set(WRAPPER_CMDS);

/** wrapper 在 executable 之前的额外 positional 参数数（如 timeout <duration> <command>）。 */
export const WRAPPER_POS_SKIP: Readonly<Record<string, number>> = {
  timeout: 1,
};
