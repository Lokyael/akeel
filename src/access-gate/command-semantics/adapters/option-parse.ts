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

/** class 调节目标（D-040）：选项命中后对命令分类的升降级。引擎内部类型，
 * 消费方通过 ParseResult.classAdjust 读取（无需显式引用）。 */
type ClassAdjust = "destroy" | "modify" | "inspect";

/** 风险序：destroy > modify > inspect（fail-closed，多命中取最高风险）。 */
const ADJUST_RISK: Readonly<Record<ClassAdjust, number>> = { destroy: 2, modify: 1, inspect: 0 };

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
  /** 消费到终止符（-exec → ["+", ";"]）；区内 token 标记 consumed，不参与 flags/positional。
   * 必须携带 operation: "write"（D-040，防静默漏检——见 validateOpts）。 */
  consumeUntil?: readonly string[];
  /** class 调节（D-040）：命中后升级命令分类（date -s → modify；git push -f → destroy）。 */
  upgradeTo?: "modify" | "destroy";
  /** class 调节（D-040）：命中后降级命令分类（black --check → inspect）。 */
  downgradeTo?: "inspect";
}

/** 命令级配置。 */
export interface OptConfig {
  opts: readonly Opt[];
  /** 位置参数性质：program-first 首个位置参数是程序（无 -e/-f 时）；set 全部非文件（tr 字符集）。 */
  positional: "file" | "program-first" | "set";
  /** 未知选项策略（C 候选单点裁决）。 */
  opaqueOnUnknown: boolean;
}

interface ConsumedValue {
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
  /** class 调节（D-040）：命中的最高风险调节（destroy > modify > inspect）；未命中 null。 */
  classAdjust: ClassAdjust | null;
}

// ── 索引 + 校验（按 opts 数组引用缓存，D-040） ──
// opts 均为模块级常量（引用稳定），WeakMap 缓存消除每命令每次的索引重建与重复校验。

interface OptIndex {
  byName: Map<string, Opt>;
  /** 声明了 attached 形式的短名（2 字符，-o）。 */
  attachedNames: readonly { short: string; opt: Opt }[];
  /** 声明了 suffix 形式的名字（-i、--in-place…）。 */
  suffixNames: readonly { name: string; opt: Opt }[];
}

const _indexCache = new WeakMap<readonly Opt[], OptIndex>();

/** 一个名字是否以另一个名字为真前缀（-i 是 -in、-i.bak 匹配候选的歧义来源）。 */
function isProperPrefix(prefix: string, name: string): boolean {
  return name.length > prefix.length && name.startsWith(prefix);
}

function validateOpts(opts: readonly Opt[]): void {
  for (const opt of opts) {
    // E：consumeUntil 必须声明写操作——引擎在消费区仅标记 sawWrite，无 write 即静默漏检。
    if (opt.consumeUntil && opt.operation !== "write") {
      throw new Error(`option-parse: consumeUntil option ${opt.names.join("/")} must declare operation: "write"`);
    }
  }
  // B：suffix/attached 前缀重叠——匹配按声明顺序线性扫，前缀重叠使归属依赖声明顺序（隐式优先级）。
  const overlappable = opts.filter((o) => (o.forms ?? []).some((f) => f === "suffix" || f === "attached"));
  for (let i = 0; i < overlappable.length; i++) {
    const a = overlappable[i]!;
    for (let j = i + 1; j < overlappable.length; j++) {
      const b = overlappable[j]!;
      for (const na of a.names) {
        for (const nb of b.names) {
          if (na === nb) continue; // 精确冲突已由 buildIndex 拒绝
          if (isProperPrefix(na, nb) || isProperPrefix(nb, na)) {
            throw new Error(`option-parse: ambiguous prefix overlap between "${na}" and "${nb}" (suffix/attached forms)`);
          }
        }
      }
    }
  }
}

function buildIndex(opts: readonly Opt[]): OptIndex {
  const cached = _indexCache.get(opts);
  if (cached) return cached;
  validateOpts(opts);
  const byName = new Map<string, Opt>();
  const attachedNames: { short: string; opt: Opt }[] = [];
  const suffixNames: { name: string; opt: Opt }[] = [];
  for (const opt of opts) {
    const forms = opt.forms ?? [];
    for (const name of opt.names) {
      if (byName.has(name)) throw new Error(`option-parse: duplicate option name: ${name}`);
      byName.set(name, opt);
      if (forms.includes("suffix")) suffixNames.push({ name, opt });
      if (forms.includes("attached") && name.length === 2 && name.startsWith("-")) attachedNames.push({ short: name, opt });
    }
  }
  const index: OptIndex = { byName, attachedNames, suffixNames };
  _indexCache.set(opts, index);
  return index;
}

