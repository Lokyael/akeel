// command-semantics/registry.ts — 语义注册表

import { basename } from "node:path";

import type { ShellCommandNode } from "../shell-parse/types";
import type { CommandAdapter, CommandSemantics } from "./types";
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
import { dateAdapter } from "./adapters/date";
import { herdrAdapter } from "./adapters/herdr";
import { makeSemantics } from "./semantics";
import { canonicalExecutableName } from "./naming";
import {
  commandOverridesFor,
  applyCommandDef,
  applyReclassify,
  aliasNode,
} from "./overrides";
import { loadConfig } from "../config";
import { getAgentDir } from "../agent-dir";

// 核心 adapter（始终注册，封闭集合，D-031）
const CORE_ADAPTERS: CommandAdapter[] = [
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

// 可选工具建模（D-041）：随包分发但默认不加载，用户在 config.yaml 的
// optionalAdapters 显式启用后才注册。惰性 factory：未启用不实例化。
const OPTIONAL_ADAPTERS: Readonly<Record<string, () => CommandAdapter>> = {
  herdr: () => herdrAdapter,
};

/** 注册 adapter 到索引；同名重复注册是结构错误——fail-fast 防止静默覆盖。
 * 单一实现：buildCommandIndex 与 optionalCommandIndex 共用，守卫语义单点定义。 */
function registerAdapter(index: Map<string, CommandAdapter>, adapter: CommandAdapter): void {
  for (const name of adapter.names) {
    if (index.has(name)) throw new Error(`duplicate command registration: ${name}`);
    index.set(name, adapter);
  }
}

// 按命令名索引；同名命令跨 adapter 重复注册是结构错误——fail-fast 防止静默覆盖
function buildCommandIndex(adapters: readonly CommandAdapter[]): ReadonlyMap<string, CommandAdapter> {
  const index = new Map<string, CommandAdapter>();
  for (const adapter of adapters) registerAdapter(index, adapter);
  return index;
}

const CORE_INDEX = buildCommandIndex(CORE_ADAPTERS);

// 导出供测试验证 fail-fast 守卫（结构性不变量的直接断言）
export { buildCommandIndex };

/**
 * 已启用可选 adapter 的完整索引（core + optional）。按启用名集合缓存。
 * 未知启用名 → 响亮报错且整段 fail-closed（不加载任何 optional），与 profiles 损坏同模式。
 */
let _optionalIndex: { key: string; index: ReadonlyMap<string, CommandAdapter> } | null = null;

function optionalCommandIndex(agentDir: string): ReadonlyMap<string, CommandAdapter> {
  const loaded = loadConfig(agentDir);
  const enabled = loaded.kind === "ok" ? (loaded.value.optionalAdapters ?? []) : [];
  const key = enabled.join(",");
  if (_optionalIndex && _optionalIndex.key === key) return _optionalIndex.index;

  const index = new Map(CORE_INDEX);
  for (const name of enabled) {
    const factory = OPTIONAL_ADAPTERS[name];
    if (!factory) {
      console.error(
        `pi-keel: config optionalAdapters: unknown adapter "${name}" ` +
        `(known: ${Object.keys(OPTIONAL_ADAPTERS).join(", ")}); no optional adapters loaded`,
      );
      _optionalIndex = { key, index: new Map(CORE_INDEX) };
      return _optionalIndex.index;
    }
    const adapter = factory();
    registerAdapter(index, adapter);
  }
  _optionalIndex = { key, index };
  return index;
}

/**
 * 将 executable 归一化为索引键：
 * - 路径形式（.venv/bin/python、/usr/bin/sed）取 basename
 * - 版本化解释器（python3.11、nodejs、perl5）映射回基础名
 */
function indexKey(executable: string): string {
  return canonicalExecutableName(basename(executable));
}

/** 剥离前导 "./"——./ 是 cwd 相对拼写，无管理意义（D-024），精确键与前缀键对称归一化。 */
function stripDotSlash(s: string): string {
  return s.startsWith("./") ? s.slice(2) : s;
}

/**
 * 显式作用域键查找（D-024）：
 * - 精确键优先（裸名或完整路径字符串），前导 "./" 归一化对精确键与前缀键对称生效；
 * - 路径形式按最长路径前缀键匹配（键以 "/" 结尾）；
 * - 不做隐式 basename 匹配——工具身份由用户声明定义，gate 不猜测哪个路径形式
 *   该被覆盖，basename 冲突由此结构性消除。
 * 返回命中的键；未命中返回 null。
 * 导出供测试直接断言作用域键边界（精确/前缀优先级与 ./ 对称归一化，D-024）。
 */
export function scopeKey(table: Record<string, unknown> | undefined, name: string): string | null {
  if (!table) return null;
  const normalized = stripDotSlash(name);
  // 精确键：键与名均做 ./ 归一化后相等即命中（两侧对称，D-024）
  for (const key of Object.keys(table)) {
    if (key.endsWith("/")) continue;
    if (stripDotSlash(key) === normalized) return key;
  }
  // 路径前缀键（以 / 结尾）：最长前缀优先，键与名均 ./ 归一化
  if (normalized.includes("/")) {
    let bestKey: string | null = null;
    let bestLen = -1;
    for (const key of Object.keys(table)) {
      if (!key.endsWith("/")) continue;
      const normKey = stripDotSlash(key);
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
): CommandSemantics {
  const name = node.executable?.value?.toLowerCase() ?? "";
  const ov = commandOverridesFor();

  // 1. 用户定义的完整命令（精确 + 路径前缀作用域，D-024）
  const commandKey = scopeKey(ov.commands, name);
  if (commandKey) {
    return applyCommandDef(ov.commands![commandKey], node.args, name);
  }

  // 2. 别名解析（精确 + 路径前缀作用域）
  const aliasKey = scopeKey(ov.aliases, name);
  const resolvedName = aliasKey ? ov.aliases![aliasKey] : name;

  // 2.5 别名目标可能是用户定义的 commands 条目（链式解析：别名 → 命令定义）
  if (resolvedName !== name) {
    const targetCommandKey = scopeKey(ov.commands, resolvedName);
    if (targetCommandKey) {
      return applyCommandDef(ov.commands![targetCommandKey], node.args, name);
    }
  }

  // 3. 内置 + 已启用可选 adapter 查找（executable 按 basename/版本归一）
  const key = indexKey(resolvedName);
  const adapter = optionalCommandIndex(getAgentDir()).get(key);

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

  const result = adapter.analyze(lookupNode);

  // 4. reclassify 覆盖（匹配原始名和解析后名称）
  if (ov.reclassify && ov.reclassify.length > 0) {
    const newClass = applyReclassify(ov.reclassify, name, resolvedName, node.args);
    if (newClass) {
      // 用户显式重分类意味着提供了缺失的语义知识，清除 opaque
      return {
        ...result,
        commandClass: newClass,
        opaque: false,
        reason: `${result.reason} (reclassified to ${newClass})`,
      };
    }
  }

  return result;
}
