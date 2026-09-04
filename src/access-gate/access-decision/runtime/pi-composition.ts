import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { adaptPiToolCall, loadPolicyFile } from "../adapters/index";
import { createPolicyState } from "./policy-state";
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

function policyStateFrom(config: unknown): PolicyState | undefined {
  try {
    return createPolicyState(config);
  } catch {
    return undefined;
  }
}

function installComposition(
  pi: ExtensionAPI,
  policyState: PolicyState | undefined,
  createSessionProject: (cwd: string) => SessionProject,
): void {
  let service: ReturnType<typeof createDecisionService> | undefined;
  let project: ProjectLifecycle | undefined;

  pi.on("session_start", (_event, context) => {
    project?.dispose();
    project = undefined;
    if (!policyState) {
      service = undefined;
      return;
    }
    try {
      const sessionProject = createSessionProject(context.cwd);
      if ("dispose" in sessionProject) project = sessionProject as ProjectLifecycle;
      service = createDecisionService(policyState, sessionProject.context);
    } catch {
      service = undefined;
    }
  });

  pi.on("session_shutdown", () => {
    project?.dispose();
    project = undefined;
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
