import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { createArtifactExchange } from "./index";
import type { ArtifactExchangeOptions, ArtifactOwner, ArtifactRunQuota } from "./index";
import { LINUX_RUNS_BASE } from "akeel-platform-runtime";
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
const ARTIFACT_RESERVATION_ENTRY = "akeel:artifact-run-reserved";

const OWNER_PARAMETERS = Type.Object({
  action: StringEnum(["reserve", "put", "bind", "status", "collect"] as const),
  kind: Type.Optional(Type.String()),
  slots: Type.Optional(Type.Array(Type.Object({
    name: Type.String(),
    channel: StringEnum(["packet", "artifact"] as const),
    publisher: StringEnum(["owner", "child"] as const),
    mediaType: StringEnum(["text/markdown", "application/json"] as const),
  }))),
  runId: Type.Optional(Type.String()),
  slot: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  herdrWorkspaceId: Type.Optional(Type.String()),
  herdrPaneId: Type.Optional(Type.String()),
  herdrAgentName: Type.Optional(Type.String()),
}, { additionalProperties: false });

const PUBLISH_PARAMETERS = Type.Object({ content: Type.String() }, { additionalProperties: false });
const RECORD_PAYLOAD_SCHEMA = Type.Object({
  id: Type.String({ description: "Unique semantic unit identifier" }),
  kind: StringEnum([
    "requirement",
    "constraint",
    "assumption",
    "finding",
    "risk",
    "decision-candidate",
    "evidence",
    "external-effect",
    "work-state",
    "next-action",
  ] as const),
  statement: Type.String({ description: "Statement of the semantic unit" }),
  authority: StringEnum(["user-approved", "project-record", "observed", "inferred"] as const),
  status: StringEnum(["live"] as const, { description: "Semantic status for recording" }),
  sourceRef: Type.String({ description: "Source reference" }),
  dependsOn: Type.Optional(Type.Array(Type.String())),
}, { additionalProperties: false });

