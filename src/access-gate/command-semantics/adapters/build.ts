// 构建工具命令 — cargo, go, make 的语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface BuildDef {
  cls: "inspect" | "modify" | "execute" | "unknown";
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

interface BuildToolConfig {
  rules: BuildDef[];
  /** 取值选项：选项之后的 token 是值而非子命令的一部分。不穷举，未覆盖的选项导致 unknown（安全降级）。 */
  valueOpts?: readonly string[];
}

/**
 * 提取构建工具的子命令字符串。
 * 跳过取值选项及其值后，从第一个非选项参数开始，取全部非选项参数，空格连接。
 * go mod tidy、go mod download 等多词子命令依赖此逻辑。
 */
function extractSubcommand(args: readonly ShellArg[], valueOpts: readonly string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") break;
    if (v.startsWith("-")) {
      // 取值选项且不是 attached-value 形式（如 --opt=val），跳过下一个 token
      if (valueOpts.includes(v) && !v.includes("=") && i + 1 < args.length) {
        i++;
      }
      continue;
    }
    parts.push(v);
  }
  return parts.join(" ");
}

const BUILD_CONFIG: Record<string, BuildToolConfig> = {
  cargo: {
    valueOpts: [
      "--manifest-path", "--target-dir", "--target", "--color",
      "--message-format", "--config", "-Z", "-p", "--package",
      "--bin", "--example", "--test", "--bench", "--profile",
      "--features", "-j", "--jobs", "--timings",
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
      { cls: "modify", pattern: (s) => /^clean\b/.test(s), reason: "cargo clean" },
      { cls: "unknown", pattern: () => true, reason: "cargo other" },
    ],
  },
  go: {
    valueOpts: [
      "-C", "-o", "-p", "-tags", "-ldflags", "-gcflags",
      "-asmflags", "-buildmode", "-mod", "-modfile", "-overlay",
      "-pkgdir", "-toolexec", "-trimpath",
    ],
    rules: [
      { cls: "inspect", pattern: (s) => /^doc\b/.test(s), reason: "go doc" },
      { cls: "inspect", pattern: (s) => /^list\b/.test(s), reason: "go list" },
      { cls: "inspect", pattern: (s) => /^version\b/.test(s), reason: "go version" },
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
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = BUILD_CONFIG[name];
    if (!config) return makeSemantics("unknown", { reason: `unknown build tool: ${name}`, opaque: true });

    const args = [...node.args];
    const subcmd = extractSubcommand(args, config.valueOpts ?? []);

    for (const def of config.rules) {
      if (def.pattern(subcmd)) {
        return makeSemantics(def.cls, {
          reason: def.reason,
          effects: def.network ? ["network"] : undefined,
          opaque: def.cls === "unknown",
        });
      }
    }

    return makeSemantics("unknown", { reason: `${name}: unrecognized`, opaque: true });
  },
};
