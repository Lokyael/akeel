import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  adaptPiToolCall,
  createCredentialBoundaryForAgentDir,
  loadPolicyFile,
  resolveAgentDir,
} from "../adapters/index";
import { activatePolicyPreset, createPolicyState } from "./policy-state";
import { createProjectContext } from "./project-context";
import { createProjectLifecycle } from "./project-lifecycle";
import type { PolicyState } from "./policy-state";
import type { ProjectContext } from "./project-context";
import type { ProjectLifecycle } from "./project-lifecycle";
import { createDecisionService } from "./service";
import { handlePiToolCall } from "./host-composition";
import type { PiToolCallHandlerResult } from "./host-composition";

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

function notifyPolicy(context: { readonly ui: { readonly notify: (message: string, level?: "info" | "warning" | "error") => void } }, message: string, level: "info" | "warning" | "error" = "info"): void {
  context.ui.notify(message, level);
}

function policyStateFrom(config: unknown): PolicyState | undefined {
  try {
    return createPolicyState(config);
  } catch {
    return undefined;
  }
}

function policyStatus(state: PolicyState | undefined): string {
  return state?.activePreset ?? "static";
}

type PolicyPresetOption = Readonly<{ readonly name: string; readonly label: string }>;

function policyPresetOptions(state: PolicyState): readonly PolicyPresetOption[] {
  return Object.keys(state.presets?.snapshots ?? {}).map((name) => ({
    name,
    label: BUILTIN_POLICY_PRESET_LABELS[name] ?? name,
  }));
}

function presetNameForLabel(options: readonly PolicyPresetOption[], label: string | undefined): string | undefined {
  return options.find((option) => option.label === label)?.name;
}

function installComposition(
  pi: ExtensionAPI,
  initialPolicyState: PolicyState | undefined,
  createSessionProject: (cwd: string) => SessionProject,
  credentialBoundary: ReturnType<typeof createCredentialBoundaryForAgentDir>,
): void {
  let policyState = initialPolicyState;
  let service: ReturnType<typeof createDecisionService> | undefined;
  let project: ProjectLifecycle | undefined;
  let projectContext: ProjectContext | undefined;
  let sessionHome: string | undefined;

  function setPolicyPreset(name: string): boolean {
    if (policyState === undefined) return false;
    try {
      policyState = activatePolicyPreset(policyState, name);
      service = projectContext === undefined ? undefined : createDecisionService(
        policyState,
        projectContext,
        undefined,
        credentialBoundary,
        sessionHome,
      );
      return true;
    } catch {
      return false;
    }
  }

  pi.registerCommand("policy", {
    description: "Show or switch the active AKeel policy preset.",
    handler: async (args, context) => {
      const requested = args.trim();
      if (policyState?.accessGateDisabled) {
        notifyPolicy(context, "Access Gate is disabled; bootstrap and skills remain active.", "warning");
        return;
      }
      if (policyState?.presets === undefined) {
        notifyPolicy(context, "No Policy Presets are configured; the static policy remains active.", "warning");
        return;
      }
      if (requested.length === 0 && context.mode === "tui") {
        const options = policyPresetOptions(policyState);
        const selected = await context.ui.select(
          "Select AKeel policy preset:",
          options.map((option) => option.label),
        );
        const selectedPreset = presetNameForLabel(options, selected);
        if (selectedPreset === undefined) return;
        if (setPolicyPreset(selectedPreset)) {
          notifyPolicy(context, `Active AKeel policy: ${policyStatus(policyState)}.`);
        } else {
          notifyPolicy(context, "Unknown AKeel policy preset selection.", "error");
        }
        return;
      }
      if (requested.length === 0 || requested === "status") {
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(policyState)}.`);
        return;
      }
      if (setPolicyPreset(requested)) {
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(policyState)}.`);
      } else {
        notifyPolicy(context, `Unknown AKeel policy preset: ${requested}.`, "error");
      }
    },
  });

  pi.on("session_start", (_event, context) => {
    project?.dispose();
    project = undefined;
    projectContext = undefined;
    service = undefined;
    sessionHome = captureSessionHome();
    policyState = initialPolicyState;
    if (!policyState || policyState.accessGateDisabled) return;
    try {
      const sessionProject = createSessionProject(context.cwd);
      projectContext = sessionProject.context;
      if ("dispose" in sessionProject) project = sessionProject as ProjectLifecycle;
      service = createDecisionService(policyState, projectContext, undefined, credentialBoundary, sessionHome);
    } catch {
      service = undefined;
      projectContext = undefined;
    }
  });

  pi.on("session_shutdown", (_event, _context) => {
    project?.dispose();
    project = undefined;
    projectContext = undefined;
    sessionHome = undefined;
    service = undefined;
  });

  pi.on("tool_call", async (event, context) => {
    if (policyState?.accessGateDisabled) return undefined;
    if (!service) {
      return adaptPiToolCall(event, context).kind === "passthrough" ? undefined : initializationFailure();
    }
    return handlePiToolCall(service, event, context);
  });
}

export function installPiAccessDecision(pi: ExtensionAPI, options: PiCompositionOptions): void {
  const agentDir = resolveAgentDir(options.agentDir);
  installComposition(pi, policyStateFrom(options.policyConfig), (cwd) => {
    if (options.projectRoot !== cwd) throw new TypeError("project root must match session cwd");
    return {
      context: createProjectContext({
        cwd,
        projectRoot: cwd,
        stagingRoot: options.stagingRoot,
      }),
    };
  }, createCredentialBoundaryForAgentDir(agentDir));
}

export function installGlobalPiAccessDecision(pi: ExtensionAPI, options: GlobalPiCompositionOptions): void {
  const agentDir = resolveAgentDir(options.agentDir);
  const loaded = loadPolicyFile(agentDir);
  installComposition(
    pi,
    policyStateFrom(loaded),
    createProjectLifecycle,
    createCredentialBoundaryForAgentDir(agentDir),
  );
}
