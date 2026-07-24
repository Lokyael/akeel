// 构建工具命令 — cargo, go, make 的语义

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface BuildDef {
  cls: "inspect" | "modify" | "execute" | "unknown";
  pattern: (subcmd: string) => boolean;
  reason: string;
  network?: boolean;
}

const BUILD_RULES: Record<string, BuildDef[]> = {
  cargo: [
    { cls: "inspect", pattern: (s) => /^search\b/.test(s), reason: "cargo search" },
    { cls: "inspect", pattern: (s) => /^--version\b/.test(s), reason: "cargo version" },
    { cls: "execute", pattern: (s) => /^build\b/.test(s), reason: "cargo build", network: true },
    { cls: "execute", pattern: (s) => /^test\b/.test(s), reason: "cargo test", network: true },
    { cls: "execute", pattern: (s) => /^run\b/.test(s), reason: "cargo run" },
    { cls: "execute", pattern: (s) => /^install\b/.test(s), reason: "cargo install", network: true },
    { cls: "execute", pattern: (s) => /^publish\b/.test(s), reason: "cargo publish", network: true },
    { cls: "execute", pattern: (s) => /^update\b/.test(s), reason: "cargo update", network: true },
    { cls: "execute", pattern: (s) => /^check\b/.test(s), reason: "cargo check", network: true },
    { cls: "execute", pattern: (s) => /^clean\b/.test(s), reason: "cargo clean" },
    { cls: "unknown", pattern: () => true, reason: "cargo other" },
  ],
  go: [
    { cls: "inspect", pattern: (s) => /^doc\b/.test(s), reason: "go doc" },
    { cls: "inspect", pattern: (s) => /^list\b/.test(s), reason: "go list" },
    { cls: "inspect", pattern: (s) => /^version\b/.test(s), reason: "go version" },
    { cls: "execute", pattern: (s) => /^build\b/.test(s), reason: "go build" },
    { cls: "execute", pattern: (s) => /^test\b/.test(s), reason: "go test" },
    { cls: "execute", pattern: (s) => /^run\b/.test(s), reason: "go run" },
    { cls: "execute", pattern: (s) => /^install\b/.test(s), reason: "go install", network: true },
    { cls: "execute", pattern: (s) => /^mod\s+download\b/.test(s), reason: "go mod download", network: true },
    { cls: "execute", pattern: (s) => /^mod\s+(init|tidy|vendor)\b/.test(s), reason: "go mod modify" },
    { cls: "execute", pattern: (s) => /^get\b/.test(s), reason: "go get", network: true },
    { cls: "unknown", pattern: () => true, reason: "go other" },
  ],
  make: [
    { cls: "execute", pattern: () => true, reason: "execute makefile" },
  ],
};

export const buildAdapter: CommandAdapter = {
  names: Object.keys(BUILD_RULES),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const rules = BUILD_RULES[name];
    if (!rules) return makeSemantics("unknown", { reason: `unknown build tool: ${name}`, opaque: true });

    const args = [...node.args];
    const subcmd = args.find((a) => {
      const v = a.value ?? "";
      return !v.startsWith("-") && v !== "--";
    })?.value ?? "";

    for (const def of rules) {
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
