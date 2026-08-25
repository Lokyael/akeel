// shell-parse/region.ts — 区域扫描（T-062 P1T1）
// 在"按操作符切组"的 token 流上做栈式区域识别（region pass）：
//   - 命令位 + 未引用的 `for <var> [in words...] ; do ... done` → LoopScope 构建信息（命令不回指 W1）
//   - 非 for 保留字区（if/while/until/case/select/function/[[/((/圆括号/花括号）→ OpaqueRegion
//   - `time`/`!` 管线形态（|/||/&& 连接，含组内 for/while 等）→ OpaqueRegion；简单主体放行（normalize 剥离 A0-1）
//   - 组首保留字无可对应开放范围（do/done/then/fi/elif/esac…）→ unsafeSyntax（G6，对齐 bash）
//   - 嵌套配对：for/while/until/select 共享 done；if→fi、case→esac、[[→]]、((→))、(→)、{→}、function→}
// 产出供 parse() 汇编 commands（去边界词）+ LoopScope + OpaqueRegion。

import type { LexToken } from "./lexer";
import type {
  OpaqueRegion,
  RedirectionKind,
  ShellOperator,
  ShellRedirectionNode,
  ShellArg,
  SourceSpan,
} from "./types";

/** 非 for 保留字 → opaque 消费终结符。 */
const OPAQUE_END: Readonly<Record<string, string>> = {
  if: "fi",
  while: "done",
  until: "done",
  case: "esac",
  select: "done",
  "[[": "]]",
  "((": "))",
  "(": ")",
  "{": "}",
  function: "}",
};

/** 无开放范围即语法错的组首保留字（G6）。 */
const STRAY_RESERVED = new Set(["do", "done", "then", "fi", "elif", "else", "esac", "]]", "))", ")", "}"]);

/** time/! 管线的连接操作符。 */
const PIPELINE_JOIN = new Set(["|", "||", "&&"]);

export const MAX_REGION_NESTING = 64;
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const ALL_DIGITS = /^\d+$/;

export interface RegionGroup {
  tokens: LexToken[];
  opBefore: ShellOperator;
}

/** 扫描期 for 作用域构建信息（parse() 汇编 ShellCommandNode 后转正式 LoopScope）。 */
export interface ScopeBuild {
  variable: ShellArg;
  words: ShellArg[];
  hasIn: boolean;
  opBefore: ShellOperator;
  trailingOperator: ShellOperator | null;
  bodyGroupIndices: number[];
  redirections: ShellRedirectionNode[];
  headerSpan: SourceSpan;
  doneSpan: SourceSpan;
}

export interface RegionResult {
  groups: RegionGroup[];
  scopeBuilds: ScopeBuild[];
  opaqueRegions: OpaqueRegion[];
  unsafeSyntax: string | null;
}

/** 重定向 kind 推断（与 parser 的 redirectKind 同规则的精简版；仅用于 region 内重定向采集）。 */
function redirKindOf(op: string, target: string | null): RedirectionKind {
  if (op === "<") return "stdin";
  if (op === "<>" || op === "<&" || op === ">&") {
    if (op !== "<>" && target === "-") return "fdClose";
    if (op !== "<>" && target !== null && ALL_DIGITS.test(target)) return "fdDuplicate";
  }
  if (op === ">" || op === ">|") return "stdout";
  if (op === ">>") return "stdoutAppend";
  if (op === "&>" || op === "&>>") return "stdoutAppend";
  if (op === "<<") return "heredoc";
  if (op === "<<<") return "hereString";
  return "stdout";
}

/** 命令位词：跳过 env 赋值词（G5/R2）与重定向操作符+目标。 */
function commandWordToken(tokens: LexToken[]): LexToken | null {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === "redirect") {
      i += tokens[i + 1]?.kind === "word" ? 2 : 1;
      continue;
    }
    if (t.kind === "word") {
      if (ENV_ASSIGN.test(t.raw)) {
        i++;
        continue;
      }
      return t;
    }
    i++;
  }
  return null;
}

function wordArg(t: LexToken): ShellArg {
  return { raw: t.raw, value: t.value, quoted: t.quoted, dynamic: t.dynamic, span: t.span };
}

function lastSpanEnd(tokens: readonly LexToken[]): number {
  const last = tokens[tokens.length - 1];
  return last ? last.span.end : 0;
}

