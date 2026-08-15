// access-gate/ui/footer-layout.ts — Profile Footer 纯布局与数据派生层
// 零宿主依赖（不 import pi 包）：宽度助手经参数显式注入（WidthHelpers），
// 可直接单测（注入 fallbackWidthHelpers），无 import 体操。
// 宿主桥（NativeFooter / pi-tui 选择 / 组件工厂）在 profile-footer.ts。

export interface WidthHelpers {
  /** 显示宽度：剥离 ANSI。宽字符（CJK/emoji）按 2 列计——pi-tui 生产路径；fallback 为 UTF-16 近似（测试环境，ASCII 内容正确）。 */
  visibleWidth(text: string): number;
  /** 按显示宽度截断，尾部追加省略符 "..."。 */
  truncate(text: string, width: number): string;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

export { stripAnsi };

/** fallback：UTF-16 长度近似（测试环境；无 pi-tui，ASCII 内容正确）。 */
export function fallbackWidthHelpers(): WidthHelpers {
  return {
    visibleWidth(text) {
      return stripAnsi(text).length;
    },
    truncate(text, width) {
      if (width <= 0) return "";
      const clean = stripAnsi(text);
      if (clean.length <= width) return clean;
      if (width <= 3) return clean.slice(0, width);
      return `${clean.slice(0, width - 3)}...`;
    },
  };
}

export interface FooterSnapshot {
  cwd: string;
  branch: string | null;
  sessionName: string | undefined;
  profileName: string;
  stats: string;
  context: string;
  provider: string | undefined;
  model: string;
  thinkingLevel: string;
  extensionStatuses?: ReadonlyMap<string, string>;
}

/** 会话条目数据源（buildStats 消费；宿主 session 结构的最小化契约）。 */
export interface FooterEntrySource {
  getEntries(): readonly unknown[];
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

/**
 * left/right 适配（统一 appendRight + fitLine）：装得下→填充；
 * 右超宽→只留右；否则→左截断+填充。宽度 ANSI 感知（pi-tui 或 fallback）。
 */
export function fitLine(left: string, right: string, width: number, helpers: WidthHelpers): string {
  if (width <= 0) return "";
  const rightWidth = helpers.visibleWidth(right);
  if (rightWidth >= width) return helpers.truncate(right, width);
  const leftWidth = width - rightWidth - 2;
  const leftDisplayWidth = helpers.visibleWidth(left);
  if (leftDisplayWidth <= leftWidth) {
    return `${left}${" ".repeat(width - leftDisplayWidth - rightWidth)}${right}`;
  }
  const fitted = helpers.truncate(left, leftWidth);
  return `${fitted}${" ".repeat(Math.max(0, width - helpers.visibleWidth(fitted) - rightWidth))}${right}`;
}

export function renderProfileFooter(snapshot: FooterSnapshot, width: number, helpers: WidthHelpers): string[] {
  const location = snapshot.branch ? `${snapshot.cwd} (${snapshot.branch})` : snapshot.cwd;
  const namedLocation = snapshot.sessionName ? `${location} • ${snapshot.sessionName}` : location;
  const model = snapshot.provider ? `(${snapshot.provider}) ${snapshot.model}` : snapshot.model;
  const modelWithThinking = snapshot.thinkingLevel ? `${model} • ${snapshot.thinkingLevel}` : model;
  const extensionStatuses = snapshot.extensionStatuses ? Array.from(snapshot.extensionStatuses.values()).join(" ") : "";
  const secondLineRight = [modelWithThinking, extensionStatuses].filter(Boolean).join(" ");

  return [
    fitLine(namedLocation, snapshot.profileName, width, helpers),
    fitLine(`${snapshot.stats} ${snapshot.context}`.trim(), secondLineRight, width, helpers),
  ];
}

function readUsage(entry: unknown): { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number } | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const value = entry as Record<string, unknown>;
  if (typeof value.input !== "number" || typeof value.output !== "number") return undefined;
  const cost = value.cost;
  return {
    input: value.input,
    output: value.output,
    cacheRead: typeof value.cacheRead === "number" ? value.cacheRead : 0,
    cacheWrite: typeof value.cacheWrite === "number" ? value.cacheWrite : 0,
    cost: cost && typeof cost === "object" && typeof (cost as Record<string, unknown>).total === "number"
      ? (cost as Record<string, number>).total
      : 0,
  };
}

/**
 * 从 context entries 反向提取最近一次 thinking level（footer 输入派生，UI 细节留在 ui 层）。
 * 无匹配时返回 "off"（footer 渲染的空值约定）。
 */
export function thinkingLevelFromEntries(entries: readonly unknown[]): string {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    if (value.type !== "thinking_level_change") continue;
    const level = value.thinkingLevel;
    if (typeof level === "string") return level;
  }
  return "off";
}

export function formatContext(usage: { percent: number | null; contextWindow: number } | undefined): string {
  if (!usage) return "";
  const percent = usage.percent === null ? "?" : `${usage.percent.toFixed(1)}%`;
  return `${percent}/${formatTokens(usage.contextWindow)} (auto)`;
}

export function buildStats(session: FooterEntrySource): string {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const entry of session.getEntries()) {
    if (!entry || typeof entry !== "object") continue;
    const message = (entry as Record<string, unknown>).message;
    const usage = message && typeof message === "object"
      ? readUsage((message as Record<string, unknown>).usage)
      : readUsage((entry as Record<string, unknown>).usage);
    if (!usage) continue;
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost;
  }

  const parts: string[] = [];
  if (totals.input) parts.push(`↑${formatTokens(totals.input)}`);
  if (totals.output) parts.push(`↓${formatTokens(totals.output)}`);
  if (totals.cacheRead) parts.push(`R${formatTokens(totals.cacheRead)}`);
  if (totals.cacheWrite) parts.push(`W${formatTokens(totals.cacheWrite)}`);
  if (totals.cost) parts.push(`$${totals.cost.toFixed(3)}`);
  return parts.join(" ");
}
