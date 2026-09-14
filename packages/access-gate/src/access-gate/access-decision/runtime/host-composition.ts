import { adaptPiGateToolCall } from "../adapters/index";
import { renderHostBlock, renderHostFacingDecision } from "./host-render";
import type { HostFacingDecision } from "./host-render";
import type { GateSession, GateSessionResult } from "./gate-session";

export type PiToolCallHandlerResult = Readonly<{
  readonly block: true;
  readonly reason: string;
}> | undefined;

type ApprovalHostContext = Readonly<{
  readonly hasUI: true;
  readonly ui: Readonly<{
    readonly confirm: (title: string, message: string) => Promise<boolean>;
  }>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasApprovalUI(value: unknown): value is ApprovalHostContext {
  if (!isRecord(value) || value.hasUI !== true || !isRecord(value.ui)) return false;
  return typeof value.ui.confirm === "function";
}

export async function handleGateSessionToolCall(
  session: GateSession,
  event: unknown,
  context: unknown,
): Promise<PiToolCallHandlerResult> {
  const adapted = adaptPiGateToolCall(event, context);
  if (adapted.kind === "passthrough") return undefined;
  if (adapted.kind === "reject") return hostHandlerResult(renderHostBlock(adapted.code), context);

  try {
    const result = session.evaluate(adapted.request);
    return await hostHandlerResult(renderGateSessionResult(result, session, adapted.request.surface), context);
  } catch {
    return Object.freeze({ block: true, reason: renderHostBlock("invalid-admission").reason });
  }
}

function renderGateSessionResult(
  result: GateSessionResult,
  session: GateSession,
  surface: string,
): HostFacingDecision {
  if (result.kind === "allow") return Object.freeze({ kind: "allow" });
  if (result.kind === "approval-required") {
    return renderHostFacingDecision({ kind: "ask", executed: false }, result.display);
  }
  if (result.code === "policy-denied" && session.activePreset() === "review" &&
    (surface === "write" || surface === "edit")) {
    return renderHostBlock("read-only-policy-switch-required");
  }
  return renderHostBlock(result.code);
}

async function hostHandlerResult(result: HostFacingDecision, context: unknown): Promise<PiToolCallHandlerResult> {
  if (result.kind === "block") return Object.freeze({ block: true, reason: result.reason });
  if (result.kind !== "confirm") return undefined;
  if (!hasApprovalUI(context)) return Object.freeze({ block: true, reason: "Blocked because approval UI is unavailable." });

  try {
    const approved = await context.ui.confirm("Approval required", result.summary);
    return approved ? undefined : Object.freeze({ block: true, reason: "Blocked by user." });
  } catch {
    return Object.freeze({ block: true, reason: "Blocked because approval UI failed." });
  }
}
