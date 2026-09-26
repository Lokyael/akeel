import type { DecodedPolicyConfiguration } from "../adapters/index";
import type { RootReference } from "akeel-platform-runtime";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "../core/authorization/index";
import type { UnifiedPolicySnapshot } from "../core/authorization/index";
import {
  compileManagedCall,
  createCompileEnvironment,
  projectCompilationDisplay,
} from "../core/compilation/index";
import type { ManagedCall, UnifiedDisplayView } from "../core/compilation/index";

export type GateSessionResult =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "approval-required"; readonly display: UnifiedDisplayView }>
  | Readonly<{
      readonly kind: "deny";
      readonly code:
        | "invalid-request"
        | "resource-limit"
        | "security-boundary"
        | "unsupported-syntax"
        | "dynamic-value"
        | "invalid-admission"
        | "hard-boundary"
        | "policy-denied";
    }>;

export type GateSession = Readonly<{
  readonly evaluate: (request: ManagedCall) => GateSessionResult;
  readonly activePreset: () => string;
  readonly activatePreset: (name: string) => boolean;
  readonly close: () => void;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function effectivePolicy(
  snapshot: UnifiedPolicySnapshot,
  roots: readonly string[],
  rootRefByPath?: ReadonlyMap<string, RootReference>,
): UnifiedPolicySnapshot {
  const allowedRoots = snapshot.paths.allowedRoots.length > 0 ? snapshot.paths.allowedRoots : roots;
  let allowedRootRefs: Set<RootReference> | undefined;
  let blockedRootRefs: Set<RootReference> | undefined;
  let blockedPathRefs: Set<RootReference> | undefined;

  if (rootRefByPath) {
    allowedRootRefs = new Set();
    for (const root of allowedRoots) {
      const ref = rootRefByPath.get(root);
      if (ref) allowedRootRefs.add(ref);
    }
    blockedRootRefs = new Set();
    for (const root of snapshot.paths.blockedRoots) {
      const ref = rootRefByPath.get(root);
      if (ref) blockedRootRefs.add(ref);
    }
    blockedPathRefs = new Set();
    for (const path of snapshot.paths.blockedPaths) {
      const ref = rootRefByPath.get(path);
      if (ref) blockedPathRefs.add(ref);
    }
  }

  return freezeUnifiedPolicySnapshot({
    paths: {
      ...snapshot.paths,
      allowedRoots,
      ...(allowedRootRefs ? { allowedRootRefs } : {}),
      ...(blockedRootRefs ? { blockedRootRefs } : {}),
      ...(blockedPathRefs ? { blockedPathRefs } : {}),
    },
    commands: snapshot.commands,
  });
}

export function createGateSession(input: unknown): GateSession {
  if (!isRecord(input) || !isAbsolutePath(input.cwd) || !isAbsolutePath(input.stagingRoot) ||
    input.accessRoot !== undefined && !isAbsolutePath(input.accessRoot) ||
    input.home !== undefined && !isAbsolutePath(input.home) || !Array.isArray(input.credentialRoots) ||
    input.credentialRoots.length === 0 || !input.credentialRoots.every(isAbsolutePath) ||
    input.capabilityRoots !== undefined && (!Array.isArray(input.capabilityRoots) || !input.capabilityRoots.every(isAbsolutePath)) ||
    !isRecord(input.configuration) || input.configuration.kind !== "enabled" || !isRecord(input.pathEvidence)) {
    throw new TypeError("invalid gate session");
  }
  const configuration = input.configuration as DecodedPolicyConfiguration & { readonly kind: "enabled" };
  const environment = createCompileEnvironment({
    cwd: input.cwd,
    home: input.home,
    pathEvidence: input.pathEvidence,
  });
  const rootRefByPath = input.rootRefByPath instanceof Map
    ? (input.rootRefByPath as ReadonlyMap<string, RootReference>)
    : undefined;
  let credentialRootRefs: Set<RootReference> | undefined;
  let capabilityRootRefs: Set<RootReference> | undefined;
  if (rootRefByPath) {
    credentialRootRefs = new Set();
    for (const root of input.credentialRoots) {
      const ref = rootRefByPath.get(root);
      if (ref) credentialRootRefs.add(ref);
    }
    if (Array.isArray(input.capabilityRoots)) {
      capabilityRootRefs = new Set();
      for (const root of input.capabilityRoots) {
        const ref = rootRefByPath.get(root);
        if (ref) capabilityRootRefs.add(ref);
      }
    }
  }

  const mandatory = createMandatoryBoundaries({
    credentialRoots: input.credentialRoots,
    capabilityRoots: input.capabilityRoots as readonly string[] | undefined,
    ...(credentialRootRefs ? { credentialRootRefs } : {}),
    ...(capabilityRootRefs ? { capabilityRootRefs } : {}),
  });
  const defaultRoots = Object.freeze([
    (input.accessRoot as string | undefined) ?? input.cwd,
    input.stagingRoot,
    "/tmp/akeel",
  ]);
  const effectiveSnapshots = Object.freeze(
    Object.fromEntries(
      Object.entries(configuration.snapshots).map(([name, snapshot]) => [
        name,
        effectivePolicy(snapshot, defaultRoots, rootRefByPath),
      ]),
    ),
  );
  let active = configuration.activePreset;
  let closed = false;

  const session = Object.freeze({
    evaluate(request: ManagedCall): GateSessionResult {
      if (closed) return Object.freeze({ kind: "deny", code: "invalid-admission" });
      const snapshot = effectiveSnapshots[active];
      if (!snapshot) return Object.freeze({ kind: "deny", code: "invalid-admission" });
      const compilation = compileManagedCall(request, environment);
      if ("kind" in compilation && compilation.kind === "reject") {
        return Object.freeze({ kind: "deny", code: compilation.code });
      }
      const admission = projectUnifiedAdmission(compilation);
      const verdict = authorizeAdmission(admission, mandatory, snapshot);
      if (verdict.kind !== "approval-required") return verdict;
      const display = projectCompilationDisplay(compilation);
      return display === undefined
        ? Object.freeze({ kind: "deny", code: "invalid-admission" })
        : Object.freeze({ kind: "approval-required", display });
    },

    activePreset(): string {
      return active;
    },

    activatePreset(name: string): boolean {
      if (closed || !configuration.switchable || !Object.hasOwn(configuration.snapshots, name)) return false;
      active = name;
      return true;
    },

    close(): void {
      closed = true;
    },
  });
  return session;
}
