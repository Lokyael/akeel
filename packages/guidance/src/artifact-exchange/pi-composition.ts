import { join } from "node:path";
import { tmpdir } from "node:os";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createArtifactExchange } from "./index";
import type { ArtifactExchangeOptions } from "./index";
import { createHandoffStore } from "../handoff-store/index";

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
  action: Type.Union([Type.Literal("publish"), Type.Literal("verify")]),
  content: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
}, { additionalProperties: false });

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

export type ArtifactExchangeCompositionOptions = Partial<ArtifactExchangeOptions> & Readonly<{ readonly handoffRoot?: string }>;

export function installArtifactExchange(pi: ExtensionAPI, options: ArtifactExchangeCompositionOptions = {}): void {
  const root = options.root ?? join(tmpdir(), "akeel", "runs");
  const exchange = createArtifactExchange({ ...options, root });
  const handoffs = createHandoffStore({ root: options.handoffRoot ?? join(tmpdir(), "akeel", "handoffs") });

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
    description: "Atomically publish or verify a bounded cross-session AKeel handoff.",
    parameters: HANDOFF_PARAMETERS,
    executionMode: "sequential",
    async execute(_toolCallId, params: { action: "publish" | "verify"; content?: string; path?: string }, _signal, _onUpdate, context) {
      try {
        if (params.action === "publish") {
          const result = handoffs.publish(ownerContext(context), requireString(params.content));
          return { content: [{ type: "text", text: result.path }], details: { result } };
        }
        if (params.action === "verify") {
          const result = handoffs.verify(requireString(params.path));
          return { content: [{ type: "text", text: result.content }], details: { result } };
        }
        return staticFailure("Handoff operation failed.");
      } catch {
        return staticFailure("Handoff operation failed.");
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

  pi.on("session_start", () => {
    const capability = pi.getFlag(CAPABILITY_FLAG);
    const active = pi.getActiveTools().filter((name) => name !== OWNER_TOOL && name !== PUBLISH_TOOL && name !== HANDOFF_TOOL);
    if (typeof capability === "string" && capability.length > 0) active.push(PUBLISH_TOOL);
    else active.push(OWNER_TOOL, HANDOFF_TOOL);
    pi.setActiveTools(active);
  });
}

export default function artifactExchange(pi: ExtensionAPI): void {
  installArtifactExchange(pi);
}
