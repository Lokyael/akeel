// 文本处理命令 — sed, awk, sort, uniq 的选项语义

import type { ShellCommandNode, ShellArg, SourceSpan } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

interface OptionSchema {
  /** 选项名（短和长）。 */
  names: string[];
  /** 选项是否带值。 */
  takesValue: boolean;
  /** 产生的操作。 */
  operation: "read" | "write";
  /**
   * 值的性质: "file"（值是一个文件路径，产生路径 intent）或
   * "expression"（值是程序/表达式，如 sed -e、awk -e/-F/-v —— 值被消费但不产生路径 intent）。
   */
  valueKind?: "file" | "expression";
  /** 是否支持 inline 后缀（如 sed -i.bak、--in-place=.bak）。 */
  inlineSuffix?: boolean;
  /** 无值行为修饰符（如 sed -n、-E）：不产生文件 intent，也不置 opaque。 */
  flag?: boolean;
  /** 是否提供程序/模式（-e/-f）：存在时位置参数全部是文件，首个位置参数不再按程序跳过。 */
  isPattern?: boolean;
}

const SED_OPTS: OptionSchema[] = [
  { names: ["-i", "--in-place"], takesValue: false, operation: "write", inlineSuffix: true },
  { names: ["-e", "--expression"], takesValue: true, operation: "read", valueKind: "expression", isPattern: true },
  { names: ["-f", "--file"], takesValue: true, operation: "read", isPattern: true },
  { names: ["-l", "--line-length"], takesValue: true, operation: "read", valueKind: "expression" },
  { names: ["-n", "--quiet", "--silent"], takesValue: false, operation: "read", flag: true },
  { names: ["-E", "-r", "-z", "-s", "-u", "--sandbox", "--debug"], takesValue: false, operation: "read", flag: true },
];

const AWK_OPTS: OptionSchema[] = [
  { names: ["-i", "--in-place"], takesValue: false, operation: "write", inlineSuffix: true },
  { names: ["-f", "--file"], takesValue: true, operation: "read", isPattern: true },
  { names: ["-e"], takesValue: true, operation: "read", valueKind: "expression", isPattern: true },
  { names: ["-F", "--field-separator"], takesValue: true, operation: "read", valueKind: "expression" },
  { names: ["-v", "--assign"], takesValue: true, operation: "read", valueKind: "expression" },
  { names: ["-V", "--version", "-h", "--help"], takesValue: false, operation: "read", flag: true },
];

const SORT_OPTS: OptionSchema[] = [
  { names: ["-o", "--output"], takesValue: true, operation: "write" },
  { names: ["-t", "--field-separator", "-k", "--key"], takesValue: true, operation: "read", valueKind: "expression" },
  { names: ["-n", "-r", "-u", "-f", "-b", "-c", "-m", "-h", "-V", "-s", "--numeric-sort", "--reverse", "--unique", "--ignore-case", "--stable", "--check", "--merge", "--version", "--help"], takesValue: false, operation: "read", flag: true },
];

const UNIQ_OPTS: OptionSchema[] = [
  { names: ["-o", "--output"], takesValue: true, operation: "write" },
  { names: ["-c", "-d", "-u", "-i", "--count", "--repeated", "--unique", "--ignore-case", "--version", "--help"], takesValue: false, operation: "read", flag: true },
];

const TEXT_CONFIG: Record<string, {
  class: "inspect" | "modify" | "unknown";
  schemas: OptionSchema[];
  reason: string;
  /** sed/awk 在出现写选项（-i）时，位置参数是原地修改目标而非只读输入。 */
  inPlace?: boolean;
  /** 首个位置参数是程序（sed/awk 经典形式），未出现 -e/-f 时跳过。 */
  programFirst?: boolean;
}> = {
  sed: { class: "inspect", schemas: SED_OPTS, reason: "stream editor", inPlace: true, programFirst: true },
  awk: { class: "inspect", schemas: AWK_OPTS, reason: "pattern scanning", inPlace: true, programFirst: true },
  sort: { class: "inspect", schemas: SORT_OPTS, reason: "sort lines" },
  uniq: { class: "inspect", schemas: UNIQ_OPTS, reason: "unique lines" },
};

