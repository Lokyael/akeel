// access-gate/path/glob.ts — 路径通配符语言（globstar 语义）
// 深化（C）：glob 语言模块化——compileGlob 编译一次、globMatches 匹配 N 次。
// 语义对齐 globstar：
//   - `*`  单个路径段内任意（不跨 `/`）→ [^/]*
//   - `?`  单段内单字符 → [^/]
//   - `**` 跨段 globstar：
//       - 开头 `**/x`    → (?:[^/]+/)*x        （零或多段 + 后段裸接）
//       - 中间 `a/**/b`  → a(?:/[^/]+)*/b      （零段 a/b、多段 a/x/b）
//       - 结尾 `a/**`    → a(?:/.*)?           （匹配 a 自身及其下全部）
//   - `/etc/x` 等绝对路径保留前导 `/`
// 与原实现差异（行为变更，需 blocked 矩阵回归）：
//   - 原 `*`→.* 跨段（超宽）；现 `*` 单段
//   - 原 `**`→.* 非零段；现 `**` 含零段

/** 编译一次的 glob 制品。 */
export interface CompiledGlob {
  readonly pattern: string;
  /** pattern 以 `/**` 结尾时，其前缀自身也命中（如 `a/**` 匹配 `a`）。 */
  readonly matchesSelf: boolean;
  readonly prefix: string;
  readonly regex: RegExp;
}

/** 单个普通段的 glob→regex（`*`/`?` 不跨段；其余正则字符转义）。 */
function escapeSegment(seg: string): string {
  return seg
    .replace(/([.+^${}()|[\]\\])/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
}

function globstarPattern(pattern: string): string {
  const leading = pattern.startsWith("/") ? "/" : "";
  const body = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  const segs = body.split("/");
  let out = "";
  let nextNoSlash = false; // 开头 globstar 后首个普通段裸接（不补 "/"）

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (seg === "**") {
      if (i === segs.length - 1) {
        out += "(?:/.*)?";
        nextNoSlash = false;
      } else if (i === 0) {
        out += "(?:[^/]+/)*";
        nextNoSlash = true;
      } else {
        // 中间 globstar：去掉前一普通段的 "/"，斜杠并入 (?:/[^/]+)* 结构
        if (out.endsWith("/")) out = out.slice(0, -1);
        out += "(?:/[^/]+)*";
        nextNoSlash = false;
      }
      continue;
    }
    const needSlash = out !== "" && !nextNoSlash && !out.endsWith("/");
    out += (needSlash ? "/" : "") + escapeSegment(seg);
    nextNoSlash = false;
  }
  return `${leading}${out}`;
}

/** 编译 glob 模式（纯函数，无全局缓存；同一 pattern 只编译一次由消费方持有）。 */
export function compileGlob(pattern: string): CompiledGlob {
  const matchesSelf = pattern.endsWith("/**");
  const prefix = matchesSelf ? pattern.slice(0, -3) : pattern;
  return {
    pattern,
    matchesSelf,
    prefix,
    regex: new RegExp(`^${globstarPattern(pattern)}$`, "i"),
  };
}

/** 匹配：pattern 以 `/**` 结尾时前缀自身命中；否则正则匹配。 */
export function globMatches(compiled: CompiledGlob, value: string): boolean {
  if (compiled.matchesSelf && value === compiled.prefix) return true;
  return compiled.regex.test(value);
}
