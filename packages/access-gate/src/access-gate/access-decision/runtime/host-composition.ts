import type { DecisionService, RuntimeResult } from "./service";

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

export async function handlePiToolCall(
  service: DecisionService,
  event: unknown,
  context: unknown,
): Promise<PiToolCallHandlerResult> {
  const result = service.decidePiToolCall(event, context);
  return hostHandlerResult(result, context);
}

async function hostHandlerResult(result: RuntimeResult, context: unknown): Promise<PiToolCallHandlerResult> {
  if (result.kind === "block") return Object.freeze({ block: true, reason: result.reason });
  if (result.kind !== "confirm") return undefined;
  if (!hasApprovalUI(context)) return Object.freeze({ block: true, reason: "Blocked because approval UI is unavailable." });

  try {
    if (await context.ui.confirm("Approval required", result.summary)) return undefined;
  } catch {
    return Object.freeze({ block: true, reason: "Blocked because approval UI is unavailable." });
  }
  return Object.freeze({ block: true, reason: "Blocked by user." });
}
