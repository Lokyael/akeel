// command-semantics/adapters/option-parse.ts — 统一选项遍历引擎（B 候选）
//
// 收敛 text-transform/search/shared.extractPositionalArgs/git.writeOutputArgs 四套
// 「选项取值消费」遍历为一个深模块：小接口 parseOptions(args, schema)，复杂行为内置。
// 制度化 D-040（值性质 file/expression）与位置参数性质（file/program-first/set）。
// config-parse 独立（读写轴 + 配置目标解析是分类策略领域，非值消费遍历，B1 决策）。
//
// 未知选项策略由 OptConfig.opaqueOnUnknown 显式裁决（C 候选落点）：
//  - text-transform / search / filesystem / read → true（fail-closed，行为收紧）
//  - git 的 -o 提取 → false（子集提取：未知选项是合法的，如 --format）

import type { ShellArg, SourceSpan } from "../../shell-parse/types";

/** 选项声明（一条 = 同形式同语义的名字组；跨形式差异拆条，如 -e vs --regexp）。 */
export interface Opt {
  names: readonly string[];
  /** D-040 值性质：file = 值产生路径 intent；expression = 值被消费不产生；flag = 无值。 */
  kind: "file" | "expression" | "flag";
  /** 值/标志产生的路径操作（kind=flag + operation=write = 无值写标志，如 sed -i、find -delete）。 */
  operation?: "read" | "write";
  /**
   * 接受形式（默认 ["separated"]）：
   * separated — -o FILE（消费下一 token）
   * equals    — --output=FILE（= 附着，长选项）
   * attached  — -oFILE / -ePATTERN（短选项无边界附着）
   * suffix    — -i.bak（无值选项的后缀，kind=flag 时使用；与 attached 的取值语义不同）
   */
  forms?: readonly ("separated" | "equals" | "attached" | "suffix")[];
  /** 提供程序/模式（-e/-f）：命中后位置参数起点左移（program-first 失效）。 */
  isPattern?: boolean;
  /** 消费到终止符（-exec → ["+", ";"]）；区内 token 标记 consumed，不参与 flags/positional。 */
  consumeUntil?: readonly string[];
}

/** 命令级配置。 */
export interface OptConfig {
  opts: readonly Opt[];
  /** 位置参数性质：program-first 首个位置参数是程序（无 -e/-f 时）；set 全部非文件（tr 字符集）。 */
  positional: "file" | "program-first" | "set";
  /** 未知选项策略（C 候选单点裁决）。 */
  opaqueOnUnknown: boolean;
}

export interface ConsumedValue {
  option: string;
  value: string;
  kind: "file" | "expression";
  operation: "read" | "write";
  /** 选项 token 的 span（供 adapter 按出现顺序合并 positional/consumed intent）。 */
  span: SourceSpan;
}

export interface ParseResult {
  /** 位置参数（set 性质时为空——位置参数非文件，消费但不输出）。 */
  positional: readonly ShellArg[];
  /** 被消费的取值选项（含值性质与操作；adapter 把 kind=file 转路径 intent）。 */
  consumed: readonly ConsumedValue[];
  /** 无值标志（cluster 逐字符、长选项、consumeUntil 区外）。 */
  flags: readonly string[];
  /** 出现写选项（-i/-delete/-o FILE）→ adapter 升级 modify 或标记 in-place。 */
  sawWrite: boolean;
  /** 未知选项（按 opaqueOnUnknown 裁决；含未知 cluster 字符，统一 text-transform 语义）。 */
  opaque: boolean;
}

function buildIndex(opts: readonly Opt[]): Map<string, Opt> {
  const index = new Map<string, Opt>();
  for (const opt of opts) {
    for (const name of opt.names) {
      if (index.has(name)) throw new Error(`option-parse: duplicate option name: ${name}`);
      index.set(name, opt);
    }
  }
  return index;
}