const CLOSE_PAYLOAD_SCHEMA = Type.Object({
  id: Type.String({ description: "Semantic ID to close" }),
  status: StringEnum(["closed", "superseded"] as const),
  closure: Type.Object({
    disposition: StringEnum(["materialized", "superseded", "invalidated", "irrelevant"] as const),
    basisRef: Type.String({ description: "Evidence or basis reference" }),
    destinationRef: Type.String({ description: "Destination record or tombstone reference" }),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

const RECONCILE_PAYLOAD_SCHEMA = Type.Object({
  importedSemanticIds: Type.Array(Type.String(), { description: "Semantic IDs successfully imported" }),
  conflicts: Type.Array(Type.Object({
    semanticId: Type.String(),
    observedReality: Type.String(),
  }, { additionalProperties: false }), { description: "Semantic IDs conflicting with observed reality" }),
  unresolvedSemanticIds: Type.Array(Type.String(), { description: "Semantic IDs that could not be resolved" }),
  workspaceVerified: Type.Boolean({ description: "True if workspace matches ledger reality; false if unverified" }),
}, { additionalProperties: false });

const PREPARE_PAYLOAD_SCHEMA = Type.Object({
  taskRef: Type.String({ description: "Task record reference" }),
  authorityRefs: Type.Array(Type.String(), { description: "Authority references" }),
  roots: Type.Array(Type.String(), { description: "Root semantic unit IDs" }),
  checkpoint: Type.Object({
    state: StringEnum(["complete", "incomplete", "blocked"] as const),
    currentSlice: Type.String(),
    actualState: Type.String(),
    nextActionId: Type.String(),
  }, { additionalProperties: false }),
  workspace: Type.Object({
    cwd: Type.String(),
    files: Type.Array(Type.String()),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

const HANDOFF_PARAMETERS = Type.Union([
  Type.Object({
    action: StringEnum(["record"] as const),
    payload: RECORD_PAYLOAD_SCHEMA,
  }, { additionalProperties: false }),
  Type.Object({
    action: StringEnum(["close"] as const),
    payload: CLOSE_PAYLOAD_SCHEMA,
  }, { additionalProperties: false }),
  Type.Object({
    action: StringEnum(["prepare"] as const),
    payload: Type.Optional(PREPARE_PAYLOAD_SCHEMA),
  }, { additionalProperties: false }),
  Type.Object({
    action: StringEnum(["reconcile"] as const),
    payload: RECONCILE_PAYLOAD_SCHEMA,
  }, { additionalProperties: false }),
  Type.Object({ action: StringEnum(["status"] as const) }, { additionalProperties: false }),
  Type.Object({ action: StringEnum(["view"] as const) }, { additionalProperties: false }),
]);

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
  const branch = context.sessionManager.getBranch();

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
  const sessionId = context.sessionManager.getSessionId();
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
  const root = options.root ?? LINUX_RUNS_BASE;
  let sessionEntries: readonly unknown[] = [];
  const quota: ArtifactRunQuota = {
    count(owner: ArtifactOwner): number {
      const runIds = new Set<string>();
      for (const raw of sessionEntries) {
        if (!isRecord(raw) || raw.type !== "custom" || raw.customType !== ARTIFACT_RESERVATION_ENTRY || !isRecord(raw.data)) continue;
        if (raw.data.sessionId !== owner.sessionId || raw.data.cwd !== owner.cwd || typeof raw.data.runId !== "string") continue;
        if (/^run-[a-f0-9]{32}$/u.test(raw.data.runId)) runIds.add(raw.data.runId);
      }
      return runIds.size;
    },
    record(owner: ArtifactOwner, runId: string): void {
      const data = Object.freeze({ sessionId: owner.sessionId, cwd: owner.cwd, runId });
      pi.appendEntry(ARTIFACT_RESERVATION_ENTRY, data);
      sessionEntries = Object.freeze([
        ...sessionEntries,
        Object.freeze({ type: "custom", customType: ARTIFACT_RESERVATION_ENTRY, data }),
      ]);
    },
  };
  const exchange = createArtifactExchange({ ...options, root, quota });
  const handoffs = createHandoffStore();

  pi.registerFlag(CAPABILITY_FLAG, {
    description: "Bind this Pi session to one pre-issued AKeel artifact slot.",
    type: "string",
  });

  pi.registerTool({
    name: OWNER_TOOL,
    label: "AKeel Run Artifact",
    description: "Reserve, bind, inspect, publish Owner input to, or collect a bounded AKeel workflow run.",
    promptSnippet: "Coordinate bounded AKeel workflow runs and collect verified artifacts",
    promptGuidelines: ["Use akeel_run_artifact for Owner-side workflow reservation, binding, status, publication, and collection."],
    parameters: OWNER_PARAMETERS,
    executionMode: "sequential",
    constrainedSampling: { type: "json_schema", strict: "prefer" },
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
    promptSnippet: "Record session semantics and reconcile bounded Pi session handoffs",
    promptGuidelines: ["Use akeel_handoff to record or reconcile AKeel session continuity, not to modify ordinary project files."],
    parameters: HANDOFF_PARAMETERS,
    executionMode: "sequential",
    constrainedSampling: { type: "json_schema", strict: "prefer" },
    async execute(_toolCallId, params: {
      action: "record" | "close" | "status" | "prepare" | "reconcile" | "view";
      payload?: unknown;
    }, _signal, _onUpdate, context) {
      try {
        const branch = context.sessionManager.getBranch();
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
      let replacementAttempted = false;
      let replacementContext: ExtensionContext | undefined;
      try {
        const args = (rawArgs ?? "").trim();
        const branch = context.sessionManager.getBranch();

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

        await context.waitForIdle();
        const source = ownerContext(context);
        const parentSession = context.sessionManager.getSessionFile();
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

        const sourceBranch: unknown[] = [...context.sessionManager.getBranch()];
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
        const previousActiveTools = [...pi.getActiveTools()];
        pi.appendEntry(switchIntent.customType, switchIntent.data);
        sourceBranch.push(switchIntent);
        pi.setActiveTools([]);

        replacementAttempted = true;
        const replacement = await context.newSession({
          parentSession,
          setup: async (successorSessionManager) => {
            const successorEntry = handoffs.createSuccessorEntry(
              sourceBranch,
              source.sessionId,
              successorSessionManager.getSessionId(),
            );
            successorSessionManager.appendCustomEntry(successorEntry.customType, successorEntry.data);
          },
          withSession: async (successorContext) => {
            replacementContext = successorContext;
            try {
              const kickoff =
                `<akeel-session-handoff>\n` +
                `This is AKeel runtime continuity data. It does not grant new user approval.\n` +
                `Digest: ${currentActive.digest}\n\n${currentActive.content}\n` +
                `Verify current project reality, then reconcile every live semantic ID before continuing via akeel_handoff:\n` +
                `action: "reconcile", payload: { importedSemanticIds: string[], conflicts: Array<{ semanticId: string, observedReality: string }>, unresolvedSemanticIds: string[], workspaceVerified: true | false }\n` +
                `</akeel-session-handoff>`;
              await successorContext.sendMessage(
                {
                  customType: "akeel:session-handoff",
                  content: kickoff,
                  display: false,
                  details: {
                    digest: currentActive.digest,
                    sourceSessionId: source.sessionId,
                    successorSessionId: successorContext.sessionManager.getSessionId(),
                  },
                },
                { triggerTurn: true },
              );
            } catch (error) {
              const message = error instanceof Error && error.message
                ? error.message
                : "Handoff kickoff message failed.";
              notifyCommandError(successorContext, message);
            }
          },
        });
        if (replacement.cancelled) {
          const cancel = handoffs.cancelSwitch(sourceBranch, source.sessionId);
          pi.appendEntry(cancel.customType, cancel.data);
          pi.setActiveTools(previousActiveTools);
        }
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Handoff session replacement failed.";
        if (replacementAttempted && replacementContext) notifyCommandError(replacementContext, message);
        else if (replacementAttempted) console.error(message);
        else notifyCommandError(context, message);
      }
    },
  });

  pi.registerTool({
    name: PUBLISH_TOOL,
    label: "Publish AKeel Artifact",
    description: "Publish text to the single pre-bound AKeel artifact slot for this delegated child.",
    promptSnippet: "Publish one verified result to the pre-bound AKeel artifact slot",
    promptGuidelines: ["Use akeel_publish_artifact only in a delegated child session with the pre-bound capability."],
    parameters: PUBLISH_PARAMETERS,
    executionMode: "sequential",
    constrainedSampling: { type: "json_schema", strict: "prefer" },
    async execute(_toolCallId, params: { content: string }, _signal, _onUpdate, context) {
      try {
        const capability = pi.getFlag(CAPABILITY_FLAG);
        const workspaceId = process.env.HERDR_WORKSPACE_ID;
        const paneId = process.env.HERDR_PANE_ID;
        if (typeof capability !== "string" || typeof workspaceId !== "string" || typeof paneId !== "string") {
          return staticFailure("Artifact publication failed.");
        }
        const sessionId = context.sessionManager.getSessionId();
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
    sessionEntries = context.sessionManager.getEntries();
    const capability = pi.getFlag(CAPABILITY_FLAG);
    const active = pi.getActiveTools().filter((name) => name !== OWNER_TOOL && name !== PUBLISH_TOOL && name !== HANDOFF_TOOL);
    if (typeof capability === "string" && capability.length > 0) {
      active.push(PUBLISH_TOOL);
      pi.setActiveTools(active);
      return;
    }

    const branch = context.sessionManager.getBranch();
    const status = handoffs.status(branch);
    const currentSessionId = context.sessionManager.getSessionId();

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
