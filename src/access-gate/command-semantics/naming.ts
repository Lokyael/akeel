// command-semantics/naming.ts — 可执行名身份归一（公共层）
// 原 shared.ts 上升拆分（E）：registry 的 adapter 索引键与 preflight 的硬规则
// 解释器判定共用同一映射（单一来源，防两处漂移）。

/**
 * 可执行名规范化：版本化/别名解释器映射回基础名（nodejs→node、perl5→perl、
 * python3.11→python3）。
 */
export function canonicalExecutableName(base: string): string {
  if (/^python3\.\d+$/.test(base)) return "python3";
  if (base === "nodejs") return "node";
  if (base === "perl5") return "perl";
  return base;
}
