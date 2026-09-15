import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  adaptPiGateToolCall,
  decodePolicyConfiguration,
  loadDecodedPolicyFile,
  resolveAgentDir,
} from "../adapters/index";
import type { DecodedPolicyConfiguration } from "../adapters/index";
import { createLinuxPathEvidence } from "../core/compilation/index";
import { handleGateSessionToolCall } from "./host-composition";
import type { PiToolCallHandlerResult } from "./host-composition";
import { createGateSession } from "./gate-session";
import type { GateSession } from "./gate-session";
import { createProjectContext } from "./project-context";
import { createProjectLifecycle } from "./project-lifecycle";
import type { ProjectContext } from "./project-context";
import type { ProjectLifecycle } from "./project-lifecycle";

type ProjectLifecycleOptions = Readonly<{
  readonly projectRoot: string;
  readonly stagingRoot: string;
}>;

export type PiCompositionOptions = ProjectLifecycleOptions & Readonly<{
  readonly policyConfig: unknown;
  readonly agentDir?: string;
}>;

export type GlobalPiCompositionOptions = Readonly<{
  readonly agentDir?: string;
}>;

type SessionProject = Readonly<{
  readonly context: ProjectContext;
  readonly dispose?: () => void;
}>;

interface FooterTheme {
  fg(color: string, text: string): string;
}

interface FooterDataProvider {
  getGitBranch(): string | null;
  getExtensionStatuses?(): ReadonlyMap<string, string>;
}

interface FooterComponent {
  render(width: number): string[];
  invalidate(): void;
}

type NativeFooterConstructor = new (session: unknown, footerData: unknown) => FooterComponent;

