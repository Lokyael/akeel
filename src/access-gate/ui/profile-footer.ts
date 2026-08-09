import type { ResolvedProfile } from "../profile/types";
import { displayName } from "../profile/defaults";

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

export interface ProfileFooterSession {
  getCwd(): string;
  getSessionName(): string | undefined;
  getEntries(): readonly unknown[];
  buildContextEntries(): readonly unknown[];
}

export interface ProfileFooterData {
  getGitBranch(): string | null;
  getExtensionStatuses?(): ReadonlyMap<string, string>;
  getAvailableProviderCount?(): number;
}

export interface ProfileFooterModel {
  id: string;
  provider: string;
  reasoning?: boolean;
}

export interface ProfileFooterTheme {
  fg(color: string, text: string): string;
}

export interface ProfileFooterComponent {
  render(width: number): string[];
  invalidate(): void;
}

interface NativeFooterComponent {
  render(width: number): string[];
  setAutoCompactEnabled?(enabled: boolean): void;
}

type NativeFooterConstructor = new (session: unknown, footerData: ProfileFooterData) => NativeFooterComponent;

let NativeFooter: NativeFooterConstructor | undefined;
try {
  const piModule = await import("@earendil-works/pi-coding-agent");
  NativeFooter = (piModule as { FooterComponent?: NativeFooterConstructor }).FooterComponent;
} catch {
  // The host Pi package is unavailable in standalone unit tests.
}

// ─── 宽度/截断助手（T-050 A3b）───
// 生产环境用宿主 pi-tui（grapheme/宽字符正确：CJK/emoji 按 2 列）；独立测试环境
// 无 pi-tui（只随宿主 bundle 提供），fallback 到手写近似——与 NativeFooter 同模式。

export interface WidthHelpers {
  /** 显示宽度：剥离 ANSI。宽字符（CJK/emoji）按 2 列计——pi-tui 生产路径；fallback 为 UTF-16 近似（测试环境，ASCII 内容正确）。 */
  visibleWidth(text: string): number;
  /** 按显示宽度截断，尾部追加省略符 "..."。 */
  truncate(text: string, width: number): string;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

/** fallback：UTF-16 长度近似（测试环境；无 pi-tui，ASCII 内容正确）。 */
function fallbackWidthHelpers(): WidthHelpers {
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

/** 结构检查宿主提供的 pi-tui 模块；缺失或形状不符时回退 fallback。 */
export function selectWidthHelpers(tui: unknown): WidthHelpers {
  if (tui && typeof tui === "object") {
    const visibleWidth = (tui as Record<string, unknown>).visibleWidth;
    const truncateToWidth = (tui as Record<string, unknown>).truncateToWidth;
    if (typeof visibleWidth === "function" && typeof truncateToWidth === "function") {
      return {
        visibleWidth: (text) => (visibleWidth as (s: string) => number)(text),
        truncate: (text, width) => (truncateToWidth as (s: string, w: number, e?: string, p?: boolean) => string)(text, width, "...", false),
      };
    }
  }
  return fallbackWidthHelpers();
}

let WIDTH: WidthHelpers = fallbackWidthHelpers();
try {
  const tuiModule = await import("@earendil-works/pi-tui");
  WIDTH = selectWidthHelpers(tuiModule);
} catch {
  // pi-tui 只随宿主 bundle 提供；独立测试环境不可导入，保留 fallback。
}

function collapseNativeFooterLines(lines: string[], width: number): string[] {
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";
  const extra = lines.slice(2).map(stripAnsi).join(" ").trim();
  if (!extra) return [first, second];
  return [first, WIDTH.truncate(`${stripAnsi(second).trimEnd()} ${extra}`, width)];
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

/**
 * left/right 适配（T-050 A3a 统一 appendRight + fitLine）：装得下→填充；
 * 右超宽→只留右；否则→左截断+填充。宽度 ANSI 感知（pi-tui 或 fallback）。
 */
export function fitLine(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  const rightWidth = WIDTH.visibleWidth(right);
  if (rightWidth >= width) return WIDTH.truncate(right, width);
  const leftWidth = width - rightWidth - 2;
  const leftDisplayWidth = WIDTH.visibleWidth(left);
  if (leftDisplayWidth <= leftWidth) {
    return `${left}${" ".repeat(width - leftDisplayWidth - rightWidth)}${right}`;
  }
  const fitted = WIDTH.truncate(left, leftWidth);
  return `${fitted}${" ".repeat(Math.max(0, width - WIDTH.visibleWidth(fitted) - rightWidth))}${right}`;
}

export function renderProfileFooter(snapshot: FooterSnapshot, width: number): string[] {
  const location = snapshot.branch ? `${snapshot.cwd} (${snapshot.branch})` : snapshot.cwd;
  const namedLocation = snapshot.sessionName ? `${location} • ${snapshot.sessionName}` : location;
  const model = snapshot.provider ? `(${snapshot.provider}) ${snapshot.model}` : snapshot.model;
  const modelWithThinking = snapshot.thinkingLevel ? `${model} • ${snapshot.thinkingLevel}` : model;
  const extensionStatuses = snapshot.extensionStatuses ? Array.from(snapshot.extensionStatuses.values()).join(" ") : "";
  const secondLineRight = [modelWithThinking, extensionStatuses].filter(Boolean).join(" ");

  return [
    fitLine(namedLocation, snapshot.profileName, width),
    fitLine(`${snapshot.stats} ${snapshot.context}`.trim(), secondLineRight, width),
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

function formatContext(usage: { percent: number | null; contextWindow: number } | undefined): string {
  if (!usage) return "";
  const percent = usage.percent === null ? "?" : `${usage.percent.toFixed(1)}%`;
  return `${percent}/${formatTokens(usage.contextWindow)} (auto)`;
}

function buildStats(session: ProfileFooterSession): string {
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

export function createProfileFooter(
  session: ProfileFooterSession,
  profile: () => ResolvedProfile,
  model: () => ProfileFooterModel | undefined,
  thinkingLevel: () => string,
  contextUsage: () => { percent: number | null; contextWindow: number } | undefined,
  footerData: ProfileFooterData,
  theme: ProfileFooterTheme,
): ProfileFooterComponent {
  const nativeFooter = NativeFooter
    ? new NativeFooter({
        get state() {
          return { model: model(), thinkingLevel: thinkingLevel() };
        },
        sessionManager: session,
        getContextUsage: contextUsage,
        modelRuntime: { isUsingOAuth: () => false },
      }, footerData)
    : undefined;
  nativeFooter?.setAutoCompactEnabled?.(true);

  return {
    render(width) {
      if (nativeFooter) {
        const lines = collapseNativeFooterLines(nativeFooter.render(width), width);
        return [fitLine(lines[0] ?? "", theme.fg("dim", displayName(profile().name)), width), lines[1] ?? ""];
      }

      const activeModel = model();
      const snapshot: FooterSnapshot = {
        cwd: session.getCwd(),
        branch: footerData.getGitBranch(),
        sessionName: session.getSessionName(),
        profileName: displayName(profile().name),
        stats: buildStats(session),
        context: formatContext(contextUsage()),
        provider: activeModel?.provider,
        model: activeModel?.id ?? "no-model",
        thinkingLevel: activeModel?.reasoning ? thinkingLevel() : "",
        extensionStatuses: footerData.getExtensionStatuses?.(),
      };
      return renderProfileFooter(snapshot, width).map((line) => theme.fg("dim", line));
    },
    invalidate() {
      // Footer data is read on every render.
    },
  };
}
