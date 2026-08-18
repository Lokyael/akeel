// command-semantics/args.ts — 位置参数提取原语（公共层）
// 原 shared.ts 上升拆分（E）：raw 契约提取族（option-parse 引擎缺席时的纯提取）。

/** 首个非选项 token 的索引（跳过选项；不感知取值选项——raw 契约，D-024）。 */
function firstNonOptionIndex(args: ReadonlyArray<{ readonly value?: string | null }>): number {
  for (let i = 0; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") return -1;
    if (v.startsWith("-")) continue;
    return i;
  }
  return -1;
}

/**
 * 位置参数提取（raw 契约：不消费取值选项的值）——option-parse 引擎缺席时的纯提取。
 * `--` 终止选项区（其后全部位置参数）；`-` 按 dashIsOption 声明：
 * false = stdin 约定算位置词（引擎语义）；true = 选项跳过（git checkout - 的前分支语义）。
 */
export function positionalWords(
  args: ReadonlyArray<{ readonly value?: string | null }>,
  options: { dashIsOption: boolean },
): { value: string }[] {
  let optionsDone = false;
  const result: { value: string }[] = [];
  for (const arg of args) {
    const v = arg.value ?? "";
    if (!optionsDone && v === "--") { optionsDone = true; continue; }
    if (!optionsDone && v.startsWith("-") && (v !== "-" || options.dashIsOption)) continue;
    result.push({ value: v });
  }
  return result;
}

/** 首个位置词（子命令提取）；语义见 positionalWords。 */
export function firstWord(
  args: ReadonlyArray<{ readonly value?: string | null }>,
  options: { dashIsOption: boolean },
): string {
  return positionalWords(args, options)[0]?.value ?? "";
}

/** 子命令候选回退（既有语义）：引擎 positional 为空（全选项输入）时取首个原始 token。 */
export function subcommandArgs(
  positional: readonly { readonly value: string }[],
  args: readonly { readonly value: string }[],
): readonly { readonly value: string }[] {
  return positional.length > 0 ? positional : (args.length > 0 ? [args[0]!] : []);
}

/** 子命令尾部：首个非选项 token 起的全部 token，空格连接（reclassify pattern 匹配用）。
 * 与 adapter 提取不同，它包含选项及取值选项的值——
 * 已知局限：不跳过取值选项的值（如 cargo --manifest-path Cargo.toml build
 * 得到 "Cargo.toml build" 而非 "build"），因为它不依赖 per-adapter 配置。
 * reclassify 的 pattern 使用 substring 匹配（如 "build" 而非 "^build$"），
 * 典型场景（git 子命令）无此问题。详见 D-024。
 */
export function fullSubcommand(args: ReadonlyArray<{ readonly value?: string | null }>): string {
  const idx = firstNonOptionIndex(args);
  if (idx < 0) return "";
  const parts: string[] = [];
  for (let i = idx; i < args.length; i++) {
    const v = args[i]!.value ?? "";
    if (v === "--") break;
    parts.push(v);
  }
  return parts.join(" ");
}
