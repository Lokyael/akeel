import { canonicalCompilationFacts } from "../compilation/index";
import type { ResolvedPathEvidence } from "../compilation/index";

export type AuthorizationMode = "allow" | "ask" | "deny";
export type AuthorizationVerdict =
  | Readonly<{ readonly kind: "allow" }>
  | Readonly<{ readonly kind: "approval-required" }>
  | Readonly<{
      readonly kind: "deny";
      readonly code: "invalid-admission" | "hard-boundary" | "policy-denied";
    }>;

type DirectAdmission = Readonly<{
  readonly kind: "direct";
  readonly operation: "read" | "write" | "edit" | "list" | "search";
  readonly path: ResolvedPathEvidence;
}>;

type ShellAdmissionOperation = Readonly<{
  readonly commandClass: "inspect" | "modify" | "destroy" | "execute" | "unknown";
  readonly effects: readonly ("read" | "write" | "delete" | "execute" | "cwd-change")[];
  readonly paths: readonly Readonly<{ readonly role: "source" | "target"; readonly evidence: ResolvedPathEvidence }>[];
  readonly recursive: boolean;
  readonly opaquePathAccess: boolean;
  readonly hardBoundary: boolean;
}>;

type ShellAdmission = Readonly<{
  readonly kind: "shell";
  readonly operations: readonly ShellAdmissionOperation[];
}>;

type AdmissionFacts = DirectAdmission | ShellAdmission;

const ADMISSION_ISSUER = Symbol("ADMISSION_ISSUER");

export class UnifiedAdmissionPlan {
  #facts: AdmissionFacts;

  private constructor(issuer: symbol, facts: AdmissionFacts) {
    if (issuer !== ADMISSION_ISSUER) throw new TypeError("invalid admission plan");
    this.#facts = facts;
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: AdmissionFacts): UnifiedAdmissionPlan {
    if (issuer !== ADMISSION_ISSUER) throw new TypeError("unauthorized issuance");
    return new UnifiedAdmissionPlan(ADMISSION_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): AdmissionFacts | undefined {
    if (issuer !== ADMISSION_ISSUER) return undefined;
    return typeof value === "object" && value !== null && #facts in value
      ? (value as UnifiedAdmissionPlan).#facts
      : undefined;
  }
}

type PathPolicy = Readonly<{
  readonly read: AuthorizationMode;
  readonly write: AuthorizationMode;
  readonly edit: AuthorizationMode;
  readonly list: AuthorizationMode;
  readonly search: AuthorizationMode;
  readonly allowedRoots: readonly string[];
  readonly blockedRoots: readonly string[];
  readonly blockedPaths: readonly string[];
}>;

type CommandPolicy = Readonly<{
  readonly inspect: AuthorizationMode;
  readonly modify: AuthorizationMode;
  readonly execute: AuthorizationMode;
  readonly opaque: AuthorizationMode;
  readonly destroy: AuthorizationMode;
  readonly unknown: AuthorizationMode;
}>;

export type UnifiedPolicySnapshot = Readonly<{
  readonly paths: PathPolicy;
  readonly commands: CommandPolicy;
}>;

type MandatoryBoundaryFacts = Readonly<{
  readonly credentialRoots: readonly string[];
}>;

const BOUNDARY_ISSUER = Symbol("BOUNDARY_ISSUER");

export class MandatoryBoundaries {
  #facts: MandatoryBoundaryFacts;

