import type { DirectRequest } from "../core/index";
import type { ShellRequest } from "../core/index";

export type HostContext = Readonly<{
  readonly cwd: string;
  readonly hasUI: boolean;
  readonly home?: string;
}>;

type ManagedRequest = Readonly<{
  readonly kind: "managed";
  readonly request: DirectRequest | ShellRequest;
}>;

type PassthroughRequest = Readonly<{
  readonly kind: "passthrough";
  readonly toolName: string;
}>;

type HostReject = Readonly<{
  readonly kind: "reject";
  readonly code: "invalid-host-context" | "unsupported-surface";
}>;

export type HostToolCall = ManagedRequest | PassthroughRequest | HostReject;

type HostBlockCode =
  | "invalid-request"
  | "resource-limit"
  | "policy-denied"
  | "no-ui"
  | "hard-boundary"
  | "path-denied"
  | "invalid-admission"
  | "security-boundary"
  | "unsupported-syntax"
  | "dynamic-value"
  | "invalid-decision";

export type HostDecision =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "confirm"; readonly executed: false }>
  | Readonly<{
      readonly kind: "block";
      readonly code: HostBlockCode;
    }>;

const MANAGED_SURFACES = new Set(["read", "write", "edit", "ls", "grep", "find", "bash"]);
const DIRECT_SURFACES = new Set(["read", "write", "edit", "ls", "grep", "find"]);
const DECISION_CODES = new Set([
  "invalid-request",
  "resource-limit",
  "policy-denied",
  "no-ui",
  "hard-boundary",
  "path-denied",
  "invalid-admission",
  "security-boundary",
  "unsupported-syntax",
  "dynamic-value",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validHostContext(value: unknown): value is HostContext {
  if (!isRecord(value)) return false;
  return (
    typeof value.cwd === "string" &&
    value.cwd.length > 0 &&
    value.cwd.startsWith("/") &&
    !value.cwd.includes("\u0000") &&
    typeof value.hasUI === "boolean" &&
    (value.home === undefined ||
      (typeof value.home === "string" && value.home.length > 0 && value.home.startsWith("/") && !value.home.includes("\u0000")))
  );
}

function validToolInput(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function directRequest(
  surface: "read" | "write" | "edit" | "ls" | "grep" | "find",
  input: Record<string, unknown>,
  context: HostContext,
): DirectRequest {
  const normalizedSurface = surface === "ls" ? "list" : surface === "grep" || surface === "find" ? "search" : surface;
  return {
    surface: normalizedSurface,
    arguments: input,
    cwd: context.cwd,
    hasUI: context.hasUI,
  } as DirectRequest;
}

export function adaptPiToolCall(event: unknown, context: unknown): HostToolCall {
  if (!isRecord(event)) return { kind: "reject", code: "invalid-host-context" };
  return adaptHostToolCall(event.toolName, event.input, context);
}

export function adaptHostToolCall(toolName: unknown, input: unknown, context: unknown): HostToolCall {
  if (typeof toolName !== "string" || toolName.length === 0) {
    return { kind: "reject", code: "invalid-host-context" };
  }
  if (!MANAGED_SURFACES.has(toolName)) return { kind: "passthrough", toolName };
  if (!validHostContext(context)) return { kind: "reject", code: "invalid-host-context" };
  if (!validToolInput(input)) return { kind: "reject", code: "unsupported-surface" };

  if (DIRECT_SURFACES.has(toolName)) {
    return { kind: "managed", request: directRequest(toolName as "read" | "write" | "edit" | "ls" | "grep" | "find", input, context) };
  }
  return {
    kind: "managed",
    request: {
      surface: "bash",
      arguments: input,
      cwd: context.cwd,
      hasUI: context.hasUI,
      ...(context.home === undefined ? {} : { home: context.home }),
    } as ShellRequest,
  };
}

export function adaptHostDecision(value: unknown): HostDecision {
  if (!isRecord(value)) return { kind: "block", code: "invalid-decision" };
  if (Reflect.ownKeys(value).length === 1 && value.kind === "allow") return { kind: "allow" };
  if (
    Reflect.ownKeys(value).length === 2 &&
    value.kind === "ask" &&
    value.executed === false
  ) {
    return { kind: "confirm", executed: false };
  }
  if (
    Reflect.ownKeys(value).length === 2 &&
    value.kind === "deny" &&
    typeof value.code === "string" &&
    DECISION_CODES.has(value.code)
  ) {
    return { kind: "block", code: value.code as HostBlockCode };
  }
  return { kind: "block", code: "invalid-decision" };
}
