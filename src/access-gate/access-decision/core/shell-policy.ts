import { shellAdmissionFacts } from "./admission";
import type { ShellCommandClass, ShellEffect } from "./shell-words";

export type ShellPolicyMode = "allow" | "ask" | "deny";

export type ShellPolicyInput = Readonly<{
  readonly read: ShellPolicyMode;
  readonly write: ShellPolicyMode;
  readonly inspect: ShellPolicyMode;
  readonly modify: ShellPolicyMode;
  readonly execute: ShellPolicyMode;
  readonly destroy: ShellPolicyMode;
  readonly unknown: ShellPolicyMode;
  readonly blockedPaths?: readonly string[];
  readonly allowedRoots?: readonly string[];
  readonly blockedRoots?: readonly string[];
}>;

export type ShellPolicySnapshot = Readonly<{
  readonly read: ShellPolicyMode;
  readonly write: ShellPolicyMode;
  readonly inspect: ShellPolicyMode;
  readonly modify: ShellPolicyMode;
  readonly execute: ShellPolicyMode;
  readonly destroy: ShellPolicyMode;
  readonly unknown: ShellPolicyMode;
  readonly blockedPaths: readonly string[];
  readonly allowedRoots: readonly string[];
  readonly blockedRoots: readonly string[];
}>;

export type ShellDecision =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "ask"; readonly executed: false }>
  | Readonly<{
      readonly kind: "deny";
      readonly code: "hard-boundary" | "path-denied" | "policy-denied" | "no-ui" | "invalid-admission";
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMode(value: unknown): value is ShellPolicyMode {
  return value === "allow" || value === "ask" || value === "deny";
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.includes("\u0000");
}

export function freezeShellPolicySnapshot(input: ShellPolicyInput): ShellPolicySnapshot {
  if (!isRecord(input)) throw new TypeError("invalid shell policy snapshot");
  const keys = Reflect.ownKeys(input);
  const allowed = [
    "read",
    "write",
    "inspect",
    "modify",
    "execute",
    "destroy",
    "unknown",
    "blockedPaths",
    "allowedRoots",
    "blockedRoots",
  ];
  const required = ["read", "write", "inspect", "modify", "execute", "destroy", "unknown"];
  if (
    keys.some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    required.some((key) => !keys.includes(key))
  ) {
    throw new TypeError("invalid shell policy snapshot");
  }

  const values = input as Record<string, unknown>;
  if (
    required.some((key) => !isMode(values[key])) ||
    (values.read !== undefined && !isMode(values.read)) ||
    (values.write !== undefined && !isMode(values.write))
  ) throw new TypeError("invalid shell policy snapshot");
  const blocked = values.blockedPaths ?? [];
  const allowedRoots = values.allowedRoots ?? [];
  const blockedRoots = values.blockedRoots ?? [];
  if (
    !Array.isArray(blocked) ||
    !blocked.every(isAbsolutePath) ||
    !Array.isArray(allowedRoots) ||
    !allowedRoots.every(isAbsolutePath) ||
    !Array.isArray(blockedRoots) ||
    !blockedRoots.every(isAbsolutePath)
  ) {
    throw new TypeError("invalid shell policy snapshot");
  }
  return Object.freeze({
    read: values.read as ShellPolicyMode,
    write: values.write as ShellPolicyMode,
    inspect: values.inspect as ShellPolicyMode,
    modify: values.modify as ShellPolicyMode,
    execute: values.execute as ShellPolicyMode,
    destroy: values.destroy as ShellPolicyMode,
    unknown: values.unknown as ShellPolicyMode,
    blockedPaths: Object.freeze([...blocked]),
    allowedRoots: Object.freeze([...allowedRoots]),
    blockedRoots: Object.freeze([...blockedRoots]),
  });
}

function policyMode(snapshot: ShellPolicySnapshot, commandClass: ShellCommandClass): ShellPolicyMode {
  return snapshot[commandClass];
}

function pathWithinRoot(candidate: string, root: string): boolean {
  return root === "/" || candidate === root || candidate.startsWith(`${root}/`);
}

function effectMode(snapshot: ShellPolicySnapshot, effect: ShellEffect): ShellPolicyMode | undefined {
  if (effect === "read" || effect === "cwd-change") return snapshot.read;
  if (effect === "write" || effect === "delete") return snapshot.write;
  return undefined;
}

function violatesPathBoundary(candidate: string, policy: ShellPolicySnapshot): boolean {
  const outsideAllowedRoots =
    policy.allowedRoots.length > 0 && !policy.allowedRoots.some((root) => pathWithinRoot(candidate, root));
  const insideBlockedRoot = policy.blockedRoots.some((root) => pathWithinRoot(candidate, root));
  return outsideAllowedRoots || insideBlockedRoot || policy.blockedPaths.includes(candidate);
}

function recursiveReadReachesBlockedPath(candidate: string, policy: ShellPolicySnapshot): boolean {
  return policy.blockedRoots.some((root) => pathWithinRoot(root, candidate)) ||
    policy.blockedPaths.some((path) => pathWithinRoot(path, candidate));
}

function violatesVisitedPathBoundary(candidate: string, policy: ShellPolicySnapshot): boolean {
  return policy.blockedRoots.some((root) => pathWithinRoot(candidate, root)) ||
    policy.blockedPaths.includes(candidate);
}

function hasPathBoundary(policy: ShellPolicySnapshot): boolean {
  return policy.allowedRoots.length > 0 || policy.blockedRoots.length > 0 || policy.blockedPaths.length > 0;
}

export function evaluateShellAdmission(
  admission: unknown,
  policy: ShellPolicySnapshot,
): ShellDecision {
  const facts = shellAdmissionFacts(admission);
  if (!facts) return { kind: "deny", code: "invalid-admission" };

  for (const operation of facts.operations) {
    if (operation.commandClass === "destroy" || operation.effects.includes("delete")) {
      return { kind: "deny", code: "hard-boundary" };
    }
    if ((operation.opaquePathAccess && hasPathBoundary(policy)) ||
      operation.paths.some((path) => violatesPathBoundary(path.candidate, policy) ||
        path.traversed.some((candidate) => violatesVisitedPathBoundary(candidate, policy))) ||
      (operation.recursive && operation.paths.some((path) => recursiveReadReachesBlockedPath(path.candidate, policy)))) {
      return { kind: "deny", code: "hard-boundary" };
    }
  }

  let asks = false;
  for (const operation of facts.operations) {
    for (const effect of operation.effects) {
      const mode = effectMode(policy, effect);
      if (mode === "deny") return { kind: "deny", code: "policy-denied" };
      if (mode === "ask") asks = true;
    }
  }
  for (const operation of facts.operations) {
    const mode = policyMode(policy, operation.commandClass);
    if (mode === "deny") return { kind: "deny", code: "policy-denied" };
    if (mode === "ask") asks = true;
  }
  if (!asks) return { kind: "allow" };
  if (!facts.operations.every((operation) => operation.interactive)) return { kind: "deny", code: "no-ui" };
  return { kind: "ask", executed: false };
}
