import { join } from "node:path";
import { tmpdir } from "node:os";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createArtifactExchange } from "./index";
import type { ArtifactExchangeOptions } from "./index";
import { createHandoffStore } from "../handoff-store/index";
import {
  createContinuationCapsule,
  synthesizeContinuationCapsule,
  validateSemanticUnit,
} from "../handoff-document/index";
import type { ContinuationCapsuleInput, SemanticUnit } from "../handoff-document/index";

const OWNER_TOOL = "akeel_run_artifact";
const PUBLISH_TOOL = "akeel_publish_artifact";
const HANDOFF_TOOL = "akeel_handoff";
const CAPABILITY_FLAG = "akeel-artifact-capability";

const OWNER_PARAMETERS = Type.Object({
  action: Type.Union([
    Type.Literal("reserve"), Type.Literal("put"), Type.Literal("bind"), Type.Literal("status"), Type.Literal("collect"),
  ]),
  kind: Type.Optional(Type.String()),
  slots: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    channel: Type.Union([Type.Literal("packet"), Type.Literal("artifact")]),
    publisher: Type.Union([Type.Literal("owner"), Type.Literal("child")]),
    mediaType: Type.Union([Type.Literal("text/markdown"), Type.Literal("application/json")]),
  }))),
  runId: Type.Optional(Type.String()),
  slot: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  herdrWorkspaceId: Type.Optional(Type.String()),
  herdrPaneId: Type.Optional(Type.String()),
  herdrAgentName: Type.Optional(Type.String()),
}, { additionalProperties: false });

const PUBLISH_PARAMETERS = Type.Object({ content: Type.String() }, { additionalProperties: false });
const HANDOFF_PARAMETERS = Type.Object({
  action: Type.Union([
    Type.Literal("record"),
    Type.Literal("close"),
    Type.Literal("status"),
    Type.Literal("prepare"),
    Type.Literal("reconcile"),
    Type.Literal("view"),
  ]),
  payload: Type.Optional(Type.Any()),
}, { additionalProperties: false });

const SEMANTIC_ENTRY = "akeel:semantic-ledger";

type CustomEntry = Readonly<{ readonly type?: unknown; readonly customType?: unknown; readonly data?: unknown }>;
type CloseSemanticEvent = Readonly<{
  readonly action: "close";
  readonly id: string;
  readonly status: "closed" | "superseded";
  readonly closure: NonNullable<SemanticUnit["closure"]>;
}>;
type SemanticEvent =
  | Readonly<{ readonly action: "record"; readonly unit: SemanticUnit }>
  | CloseSemanticEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveTaskRef(units: readonly SemanticUnit[]): string {
  for (const unit of units) {
    const match = unit.sourceRef.match(/^docs\/task\.md#t-[0-9]+/i);
    if (match) return match[0];
  }
  return "docs/task.md";
}

function semanticUnits(context: ExtensionContext): readonly SemanticUnit[] {
  const units = new Map<string, SemanticUnit>();
  const branch = context.sessionManager?.getBranch() ?? [];

  let startIndex = 0;
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    const raw = branch[i];
    if (isRecord(raw) && raw.type === "custom" && raw.customType === "akeel:continuation-capsule" && raw.data) {
      const continuation = raw.data as { capsule?: { units?: readonly SemanticUnit[] } };
      if (continuation.capsule && Array.isArray(continuation.capsule.units)) {
        for (const unit of continuation.capsule.units) {
          units.set(unit.id, validateSemanticUnit(unit));
        }
      }
      startIndex = i + 1;
      break;
    }
  }

  for (let i = startIndex; i < branch.length; i += 1) {
    const rawEntry = branch[i];
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as CustomEntry;
    if (entry.type !== "custom" || entry.customType !== SEMANTIC_ENTRY || !entry.data || typeof entry.data !== "object") continue;
    const event = entry.data as Partial<SemanticEvent>;
    if (event.action === "record") {
      const unit = validateSemanticUnit(event.unit);
      if (unit.status !== "live") throw new TypeError("handoff-ledger-invalid");
      units.set(unit.id, unit);
      continue;
    }
    if (event.action === "close") {
      const unit = typeof event.id === "string" ? units.get(event.id) : undefined;
      if (!unit || unit.status !== "live" || (event.status !== "closed" && event.status !== "superseded") ||
        !event.closure || typeof event.closure.basisRef !== "string" || typeof event.closure.destinationRef !== "string") {
        throw new TypeError("handoff-ledger-invalid");
      }
      units.set(unit.id, validateSemanticUnit(Object.freeze({ ...unit, status: event.status, closure: event.closure })));
      continue;
    }
    throw new TypeError("handoff-ledger-invalid");
  }
  return Object.freeze([...units.values()]);
}

