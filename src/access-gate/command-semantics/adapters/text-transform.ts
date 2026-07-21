// command-semantics/adapters/text-transform.ts
// 文本处理命令 — sed, awk, sort, uniq 的选项语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface OptionSchema {
  /** 选项名（短和长）。 */
  names: string[];
  /** 选项是否带值。 */
  takesValue: boolean;
  /** 产生的操作。 */
  operation: "read" | "write";
  /** 值的来源: next-token 或 inline（如 -ifile）。 */
  valueSource: "next" | "inline";
}

const SED_OPTS: OptionSchema[] = [
  { names: ["-i", "--in-place"], takesValue: false, operation: "write", valueSource: "next" },
  { names: ["-e", "--expression"], takesValue: true, operation: "read", valueSource: "next" },
  { names: ["-f", "--file"], takesValue: true, operation: "read", valueSource: "next" },
];

const AWK_OPTS: OptionSchema[] = [
  { names: ["-i", "--in-place"], takesValue: false, operation: "write", valueSource: "next" },
  { names: ["-f", "--file"], takesValue: true, operation: "read", valueSource: "next" },
  { names: ["-e"], takesValue: true, operation: "read", valueSource: "next" },
];

const SORT_OPTS: OptionSchema[] = [
  { names: ["-o", "--output"], takesValue: true, operation: "write", valueSource: "next" },
];

const UNIQ_OPTS: OptionSchema[] = [
  { names: ["-o", "--output"], takesValue: true, operation: "write", valueSource: "next" },
];

const TEXT_CONFIG: Record<string, {
  class: "readOnly" | "mutating" | "unclassified";
  schemas: OptionSchema[];
  reason: string;
}> = {
  sed: { class: "readOnly", schemas: SED_OPTS, reason: "stream editor" },
  awk: { class: "readOnly", schemas: AWK_OPTS, reason: "pattern scanning" },
  sort: { class: "readOnly", schemas: SORT_OPTS, reason: "sort lines" },
  uniq: { class: "readOnly", schemas: UNIQ_OPTS, reason: "unique lines" },
};

/**
 * 解析选项模式，提取路径 intent。
 * 遇到无法确定是否为文件值的选项时设置 opaque。
 */
function parseOptions(
  args: ShellArg[],
  schemas: OptionSchema[],
  index: number,
): { intents: PathIntent[]; opaque: boolean } {
  const intents: PathIntent[] = [];
  let opaque = false;

  while (index < args.length) {
    const token = args[index]!;
    const val = token.value ?? "";

    if (val === "--") { index++; break; }
    if (!val.startsWith("-")) break; // 非选项 → 结束

    // 查找匹配的 schema
    const schema = schemas.find((s) => s.names.includes(val));
    if (!schema) {
      // 不认识这个选项 → opaque
      opaque = true;
      index++;
      continue;
    }

    if (!schema.takesValue) {
      // 无值选项（如 sed -i）
      intents.push({
        operation: schema.operation,
        rawPath: "",
        source: "option",
        span: { start: 0, end: 0 },
        confidence: "conservative",
      });
      index++;
      continue;
    }

    if (schema.valueSource === "inline") {
      // inline 值（如 -i.bak）
      const inlineVal = val.slice(schema.names[0]!.length);
      if (inlineVal.length > 0) {
        intents.push({
          operation: schema.operation,
          rawPath: inlineVal,
          source: "option",
          span: { start: 0, end: 0 },
          confidence: "conservative",
        });
      }
      index++;
      continue;
    }

    // next token 值
    if (index + 1 < args.length) {
      const nextVal = args[index + 1]!.value;
      if (nextVal) {
        intents.push({
          operation: schema.operation,
          rawPath: nextVal,
          source: "option",
          span: { start: 0, end: 0 },
          confidence: "conservative",
        });
      }
      index += 2;
    } else {
      index++;
    }
  }

  return { intents, opaque };
}

export const textTransformAdapter: CommandAdapter = {
  names: Object.keys(TEXT_CONFIG),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = TEXT_CONFIG[name];
    if (!config) return makeSemantics("unclassified", { reason: `unknown text command: ${name}`, opaque: true });

    // 解析选项
    const { intents: optionIntents, opaque } = parseOptions([...node.args], config.schemas, 0);

    // 如果产生了写 intent，降级为 mutating
    const hasWrite = optionIntents.some((i) => i.operation === "write");
    const cls: "readOnly" | "mutating" | "unclassified" = hasWrite ? "mutating" : config.class;

    return makeSemantics(cls, {
      reason: config.reason,
      intents: optionIntents,
      opaque,
    });
  },
};
