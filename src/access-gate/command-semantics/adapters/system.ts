// system 命令语义 — date
// date 读取/设置系统时间：默认 inspect；-r/--reference、-f/--file 读取文件（read intent）；
// -s/--set 修改系统时钟（modify）；+FORMAT 与选项值是格式/时间字符串，不产生路径 intent。

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, PathIntent, SemanticContext } from "../types";
import { makeSemantics } from "./shared";

/** 取值选项：值被消费，不产生路径 intent（-d/--date 的值是时间字符串）。 */
const VALUE_OPTS = new Set(["-d", "--date"]);
/** 文件取值选项：值产生 read intent（-r/--reference、-f/--file）。 */
const FILE_VALUE_OPTS = new Set(["-r", "--reference", "-f", "--file"]);
/** 修改类选项：检测到则 class 升级为 modify。 */
const SET_OPTS = new Set(["-s", "--set"]);
/** 无值标志。 */
const FLAG_OPTS = new Set(["-u", "-R", "-I", "--utc", "--universal", "--rfc-822", "--iso-8601", "--version", "--help"]);

const SYNTHETIC_SPAN = { start: 0, end: 0 };

function readIntent(rawPath: string): PathIntent {
  return { operation: "read", rawPath, source: "option", span: SYNTHETIC_SPAN, confidence: "conservative" };
}

export const dateAdapter: CommandAdapter = {
  names: ["date"],
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    let cls: "inspect" | "modify" = "inspect";
    let opaque = false;
    const intents: PathIntent[] = [];

    const args = [...node.args];
    for (let i = 0; i < args.length; i++) {
      const val = args[i]!.value ?? "";

      // +FORMAT 输出格式与裸位置参数：不产生路径 intent
      if (val.startsWith("+") || !val.startsWith("-")) continue;
      if (val === "--") break;

      // 长选项 =VALUE 形式
      const eq = val.indexOf("=");
      if (val.startsWith("--") && eq > 0) {
        const name = val.slice(0, eq);
        const value = val.slice(eq + 1);
        if (name === "--date") continue;
        if (name === "--reference" || name === "--file") {
          if (value) intents.push(readIntent(value));
          continue;
        }
        if (name === "--set") { cls = "modify"; continue; }
        if (name === "--iso-8601" || name === "--rfc-3339") continue; // 格式说明附加值，非路径
        opaque = true;
        continue;
      }

      // 精确匹配取值选项（消费下一个 token 作为值）
      if (VALUE_OPTS.has(val) || FILE_VALUE_OPTS.has(val) || SET_OPTS.has(val)) {
        const value = args[i + 1]?.value ?? "";
        if (FILE_VALUE_OPTS.has(val) && value) intents.push(readIntent(value));
        if (SET_OPTS.has(val)) cls = "modify";
        i++;
        continue;
      }

      // 短选项附加值：-dSTR -sSTR -rFILE -fFILE -Iseconds
      if (val.length > 2) {
        const short = val.slice(0, 2);
        const attached = val.slice(2);
        if (short === "-d") continue;
        if (short === "-r" || short === "-f") {
          if (attached) intents.push(readIntent(attached));
          continue;
        }
        if (short === "-s") { cls = "modify"; continue; }
        if (short === "-I") continue; // -Iseconds 格式说明附加值
      }

      if (FLAG_OPTS.has(val)) continue;
      opaque = true;
    }

    return makeSemantics(cls, { reason: "system time", intents, opaque });
  },
};