export function parseOptions(args: readonly ShellArg[], config: OptConfig): ParseResult {
  const { byName, attachedNames, suffixNames } = buildIndex(config.opts);
  const positional: ShellArg[] = [];
  const consumed: ConsumedValue[] = [];
  const flags: string[] = [];
  let sawWrite = false;
  let opaque = false;
  let sawPattern = false;
  let programPending = config.positional === "program-first";
  let afterDoubleDash = false;
  let classAdjust: ClassAdjust | null = null;

  const markWrite = (opt: Opt): void => {
    if (opt.operation === "write") sawWrite = true;
  };
  /** B1：累计最高风险的 class 调节（destroy > modify > inspect，fail-closed）。 */
  const applyAdjust = (opt: Opt): void => {
    const adjust = opt.upgradeTo ?? opt.downgradeTo;
    if (!adjust) return;
    if (classAdjust === null || ADJUST_RISK[adjust] > ADJUST_RISK[classAdjust]) classAdjust = adjust;
  };
  const recordValue = (option: string, value: string, opt: Opt, span: SourceSpan): void => {
    if (opt.isPattern) sawPattern = true;
    applyAdjust(opt);
    if (value) consumed.push({ option, value, kind: opt.kind === "expression" ? "expression" : "file", operation: opt.operation ?? "read", span });
  };
  const pushFlag = (name: string, opt: Opt): void => {
    if (opt.isPattern) sawPattern = true;
    applyAdjust(opt);
    flags.push(name);
    markWrite(opt);
  };

  let i = 0;
  while (i < args.length) {
    const token = args[i]!;
    const val = token.value;

    // ── `--` 之后全部位置参数；裸 `-` 是 stdin 约定（工具自行解释），按位置参数处理 ──
    if (!afterDoubleDash && val === "--") { afterDoubleDash = true; i++; continue; }
    if (afterDoubleDash || !val.startsWith("-") || val === "-") {
      // program-first：首个位置参数是程序（无 -e/-f 时），跳过；非首位置参数直接落位
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

    // ── suffix：无值选项的后缀（-i.bak）──（预建索引替代线性扫，B/D）
    if (!opt && !val.startsWith("--")) {
      let hitName: string | null = null;
      let hitOpt: Opt | null = null;
      for (const { name, opt: candidate } of suffixNames) {
        if (candidate.kind !== "flag") continue;
        if (val.startsWith(name) && val.length > name.length) {
          hitName = name;
          hitOpt = candidate;
          break;
        }
      }
      if (hitName && hitOpt) {
        // 推规范名（-i.bak → "-i"）：flags 是「无值标志」集合，不携带后缀杂质
        pushFlag(hitName, hitOpt);
        i++;
        continue;
      }
    }

    // ── attached：短选项取值附着（-oFILE、-ePATTERN、-vfoo）──（预建索引替代线性扫，B/D）
    if (!opt && !val.startsWith("--")) {
      let hitShort: string | null = null;
      let hitOpt: Opt | null = null;
      for (const { short, opt: candidate } of attachedNames) {
        if (candidate.kind === "flag") continue;
        if (val.startsWith(short) && val.length > short.length) {
          hitShort = short;
          hitOpt = candidate;
          break;
        }
      }
      if (hitShort && hitOpt) {
        recordValue(hitShort, val.slice(2), hitOpt, token.span);
        markWrite(hitOpt);
        i++;
        continue;
      }
    }

    // ── 精确名命中 ──
    if (opt) {
      if (opt.consumeUntil) {
        // -exec/-execdir/-ok：消费到终止符（+ / ;）或命令末尾；区内 token 不参与 flags/positional
        markWrite(opt);
        applyAdjust(opt);
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

    // ── 数值短选项（-15、-250）：GNU/BSD 计数值惯例（head/tail 等），消费但不产生路径 intent ──
    if (!val.startsWith("--") && /^-\d+$/.test(val)) {
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
      let pendingAdjust: ClassAdjust | null = null;
      const noteAdjust = (opt: Opt): void => {
        const adjust = opt.upgradeTo ?? opt.downgradeTo;
        if (adjust && (pendingAdjust === null || ADJUST_RISK[adjust] > ADJUST_RISK[pendingAdjust])) pendingAdjust = adjust;
      };
      for (let k = 1; k < val.length; k++) {
        const cname = `-${val[k]}`;
        const copt = byName.get(cname);
        if (!copt) { unknownChar = true; break; }
        if (copt.kind === "flag") {
          if (copt.isPattern) pendingPattern = true;
          if (copt.operation === "write") pendingWrite = true;
          noteAdjust(copt);
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
      if (pendingAdjust && (classAdjust === null || ADJUST_RISK[pendingAdjust] > ADJUST_RISK[classAdjust])) classAdjust = pendingAdjust;
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

  return { positional, consumed, flags, sawWrite, opaque, classAdjust };
}