let NativeFooter: NativeFooterConstructor | undefined;
try {
  const piModule = await import("@earendil-works/pi-coding-agent");
  NativeFooter = (piModule as { FooterComponent?: NativeFooterConstructor }).FooterComponent;
} catch {
  NativeFooter = undefined;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

function truncateText(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  const plain = stripAnsi(text);
  if (plain.length <= maxWidth) return text;
  if (maxWidth <= 3) return plain.slice(0, maxWidth);
  return `${plain.slice(0, maxWidth - 3)}...`;
}

function appendBadgeRight(left: string, badge: string, width: number): string {
  if (width <= 0) return "";
  const badgeLen = visibleWidth(badge);
  if (badgeLen >= width) return badge.slice(0, width);

  const leftLen = visibleWidth(left);
  const availableLeft = width - badgeLen - 2;

  if (leftLen <= availableLeft) {
    const padding = " ".repeat(Math.max(1, width - leftLen - badgeLen));
    return `${left}${padding}${badge}`;
  }

  const truncatedLeft = truncateText(left, availableLeft);
  const padding = " ".repeat(Math.max(1, width - visibleWidth(truncatedLeft) - badgeLen));
  return `${truncatedLeft}${padding}${badge}`;
}

const INITIALIZATION_FAILURE_REASON = "Blocked because the decision service is not initialized.";
const BUILTIN_POLICY_PRESET_LABELS: Readonly<Record<string, string>> = Object.freeze({
  review: "review — Read-only review",
  guided: "guided — Interactive approval",
  develop: "develop — Daily development",
});
const POLICY_STATUS_ID = "akeel-policy";
const BUILTIN_POLICY_SHORT_CODES: Readonly<Record<string, string>> = Object.freeze({
  review: "R",
  guided: "G",
  develop: "D",
  off: "off",
});

function formatPolicyBadge(preset: string, configuration?: DecodedPolicyConfiguration): string {
  if (preset === "off") return "🛡️ off";
  const customBadge = configuration?.badges?.[preset];
  const code = customBadge ?? BUILTIN_POLICY_SHORT_CODES[preset] ?? (preset.length > 0 ? preset.charAt(0).toUpperCase() : "?");
  return `🛡️ ${code}`;
}

function captureSessionHome(): string | undefined {
  const home = process.env.HOME;
  return typeof home === "string" && home.length > 0 && home.startsWith("/") && !home.includes("\u0000")
    ? home
    : undefined;
}

function initializationFailure(): PiToolCallHandlerResult {
  return Object.freeze({ block: true, reason: INITIALIZATION_FAILURE_REASON });
}

function notifyPolicy(
  context: { readonly ui: { readonly notify: (message: string, level?: "info" | "warning" | "error") => void } },
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  context.ui.notify(message, level);
}

function decodedPolicy(input: unknown): DecodedPolicyConfiguration | undefined {
  try {
    return decodePolicyConfiguration(input);
  } catch {
    return undefined;
  }
}

function policyStatus(configuration: DecodedPolicyConfiguration | undefined, session: GateSession | undefined): string {
  if (session !== undefined) return session.activePreset();
  if (configuration?.kind === "off") return "off";
  return configuration?.kind === "enabled" ? configuration.activePreset : "static";
}

type PolicyPresetOption = Readonly<{ readonly name: string; readonly label: string }>;

function policyPresetOptions(configuration: DecodedPolicyConfiguration): readonly PolicyPresetOption[] {
  const options: PolicyPresetOption[] = Object.keys(configuration.snapshots).map((name) => ({
    name,
    label: BUILTIN_POLICY_PRESET_LABELS[name] ?? name,
  }));
  options.push({ name: "off", label: "off — Bypass Access Gate for this session" });
  return options;
}

function presetNameForLabel(options: readonly PolicyPresetOption[], label: string | undefined): string | undefined {
  return options.find((option) => option.label === label)?.name;
}

function credentialRoots(agentDir: string): readonly string[] {
  const resolved = createLinuxPathEvidence().resolve("/", agentDir)?.candidate;
  return Object.freeze(resolved === undefined || resolved === agentDir ? [agentDir] : [agentDir, resolved]);
}

function installComposition(
  pi: ExtensionAPI,
  policyProvider: () => DecodedPolicyConfiguration | undefined,
  createSessionProject: (cwd: string) => SessionProject,
  agentDir: string,
): void {
  let session: GateSession | undefined;
  let project: ProjectLifecycle | undefined;
  let sessionHome: string | undefined;
  let currentConfiguration: DecodedPolicyConfiguration | undefined = policyProvider();
  let currentTui: { requestRender: () => void } | undefined;
  let downstreamFooterFactory:
    | ((tui: unknown, theme: FooterTheme, footerData: FooterDataProvider) => FooterComponent)
    | undefined = undefined;
  let restoreOriginalSetFooter: (() => void) | undefined = undefined;
  const pathEvidence = createLinuxPathEvidence();
  const protectedRoots = credentialRoots(agentDir);

  function currentBadge(): string {
    if (currentConfiguration?.kind === "off") {
      return formatPolicyBadge("off");
    }
    return formatPolicyBadge(policyStatus(currentConfiguration, session), currentConfiguration);
  }

  function fallbackFooterLines(context: any, footerData: FooterDataProvider): string[] {
    const branch = footerData.getGitBranch?.();
    const branchStr = branch ? ` (${branch})` : "";
    const cwd = context.sessionManager?.getCwd?.() ?? context.cwd ?? "";
    const sessionName = context.sessionManager?.getSessionName?.();
    const nameStr = sessionName ? ` • ${sessionName}` : "";
    return [`${cwd}${branchStr}${nameStr}`, ""];
  }

  function setupChainedFooter(context: any): void {
    if (!context.ui?.setFooter) return;

    context.ui.setStatus?.(POLICY_STATUS_ID, undefined);

    const originalSetFooter = context.ui.setFooter.bind(context.ui);

    function compositeFactory(tui: any, theme: FooterTheme, footerData: FooterDataProvider): FooterComponent {
      currentTui = tui;
      let downstreamComponent: FooterComponent | undefined;
      if (downstreamFooterFactory) {
        try {
          downstreamComponent = downstreamFooterFactory(tui, theme, footerData);
        } catch {
          downstreamComponent = undefined;
        }
      }

      let nativeFooter: FooterComponent | undefined;
      if (!downstreamComponent && NativeFooter) {
        try {
          nativeFooter = new NativeFooter(
            {
              get state() {
                return { model: context.model, thinkingLevel: "" };
              },
              sessionManager: context.sessionManager,
              getContextUsage: () => context.getContextUsage?.(),
              modelRuntime: { isUsingOAuth: () => false, isUsingSubscription: () => false },
            },
            footerData,
          );
        } catch {
          nativeFooter = undefined;
        }
      }

      return {
        render(width: number): string[] {
          let baseLines: string[];
          if (downstreamComponent) {
            baseLines = downstreamComponent.render(width);
          } else if (nativeFooter) {
            baseLines = nativeFooter.render(width);
          } else {
            baseLines = fallbackFooterLines(context, footerData);
          }

          const badge = currentBadge();
          const line0 = appendBadgeRight(baseLines[0] ?? "", badge, width);
          const line1 = baseLines[1] ?? "";
          return [line0, line1];
        },
        invalidate(): void {
          downstreamComponent?.invalidate();
          nativeFooter?.invalidate();
        },
      };
    }

    context.ui.setFooter = (factory: any) => {
      if (factory === compositeFactory) {
        originalSetFooter(factory);
        return;
      }
      downstreamFooterFactory = factory;
      originalSetFooter(compositeFactory);
    };

    originalSetFooter(compositeFactory);
    restoreOriginalSetFooter = () => {
      context.ui.setFooter = originalSetFooter;
      originalSetFooter(downstreamFooterFactory ?? undefined);
    };
  }

  function teardownChainedFooter(): void {
    restoreOriginalSetFooter?.();
    restoreOriginalSetFooter = undefined;
    downstreamFooterFactory = undefined;
    currentTui = undefined;
  }

  function activatePresetOrOff(name: string, context: any): boolean {
    if (name === "off") {
      session?.close();
      session = undefined;
      if (currentConfiguration) {
        currentConfiguration = {
          kind: "off",
          snapshots: currentConfiguration.snapshots,
          badges: currentConfiguration.badges,
        };
      }
      return true;
    }

    if (!currentConfiguration?.snapshots[name]) {
      return false;
    }

    if (session) {
      const switched = session.activatePreset(name);
      if (switched && currentConfiguration.kind === "enabled") {
        currentConfiguration = {
          ...currentConfiguration,
          activePreset: name,
        };
      }
      return switched;
    }

    try {
      if (!project) {
        const sessionProject = createSessionProject(context.cwd);
        if ("dispose" in sessionProject) project = sessionProject as ProjectLifecycle;
      }
      sessionHome = sessionHome ?? captureSessionHome();
      const newConfig: DecodedPolicyConfiguration = {
        kind: "enabled",
        activePreset: name,
        switchable: true,
        snapshots: currentConfiguration.snapshots,
        badges: currentConfiguration.badges,
      };
      session = createGateSession({
        cwd: context.cwd,
        accessRoot: project ? project.context.projectRoot : context.cwd,
        stagingRoot: project ? project.context.stagingRoot : context.cwd,
        home: sessionHome,
        credentialRoots: protectedRoots,
        configuration: newConfig,
        pathEvidence,
      });
      currentConfiguration = newConfig;
      return true;
    } catch {
      session = undefined;
      return false;
    }
  }

  async function confirmAndTurnOff(context: any): Promise<void> {
    if (currentConfiguration?.kind === "off") {
      notifyPolicy(context, "Access Gate is already turned off for this session.", "info");
      return;
    }
    if (context.hasUI && context.mode === "tui") {
      const confirmed = await context.ui.confirm(
        "Turn off Access Gate",
        "Bypass all tool-call and path checks for this session? Principles and skills remain active.",
      );
      if (!confirmed) return;
    }
    activatePresetOrOff("off", context);
    currentTui?.requestRender();
    notifyPolicy(context, "Access Gate turned off for this session. Tools will passthrough.", "warning");
  }

  pi.registerCommand("policy", {
    description: "Show or switch the active AKeel policy preset.",
    handler: async (args, context) => {
      const requested = args.trim();
      if (!currentConfiguration) {
        notifyPolicy(context, "No policy configuration available.", "warning");
        return;
      }

      if (requested.length === 0 && context.mode === "tui") {
        const options = policyPresetOptions(currentConfiguration);
        const selected = await context.ui.select(
          "Select AKeel policy preset:",
          options.map((option) => option.label),
        );
        const selectedPreset = presetNameForLabel(options, selected);
        if (selectedPreset === undefined) return;

        if (selectedPreset === "off") {
          await confirmAndTurnOff(context);
          return;
        }

        if (activatePresetOrOff(selectedPreset, context)) {
          currentTui?.requestRender();
          notifyPolicy(context, `Active AKeel policy: ${policyStatus(currentConfiguration, session)}.`);
        } else {
          notifyPolicy(context, "Unknown AKeel policy preset selection.", "error");
        }
        return;
      }

      if (requested.length === 0 || requested === "status") {
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(currentConfiguration, session)}.`);
        return;
      }

      if (requested === "off") {
        await confirmAndTurnOff(context);
        return;
      }

      if (activatePresetOrOff(requested, context)) {
        currentTui?.requestRender();
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(currentConfiguration, session)}.`);
      } else {
        notifyPolicy(context, `Unknown AKeel policy preset: ${requested}.`, "error");
      }
    },
  });

  pi.on("session_start", (_event, context) => {
    session?.close();
    project?.dispose();
    teardownChainedFooter();
    session = undefined;
    project = undefined;
    sessionHome = captureSessionHome();
    currentConfiguration = policyProvider();
    if (currentConfiguration === undefined) {
      return;
    }
    if (currentConfiguration.kind === "off") {
      setupChainedFooter(context);
      currentTui?.requestRender();
      return;
    }
    try {
      const sessionProject = createSessionProject(context.cwd);
      if ("dispose" in sessionProject) project = sessionProject as ProjectLifecycle;
      session = createGateSession({
        cwd: sessionProject.context.cwd,
        accessRoot: sessionProject.context.projectRoot,
        stagingRoot: sessionProject.context.stagingRoot,
        home: sessionHome,
        credentialRoots: protectedRoots,
        configuration: currentConfiguration,
        pathEvidence,
      });
      setupChainedFooter(context);
      currentTui?.requestRender();
    } catch {
      session = undefined;
      project?.dispose();
      project = undefined;
    }
  });

  pi.on("session_shutdown", (_event, context) => {
    session?.close();
    project?.dispose();
    teardownChainedFooter();
    context.ui?.setStatus?.(POLICY_STATUS_ID, undefined);
    session = undefined;
    project = undefined;
    sessionHome = undefined;
  });

  pi.on("tool_call", async (event, context) => {
    if (currentConfiguration?.kind === "off") return undefined;
    if (!session) {
      return adaptPiGateToolCall(event, context).kind === "passthrough" ? undefined : initializationFailure();
    }
    return handleGateSessionToolCall(session, event, context);
  });
}

export function installPiAccessDecision(pi: ExtensionAPI, options: PiCompositionOptions): void {
  const agentDir = resolveAgentDir(options.agentDir);
  installComposition(pi, () => decodedPolicy(options.policyConfig), (cwd) => {
    if (options.projectRoot !== cwd) throw new TypeError("project root must match session cwd");
    return {
      context: createProjectContext({ cwd, projectRoot: cwd, stagingRoot: options.stagingRoot }),
    };
  }, agentDir);
}

export function installGlobalPiAccessDecision(pi: ExtensionAPI, options: GlobalPiCompositionOptions): void {
  const agentDir = resolveAgentDir(options.agentDir);
  installComposition(pi, () => loadDecodedPolicyFile(agentDir), createProjectLifecycle, agentDir);
}
