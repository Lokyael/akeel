import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { adaptPiToolCall, loadPolicyFile } from "../adapters/index";
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
}>;

export type GlobalPiCompositionOptions = Readonly<{
  readonly agentDir?: string;
}>;

type SessionProject = Readonly<{
  readonly context: ProjectContext;
  readonly dispose?: () => void;
}>;

const INITIALIZATION_FAILURE_REASON = "Blocked because the decision service is not initialized.";

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

function installComposition(
  pi: ExtensionAPI,
  initialPolicyState: PolicyState | undefined,
  createSessionProject: (cwd: string) => SessionProject,
): void {
  let policyState = initialPolicyState;
  let service: ReturnType<typeof createDecisionService> | undefined;
  let project: ProjectLifecycle | undefined;
  let projectContext: ProjectContext | undefined;

  pi.registerCommand("policy", {
    description: "Show or switch the active AKeel policy preset.",
    handler: async (args, context) => {
      const requested = args.trim();
      if (policyState?.presets === undefined) {
        notifyPolicy(context, "No Policy Presets are configured; the static policy remains active.", "warning");
        return;
      }
      if (requested.length === 0) {
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(policyState)}.`);
        return;
      }
      try {
        policyState = activatePolicyPreset(policyState, requested);
        service = projectContext === undefined ? undefined : createDecisionService(policyState, projectContext);
        notifyPolicy(context, `Active AKeel policy: ${policyStatus(policyState)}.`);
      } catch {
        notifyPolicy(context, `Unknown AKeel policy preset: ${requested}.`, "error");
      }
    },
  });

  pi.on("session_start", (_event, context) => {
    project?.dispose();
    project = undefined;
    projectContext = undefined;
    service = undefined;
    policyState = initialPolicyState;
    if (!policyState) return;
    try {
      const sessionProject = createSessionProject(context.cwd);
      projectContext = sessionProject.context;
      if ("dispose" in sessionProject) project = sessionProject as ProjectLifecycle;
      service = createDecisionService(policyState, projectContext);
    } catch {
      service = undefined;
      projectContext = undefined;
    }
  });

  pi.on("session_shutdown", (_event, _context) => {
    project?.dispose();
    project = undefined;
    projectContext = undefined;
    service = undefined;
  });

  pi.on("tool_call", async (event, context) => {
    if (!service) {
      return adaptPiToolCall(event, context).kind === "passthrough" ? undefined : initializationFailure();
    }
    return handlePiToolCall(service, event, context);
  });
}

export function installPiAccessDecision(pi: ExtensionAPI, options: PiCompositionOptions): void {
  installComposition(pi, policyStateFrom(options.policyConfig), (cwd) => ({
    context: createProjectContext({
      cwd,
      projectRoot: options.projectRoot,
      stagingRoot: options.stagingRoot,
    }),
  }));
}

export function installGlobalPiAccessDecision(pi: ExtensionAPI, options: GlobalPiCompositionOptions): void {
  const loaded = loadPolicyFile(options.agentDir);
  installComposition(pi, loaded.kind === "ok" ? policyStateFrom(loaded.value) : undefined, createProjectLifecycle);
}
