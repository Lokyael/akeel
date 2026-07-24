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
import {
  loadOverrides,
  applyCommandDef,
  applyReclassify,
  aliasNode,
} from "./overrides";

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
 *
 * 查找顺序：
 * 1. 用户定义的 commands（YAML 中的完整命令定义）
 * 2. 别名解析（aliases → 替换 executable 名称后走内置 adapter）
 * 3. 内置 adapter 查找
 * 4. reclassify 覆盖（修改 adapter 返回的 class）
 *
 * 找不到 adapter 时返回 unknown，opaque=false。
 */
export function analyzeSemantics(
  node: ShellCommandNode,
  context: SemanticContext,
): CommandSemantics {
  const name = node.executable?.value?.toLowerCase() ?? "";
  const ov = loadOverrides(context.projectRoot);

  // 1. 用户定义的完整命令 — 直接返回，不走 adapter
  if (ov.commands?.[name]) {
    return applyCommandDef(ov.commands[name]!, node.args, name);
  }

  // 2. 别名解析
  const resolvedName = ov.aliases?.[name] ?? name;

  // 3. 内置 adapter 查找
  const adapter = INDEX.get(resolvedName);

  if (!adapter) {
    // 别名目标也不存在时给出更清晰的理由
    const reason = resolvedName !== name
      ? `no adapter for: ${name} (aliased to ${resolvedName})`
      : `no adapter for: ${name}`;
    return makeSemantics("unknown", { reason, opaque: false });
  }

  // 别名节点：替换 executable 名称让 adapter 按目标命令规则分析
  const lookupNode = resolvedName !== name
    ? { ...node, executable: aliasNode(node.executable, resolvedName) }
    : node;

  const result = adapter.analyze(lookupNode, context);

  // 4. reclassify 覆盖（匹配原始名和解析后名称）
  if (ov.reclassify && ov.reclassify.length > 0) {
    const newClass = applyReclassify(ov.reclassify, name, resolvedName, node.args);
    if (newClass) {
      // 用户显式重分类意味着提供了缺失的语义知识，清除 opaque
      return {
        ...result,
        class: newClass,
        opaque: false,
        reason: `${result.reason} (reclassified to ${newClass})`,
      };
    }
  }

  return result;
}
