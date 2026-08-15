// access-gate/ui/profile-footer.ts — Profile Footer 宿主桥
// 职责：宿主集成（NativeFooter 动态导入 + 宽度助手选择 + 组件工厂）。
// 纯布局与数据派生在 footer-layout.ts（零宿主依赖，helpers 显式注入）。

import {
  buildStats,
  fallbackWidthHelpers,
  fitLine,
  formatContext,
  renderProfileFooter,
  stripAnsi,
  type FooterSnapshot,
  type WidthHelpers,
} from "./footer-layout";
import type { ResolvedProfile } from "../profile/types";
import { displayName } from "../profile";

export type { FooterSnapshot } from "./footer-layout";

interface ProfileFooterSession {
  getCwd(): string;
  getSessionName(): string | undefined;
  getEntries(): readonly unknown[];
  buildContextEntries(): readonly unknown[];
}

interface ProfileFooterData {
  getGitBranch(): string | null;
  getExtensionStatuses?(): ReadonlyMap<string, string>;
  getAvailableProviderCount?(): number;
}

export interface ProfileFooterModel {
  id: string;
  provider: string;
  reasoning?: boolean;
}

interface ProfileFooterTheme {
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

// ─── 宽度助手选择（宿主 seam） ───
// 生产环境用宿主 pi-tui（grapheme/宽字符正确：CJK/emoji 按 2 列）；独立测试环境
// 无 pi-tui（只随宿主 bundle 提供），fallback 到手写近似——与 NativeFooter 同模式。
// 选择在导入时完成一次（const），纯布局层不持有宽度状态。

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

async function loadWidthHelpers(): Promise<WidthHelpers> {
  try {
    const tuiModule = await import("@earendil-works/pi-tui");
    return selectWidthHelpers(tuiModule);
  } catch {
    // pi-tui 只随宿主 bundle 提供；独立测试环境不可导入，保留 fallback。
    return fallbackWidthHelpers();
  }
}

const WIDTH = await loadWidthHelpers();

function collapseNativeFooterLines(lines: string[], width: number): string[] {
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";
  const extra = lines.slice(2).map(stripAnsi).join(" ").trim();
  if (!extra) return [first, second];
  return [first, WIDTH.truncate(`${stripAnsi(second).trimEnd()} ${extra}`, width)];
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
        return [fitLine(lines[0] ?? "", theme.fg("dim", displayName(profile().name)), width, WIDTH), lines[1] ?? ""];
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
      return renderProfileFooter(snapshot, width, WIDTH).map((line) => theme.fg("dim", line));
    },
    invalidate() {
      // Footer data is read on every render.
    },
  };
}
