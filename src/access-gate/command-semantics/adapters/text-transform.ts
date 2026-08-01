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
  /**
   * 值的性质: "file"（值是一个文件路径，产生路径 intent）或
   * "expression"（值是程序/表达式，如 sed -e、awk -e/-F/-v —— 值被消费但不产生路径 intent）。
   */
  valueKind?: "file" | "expression";
  /** 是否支持 inline 后缀（如 sed -i.bak、--in-place=.bak）。 */
  inlineSuffix?: boolean;
  /** 无值行为修饰符（如 sed -n、-E）：不产生文件 intent，也不置 opaque。 */
  flag?: boolean;
}

const SED_OPTS: OptionSchema[] = [
  { names: ["-i", "--in-place"], takesValue: false, operation: "write", valueSource: "next", inlineSuffix: true },
  { names: ["-e", "--expression"], takesValue: true, operation: "read", valueSource: "next", valueKind: "expression" },
  { names: ["-f", "--file"], takesValue: true, operation: "read", valueSource: "next" },
  { names: ["-l", "--line-length"], takesValue: true, operation: "read", valueSource: "next", valueKind: "expression" },
  { names: ["-n", "--quiet", "--silent"], takesValue: false, operation: "read", valueSource: "next", flag: true },
  { names: ["-E", "-r", "-z", "-s", "-u", "--sandbox", "--debug"], takesValue: false, operation: "read", valueSource: "next", flag: true },
];

const AWK_OPTS: OptionSchema[] = [
  { names: ["-i", "--in-place"], takesValue: false, operation: "write", valueSource: "next", inlineSuffix: true },
  { names: ["-f", "--file"], takesValue: true, operation: "read", valueSource: "next" },
  { names: ["-e"], takesValue: true, operation: "read", valueSource: "next", valueKind: "expression" },
  { names: ["-F", "--field-separator"], takesValue: true, operation: "read", valueSource: "next", valueKind: "expression" },
  { names: ["-v", "--assign"], takesValue: true, operation: "read", valueSource: "next", valueKind: "expression" },
  { names: ["-V", "--version", "-h", "--help"], takesValue: false, operation: "read", valueSource: "next", flag: true },
];

const SORT_OPTS: OptionSchema[] = [
  { names: ["-o", "--output"], takesValue: true, operation: "write", valueSource: "next" },
  { names: ["-t", "--field-separator", "-k", "--key"], takesValue: true, operation: "read", valueSource: "next", valueKind: "expression" },
  { names: ["-n", "-r", "-u", "-f", "-b", "-c", "-m", "-h", "-V", "-s", "--numeric-sort", "--reverse", "--unique", "--ignore-case", "--stable", "--check", "--merge", "--version", "--help"], takesValue: false, operation: "read", valueSource: "next", flag: true },
];

const UNIQ_OPTS: OptionSchema[] = [
  { names: ["-o", "--output"], takesValue: true, operation: "write", valueSource: "next" },
  { names: ["-c", "-d", "-u", "-i", "--count", "--repeated", "--unique", "--ignore-case", "--version", "--help"], takesValue: false, operation: "read", valueSource: "next", flag: true },
];

const TEXT_CONFIG: Record<string, {
  class: "inspect" | "modify" | "unknown";
  schemas: OptionSchema[];
  reason: string;
  /** sed/awk 在出现写选项（-i）时，位置参数是原地修改目标而非只读输入。 */
  inPlace?: boolean;
}> = {
  sed: { class: "inspect", schemas: SED_OPTS, reason: "stream editor", inPlace: true },
  awk: { class: "inspect", schemas: AWK_OPTS, reason: "pattern scanning", inPlace: true },
  sort: { class: "inspect", schemas: SORT_OPTS, reason: "sort lines" },
  uniq: { class: "inspect", schemas: UNIQ_OPTS, reason: "unique lines" },
};

/**
 * 解析选项模式，提取路径 intent。
 * 遇到无法确定是否为文件值的选项时设置 opaque。
 */
function parseOptions(
  args: ShellArg[],
  schemas: OptionSchema[],
  index: number,
  inPlace: boolean,
): { intents: PathIntent[]; opaque: boolean } {
  const intents: PathIntent[] = [];
  let opaque = false;
  let afterDoubleDash = false;

  while (index < args.length) {
    const token = args[index]!;
    const val = token.value ?? "";

    if (!afterDoubleDash && val === "--") { afterDoubleDash = true; index++; continue; } // 之后的 token 全部按位置参数处理
    if (afterDoubleDash || !val.startsWith("-")) {
      // 位置参数：输入文件（in-place 模式下出现写选项时是原地修改目标）
      const sawWrite = intents.some((i) => i.operation === "write");
      intents.push({
        operation: inPlace && sawWrite ? "write" : "read",
        rawPath: val,
        source: "argument",
        span: token.span,
        confidence: "exact",
      });
      index++;
      continue;
    }

    // 查找匹配的 schema
    const schema = schemas.find((s) => s.names.includes(val));
    if (!schema) {
      // inline 后缀形式：sed -i.bak、--in-place=.bak（选项值附在选项上，不是文件路径）
      const inline = schemas.find((s) => s.inlineSuffix && s.names.some((n) => {
        if (n.startsWith("--")) return val.startsWith(n + "=");
        return !val.startsWith("--") && val.startsWith(n) && val.length > n.length;
      }));
      if (inline) {
        intents.push({
          operation: inline.operation,
          rawPath: "",
          source: "option",
          span: { start: 0, end: 0 },
          confidence: "conservative",
        });
        index++;
        continue;
      }
      // 短选项内联值：-F,、-vfoo、-es/x/y/（值紧附在选项名后）
      const short = schemas.find((s) => !s.flag && s.takesValue && s.names.some((n) =>
        n.length === 2 && n.startsWith("-") && val.startsWith(n) && val.length > 2,
      ));
      if (short) {
        const inlineVal = val.slice(2);
        if (short.valueKind !== "expression" && inlineVal.length > 0) {
          intents.push({
            operation: short.operation,
            rawPath: inlineVal,
            source: "option",
            span: { start: 0, end: 0 },
            confidence: "conservative",
          });
        }
        index++;
        continue;
      }
      // 不认识这个选项 → opaque
      opaque = true;
      index++;
      continue;
    }

    if (!schema.takesValue) {
      if (!schema.flag) {
        // 无值选项（如 sed -i）
        intents.push({
          operation: schema.operation,
          rawPath: "",
          source: "option",
          span: { start: 0, end: 0 },
          confidence: "conservative",
        });
      }
      index++;
      continue;
    }

    if (schema.valueKind === "expression") {
      // sed -e / awk -e：表达式值被消费但不产生路径 intent
      index += index + 1 < args.length ? 2 : 1;
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
    if (!config) return makeSemantics("unknown", { reason: `unknown text command: ${name}`, opaque: true });

    // 解析选项
    const { intents: optionIntents, opaque } = parseOptions([...node.args], config.schemas, 0, config.inPlace === true);

    // 如果产生了写 intent，升级为 modify
    const hasWrite = optionIntents.some((i) => i.operation === "write");
    const cls: "inspect" | "modify" | "unknown" = hasWrite ? "modify" : config.class;

    return makeSemantics(cls, {
      reason: config.reason,
      intents: optionIntents,
      opaque,
    });
  },
};