export function parseOptions(args: readonly ShellArg[], config: OptConfig): ParseResult {
  const byName = buildIndex(config.opts);
  const positional: ShellArg[] = [];
  const consumed: ConsumedValue[] = [];
  const flags: string[] = [];
  let sawWrite = false;
  let opaque = false;
  let sawPattern = false;
  let programPending = config.positional === "program-first";
  let afterDoubleDash = false;

  const markWrite = (opt: Opt): void => {
    if (opt.operation === "write") sawWrite = true;
  };
  const recordValue = (option: string, value: string, opt: Opt, span: SourceSpan): void => {
    if (opt.isPattern) sawPattern = true;
    if (value) consumed.push({ option, value, kind: opt.kind === "expression" ? "expression" : "file", operation: opt.operation ?? "read", span });
  };
  const pushFlag = (name: string, opt: Opt): void => {
    if (opt.isPattern) sawPattern = true;
    flags.push(name);
    markWrite(opt);
  };

  let i = 0;
  while (i < args.length) {
    const token = args[i]!;
    const val = token.value ?? "";

    // ── `--` 之后全部位置参数 ──
    if (!afterDoubleDash && val === "--") { afterDoubleDash = true; i++; continue; }
    if (afterDoubleDash || !val.startsWith("-")) {
      // program-first：首个位置参数是程序（无 -e/-f 时），跳过
      if (programPending && !sawPattern) { programPending = false; i++; continue; }
      programPending = false;
      if (config.positional !== "set") positional.push(token);
      i++;
      continue;
    }

    const opt = byName.get(val);

    // ── 长选项 =VALUE（--expression=…、--output=…、--in-place=.bak）──
    // 注意：flag 选项也可有 = 形式（--in-place=.bak → 后缀值忽略，标记写）
    if (!opt && val.startsWith("--")) {
      const eq = val.indexOf("=");
      if (eq > 0) {
        const name = val.slice(0, eq);
        const eqOpt = byName.get(name);
        if (eqOpt && (eqOpt.forms ?? ["separated"]).includes("equals")) {
          if (eqOpt.kind === "flag") pushFlag(name, eqOpt);
          else {
            recordValue(name, val.slice(eq + 1), eqOpt, token.span);
            markWrite(eqOpt);
          }
          i++;
          continue;
        }
      }
    }

    // ── suffix：无值选项的后缀（-i.bak）──
    if (!opt) {
      const suffixOpt = config.opts.find(
        (o) => o.kind === "flag" && (o.forms ?? []).includes("suffix")
          && !val.startsWith("--")
          && o.names.some((n) => val.startsWith(n) && val.length > n.length),
      );
      if (suffixOpt) {
        // 推规范名（-i.bak → "-i"）：flags 是「无值标志」集合，不携带后缀杂质
        const hitName = suffixOpt.names.find((n) => val.startsWith(n) && val.length > n.length)!;
        pushFlag(hitName, suffixOpt);
        i++;
        continue;
      }
    }

    // ── attached：短选项取值附着（-oFILE、-ePATTERN、-vfoo）──
    if (!opt) {
      const attOpt = config.opts.find(
        (o) => o.kind !== "flag" && (o.forms ?? []).includes("attached")
          && !val.startsWith("--")
          && o.names.some((n) => n.length === 2 && n.startsWith("-") && val.startsWith(n) && val.length > 2),
      );
      if (attOpt) {
        const shortName = attOpt.names.find((n) => n.length === 2 && n.startsWith("-") && val.startsWith(n))!;
        recordValue(shortName, val.slice(2), attOpt, token.span);
        markWrite(attOpt);
        i++;
        continue;
      }
    }

    // ── 精确名命中 ──
    if (opt) {
      if (opt.consumeUntil) {
        // -exec/-execdir/-ok：消费到终止符（+ / ;）或命令末尾；区内 token 不参与 flags/positional
        markWrite(opt);
        i++;
        while (i < args.length) {
          const v = args[i]!.value ?? "";
          i++;
          if (opt.consumeUntil.includes(v)) break;
        }
        continue;
      }
      if (opt.kind === "flag") {
        pushFlag(val, opt);
        i++;
        continue;
      }
      // 取值选项：separated 消费下一 token
      if ((opt.forms ?? ["separated"]).includes("separated")) {
        if (i + 1 < args.length) {
          recordValue(val, args[i + 1]!.value ?? "", opt, token.span);
          markWrite(opt);
          i += 2;
          continue;
        }
        i++; // 缺值（POSIX 错误输入）：静默不消费
        continue;
      }
      // 取值但 forms 不含 separated（equals/attached 未命中）→ 无法消费，保守 opaque
      if (config.opaqueOnUnknown) opaque = true;
      i++;
      continue;
    }

    // ── POSIX 组合簇（-rn、-vd、-rt d）──
    // 副作用延迟到整簇判定完成：未知字符时丢弃全部（flags/sawWrite/sawPattern 不残留，
    // 引擎中间状态确定性——opaque 虽是硬拒优先级，但簇前缀的写标志不得污染后续语义）
    if (!val.startsWith("--") && val.length > 2) {
      let unknownChar = false;
      let valueOpt: { name: string; opt: Opt; idx: number } | null = null;
      const pendingFlags: string[] = [];
      let pendingWrite = false;
      let pendingPattern = false;
      for (let k = 1; k < val.length; k++) {
        const cname = `-${val[k]}`;
        const copt = byName.get(cname);
        if (!copt) { unknownChar = true; break; }
        if (copt.kind === "flag") {
          if (copt.isPattern) pendingPattern = true;
          if (copt.operation === "write") pendingWrite = true;
          pendingFlags.push(cname);
        } else {
          // 首个取值字符：其前字符为 flag 簇，其后（如有）为附着值
          valueOpt = { name: cname, opt: copt, idx: k };
          break;
        }
      }
      if (unknownChar) {
        if (config.opaqueOnUnknown) opaque = true;
        i++;
        continue;
      }
      if (pendingWrite) sawWrite = true;
      if (pendingPattern) sawPattern = true;
      flags.push(...pendingFlags);
      if (valueOpt) {
        if (valueOpt.idx < val.length - 1) {
          recordValue(valueOpt.name, val.slice(valueOpt.idx + 1), valueOpt.opt, token.span);
        } else if (i + 1 < args.length) {
          recordValue(valueOpt.name, args[i + 1]!.value ?? "", valueOpt.opt, token.span);
          i++;
        }
        markWrite(valueOpt.opt);
        i++;
        continue;
      }
      i++; // 纯 flag 簇
      continue;
    }

    // ── 未知选项 ──
    if (config.opaqueOnUnknown) opaque = true;
    i++;
  }

  return { positional, consumed, flags, sawWrite, opaque };
}
