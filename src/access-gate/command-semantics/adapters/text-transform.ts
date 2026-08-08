// 文本处理命令 — sed, awk, sort, uniq, tr 的选项语义

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics, matchFlagCluster, optionIntent } from "./shared";

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

// tr 无文件参数（GNU/POSIX 均只读 stdin）；选项全为 flag，positionals（SET1/SET2）是字符集非文件路径。
const TR_OPTS: OptionSchema[] = [
  { names: ["-c", "--complement", "-d", "--delete", "-s", "--squeeze-repeats", "-t", "--truncate-set1", "--help", "--version"], takesValue: false, operation: "read", flag: true },
];

const TEXT_CONFIG: Record<string, {
  class: "inspect" | "modify" | "unknown";
  schemas: OptionSchema[];
  reason: string;
  /** sed/awk 在出现写选项（-i）时，位置参数是原地修改目标而非只读输入。 */
  inPlace?: boolean;
  /** 首个位置参数是程序（sed/awk 经典形式），未出现 -e/-f 时跳过。 */
  programFirst?: boolean;
  /** 位置参数是字符集等非文件值（tr SET1/SET2）：消费但不产生路径 intent（D-027 值性质）。 */
  positionalsNotFiles?: boolean;
}> = {
  sed: { class: "inspect", schemas: SED_OPTS, reason: "stream editor", inPlace: true, programFirst: true },
  awk: { class: "inspect", schemas: AWK_OPTS, reason: "pattern scanning", inPlace: true, programFirst: true },
  sort: { class: "inspect", schemas: SORT_OPTS, reason: "sort lines" },
  uniq: { class: "inspect", schemas: UNIQ_OPTS, reason: "unique lines" },
  tr: { class: "inspect", schemas: TR_OPTS, reason: "translate characters", positionalsNotFiles: true },
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
  programFirst: boolean,
  positionalsNotFiles: boolean,
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
      // 其余位置参数：输入文件（in-place 模式下出现写选项时是原地修改目标）；tr 等 positionalsNotFiles 命令的字符集非文件，消费不产生 intent
      if (!positionalsNotFiles) {
        intents.push({
          operation: inPlace && sawWrite ? "write" : "read",
          rawPath: val,
          source: "argument",
          span: token.span,
          confidence: "exact",
        });
      }
      index++;
      continue;
    }

    // 长选项 =VALUE 形式（--expression=...、--output=...、--in-place=.bak）
    if (!afterDoubleDash && val.startsWith("--")) {
      const eq = val.indexOf("=");
      if (eq > 0) {
        const name = val.slice(0, eq);
        const attachedVal = val.slice(eq + 1);
        const schema = schemas.find((s) => s.names.includes(name));
        if (schema) {
          if (schema.isPattern) sawPattern = true;
          if (schema.takesValue) {
            if (schema.valueKind !== "expression" && attachedVal) {
              intents.push(optionIntent(schema.operation, attachedVal));
            }
          } else if (!schema.flag && schema.operation === "write") {
            sawWrite = true;
          }
          index++;
          continue;
        }
        opaque = true;
        index++;
        continue;
      }
    }

    // 查找匹配的 schema
    const schema = schemas.find((s) => s.names.includes(val));
    if (!schema) {
      // inline 后缀形式：-i.bak（短选项值附在选项上，不是文件路径；长形式 --in-place= 已由上方 =VALUE 分支处理）
      const inline = schemas.find((s) => s.inlineSuffix && s.names.some((n) =>
        !val.startsWith("--") && val.startsWith(n) && val.length > n.length,
      ));
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
      // 组合纯 flag 短选项：-rn、-cd、-nE（POSIX 组合短选项，逐字符均为无值 flag 时消费）。
      // 簇内含带值选项（如 sed -ne、sort -oFILE）返回 null，落回后续分支——附着值语义由上面两分支负责，保守不扩展。
      const cluster = matchFlagCluster(val, schemas);
      if (cluster) {
        for (const s of cluster) {
          if (s.isPattern) sawPattern = true;
          if (s.operation === "write") sawWrite = true;
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
    const { intents: optionIntents, opaque, sawWrite } = parseOptions([...node.args], config.schemas, 0, config.inPlace === true, config.programFirst === true, config.positionalsNotFiles === true);

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