export function regionPass(tokens: LexToken[]): RegionResult {
  // 先按操作符切组（与 parse() 既有逻辑一致；含空组以保留孤立操作符如 done 后 &）
  const groups: RegionGroup[] = [];
  let current: LexToken[] = [];
  let lastOp: ShellOperator = "start";
  for (const tok of tokens) {
    if (tok.kind === "operator") {
      groups.push({ tokens: current, opBefore: lastOp });
      current = [];
      lastOp = tok.value as ShellOperator;
    } else {
      current.push(tok);
    }
  }
  groups.push({ tokens: current, opBefore: lastOp });

  const output: RegionGroup[] = [];
  const scopeBuilds: ScopeBuild[] = [];
  const opaqueRegions: OpaqueRegion[] = [];

  interface Frame {
    kind: "for" | "opaque";
    terminator: string;
    build?: ScopeBuild;
    opaqueKeyword?: string;
    opaqueStart?: number;
    hasDo?: boolean;
    /** 深括号族（(/{/[[/((）：终结符任意 token 位置匹配（G9），非仅组首。 */
    terminatorAnywhere?: boolean;
  }
  const stack: Frame[] = [];
  let unsafe: string | null = null;

  // 工作队列：do/for 剥除后的剩余组前插
  const queue: RegionGroup[] = [];
  let gi = 0;
  const next = (): RegionGroup | null => (queue.length > 0 ? queue.shift()! : groups[gi++] ?? null);
  /** 当前组的下一原始组（含空组），取操作符。 */
  const nextOpBefore = (): ShellOperator | null => groups[gi]?.opBefore ?? null;

  const pushFrame = (frame: Frame) => {
    if (stack.length >= MAX_REGION_NESTING) {
      unsafe = "nesting too deep";
      return false;
    }
    stack.push(frame);
    return true;
  };

  while (!unsafe) {
    const gNext = next();
    if (!gNext) break;
    const kw = commandWordToken(gNext.tokens);
    const kwValue = kw && !kw.quoted ? kw.value : null;

    // ① 栈顶终结符匹配（done/fi/esac/]}/)) 等；循环组共享 done 由栈序保证）
    if (stack.length > 0) {
      const top0 = stack[stack.length - 1]!;
      const matched = top0.terminatorAnywhere
        ? gNext.tokens.some((t) => t.kind === "word" && !t.quoted && t.value === top0.terminator)
        : kwValue === top0.terminator;
      if (matched) {
        const frame = stack.pop()!;
        if (frame.kind === "for") {
          frame.build!.doneSpan = { start: gNext.tokens[0]!.span.start, end: lastSpanEnd(gNext.tokens) };
          if (frame.build!.trailingOperator == null) frame.build!.trailingOperator = nextOpBefore();
          // I1：done 之后的 post-done 重定向（`done >out`）采集
          const dIdx = gNext.tokens.indexOf(kw ?? gNext.tokens[0]!);
          collectRedirsFrom(gNext.tokens, dIdx + 1, frame.build!.redirections);
          scopeBuilds.push(frame.build!);
        } else {
          opaqueRegions.push({
            keyword: frame.opaqueKeyword!,
            span: { start: frame.opaqueStart!, end: lastSpanEnd(gNext.tokens) },
          });
        }
        continue;
      }
    }

    // ② do 边界：栈顶 for（期待 do）消费之；opaque 帧内 do 剥除后重扫剩余（for-in-while 等）；多余 do → 语法错（G6）
    if (kwValue === "do") {
      const top = stack[stack.length - 1];
      if (top && top.kind === "opaque") {
        const idx = gNext.tokens.indexOf(kw!);
        if (idx >= 0 && idx + 1 < gNext.tokens.length) {
          queue.unshift({ tokens: gNext.tokens.slice(idx + 1), opBefore: gNext.opBefore });
        }
        continue;
      }
      if (!top || top.kind !== "for" || top.hasDo) {
        unsafe = `syntax error near ${kwValue}`;
        break;
      }
      top.hasDo = true;
      const idx = gNext.tokens.indexOf(kw!);
      if (idx >= 0 && idx + 1 < gNext.tokens.length) {
        queue.unshift({ tokens: gNext.tokens.slice(idx + 1), opBefore: gNext.opBefore });
      }
      continue;
    }

    // ③ for 头
    if (kwValue === "for") {
      // R2：赋值词 + 组首 for → bash 语法错（建模永不执行命令无意义）
      if (gNext.tokens.slice(0, gNext.tokens.indexOf(kw!)).some((t) => t.kind === "word" && ENV_ASSIGN.test(t.raw))) {
        unsafe = "invalid for header";
        break;
      }
      const head = parseForHeader(gNext, kw!);
      if (head === null || head === "syntax") {
        // 无 in 词表 / 畸形 → 语法错（V）；C 风格 for (( → opaque（头变量非标识符，吞到配对 done）
        unsafe = head === null ? null : "invalid for header";
        if (head === null) {
          // C 风格 for ((…：头非标识符 → opaque-for
          if (!pushFrame({ kind: "opaque", terminator: "done", opaqueKeyword: "for ((…)", opaqueStart: gNext.tokens[0]!.span.start, hasDo: true })) break;
        } else {
          break;
        }
        continue;
      }
      if (!pushFrame({ kind: "for", terminator: "done", build: head.build, hasDo: head.hasDo })) break;
      if (head.rest.length > 0) queue.unshift({ tokens: head.rest, opBefore: gNext.opBefore });
      continue;
    }

    // ④ time / !（管线形态 opaque；简单主体放行）
    if (kwValue === "time" || kwValue === "!") {
      let swallow = false;
      const nextOp = nextOpBefore();
      if (nextOp && PIPELINE_JOIN.has(nextOp)) swallow = true;
      if (swallow) {
        let end = lastSpanEnd(gNext.tokens);
        while (nextOpBefore() && PIPELINE_JOIN.has(nextOpBefore()!)) {
          const joined = next()!;
          end = lastSpanEnd(joined.tokens);
        }
        opaqueRegions.push({ keyword: "time/!", span: { start: gNext.tokens[0]!.span.start, end } });
      } else {
        // 组内含 for/while 等保留字（`time for …`）→ 整体 opaque（吞到其终结符）
        const inner = commandWordToken(gNext.tokens.slice(gNext.tokens.indexOf(kw!) + 1));
        if (inner && !inner.quoted && inner.value in OPAQUE_END) {
          if (!pushFrame({ kind: "opaque", terminator: OPAQUE_END[inner.value]!, opaqueKeyword: inner.value, opaqueStart: gNext.tokens[0]!.span.start })) break;
        } else if (inner && !inner.quoted && inner.value === "for") {
          if (!pushFrame({ kind: "opaque", terminator: "done", opaqueKeyword: "for", opaqueStart: gNext.tokens[0]!.span.start })) break;
        } else {
          // 简单主体（time ls / ! ls）→ 放行，normalize（A0-1）剥离
          output.push({ tokens: gNext.tokens, opBefore: gNext.opBefore });
          const top = stack[stack.length - 1];
          if (top && top.kind === "for" && top.hasDo) top.build!.bodyGroupIndices.push(output.length - 1);
        }
      }
      continue;
    }

    // ⑤ 非 for 保留字：opaque 或 stray
    if (kwValue !== null && (kwValue in OPAQUE_END || STRAY_RESERVED.has(kwValue))) {
      const top = stack[stack.length - 1];
      if (kwValue in OPAQUE_END) {
        const anywhere = kwValue === "(" || kwValue === "{" || kwValue === "[[" || kwValue === "((";
        if (!pushFrame({ kind: "opaque", terminator: OPAQUE_END[kwValue]!, opaqueKeyword: kwValue, opaqueStart: gNext.tokens[0]!.span.start, terminatorAnywhere: anywhere })) break;
      } else if (top && top.kind === "opaque" && (kwValue === "then" || kwValue === "elif" || kwValue === "else")) {
        // if 结构内部边界词（opaque 帧内吞并，非 stray）
        const idxO = gNext.tokens.indexOf(kw!);
        if (idxO >= 0 && idxO + 1 < gNext.tokens.length) {
          queue.unshift({ tokens: gNext.tokens.slice(idxO + 1), opBefore: gNext.opBefore });
        }
        continue;
      } else {
        unsafe = `syntax error near ${kwValue}`;
        break;
      }
      continue;
    }

    // ⑥ 普通命令组（V1：for 头期间的 |/&&/|| 连接是结构错误；opaque 帧内吞并不发命令）
    const top = stack[stack.length - 1];
    if (top && top.kind === "for" && !top.hasDo
      && (gNext.opBefore === "|" || gNext.opBefore === "&&" || gNext.opBefore === "||")) {
      unsafe = "invalid for header";
      break;
    }
    if (top && top.kind === "opaque") {
      continue; // opaque 帧内普通命令：吞并（不发命令）
    }
    const outIdx = output.length;
    output.push({ tokens: gNext.tokens, opBefore: gNext.opBefore });
    // 嵌套：body 命令记入所有在开 for 帧（外层 loopScopes 的 body 含内层命令引用）
    for (const f of stack) if (f.kind === "for" && f.hasDo) f.build!.bodyGroupIndices.push(outIdx);
  }

  if (unsafe !== null) return { groups: output, scopeBuilds, opaqueRegions, unsafeSyntax: unsafe };
  if (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    return { groups: output, scopeBuilds, opaqueRegions, unsafeSyntax: top.kind === "for" ? "unterminated for" : `unterminated ${top.terminator}` };
  }
  return { groups: output, scopeBuilds, opaqueRegions, unsafeSyntax: null };
}

