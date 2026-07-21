import type { ResolvedProfile } from "../profile/types";

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

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

function truncatePlain(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

export function appendRight(text: string, right: string, width: number): string {
  const rightWidth = visibleWidth(right);
  if (rightWidth >= width) return truncatePlain(stripAnsi(right), width);
  const leftWidth = width - rightWidth - 2;
  const textWidth = visibleWidth(text);
  if (textWidth <= leftWidth) {
    return `${text}${" ".repeat(width - textWidth - rightWidth)}${right}`;
  }
  const left = truncatePlain(stripAnsi(text), leftWidth);
  return `${left}${" ".repeat(Math.max(0, width - left.length - rightWidth))}${right}`;
}

function collapseNativeFooterLines(lines: string[], width: number): string[] {
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";
  const extra = lines.slice(2).map(stripAnsi).join(" ").trim();
  if (!extra) return [first, second];
  return [first, truncatePlain(`${stripAnsi(second).trimEnd()} ${extra}`, width)];
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

function fitLine(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  if (left.length + 2 + right.length <= width) {
    return `${left}${" ".repeat(width - left.length - right.length)}${right}`;
  }
  if (right.length >= width) return truncate(right, width);
  const leftWidth = Math.max(0, width - right.length - 2);
  return `${truncate(left, leftWidth)}${" ".repeat(Math.max(0, width - Math.min(left.length, leftWidth) - right.length))}${right}`;
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
        return [appendRight(lines[0] ?? "", theme.fg("dim", profile().name), width), lines[1] ?? ""];
      }

      const activeModel = model();
      const snapshot: FooterSnapshot = {
        cwd: session.getCwd(),
        branch: footerData.getGitBranch(),
        sessionName: session.getSessionName(),
        profileName: profile().name,
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
