export const WINDOWS_HOST_PROTOCOL_VERSION = 1 as const;
export const MAX_HOST_REQUEST_BYTES = 64 * 1024;
export const MAX_HOST_RESPONSE_BYTES = 512 * 1024;
export const DEFAULT_HOST_TIMEOUT_MS = 10_000;
export const MAX_AST_SCRIPT_BYTES = 16_384;

export type HostRequestPayload =
  | Readonly<{ type: "ping" }>
  | Readonly<{ type: "parse-ast"; script: string }>
  | Readonly<{ type: "query-path"; path: string; base?: string }>
  | Readonly<{ type: "query-security"; path: string }>
  | Readonly<{ type: "process-identity" }>;

export type HostRequest = HostRequestPayload & Readonly<{
  version: typeof WINDOWS_HOST_PROTOCOL_VERSION;
  seq: number;
}>;

export type HostSuccessResponse<T = unknown> = Readonly<{
  version: typeof WINDOWS_HOST_PROTOCOL_VERSION;
  seq: number;
  ok: true;
  data: T;
}>;

export type HostErrorResponse = Readonly<{
  version: typeof WINDOWS_HOST_PROTOCOL_VERSION;
  seq: number;
  ok: false;
  error: string;
  code?: string;
}>;

export type HostResponse<T = unknown> = HostSuccessResponse<T> | HostErrorResponse;

export function serializeHostRequest(request: HostRequest): string {
  const serialized = JSON.stringify(request);
  if (Buffer.byteLength(serialized, "utf8") > MAX_HOST_REQUEST_BYTES) {
    throw new Error("Windows host request exceeds maximum allowed byte budget");
  }
  return `${serialized}\n`;
}

export function parseHostResponse(line: string): HostResponse {
  if (Buffer.byteLength(line, "utf8") > MAX_HOST_RESPONSE_BYTES) {
    throw new Error("Windows host response exceeds maximum allowed byte budget");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.trim());
  } catch {
    throw new Error("Windows host response was not valid JSON");
  }
  if (!isRecord(parsed) || parsed.version !== WINDOWS_HOST_PROTOCOL_VERSION ||
    !Number.isSafeInteger(parsed.seq) || typeof parsed.ok !== "boolean") {
    throw new Error("Windows host response protocol contract violated");
  }
  if (parsed.ok === true) {
    return parsed as HostSuccessResponse;
  }
  if (typeof parsed.error !== "string") {
    throw new Error("Windows host error response missing required error text");
  }
  return parsed as HostErrorResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
