// herdr 可选 adapter 的语义单元测试（直接测 adapter 本体，不依赖注册状态，D-041）
// 注册行为（默认不加载 / 启用）见 command-semantics-optional.test.ts

import { defineSemanticTests } from "./semantics-dsl";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { herdrAdapter } from "../../../src/access-gate/command-semantics/adapters/herdr";
import type { SemanticContext } from "../../../src/access-gate/command-semantics/types";

function analyzeHerdr(cmd: string, ctx: SemanticContext) {
  const { program } = parse(lex(cmd).tokens);
  return herdrAdapter.analyze(program.commands[0]!, ctx);
}

defineSemanticTests({
  prefix: "herdr: ",
  analyze: analyzeHerdr,
  cases: [
    { cmd: "herdr", name: "bare herdr launches/attaches the TUI", cls: "execute" },
    { cmd: "herdr --help", name: "--help prints info", cls: "inspect" },
    { cmd: "herdr -h", name: "-h prints info", cls: "inspect" },
    { cmd: "herdr --version", name: "--version prints info", cls: "inspect" },
    { cmd: "herdr -V", name: "-V prints info", cls: "inspect" },
    { cmd: "herdr --skill", name: "--skill prints the skill file", cls: "inspect" },
    { cmd: "herdr --default-config", name: "--default-config prints default config", cls: "inspect" },
    { cmd: "herdr --no-session", name: "--no-session monolith mode launches the TUI", cls: "execute" },
    { cmd: "herdr --session dev", name: "--session launcher form is execute", cls: "execute" },
    { cmd: "herdr --remote host", name: "--remote launcher form is execute", cls: "execute" },
    { cmd: "herdr status", name: "status is a read-only query", cls: "inspect" },
    { cmd: "herdr status server", name: "status server is a read-only query", cls: "inspect" },
    { cmd: "herdr api", name: "api inspection is read-only", cls: "inspect" },
    { cmd: "herdr completion zsh", name: "completion prints shell completions", cls: "inspect" },
    { cmd: "herdr help", name: "help subcommand is read-only", cls: "inspect" },
    // 取值选项被消费：--session dev 不参与子命令提取，status 仍被识别（覆盖层做不到，D-041 价值点）
    { cmd: "herdr --session dev status", name: "--session value is consumed, status stays read-only", cls: "inspect" },
    { cmd: "herdr --session dev agent list", name: "--session value is consumed, agent list stays control", cls: "execute" },
    { cmd: "herdr workspace list", name: "workspace control command", cls: "execute" },
    { cmd: "herdr tab create", name: "tab control command", cls: "execute" },
    { cmd: "herdr pane split --current --direction right", name: "pane split is a control command", cls: "execute" },
    { cmd: "herdr pane run w1:p1 'just test'", name: "pane run is a control command", cls: "execute" },
    { cmd: "herdr agent start reviewer --kind codex", name: "agent start is a control command", cls: "execute" },
    { cmd: "herdr agent prompt reviewer 'work'", name: "agent prompt is a control command", cls: "execute" },
    { cmd: "herdr session attach dev", name: "session attach is a control command", cls: "execute" },
    { cmd: "herdr worktree create", name: "worktree control command", cls: "execute" },
    { cmd: "herdr notification send", name: "notification control command", cls: "execute" },
    { cmd: "herdr integration list", name: "integration control command", cls: "execute" },
    { cmd: "herdr server stop", name: "server stop is a control command", cls: "execute" },
    { cmd: "herdr server reload-config", name: "server reload-config is a control command", cls: "execute" },
    { cmd: "herdr channel set preview", name: "channel set is a control command", cls: "execute" },
    { cmd: "herdr config reset-keys", name: "config reset-keys is a control command", cls: "execute" },
    { cmd: "herdr update", name: "update downloads a new binary", cls: "execute", effects: ["network"] },
    { cmd: "herdr update --handoff", name: "update --handoff downloads a new binary", cls: "execute", effects: ["network"] },
  ],
});
