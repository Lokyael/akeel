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

const INITIALIZATION_FAILURE_REASON = "Blocked because the decision service is not initialized.";
const BUILTIN_POLICY_PRESET_LABELS: Readonly<Record<string, string>> = Object.freeze({
  review: "review — Read-only review",
  guided: "guided — Interactive approval",
  develop: "develop — Daily development",
});

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
  return configuration?.kind === "enabled" ? configuration.activePreset : "static";
}

type PolicyPresetOption = Readonly<{ readonly name: string; readonly label: string }>;

function policyPresetOptions(configuration: Extract<DecodedPolicyConfiguration, { readonly kind: "enabled" }>): readonly PolicyPresetOption[] {
  return Object.keys(configuration.snapshots).map((name) => ({
    name,
    label: BUILTIN_POLICY_PRESET_LABELS[name] ?? name,
  }));
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
  const pathEvidence = createLinuxPathEvidence();
  const protectedRoots = credentialRoots(agentDir);

  function setPolicyPreset(name: string): boolean {
    return session?.activatePreset(name) ?? false;
  }

  pi.registerCommand("policy", {
    description: "Show or switch the active AKeel policy preset.",
    handler: async (args, context) => {
      const requested = args.trim();
      if (currentConfiguration?.kind === "disabled") {
        notifyPolicy(context, "Access Gate is disabled; bootstrap and skills remain active.", "warning");
        return;
      }
      if (currentConfiguration?.kind !== "enabled" || !currentConfiguration.switchable) {
        notifyPolicy(context, "No Policy Presets are configured; the static policy remains active.", "warning");
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
        if (setPolicyPreset(selectedPreset)) {
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
      if (setPolicyPreset(requested)) {
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(currentConfiguration, session)}.`);
      } else {
        notifyPolicy(context, `Unknown AKeel policy preset: ${requested}.`, "error");
      }
    },
  });

  pi.on("session_start", (_event, context) => {
    session?.close();
    project?.dispose();
    session = undefined;
    project = undefined;
    sessionHome = captureSessionHome();
    currentConfiguration = policyProvider();
    if (currentConfiguration === undefined || currentConfiguration.kind === "disabled") return;
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
    } catch {
      session = undefined;
      project?.dispose();
      project = undefined;
    }
  });

  pi.on("session_shutdown", (_event, _context) => {
    session?.close();
    project?.dispose();
    session = undefined;
    project = undefined;
    sessionHome = undefined;
  });

  pi.on("tool_call", async (event, context) => {
    if (currentConfiguration?.kind === "disabled") return undefined;
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