/** 选项派生意图的合成 span：真实 token 位置未知，不参与精确定位。 */
const SYNTHETIC_SPAN: SourceSpan = { start: 0, end: 0 };

/** 选项派生的路径意图（source: option，conservative 置信度）。 */
function optionIntent(operation: "read" | "write", rawPath: string): PathIntent {
  return { operation, rawPath, source: "option", span: SYNTHETIC_SPAN, confidence: "conservative" };
}

/**
 * 解析选项模式，提取路径 intent。
 * 遇到无法确定是否为文件值的选项时设置 opaque。
 */
function parseOptions(
  args: ShellArg[],
  schemas: OptionSchema[],
  index: number,
  inPlace: boolean,
  programFirst: boolean,
): { intents: PathIntent[]; opaque: boolean; sawWrite: boolean } {
  const intents: PathIntent[] = [];
  let opaque = false;
  let sawWrite = false;
  let sawPattern = false;
  let programPending = programFirst;
  let afterDoubleDash = false;

  while (index < args.length) {
    const token = args[index]!;
    const val = token.value ?? "";

    if (!afterDoubleDash && val === "--") { afterDoubleDash = true; index++; continue; } // 之后的 token 全部按位置参数处理
    if (afterDoubleDash || !val.startsWith("-")) {
      // 位置参数：sed/awk 经典形式的首个位置参数是程序（无 -e/-f 时），跳过
      if (programPending && !sawPattern) {
        programPending = false;
        index++;
        continue;
      }
      programPending = false;
      // 其余位置参数：输入文件（in-place 模式下出现写选项时是原地修改目标）
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
        if (inline.operation === "write") sawWrite = true;
        index++;
        continue;
      }
      // 短选项内联值：-F,、-vfoo、-es/x/y/（值紧附在选项名后）
      const short = schemas.find((s) => !s.flag && s.takesValue && s.names.some((n) =>
        n.length === 2 && n.startsWith("-") && val.startsWith(n) && val.length > 2,
      ));
      if (short) {
        if (short.isPattern) sawPattern = true;
        const inlineVal = val.slice(2);
        if (short.valueKind !== "expression" && inlineVal.length > 0) {
          intents.push(optionIntent(short.operation, inlineVal));
        }
        index++;
        continue;
      }
      // 不认识这个选项 → opaque
      opaque = true;
      index++;
      continue;
    }

    if (schema.isPattern) sawPattern = true;

    if (!schema.takesValue) {
      if (!schema.flag) {
        // 无值写选项（如 sed -i）：仅标记 in-place 写意图，不产生空路径 intent
        if (schema.operation === "write") sawWrite = true;
      }
      index++;
      continue;
    }

    // 取值选项统一消费下一个 token：expression 值（sed -e / awk -e 等）不产生路径 intent，其余视为文件路径
    if (index + 1 < args.length) {
      const nextVal = args[index + 1]!.value;
      if (schema.valueKind !== "expression" && nextVal) {
        intents.push(optionIntent(schema.operation, nextVal));
      }
      index += 2;
    } else {
      index++;
    }
  }

  return { intents, opaque, sawWrite };
}

export const textTransformAdapter: CommandAdapter = {
  names: Object.keys(TEXT_CONFIG),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const config = TEXT_CONFIG[name];
    if (!config) return makeSemantics("unknown", { reason: `unknown text command: ${name}`, opaque: true });

    // 解析选项
    const { intents: optionIntents, opaque, sawWrite } = parseOptions([...node.args], config.schemas, 0, config.inPlace === true, config.programFirst === true);

    // 如果产生了写意图（-o/--output 或 in-place -i），升级为 modify
    const hasWrite = sawWrite || optionIntents.some((i) => i.operation === "write");
    const cls: "inspect" | "modify" | "unknown" = hasWrite ? "modify" : config.class;

    return makeSemantics(cls, {
      reason: config.reason,
      intents: optionIntents,
      opaque,
    });
  },
};