type OwnerParams = Readonly<{
  readonly action: "reserve" | "put" | "bind" | "status" | "collect";
  readonly kind?: string;
  readonly slots?: readonly Readonly<{
    readonly name: string;
    readonly channel: "packet" | "artifact";
    readonly publisher: "owner" | "child";
    readonly mediaType: "text/markdown" | "application/json";
  }>[];
  readonly runId?: string;
  readonly slot?: string;
  readonly content?: string;
  readonly herdrWorkspaceId?: string;
  readonly herdrPaneId?: string;
  readonly herdrAgentName?: string;
}>;

function ownerContext(context: ExtensionContext): Readonly<{ sessionId: string; cwd: string }> {
  const sessionId = context.sessionManager?.getSessionId();
  if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error("Artifact operation failed.");
  return Object.freeze({ sessionId, cwd: context.cwd });
}

function staticFailure(message: string): never {
  throw new Error(message);
}

function requireString(value: string | undefined): string {
  return value === undefined ? staticFailure("Artifact operation failed.") : value;
}

export type ArtifactExchangeCompositionOptions = Partial<ArtifactExchangeOptions> & Readonly<{
  readonly handoffRoot?: string;
}>;

export function installArtifactExchange(pi: ExtensionAPI, options: ArtifactExchangeCompositionOptions = {}): void {
  const root = options.root ?? join(tmpdir(), "akeel", "runs");
  const exchange = createArtifactExchange({ ...options, root });
  const handoffs = createHandoffStore();

  pi.registerFlag(CAPABILITY_FLAG, {
    description: "Bind this Pi session to one pre-issued AKeel artifact slot.",
    type: "string",
  });

  pi.registerTool({
    name: OWNER_TOOL,
    label: "AKeel Run Artifact",
    description: "Reserve, bind, inspect, publish Owner input to, or collect a bounded AKeel workflow run.",
    parameters: OWNER_PARAMETERS,
    executionMode: "sequential",
    async execute(_toolCallId, rawParams, _signal, _onUpdate, context) {
      const params = rawParams as OwnerParams;
      const owner = ownerContext(context);
      try {
        let result: unknown;
        switch (params.action) {
          case "reserve":
            result = exchange.reserve(owner, { kind: requireString(params.kind), slots: params.slots ?? [] });
            break;
          case "put":
            result = exchange.put(owner, requireString(params.runId), requireString(params.slot), requireString(params.content));
            break;
          case "bind":
            result = exchange.bind(owner, requireString(params.runId), requireString(params.slot), {
              herdrWorkspaceId: requireString(params.herdrWorkspaceId),
              herdrPaneId: requireString(params.herdrPaneId),
              herdrAgentName: requireString(params.herdrAgentName),
            });
            break;
          case "status":
            result = exchange.status(owner, requireString(params.runId));
            break;
          case "collect": {
            const collected = exchange.collect(owner, requireString(params.runId), requireString(params.slot));
            return { content: [{ type: "text", text: collected.content }], details: { result: collected } };
          }
          default:
            return staticFailure("Artifact operation failed.");
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result ?? { status: "bound" }) }],
          details: { result: result ?? { status: "bound" } },
        };
      } catch {
        return staticFailure("Artifact operation failed.");
      }
    },
  });

  pi.registerTool({
    name: HANDOFF_TOOL,
    label: "AKeel Handoff",
    description: "In-session continuity tool to record or close live semantics, prepare or verify a continuation capsule, and reconcile in a successor session.",
    parameters: HANDOFF_PARAMETERS,
    executionMode: "sequential",
    async execute(_toolCallId, params: {
      action: "record" | "close" | "status" | "prepare" | "reconcile" | "view";
      payload?: unknown;
    }, _signal, _onUpdate, context) {
      try {
        const branch = context.sessionManager?.getBranch() ?? [];
        if (params.action === "record") {
          if (!params.payload || typeof params.payload !== "object") return staticFailure("Handoff operation failed.");
          const unit = validateSemanticUnit(params.payload);
          const existing = semanticUnits(context);
          if (unit.status !== "live" || existing.some((candidate) => candidate.id === unit.id)) {
            return staticFailure("Handoff operation failed.");
          }
          pi.appendEntry(SEMANTIC_ENTRY, Object.freeze({ action: "record", unit } satisfies SemanticEvent));
          return { content: [{ type: "text", text: unit.id }], details: { result: { semanticId: unit.id } } };
        }
        if (params.action === "close") {
          if (!params.payload || typeof params.payload !== "object") return staticFailure("Handoff operation failed.");
          const event = { action: "close", ...(params.payload as Record<string, unknown>) } as Partial<CloseSemanticEvent> & { action: "close" };
          const current = semanticUnits(context);
          const unit = event.action === "close" && typeof event.id === "string"
            ? current.find((candidate) => candidate.id === event.id)
            : undefined;
          if (!unit || unit.status !== "live" || (event.status !== "closed" && event.status !== "superseded") ||
            !event.closure || typeof event.closure.basisRef !== "string" || typeof event.closure.destinationRef !== "string" ||
            current.some((candidate) => candidate.status === "live" && candidate.dependsOn?.includes(unit.id))) {
            return staticFailure("Handoff operation failed.");
          }
          validateSemanticUnit({ ...unit, status: event.status, closure: event.closure });
          pi.appendEntry(SEMANTIC_ENTRY, Object.freeze(event as SemanticEvent));
          return { content: [{ type: "text", text: unit.id }], details: { result: { semanticId: unit.id } } };
        }
        if (params.action === "status") {
          const units = semanticUnits(context);
          const handoffState = handoffs.status(branch);
          const result = { units, handoffState };
          return { content: [{ type: "text", text: JSON.stringify(result) }], details: { result } };
        }
        if (params.action === "prepare") {
          const source = ownerContext(context);
          const units = semanticUnits(context);
          let capsule;
          if (params.payload && typeof params.payload === "object") {
            const input = { ...(params.payload as Omit<ContinuationCapsuleInput, "units">), units };
            if (!input.workspace || typeof input.workspace.cwd !== "string" || input.workspace.cwd !== source.cwd) {
              return staticFailure("Handoff operation failed.");
            }
            capsule = createContinuationCapsule(input);
          } else {
            capsule = synthesizeContinuationCapsule({
              taskRef: resolveTaskRef(units),
              cwd: source.cwd,
              units,
            });
          }
          const prepared = handoffs.prepareCapsule(capsule);
          pi.appendEntry(prepared.entry.customType, prepared.entry.data);
          return { content: [{ type: "text", text: prepared.digest }], details: { result: prepared } };
        }
        if (params.action === "reconcile") {
          if (!params.payload || typeof params.payload !== "object") return staticFailure("Handoff operation failed.");
          const successor = ownerContext(context);
          const reconciled = handoffs.reconcile(branch, successor.sessionId, params.payload as never);
          pi.appendEntry(reconciled.entry.customType, reconciled.entry.data);

          if (reconciled.state === "reconciled") {
            const active = pi.getActiveTools().filter((name) => name !== OWNER_TOOL && name !== PUBLISH_TOOL);
            active.push(OWNER_TOOL);
            pi.setActiveTools(active);
            return { content: [{ type: "text", text: "Handoff reconciled." }], details: { result: reconciled } };
          }

          return { content: [{ type: "text", text: "Handoff reconciliation blocked." }], details: { result: reconciled } };
        }
        if (params.action === "view") {
          const active = handoffs.getActiveCapsule(branch);
          if (!active) return staticFailure("Handoff operation failed.");
          return { content: [{ type: "text", text: active.content }], details: { result: active } };
        }
        return staticFailure("Handoff operation failed.");
      } catch {
        return staticFailure("Handoff operation failed.");
      }
    },
  });

  function notifyCommandError(context: ExtensionContext, message: string): void {
    if (context.hasUI) context.ui.notify(message, "error");
    else console.error(message);
  }

  pi.registerCommand("handoff", {
    description: "Replace the current session with an in-session continuation capsule. Usage: /handoff [optional-next-action|view]",
    async handler(rawArgs, context) {
      try {
        const args = (rawArgs ?? "").trim();
        const branch = context.sessionManager?.getBranch() ?? [];

        if (args === "view") {
          const active = handoffs.getActiveCapsule(branch);
          if (!active) {
            const message = "No active continuation capsule found.";
            if (context.hasUI) context.ui.notify(message, "warning");
            else console.log(message);
            return;
          }
          if (context.hasUI) {
            context.ui.notify(`Continuation Capsule:\n\n${active.content}`, "info");
          } else {
            console.log(`Continuation Capsule:\n\n${active.content}`);
          }
          return;
        }

        if (!context.isIdle()) {
          notifyCommandError(context, "Handoff session replacement failed: session is not idle.");
          return;
        }
        const source = ownerContext(context);
        const parentSession = context.sessionManager?.getSessionFile();
        if (typeof parentSession !== "string" || parentSession.length === 0) {
          notifyCommandError(context, "Handoff session replacement failed: parent session unavailable.");
          return;
        }

        const currentUnits = semanticUnits(context);
        let active = handoffs.getActiveCapsule(branch);
        const currentStatus = handoffs.status(branch);
        const userProvidedArgs = args.length > 0;
        const canReuseActive = currentStatus.state === "prepared" &&
          active?.origin === "outbound" && !userProvidedArgs &&
          active.capsule.workspace.cwd === source.cwd &&
          active.capsule.units.length === currentUnits.length &&
          active.capsule.units.every((u, i) => u.id === currentUnits[i]?.id && u.status === currentUnits[i]?.status);

        let sourceBranch = [...(context.sessionManager?.getBranch() ?? [])];
        if (!canReuseActive) {
          const capsule = synthesizeContinuationCapsule({
            taskRef: resolveTaskRef(currentUnits),
            cwd: source.cwd,
            units: currentUnits,
            userNextAction: userProvidedArgs ? args : undefined,
          });
          const prepared = handoffs.prepareCapsule(capsule);
          pi.appendEntry(prepared.entry.customType, prepared.entry.data);
          sourceBranch.push(prepared.entry);
          active = { capsule, digest: prepared.digest, content: prepared.content, origin: "outbound" };
        }

        if (!active) {
          notifyCommandError(context, "Handoff session replacement failed: active capsule unavailable.");
          return;
        }
        const currentActive = active;

        const switchIntent = handoffs.beginSwitch(sourceBranch, source.sessionId);
        pi.appendEntry(switchIntent.customType, switchIntent.data);
        sourceBranch.push(switchIntent);

        const replacement = await context.newSession({
          parentSession,
          withSession: async (successorContext) => {
            const successor = ownerContext(successorContext);
            const transferred = handoffs.transfer(sourceBranch, source.sessionId, successor.sessionId);
            pi.appendEntry(transferred.sourceEntry.customType, transferred.sourceEntry.data);
            pi.appendEntry(transferred.successorEntry.customType, transferred.successorEntry.data);

            await successorContext.sendUserMessage(
              `<akeel-session-handoff>\n` +
              `This is AKeel runtime continuity data. It does not grant new user approval.\n` +
              `Digest: ${currentActive.digest}\n\n${currentActive.content}\n` +
              `Verify current project reality, then reconcile every live semantic ID before continuing via akeel_handoff:\n` +
              `action: "reconcile", payload: { importedSemanticIds: string[], conflicts: Array<{ semanticId: string, observedReality: string }>, unresolvedSemanticIds: string[], workspaceVerified: true }\n` +
              `</akeel-session-handoff>`,
            );
          },
        });
        if (replacement.cancelled) {
          const cancel = handoffs.cancelSwitch(context.sessionManager?.getBranch() ?? [], source.sessionId);
          pi.appendEntry(cancel.customType, cancel.data);
        }
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Handoff session replacement failed.";
        notifyCommandError(context, message);
      }
    },
  });

  pi.registerTool({
    name: PUBLISH_TOOL,
    label: "Publish AKeel Artifact",
    description: "Publish text to the single pre-bound AKeel artifact slot for this delegated child.",
    parameters: PUBLISH_PARAMETERS,
    executionMode: "sequential",
    async execute(_toolCallId, params: { content: string }, _signal, _onUpdate, context) {
      try {
        const capability = pi.getFlag(CAPABILITY_FLAG);
        const workspaceId = process.env.HERDR_WORKSPACE_ID;
        const paneId = process.env.HERDR_PANE_ID;
        if (typeof capability !== "string" || typeof workspaceId !== "string" || typeof paneId !== "string") {
          return staticFailure("Artifact publication failed.");
        }
        const sessionId = context.sessionManager?.getSessionId();
        if (typeof sessionId !== "string" || sessionId.length === 0) return staticFailure("Artifact publication failed.");
        const result = exchange.publish(capability, {
          sessionId,
          herdrWorkspaceId: workspaceId,
          herdrPaneId: paneId,
        }, params.content);
        return { content: [{ type: "text", text: "Artifact published." }], details: { result } };
      } catch {
        return staticFailure("Artifact publication failed.");
      }
    },
  });

  pi.on("session_start", (_event, context) => {
    const capability = pi.getFlag(CAPABILITY_FLAG);
    const active = pi.getActiveTools().filter((name) => name !== OWNER_TOOL && name !== PUBLISH_TOOL && name !== HANDOFF_TOOL);
    if (typeof capability === "string" && capability.length > 0) {
      active.push(PUBLISH_TOOL);
      pi.setActiveTools(active);
      return;
    }

    const branch = context.sessionManager?.getBranch() ?? [];
    const status = handoffs.status(branch);
    const currentSessionId = context.sessionManager?.getSessionId();

    if (status.state === "switch-started") {
      pi.setActiveTools([]);
      if (context.hasUI) context.ui.notify("AKeel session switch was initiated; model tools are disabled in this retired or ambiguous session.", "warning");
      return;
    }

    if (status.state === "transferred" || status.state === "blocked") {
      if (currentSessionId && status.sourceSessionId && currentSessionId === status.sourceSessionId) {
        pi.setActiveTools([]);
        if (context.hasUI) context.ui.notify("AKeel source authority was transferred; model tools are disabled in this retired session.", "warning");
        return;
      }
      if (currentSessionId && status.successorSessionId && currentSessionId === status.successorSessionId) {
        active.push(HANDOFF_TOOL);
        pi.setActiveTools(active);
        return;
      }
      pi.setActiveTools([]);
      if (context.hasUI) context.ui.notify("AKeel session authority is ambiguous; model tools are disabled.", "warning");
      return;
    }

    if (status.state === "reconciled") {
      if (currentSessionId && status.successorSessionId && currentSessionId === status.successorSessionId) {
        active.push(OWNER_TOOL, HANDOFF_TOOL);
        pi.setActiveTools(active);
        return;
      }
      pi.setActiveTools([]);
      if (context.hasUI) context.ui.notify("AKeel source authority was transferred; model tools are disabled.", "warning");
      return;
    }

    active.push(OWNER_TOOL, HANDOFF_TOOL);
    pi.setActiveTools(active);
  });
}

export default function artifactExchange(pi: ExtensionAPI): void {
  installArtifactExchange(pi);
}
