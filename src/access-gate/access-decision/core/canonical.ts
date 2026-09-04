import { exceedsDirectTextBudget } from "./limits";
import { resolveExistingPathWithTraversal } from "./shell-paths";
import type { DirectSurface } from "./types";

export type CanonicalReject = Readonly<{
  kind: "reject";
  code: "invalid-request" | "resource-limit";
  anchor: "request";
  resourceClass: "input";
}>;

type DirectFacts = Readonly<{
  surface: DirectSurface;
  path: string;
  traversed: readonly string[];
  hasUI: boolean;
}>;

class CanonicalCompilation {
  constructor(facts: DirectFacts) {
    canonicalFactsByCompilation.set(this, Object.freeze(facts));
    Object.freeze(this);
  }
}

const canonicalFactsByCompilation = new WeakMap<CanonicalCompilation, DirectFacts>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => typeof key === "string" && allowed.includes(key))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalizePath(cwd: string, path: string): string {
  return path.startsWith("/") ? path : `${cwd}/${path}`;
}

export function compileDirect(request: unknown): CanonicalCompilation | CanonicalReject {
  if (!isRecord(request) || !hasExactKeys(request, ["surface", "arguments", "cwd", "hasUI"])) return invalidRequest();
  if (
    request.surface !== "read" &&
    request.surface !== "write" &&
    request.surface !== "list" &&
    request.surface !== "search"
  ) {
    return invalidRequest();
  }
  if (!isRecord(request.arguments)) return invalidRequest();
  const actualKeys = Reflect.ownKeys(request.arguments);
  const hasPath = actualKeys.includes("path");
  let expectedArgumentKeys: readonly string[];
  if (request.surface === "read") {
    if (!hasAllowedKeys(request.arguments, ["path"], ["path", "offset", "limit"])) return invalidRequest();
  } else {
    if (request.surface === "write") {
      expectedArgumentKeys = ["path", "content"];
    } else if (request.surface === "search") {
      expectedArgumentKeys = hasPath ? ["path", "pattern"] : ["pattern"];
    } else {
      expectedArgumentKeys = hasPath ? ["path"] : [];
    }
    if (!hasExactKeys(request.arguments, expectedArgumentKeys)) return invalidRequest();
  }
  const path = hasPath ? request.arguments.path : ".";
  if (typeof path !== "string" || path.length === 0 || path.includes("\u0000")) return invalidRequest();
  if (
    request.surface === "search" &&
    (typeof request.arguments.pattern !== "string" ||
      request.arguments.pattern.length === 0 ||
      request.arguments.pattern.includes("\u0000"))
  ) {
    return invalidRequest();
  }
  if (request.surface === "write" && typeof request.arguments.content !== "string") return invalidRequest();
  if (
    request.surface === "read" &&
    ((actualKeys.includes("offset") && !isPositiveInteger(request.arguments.offset)) ||
      (actualKeys.includes("limit") && !isPositiveInteger(request.arguments.limit)))
  ) {
    return invalidRequest();
  }
  if (
    typeof request.cwd !== "string" ||
    !request.cwd.startsWith("/") ||
    request.cwd.includes("\u0000")
  ) {
    return invalidRequest();
  }
  if (typeof request.hasUI !== "boolean") return invalidRequest();
  const textValues = [path, request.cwd];
  if (request.surface === "search") textValues.push(request.arguments.pattern as string);
  if (request.surface === "write") textValues.push(request.arguments.content as string);
  if (exceedsDirectTextBudget(textValues)) return resourceLimit();

  const resolvedPath = resolveExistingPathWithTraversal(normalizePath(request.cwd, path));
  if (resolvedPath === undefined) return invalidRequest();
  return new CanonicalCompilation({
    surface: request.surface,
    path: resolvedPath.candidate,
    traversed: resolvedPath.traversed,
    hasUI: request.hasUI,
  });
}

export function canonicalFacts(value: unknown): DirectFacts | undefined {
  if (!(value instanceof CanonicalCompilation)) return undefined;
  return canonicalFactsByCompilation.get(value);
}

function invalidRequest(): CanonicalReject {
  return reject("invalid-request");
}

function resourceLimit(): CanonicalReject {
  return reject("resource-limit");
}

function reject(code: CanonicalReject["code"]): CanonicalReject {
  return Object.freeze({
    kind: "reject",
    code,
    anchor: "request",
    resourceClass: "input",
  });
}

export function isCanonicalReject(value: unknown): value is CanonicalReject {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === 4 &&
    keys.every((key) => key === "kind" || key === "code" || key === "anchor" || key === "resourceClass") &&
    value.kind === "reject" &&
    (value.code === "invalid-request" || value.code === "resource-limit") &&
    value.anchor === "request" &&
    value.resourceClass === "input"
  );
}
