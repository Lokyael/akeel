import { admissionFacts } from "./admission";
import type { Decision, PolicyInput, PolicyMode } from "./types";

export type PolicySnapshot = Readonly<Required<PolicyInput>>;

export function freezePolicySnapshot(input: PolicyInput): PolicySnapshot {
  const candidate = input as unknown;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Reflect.ownKeys(candidate).every((key) =>
      key === "read" ||
      key === "write" ||
      key === "edit" ||
      key === "list" ||
      key === "search" ||
      key === "allowedRoots" ||
      key === "blockedRoots" ||
      key === "blockedPaths",
    )
  ) {
    throw new TypeError("invalid policy snapshot");
  }

  const values = candidate as {
    read?: unknown;
    write?: unknown;
    edit?: unknown;
    list?: unknown;
    search?: unknown;
    allowedRoots?: unknown;
    blockedRoots?: unknown;
    blockedPaths?: unknown;
  };
  if (
    !isPolicyMode(values.read) ||
    !isPolicyMode(values.write) ||
    (values.edit !== undefined && !isPolicyMode(values.edit)) ||
    (values.list !== undefined && !isPolicyMode(values.list)) ||
    (values.search !== undefined && !isPolicyMode(values.search)) ||
    !isPathList(values.allowedRoots) ||
    !isPathList(values.blockedRoots) ||
    !isPathList(values.blockedPaths)
  ) {
    throw new TypeError("invalid policy snapshot");
  }
  return Object.freeze({
    read: values.read,
    write: values.write,
    edit: values.edit ?? values.write,
    list: values.list ?? "deny",
    search: values.search ?? "deny",
    allowedRoots: Object.freeze([...(values.allowedRoots ?? [])]),
    blockedRoots: Object.freeze([...(values.blockedRoots ?? [])]),
    blockedPaths: Object.freeze([...(values.blockedPaths ?? [])]),
  });
}

function isPolicyMode(value: unknown): value is PolicyMode {
  return value === "allow" || value === "ask" || value === "deny";
}

function isPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function isPathList(value: unknown): value is readonly string[] {
  return value === undefined || (Array.isArray(value) && value.every(isPath));
}

function pathWithinRoot(candidate: string, root: string): boolean {
  return root === "/" || candidate === root || candidate.startsWith(`${root}/`);
}

function violatesPathBoundary(candidate: string, policy: PolicySnapshot): boolean {
  const outsideAllowedRoots =
    policy.allowedRoots.length > 0 && !policy.allowedRoots.some((root) => pathWithinRoot(candidate, root));
  const insideBlockedRoot = policy.blockedRoots.some((root) => pathWithinRoot(candidate, root));
  return outsideAllowedRoots || insideBlockedRoot || policy.blockedPaths.includes(candidate);
}

function violatesVisitedPathBoundary(candidate: string, policy: PolicySnapshot): boolean {
  return policy.blockedRoots.some((root) => pathWithinRoot(candidate, root)) ||
    policy.blockedPaths.includes(candidate);
}

function recursiveSearchReachesBlockedPath(candidate: string, policy: PolicySnapshot): boolean {
  return policy.blockedRoots.some((root) => pathWithinRoot(root, candidate)) ||
    policy.blockedPaths.some((path) => pathWithinRoot(path, candidate));
}

export function evaluateAdmission(value: unknown, policy: PolicySnapshot): Decision {
  const facts = admissionFacts(value);
  if (!facts) return { kind: "deny", code: "invalid-request" };

  if (violatesPathBoundary(facts.resolvedCandidate, policy) ||
    facts.traversed.some((candidate) => violatesVisitedPathBoundary(candidate, policy)) ||
    (facts.operation === "search" && recursiveSearchReachesBlockedPath(facts.resolvedCandidate, policy))) {
    return { kind: "deny", code: "hard-boundary" };
  }
  const mode = policy[facts.operation];
  if (mode === "allow") return { kind: "allow" };
  if (mode === "ask") return facts.interactive ? { kind: "ask", executed: false } : { kind: "deny", code: "no-ui" };
  return { kind: "deny", code: "policy-denied" };
}
