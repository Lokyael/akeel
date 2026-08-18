// access-gate/command-semantics/adapters/herdr.ts
// herdr 可选工具建模（D-041）— terminal workspace manager for coding agents (https://herdr.dev)
// 随包分发但默认不加载；用户在 config.yaml 的 optionalAdapters 显式启用后才注册。
//
// herdr 是本地 socket 客户端：通过本地 socket 控制运行中的 herdr server
// （workspace/tab/pane/agent/session 拓扑与生命周期），不直接读写用户文件。
// 建模为 token 级：信息选项/只读查询子命令 → inspect；控制子命令 → execute；
// update 下载安装新二进制 → execute + network。
// 取值选项（--session/--remote/--remote-keybindings）被消费，不参与子命令提取。

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics } from "../types";
import { makeSemantics } from "../semantics";
import { parseOptions, type Opt } from "./option-parse";

/** 取值选项（值非路径，kind: expression，T-059）：值被消费，不参与子命令提取（--session <name>、--remote <target> 等启动器形式）。 */
const VALUE_OPTS: readonly Opt[] = [
  { names: ["--session", "--remote", "--remote-keybindings"], kind: "expression", forms: ["separated", "equals"] },
];

/** 纯信息选项：打印后退出，无变更。 */
const INFO_OPTS = new Set(["-h", "--help", "-V", "--version", "--default-config", "--skill"]);

/** 只读查询子命令：查询状态/输出，不改变 server 状态。 */
const READONLY_SUBCOMMANDS = new Set(["status", "api", "completion", "help"]);

export const herdrAdapter: CommandAdapter = {
  names: ["herdr"],
  analyze(node: ShellCommandNode): CommandSemantics {
    const args = [...node.args];
    const first = args[0]?.value ?? "";
    // 子命令首词（引擎投影：取值选项被消费，positional[0] = 首词）；
    // 信息选项/裸命令分支提前返回时该计算无副作用
    const { positional } = parseOptions(args, { opts: VALUE_OPTS, positional: "file", opaqueOnUnknown: false });
    const head = positional[0]?.value ?? "";

    // 裸 herdr 或选项开头：信息选项 → inspect；其余选项（--session/--remote/--remote-keybindings
    // 取值选项、--no-session 模式选项）跳过后若仍解析出子命令则按子命令分类，
    // 纯启动器形式 → execute
    if (first === "" || first.startsWith("-")) {
      if (INFO_OPTS.has(first)) {
        return makeSemantics("inspect", { reason: `herdr ${first} (prints info)` });
      }
      if (head !== "") return classifyHerdr(head);
      return makeSemantics("execute", {
        reason: first === "" ? "herdr TUI launcher/attach" : `herdr ${first} launcher`,
      });
    }

    return classifyHerdr(head);
  },
};

/** 按首个子命令词分类。 */
function classifyHerdr(head: string): CommandSemantics {
  if (READONLY_SUBCOMMANDS.has(head)) {
    return makeSemantics("inspect", { reason: `herdr ${head} (read-only)` });
  }
  if (head === "update") {
    return makeSemantics("execute", {
      reason: "herdr update (downloads new binary)",
      effects: ["execute", "network"],
    });
  }
  return makeSemantics("execute", { reason: `herdr ${head} control` });
}
