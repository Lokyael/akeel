import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  adaptPiGateToolCall,
  decodePolicyConfiguration,
  isExplicitlyUnsupportedToolCall,
  loadDecodedPolicyFile,
  resolveAgentDir,
} from "../adapters/index";
import type { DecodedPolicyConfiguration } from "../adapters/index";
import { createLinuxPathEvidence } from "../core/compilation/index";
import { handleGateSessionToolCall } from "./host-composition";
import { renderHostBlock } from "./host-render";
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
  readonly capabilityRoots?: readonly string[];
}>;

export type GlobalPiCompositionOptions = Readonly<{
  readonly agentDir?: string;
  readonly capabilityRoots?: readonly string[];
}>;

type SessionProject = Readonly<{
  readonly context: ProjectContext;
  readonly dispose?: () => void;
}>;

type PolicyContext = Pick<ExtensionContext, "cwd" | "hasUI" | "mode" | "ui">;

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

function capabilityRootsForSession(
  agentDir: string,
  cwd: string,
  home: string | undefined,
  configuredRoots?: readonly string[],
): readonly string[] {
  const rawRoots = [
    ...["git", "npm", "node_modules", "skills", "extensions"].map((sub) => join(agentDir, sub)),
    ...(home === undefined ? [] : [join(home, ".agents", "skills")]),
    join(cwd, ".pi", "git"),
    join(cwd, ".pi", "npm"),
    ...(configuredRoots ?? []),
  ];
  const roots: string[] = [];
  const evidence = createLinuxPathEvidence();
  for (const raw of rawRoots) {
    const resolved = evidence.resolve("/", raw)?.candidate;
    roots.push(raw);
    if (resolved !== undefined && resolved !== raw) roots.push(resolved);
  }
  return Object.freeze([...new Set(roots)]);
}

function installComposition(
  pi: ExtensionAPI,
  policyProvider: () => DecodedPolicyConfiguration | undefined,
  createSessionProject: (cwd: string) => SessionProject,
  agentDir: string,
  configuredCapabilityRoots?: readonly string[],
): void {
  let session: GateSession | undefined;
  let project: ProjectLifecycle | undefined;
  let sessionHome: string | undefined;
  let currentConfiguration: DecodedPolicyConfiguration | undefined = policyProvider();
  const pathEvidence = createLinuxPathEvidence();
  const protectedRoots = credentialRoots(agentDir);

  function currentBadge(): string {
    if (currentConfiguration?.kind === "off") {
      return formatPolicyBadge("off");
    }
    return formatPolicyBadge(policyStatus(currentConfiguration, session), currentConfiguration);
  }

  function syncPolicyStatus(context: PolicyContext): void {
    const status = currentConfiguration === undefined ? undefined : currentBadge();
    context.ui.setStatus(POLICY_STATUS_ID, status);
  }

  function activatePresetOrOff(name: string, context: PolicyContext): boolean {
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
        capabilityRoots: capabilityRootsForSession(agentDir, context.cwd, sessionHome, configuredCapabilityRoots),
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

  async function confirmAndTurnOff(context: PolicyContext): Promise<void> {
    if (currentConfiguration?.kind === "off") {
      notifyPolicy(context, "Access Gate is already turned off for this session.", "info");
      return;
    }
    if (context.hasUI && context.mode === "tui") {
      const confirmed = await context.ui.confirm(
        "Turn off Access Gate",
        "Disable ordinary operation and path admission for this session? Unsupported host surfaces remain blocked; principles and skills remain active.",
      );
      if (!confirmed) return;
    }
    activatePresetOrOff("off", context);
    syncPolicyStatus(context);
    notifyPolicy(context, "Access Gate turned off for this session; ordinary managed calls will passthrough, while unsupported host surfaces remain blocked.", "warning");
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
          syncPolicyStatus(context);
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
        syncPolicyStatus(context);
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(currentConfiguration, session)}.`);
      } else {
        notifyPolicy(context, `Unknown AKeel policy preset: ${requested}.`, "error");
      }
    },
  });

  const subscriptions: Array<() => void> = [];
  let disposed = false;

  function rememberSubscription(subscription: void | (() => void)): void {
    if (typeof subscription === "function") subscriptions.push(subscription);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    session?.close();
    project?.dispose();
    session = undefined;
    project = undefined;
    sessionHome = undefined;
    for (const unsubscribe of subscriptions.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // Host cleanup must continue even when one subscription rejects disposal.
      }
    }
  }

  rememberSubscription(pi.on("session_start", (_event, context) => {
    session?.close();
    project?.dispose();
    context.ui.setStatus(POLICY_STATUS_ID, undefined);
    session = undefined;
    project = undefined;
    sessionHome = captureSessionHome();
    currentConfiguration = policyProvider();
    if (currentConfiguration === undefined) {
      return;
    }
    if (currentConfiguration.kind === "off") {
      syncPolicyStatus(context);
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
        capabilityRoots: capabilityRootsForSession(agentDir, sessionProject.context.cwd, sessionHome, configuredCapabilityRoots),
        configuration: currentConfiguration,
        pathEvidence,
      });
      syncPolicyStatus(context);
    } catch {
      session = undefined;
      project?.dispose();
      project = undefined;
    }
  }));

  rememberSubscription(pi.on("session_shutdown", (_event, context) => {
    context.ui.setStatus(POLICY_STATUS_ID, undefined);
    dispose();
  }));

  rememberSubscription(pi.on("tool_call", async (event, context) => {
    if (currentConfiguration?.kind === "off") {
      if (isExplicitlyUnsupportedToolCall(event)) {
        return Object.freeze({ block: true, reason: renderHostBlock("unsupported-surface").reason });
      }
      return undefined;
    }
    if (!session) {
      const adapted = adaptPiGateToolCall(event, context);
      if (adapted.kind === "passthrough") return undefined;
      if (adapted.kind === "reject" && adapted.code === "unsupported-surface") {
        return Object.freeze({ block: true, reason: renderHostBlock("unsupported-surface").reason });
      }
      return initializationFailure();
    }
    return handleGateSessionToolCall(session, event, context);
  }));
}

export function installPiAccessDecision(pi: ExtensionAPI, options: PiCompositionOptions): void {
  const agentDir = resolveAgentDir(options.agentDir);
  installComposition(pi, () => decodedPolicy(options.policyConfig), (cwd) => {
    if (options.projectRoot !== cwd) throw new TypeError("project root must match session cwd");
    return {
      context: createProjectContext({ cwd, projectRoot: cwd, stagingRoot: options.stagingRoot }),
    };
  }, agentDir, options.capabilityRoots);
}

export function installGlobalPiAccessDecision(pi: ExtensionAPI, options: GlobalPiCompositionOptions): void {
  const agentDir = resolveAgentDir(options.agentDir);
  installComposition(pi, () => loadDecodedPolicyFile(agentDir), createProjectLifecycle, agentDir, options.capabilityRoots);
}
