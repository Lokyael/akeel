import type { ManagedCall } from "../core/compilation/index";

export type HostContext = Readonly<{
  readonly cwd: string;
  readonly hasUI: boolean;
}>;

type PassthroughRequest = Readonly<{
  readonly kind: "passthrough";
  readonly toolName: string;
}>;

type HostReject = Readonly<{
  readonly kind: "reject";
  readonly code: "invalid-host-context" | "unsupported-surface";
}>;

export type GateHostToolCall =
  | Readonly<{ readonly kind: "managed"; readonly request: ManagedCall }>
  | PassthroughRequest
  | HostReject;

const MANAGED_SURFACES = new Set(["read", "write", "edit", "ls", "grep", "find", "bash"]);
const UNSUPPORTED_SURFACES = new Set(["powershell"]);

export function isExplicitlyUnsupportedToolCall(event: unknown): boolean {
  return isRecord(event) && typeof event.toolName === "string" && UNSUPPORTED_SURFACES.has(event.toolName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validHostContext(value: unknown): value is HostContext {
  if (!isRecord(value)) return false;
  return typeof value.cwd === "string" && value.cwd.startsWith("/") && typeof value.hasUI === "boolean";
}

function validToolInput(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function adaptPiGateToolCall(event: unknown, context: unknown): GateHostToolCall {
  if (!isRecord(event) || typeof event.toolName !== "string" || event.toolName.length === 0) {
    return { kind: "reject", code: "invalid-host-context" };
  }
  if (isExplicitlyUnsupportedToolCall(event)) return { kind: "reject", code: "unsupported-surface" };
  if (!MANAGED_SURFACES.has(event.toolName)) return { kind: "passthrough", toolName: event.toolName };
  if (!validHostContext(context) || !validToolInput(event.input)) {
    return { kind: "reject", code: !validHostContext(context) ? "invalid-host-context" : "unsupported-surface" };
  }
  const surface = event.toolName === "ls"
    ? "list"
    : event.toolName === "grep" || event.toolName === "find"
      ? "search"
      : event.toolName;
  return Object.freeze({
    kind: "managed",
    request: Object.freeze({ surface, arguments: event.input }) as ManagedCall,
  });
}
