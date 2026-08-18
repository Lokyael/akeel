// 构建工具命令 — cargo, go, make 的语义

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics } from "../types";
import { makeSemantics } from "../semantics";
import { semanticsFromRules, type RuleDef } from "../rules";
import { subcommandArgs } from "../args";
import { parseOptions, type Opt } from "./option-parse";

interface BuildToolConfig {
  rules: RuleDef[];
  /** 取值选项（值非路径，kind: expression，D-040）——值被消费，不参与子命令提取。 */
  opts?: readonly Opt[];
}

const BUILD_CONFIG: Record<string, BuildToolConfig> = {
  cargo: {
    opts: [
      { names: ["--manifest-path", "--target-dir", "--target", "--color", "--message-format", "--config", "-Z", "-p", "--package", "--bin", "--example", "--test", "--bench", "--profile", "--features", "-j", "--jobs", "--timings"], kind: "expression", forms: ["separated", "equals"] },
    ],
    rules: [
      { cls: "inspect", pattern: (s) => /^search\b/.test(s), reason: "cargo search" },
      { cls: "inspect", pattern: (s) => /^--version\b/.test(s), reason: "cargo version" },
      { cls: "execute", pattern: (s) => /^build\b/.test(s), reason: "cargo build", network: true },
      { cls: "execute", pattern: (s) => /^test\b/.test(s), reason: "cargo test", network: true },
      { cls: "execute", pattern: (s) => /^run\b/.test(s), reason: "cargo run" },
      { cls: "execute", pattern: (s) => /^install\b/.test(s), reason: "cargo install", network: true },
      { cls: "execute", pattern: (s) => /^publish\b/.test(s), reason: "cargo publish", network: true },
      { cls: "execute", pattern: (s) => /^update\b/.test(s), reason: "cargo update", network: true },
      { cls: "execute", pattern: (s) => /^check\b/.test(s), reason: "cargo check", network: true },
      { cls: "inspect", pattern: (s) => /^(?:tree|metadata)\b/.test(s), reason: "cargo dependency tree/metadata" },
      { cls: "execute", pattern: (s) => /^(?:clippy|bench)\b/.test(s), reason: "cargo lint/benchmark" },
      { cls: "execute", pattern: (s) => /^doc\b/.test(s), reason: "cargo doc", network: true },
      { cls: "modify", pattern: (s) => /^(?:fmt|fix)\b/.test(s), reason: "cargo fmt/fix" },
      { cls: "modify", pattern: (s) => /^(?:add|remove)\b/.test(s), reason: "cargo add/remove", network: true },
      { cls: "modify", pattern: (s) => /^clean\b/.test(s), reason: "cargo clean" },
      { cls: "unknown", pattern: () => true, reason: "cargo other" },
    ],
  },
  go: {
    opts: [
      { names: ["-C", "-o", "-p", "-tags", "-ldflags", "-gcflags", "-asmflags", "-buildmode", "-mod", "-modfile", "-overlay", "-pkgdir", "-toolexec", "-trimpath"], kind: "expression", forms: ["separated", "equals"] },
    ],
    rules: [
      { cls: "inspect", pattern: (s) => /^doc\b/.test(s), reason: "go doc" },
      { cls: "inspect", pattern: (s) => /^list\b/.test(s), reason: "go list" },
      { cls: "inspect", pattern: (s) => /^version\b/.test(s), reason: "go version" },
      { cls: "inspect", pattern: (s) => /^env\b/.test(s), reason: "go env" },
      { cls: "execute", pattern: (s) => /^(?:vet|generate)\b/.test(s), reason: "go vet/generate" },
      { cls: "modify", pattern: (s) => /^(?:fmt|clean)\b/.test(s), reason: "go fmt/clean" },
      { cls: "execute", pattern: (s) => /^build\b/.test(s), reason: "go build" },
      { cls: "execute", pattern: (s) => /^test\b/.test(s), reason: "go test" },
      { cls: "execute", pattern: (s) => /^run\b/.test(s), reason: "go run" },
      { cls: "execute", pattern: (s) => /^install\b/.test(s), reason: "go install", network: true },
      { cls: "execute", pattern: (s) => /^mod\s+download\b/.test(s), reason: "go mod download", network: true },
      { cls: "modify", pattern: (s) => /^mod\s+(init|tidy|vendor)\b/.test(s), reason: "go mod modify" },
      { cls: "execute", pattern: (s) => /^get\b/.test(s), reason: "go get", network: true },
      { cls: "unknown", pattern: () => true, reason: "go other" },
    ],
  },
  make: {
    rules: [
      { cls: "execute", pattern: () => true, reason: "execute makefile" },
    ],
  },
};

export const buildAdapter: CommandAdapter = {
  names: Object.keys(BUILD_CONFIG),
  analyze(node: ShellCommandNode): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = BUILD_CONFIG[name];
    if (!config) return makeSemantics("unknown", { reason: `unknown build tool: ${name}`, opaque: true });

    // 引擎投影：取值选项被消费，positional = 子命令 token（D-040）；
    // opaqueOnUnknown: false（D-040 判据：大类 + catch-all 保守兜底）
    const { positional } = parseOptions(node.args, { opts: config.opts ?? [], positional: "file", opaqueOnUnknown: false });
    // 全选项输入（如 cargo --version）：subcommandArgs 回退取首个 token（E）
    const subcmdArgs = subcommandArgs(positional, node.args);

    const matched = semanticsFromRules(subcmdArgs, config.rules);
    if (matched) return matched;

    return makeSemantics("unknown", { reason: `${name}: unrecognized`, opaque: true });
  },
};