/** 解析 for 头（`for <var> [in words…] [do…]`）。
 * 返回 { build, rest, hasDo }（rest = do 之后剩余 token）；
 * null = C 风格 `for ((…`（头变量非标识符 → opaque-for）；
 * "syntax" = 畸形（无 in 但有词表等 → 语法错）。 */
function parseForHeader(g: RegionGroup, forTok: LexToken): { build: ScopeBuild; rest: LexToken[]; hasDo: boolean } | null | "syntax" {
  const tokens = g.tokens;
  const start = forTok.span.start;
  const build: ScopeBuild = {
    variable: null as unknown as ShellArg,
    words: [],
    hasIn: false,
    opBefore: g.opBefore,
    trailingOperator: null,
    bodyGroupIndices: [],
    redirections: [],
    headerSpan: { start, end: 0 },
    doneSpan: { start: 0, end: 0 },
  };
  const forIdx = tokens.indexOf(forTok);
  // I1：pre-for 前导重定向（`>out for …`）
  collectRedirsFrom(tokens, 0, build.redirections);
  let i = forIdx + 1;
  // for 后 pre-do 重定向（`for f in a > out; do`；fd 前缀一体折叠）
  while (i < tokens.length) {
    const next = collectRedirAt(tokens, i, build.redirections);
    if (next === null) break;
    i = next;
  }
  const varTok = tokens[i];
  if (!varTok || varTok.kind !== "word" || varTok.quoted || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(varTok.value)) {
    return null; // C 风格 for (( 等 → opaque-for
  }
  build.variable = wordArg(varTok);
  i++;
  if (tokens[i]?.kind === "word" && !tokens[i]!.quoted && tokens[i]!.value === "in") {
    build.hasIn = true;
    i++;
    const words: LexToken[] = [];
    while (i < tokens.length) {
      const next = collectRedirAt(tokens, i, build.redirections); // pre-do 重定向（fd 前缀一体折叠）
      if (next !== null) { i = next; continue; }
      const t = tokens[i]!;
      if (t.kind === "word") {
        if (!t.quoted && t.value === "do") break; // H2：未引用 do 终止词表
        words.push(t);
        i++;
        continue;
      }
      break;
    }
    build.words = words.map(wordArg);
  } else {
    // 无 in：positional 形态合法（`for f; do`）；但有词表（`for f a b; do`）→ bash 语法错（V）
    let j = i;
    while (j < tokens.length && tokens[j]!.kind === "word" && !(tokens[j]!.value === "do" && !tokens[j]!.quoted)) j++;
    if (j > i) return "syntax";
  }
  build.headerSpan = { start, end: lastSpanEnd(tokens) };

  // 同组 do（`for f in a b c do echo x`）→ 仅当后有内容才算 body-do；
  // 孤 do（`for f in do; do…`）是 list 终止符（H2），不消费为 body-do
  const rest = tokens.slice(i);
  const doTok = commandWordToken(rest);
  if (doTok && !doTok.quoted && doTok.value === "do") {
    const after = rest.slice(rest.indexOf(doTok) + 1);
    if (after.length > 0) return { build, rest: after, hasDo: true };
    return { build, rest: [], hasDo: false };
  }
  return { build, rest, hasDo: false };
}

