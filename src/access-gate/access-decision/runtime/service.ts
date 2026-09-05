import {
  compileDirect,
  compileShell,
  evaluateAdmission,
  evaluateShellAdmission,
  freezePolicySnapshot,
  freezeShellPolicySnapshot,
  isCanonicalReject,
  isShellReject,
  projectAdmission,
  projectDisplay,
  projectShellAdmission,
  projectShellDisplay,
  renderDecision,
} from "../core/index";
import type { Decision, DirectRequest, ShellRequest } from "../core/index";
import { renderHostBlock, renderHostFacingDecision } from "./host-render";
import type { HostFacingDecision } from "./host-render";
import { adaptHostToolCall, adaptPiToolCall } from "../adapters/index";
import { isPolicyState } from "./policy-state";
import type { PolicyState } from "./policy-state";
import { isProjectContext } from "./project-context";
import type { ProjectContext } from "./project-context";

type PassthroughResult = Readonly<{
  readonly kind: "passthrough";
  readonly toolName: string;
}>;

export type RuntimeResult = HostFacingDecision | PassthroughResult;

export type RuntimeObserver = Readonly<{
  readonly record: (event: RuntimeTraceEvent) => void;
}>;

export type RuntimeTraceEvent =
  | "adapt-managed"
  | "adapt-passthrough"
  | "adapt-reject"
  | "compile-direct"
  | "compile-shell"
  | "project-direct-admission"
  | "project-shell-admission"
  | "project-direct-display"
  | "project-shell-display"
  | "evaluate-direct-policy"
  | "evaluate-shell-policy"
  | "render-host-facing";

export interface DecisionService {
  decide(request: DirectRequest): Decision;
  decideToolCall(toolName: unknown, input: unknown, context: unknown): RuntimeResult;
  decidePiToolCall(event: unknown, context: unknown): RuntimeResult;
}

function mergeRoots(roots: readonly string[], context: ProjectContext | undefined): readonly string[] {
  if (context === undefined) return roots;
  return [...new Set([...roots, context.projectRoot, context.stagingRoot])];
}

function rejectResult(code: "invalid-request" | "resource-limit" | "security-boundary" | "unsupported-syntax" | "dynamic-value"): HostFacingDecision {
  return renderHostBlock(code);
}

function trace(observer: RuntimeObserver | undefined, event: RuntimeTraceEvent): void {
  observer?.record(event);
}

function renderManagedDecision(
  decision: ReturnType<typeof evaluateShellAdmission> | Decision,
  display: Parameters<typeof renderHostFacingDecision>[1],
  readOnlyModificationGuidance: boolean,
): RuntimeResult {
  if (readOnlyModificationGuidance && decision.kind === "deny" && decision.code === "policy-denied") {
    return renderHostBlock("read-only-policy-switch-required");
  }
  return renderHostFacingDecision(decision, display);
}

function evaluateManagedRequest(
  request: DirectRequest | ShellRequest,
  directPolicy: ReturnType<typeof freezePolicySnapshot>,
  shellPolicy: ReturnType<typeof freezeShellPolicySnapshot>,
  readOnlyModificationGuidance: boolean,
  observer: RuntimeObserver | undefined,
): RuntimeResult {
  if (request.surface === "bash") {
    trace(observer, "compile-shell");
    const compilation = compileShell(request);
    if (isShellReject(compilation)) {
      trace(observer, "render-host-facing");
      return rejectResult(compilation.code);
    }
    trace(observer, "project-shell-admission");
    const admission = projectShellAdmission(compilation);
    const decision = admission === undefined
      ? { kind: "deny", code: "invalid-admission" } as const
      : (trace(observer, "evaluate-shell-policy"), evaluateShellAdmission(admission, shellPolicy));
    const display = decision.kind === "ask"
      ? (trace(observer, "project-shell-display"), projectShellDisplay(compilation))
      : undefined;
    trace(observer, "render-host-facing");
    return renderManagedDecision(decision, display, false);
  }

  trace(observer, "compile-direct");
  const compilation = compileDirect(request);
  if (isCanonicalReject(compilation)) {
    trace(observer, "render-host-facing");
    return renderHostFacingDecision({ kind: "deny", code: compilation.code });
  }
  trace(observer, "project-direct-admission");
  const admission = projectAdmission(compilation);
  if (!admission) return renderHostFacingDecision({ kind: "deny", code: "invalid-request" });
  trace(observer, "evaluate-direct-policy");
  const decision = evaluateAdmission(admission, directPolicy);
  const display = decision.kind === "ask"
    ? (trace(observer, "project-direct-display"), projectDisplay(compilation))
    : undefined;
  trace(observer, "render-host-facing");
  return renderManagedDecision(decision, display, readOnlyModificationGuidance);
}

export function createDecisionService(state: PolicyState, context?: ProjectContext, observer?: RuntimeObserver): DecisionService {
  if (!isPolicyState(state)) throw new TypeError("invalid policy state");
  if (context !== undefined && !isProjectContext(context)) throw new TypeError("invalid project context");
  const directPolicy = freezePolicySnapshot({
    ...state.snapshot.direct,
    allowedRoots: mergeRoots(state.snapshot.direct.allowedRoots, context),
  });
  const shellPolicy = freezeShellPolicySnapshot({
    ...state.snapshot.shell,
    allowedRoots: mergeRoots(state.snapshot.shell.allowedRoots, context),
  });

  return {
    decide(request: DirectRequest): Decision {
      const compilation = compileDirect(request);
      if (isCanonicalReject(compilation)) return { kind: "deny", code: compilation.code };

      const admission = projectAdmission(compilation);
      if (!admission) return { kind: "deny", code: "invalid-request" };
      return renderDecision(evaluateAdmission(admission, directPolicy));
    },

    decideToolCall(toolName: unknown, input: unknown, hostContext: unknown): RuntimeResult {
      const adapted = adaptHostToolCall(toolName, input, hostContext);
      if (adapted.kind === "passthrough") {
        trace(observer, "adapt-passthrough");
        return adapted;
      }
      if (adapted.kind === "reject") {
        trace(observer, "adapt-reject");
        trace(observer, "render-host-facing");
        return renderHostBlock(adapted.code);
      }
      trace(observer, "adapt-managed");
      return evaluateManagedRequest(
        adapted.request,
        directPolicy,
        shellPolicy,
        state.activePreset === "review" && (adapted.request.surface === "write" || adapted.request.surface === "edit"),
        observer,
      );
    },

    decidePiToolCall(event: unknown, hostContext: unknown): RuntimeResult {
      const adapted = adaptPiToolCall(event, hostContext);
      if (adapted.kind === "passthrough") {
        trace(observer, "adapt-passthrough");
        return adapted;
      }
      if (adapted.kind === "reject") {
        trace(observer, "adapt-reject");
        trace(observer, "render-host-facing");
        return renderHostBlock(adapted.code);
      }
      trace(observer, "adapt-managed");
      return evaluateManagedRequest(
        adapted.request,
        directPolicy,
        shellPolicy,
        state.activePreset === "review" && (adapted.request.surface === "write" || adapted.request.surface === "edit"),
        observer,
      );
    },
  };
}