  private constructor(issuer: symbol, facts: MandatoryBoundaryFacts) {
    if (issuer !== BOUNDARY_ISSUER) throw new TypeError("invalid mandatory boundaries");
    this.#facts = facts;
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: MandatoryBoundaryFacts): MandatoryBoundaries {
    if (issuer !== BOUNDARY_ISSUER) throw new TypeError("unauthorized issuance");
    return new MandatoryBoundaries(BOUNDARY_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): MandatoryBoundaryFacts | undefined {
    if (issuer !== BOUNDARY_ISSUER) return undefined;
    return typeof value === "object" && value !== null && #facts in value
      ? (value as MandatoryBoundaries).#facts
      : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMode(value: unknown): value is AuthorizationMode {
  return value === "allow" || value === "ask" || value === "deny";
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function readModes<T extends readonly string[]>(value: unknown, fields: T): Record<T[number], AuthorizationMode> {
  if (!isRecord(value) || Reflect.ownKeys(value).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(value, field) && isMode(value[field]))) {
    throw new TypeError("invalid policy snapshot");
  }
  return Object.fromEntries(fields.map((field) => [field, value[field]])) as Record<T[number], AuthorizationMode>;
}

function readPaths(value: unknown): PathPolicy {
  if (!isRecord(value)) throw new TypeError("invalid policy snapshot");
  const modeFields = ["read", "write", "edit", "list", "search"] as const;
  const arrayFields = ["allowedRoots", "blockedRoots", "blockedPaths"] as const;
  const expected = [...modeFields, ...arrayFields];
  if (Reflect.ownKeys(value).length !== expected.length || !expected.every((field) => Object.hasOwn(value, field))) {
    throw new TypeError("invalid policy snapshot");
  }
  const modes = readModes(Object.fromEntries(modeFields.map((field) => [field, value[field]])), modeFields);
  const arrays = {} as Record<(typeof arrayFields)[number], readonly string[]>;
  for (const field of arrayFields) {
    const paths = value[field];
    if (!Array.isArray(paths) || !paths.every(isAbsolutePath)) throw new TypeError("invalid policy snapshot");
    arrays[field] = Object.freeze([...paths]);
  }
  return Object.freeze({ ...modes, ...arrays });
}

export function freezeUnifiedPolicySnapshot(input: unknown): UnifiedPolicySnapshot {
  if (!isRecord(input) || Reflect.ownKeys(input).length !== 2 || !Object.hasOwn(input, "paths") ||
    !Object.hasOwn(input, "commands")) {
    throw new TypeError("invalid policy snapshot");
  }
  if (!isRecord(input.commands)) throw new TypeError("invalid policy snapshot");
  const commandInput = Object.hasOwn(input.commands, "opaque")
    ? input.commands
    : { ...input.commands, opaque: "deny" };
  const commands = readModes(commandInput, ["inspect", "modify", "execute", "opaque", "destroy", "unknown"] as const);
  return Object.freeze({ paths: readPaths(input.paths), commands: Object.freeze(commands) });
}

export function createMandatoryBoundaries(input: unknown): MandatoryBoundaries {
  if (!isRecord(input) || Reflect.ownKeys(input).length !== 1 || !Array.isArray(input.credentialRoots) ||
    input.credentialRoots.length === 0 || !input.credentialRoots.every(isAbsolutePath)) {
    throw new TypeError("invalid mandatory boundaries");
  }
  return MandatoryBoundaries.issue(BOUNDARY_ISSUER, Object.freeze({ credentialRoots: Object.freeze([...new Set(input.credentialRoots)]) }));
}

export function projectUnifiedAdmission(compilation: unknown): UnifiedAdmissionPlan | undefined {
  const facts = canonicalCompilationFacts(compilation);
  if (!facts) return undefined;
  if (facts.kind === "direct") {
    return UnifiedAdmissionPlan.issue(ADMISSION_ISSUER, Object.freeze({
      kind: "direct",
      operation: facts.operation,
      path: facts.path,
    }));
  }
  return UnifiedAdmissionPlan.issue(ADMISSION_ISSUER, Object.freeze({
    kind: "shell",
    operations: facts.operations,
  }));
}

function pathWithinRoot(candidate: string, root: string): boolean {
  return root === "/" || candidate === root || candidate.startsWith(`${root}/`);
}

function violatesPathBoundary(candidate: string, policy: PathPolicy): boolean {
  return policy.allowedRoots.length > 0 && !policy.allowedRoots.some((root) => pathWithinRoot(candidate, root)) ||
    policy.blockedRoots.some((root) => pathWithinRoot(candidate, root)) ||
    policy.blockedPaths.includes(candidate);
}

function violatesTraversedBoundary(candidate: string, policy: PathPolicy): boolean {
  return policy.blockedRoots.some((root) => pathWithinRoot(candidate, root)) || policy.blockedPaths.includes(candidate);
}

function recursiveSearchReachesBlockedPath(candidate: string, policy: PathPolicy): boolean {
  return policy.blockedRoots.some((root) => pathWithinRoot(root, candidate)) ||
    policy.blockedPaths.some((path) => pathWithinRoot(path, candidate));
}

function recursiveSearchReachesCredentialRoot(candidate: string, credentialRoots: readonly string[]): boolean {
  return credentialRoots.some((root) => pathWithinRoot(root, candidate) || pathWithinRoot(candidate, root));
}

const TEMPLATE_MARKERS = new Set(["template", "sample", "example", "skeleton"]);

function protectedCredentialName(name: string): boolean {
  if (name === "auth.json") return true;
  if (!name.startsWith("auth.json")) return false;
  const suffix = name.slice("auth.json".length);
  if (!/^[.~_-]/u.test(suffix)) return false;
  const tokens = suffix.split(/[^A-Za-z0-9]+/u).filter(Boolean);
  return !tokens.some((token) => TEMPLATE_MARKERS.has(token));
}

function credentialArtifact(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const prefix = root === "/" ? "/" : `${root}/`;
    if (!path.startsWith(prefix)) return false;
    const relative = path.slice(prefix.length);
    return relative.length > 0 && !relative.includes("/") && protectedCredentialName(relative);
  });
}

function gitControlArtifact(path: string): boolean {
  if (
    /(?:^|\/)\.git\/hooks(?:\/|$)/u.test(path) ||
    /(?:^|\/)\.husky(?:\/|$)/u.test(path) ||
    /(?:^|\/)\.githooks(?:\/|$)/u.test(path) ||
    /(?:^|\/)\.lefthook(?:\/|$)/u.test(path) ||
    /(?:^|\/)\.git\/config(?:\.[^/]+|\/|$)/u.test(path)
  ) {
    return true;
  }
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return (
    basename === ".gitattributes" ||
    basename === ".pre-commit-config.yaml" ||
    basename === "lefthook.yml" ||
    basename === ".lefthook.yml"
  );
}

function pathHitsGitControlArtifact(path: ResolvedPathEvidence): boolean {
  return gitControlArtifact(path.candidate) ||
    path.traversed.some((candidate) => gitControlArtifact(candidate));
}

export function authorizeAdmission(
  admission: unknown,
  boundaries: unknown,
  policy: UnifiedPolicySnapshot,
): AuthorizationVerdict {
  const facts = UnifiedAdmissionPlan.read(admission, ADMISSION_ISSUER);
  const mandatory = MandatoryBoundaries.read(boundaries, BOUNDARY_ISSUER);
  if (!facts || !mandatory) return Object.freeze({ kind: "deny", code: "invalid-admission" });
  return facts.kind === "direct"
    ? authorizeDirect(facts, mandatory, policy)
    : authorizeShell(facts, mandatory, policy);
}

function authorizeDirect(
  facts: DirectAdmission,
  mandatory: MandatoryBoundaryFacts,
  policy: UnifiedPolicySnapshot,
): AuthorizationVerdict {
  if (pathHitsMandatoryBoundary(facts.path, mandatory, policy.paths) ||
    ((facts.operation === "write" || facts.operation === "edit") && pathHitsGitControlArtifact(facts.path)) ||
    facts.operation === "search" && (
      recursiveSearchReachesBlockedPath(facts.path.candidate, policy.paths) ||
      recursiveSearchReachesCredentialRoot(facts.path.candidate, mandatory.credentialRoots)
    )) {
    return Object.freeze({ kind: "deny", code: "hard-boundary" });
  }
  return verdictForModes([policy.paths[facts.operation]]);
}

function authorizeShell(
  facts: ShellAdmission,
  mandatory: MandatoryBoundaryFacts,
  policy: UnifiedPolicySnapshot,
): AuthorizationVerdict {
  for (const operation of facts.operations) {
    const isModifying = operation.effects.includes("write") || operation.effects.includes("delete");
    const isUnboundedDestroy = (operation.commandClass === "destroy" || operation.effects.includes("delete")) &&
      (operation.recursive || operation.opaquePathAccess || operation.paths.length === 0);
    if (isUnboundedDestroy || operation.hardBoundary ||
      operation.paths.some((path) => pathHitsMandatoryBoundary(path.evidence, mandatory, policy.paths)) ||
      (isModifying && operation.paths.some((path) => pathHitsGitControlArtifact(path.evidence))) ||
      operation.recursive && operation.paths.some((path) =>
        recursiveSearchReachesBlockedPath(path.evidence.candidate, policy.paths) ||
        recursiveSearchReachesCredentialRoot(path.evidence.candidate, mandatory.credentialRoots)
      )) {
      return Object.freeze({ kind: "deny", code: "hard-boundary" });
    }
  }

  const modes: AuthorizationMode[] = [];
  for (const operation of facts.operations) {
    for (const effect of operation.effects) {
      if (effect === "read" || effect === "cwd-change") modes.push(policy.paths.read);
      if (effect === "write" || effect === "delete") modes.push(policy.paths.write);
    }
    modes.push(policy.commands[operation.commandClass]);
    if (operation.opaquePathAccess) modes.push(policy.commands.opaque);
  }
  return verdictForModes(modes);
}

function pathHitsMandatoryBoundary(
  path: ResolvedPathEvidence,
  mandatory: MandatoryBoundaryFacts,
  policy: PathPolicy,
): boolean {
  return credentialArtifact(path.candidate, mandatory.credentialRoots) ||
    path.traversed.some((candidate) => credentialArtifact(candidate, mandatory.credentialRoots)) ||
    violatesPathBoundary(path.candidate, policy) ||
    path.traversed.some((candidate) => violatesTraversedBoundary(candidate, policy));
}

function verdictForModes(modes: readonly AuthorizationMode[]): AuthorizationVerdict {
  if (modes.includes("deny")) return Object.freeze({ kind: "deny", code: "policy-denied" });
  if (modes.includes("ask")) return Object.freeze({ kind: "approval-required" });
  return Object.freeze({ kind: "allow" });
}
