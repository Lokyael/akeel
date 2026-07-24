// command-semantics/registry.ts — 语义注册表

import type { ShellCommandNode } from "../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "./types";
import { filesystemAdapter } from "./adapters/filesystem";
import { textTransformAdapter } from "./adapters/text-transform";
import { searchAdapter } from "./adapters/search";
import { gitAdapter } from "./adapters/git";
import { packageAdapter } from "./adapters/package";
import { buildAdapter } from "./adapters/build";
import { noopAdapter } from "./adapters/noop";
import { readAdapter } from "./adapters/read";
import { interpreterAdapter } from "./adapters/interpreters";
import { makeSemantics } from "./adapters/shared";

// 注册所有 adapter
const ADAPTERS: CommandAdapter[] = [
  filesystemAdapter,
  textTransformAdapter,
  searchAdapter,
  gitAdapter,
  packageAdapter,
  buildAdapter,
  noopAdapter,
  readAdapter,
  interpreterAdapter,
];

// 按命令名索引
const INDEX = new Map<string, CommandAdapter>();
for (const adapter of ADAPTERS) {
  for (const name of adapter.names) {
    INDEX.set(name, adapter);
  }
}

/**
 * 查找并执行语义分析。
 * 找不到 adapter 时返回 unknown，opaque=false。
 */
export function analyzeSemantics(
  node: ShellCommandNode,
  context: SemanticContext,
): CommandSemantics {
  const name = node.executable?.value?.toLowerCase() ?? "";
  const adapter = INDEX.get(name);

  if (!adapter) {
    return makeSemantics("unknown", {
      reason: `no adapter for: ${name}`,
      opaque: false,
    });
  }

  return adapter.analyze(node, context);
}