/** 单点重定向采集（fd 数字前缀一体折叠，镜像 parser tryParseRedirect）；消费则返回下一索引，否则 null。 */
function collectRedirAt(tokens: readonly LexToken[], i: number, into: ShellRedirectionNode[]): number | null {
  const t = tokens[i]!;
  if (t.kind === "word" && ALL_DIGITS.test(t.value) && !t.quoted
    && tokens[i + 1]?.kind === "redirect" && tokens[i + 1]!.span.start === t.span.end) {
    const op = tokens[i + 1]!;
    const target = tokens[i + 2]?.kind === "word" ? tokens[i + 2]! : null;
    into.push({
      kind: redirKindOf(op.value, target?.value ?? null),
      fd: Number(t.value),
      target: target ? wordArg(target) : null,
      span: { start: t.span.start, end: target ? target.span.end : op.span.end },
    });
    return target ? i + 3 : i + 2;
  }
  if (t.kind === "redirect") {
    const target = tokens[i + 1]?.kind === "word" ? tokens[i + 1]! : null;
    into.push({
      kind: redirKindOf(t.value, target?.value ?? null),
      fd: null,
      target: target ? wordArg(target) : null,
      span: { start: t.span.start, end: target ? target.span.end : t.span.end },
    });
    return target ? i + 2 : i + 1;
  }
  return null;
}

/** 从 from 起连续采集重定向（post-done / pre-for 区）。 */
function collectRedirsFrom(tokens: readonly LexToken[], from: number, into: ShellRedirectionNode[]): void {
  let i = from;
  while (i < tokens.length) {
    const next = collectRedirAt(tokens, i, into);
    if (next === null) break;
    i = next;
  }
}