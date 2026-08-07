// command-semantics/registry.ts — 语义注册表

import { basename } from "node:path";

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
import { shellBuiltinsAdapter } from "./adapters/shell-builtins";
import { pythonToolsAdapter } from "./adapters/python-tools";
import { dateAdapter } from "./adapters/system";
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
  shellBuiltinsAdapter,
  pythonToolsAdapter,
  dateAdapter,
];

// 按命令名索引；同名命令跨 adapter 重复注册是结构错误——fail-fast 防止静默覆盖
function buildCommandIndex(adapters: readonly CommandAdapter[]): ReadonlyMap<string, CommandAdapter> {
  const index = new Map<string, CommandAdapter>();
  for (const adapter of adapters) {
    for (const name of adapter.names) {
      if (index.has(name)) throw new Error(`duplicate command registration: ${name}`);
      index.set(name, adapter);
    }
  }
  return index;
}

const INDEX = buildCommandIndex(ADAPTERS);

// 导出供测试验证 fail-fast 守卫（结构性不变量的直接断言）
export { buildCommandIndex };

/**
 * 将 executable 归一化为索引键：
 * - 路径形式（.venv/bin/python、/usr/bin/sed）取 basename
 * - 版本化解释器（python3.11、nodejs、perl5）映射回基础名
 */
function indexKey(executable: string): string {
  const base = basename(executable);
  if (/^python3\.\d+$/.test(base)) return "python3";
  if (base === "nodejs") return "node";
  if (base === "perl5") return "perl";
  return base;
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

/**
 * 显式作用域键查找（D-034）：
 * - 精确键优先（裸名或完整路径字符串）；
 * - 路径形式按最长路径前缀键匹配（键以 "/" 结尾，两侧归一化去 "./"）；
 * - 不做隐式 basename 匹配——工具身份由用户声明定义，gate 不猜测哪个路径形式
 *   该被覆盖，basename 冲突由此结构性消除。
 * 返回命中的键；未命中返回 null。
 */
function scopeKey(table: Record<string, unknown> | undefined, name: string): string | null {
  if (!table) return null;
  if (table[name] !== undefined) return name;
  if (name.includes("/")) {
    const normalized = name.startsWith("./") ? name.slice(2) : name;
    let bestKey: string | null = null;
    let bestLen = -1;
    for (const key of Object.keys(table)) {
      if (!key.endsWith("/")) continue;
      const normKey = key.startsWith("./") ? key.slice(2) : key;
      if (normalized.startsWith(normKey) && normKey.length > bestLen) {
        bestKey = key;
        bestLen = normKey.length;
      }
    }
    if (bestKey) return bestKey;
  }
  return null;
}

export function analyzeSemantics(
  node: ShellCommandNode,
  context: SemanticContext,
): CommandSemantics {
  const name = node.executable?.value?.toLowerCase() ?? "";
  const ov = loadOverrides();

  // 1. 用户定义的完整命令（精确 + 路径前缀作用域，D-034）
  const commandKey = scopeKey(ov.commands, name);
  if (commandKey) {
    return applyCommandDef(ov.commands![commandKey]!, node.args, name);
  }

  // 2. 别名解析（精确 + 路径前缀作用域）
  const aliasKey = scopeKey(ov.aliases, name);
  const resolvedName = aliasKey ? ov.aliases![aliasKey]! : name;

  // 3. 内置 adapter 查找（executable 按 basename/版本归一）
  const key = indexKey(resolvedName);
  const adapter = INDEX.get(key);

  if (!adapter) {
    // 路径形式（含 "/"）本质是运行本地二进制 → execute；裸名保持 unknown（可能为
    // alias/函数/PATH 工具），由 profile.unknown 决策（D-024 覆盖层仍可精确语义化）。
    if (resolvedName.includes("/")) {
      return makeSemantics("execute", { reason: `execute local binary: ${name}` });
    }
    // 别名目标也不存在时给出更清晰的理由
    const reason = resolvedName !== name
      ? `no adapter for: ${name} (aliased to ${resolvedName})`
      : `no adapter for: ${name}`;
    return makeSemantics("unknown", { reason, opaque: false });
  }

  // 别名/归一化节点：替换 executable 名称让 adapter 按目标命令规则分析
  const lookupNode = (resolvedName !== name || key !== resolvedName)
    ? { ...node, executable: aliasNode(node.executable, key) }
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
