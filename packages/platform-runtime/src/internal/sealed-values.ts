const VALUE_ISSUER = Symbol("AKeelPlatformValueIssuer");
const MAX_ROOTS = 256;
const MAX_RELATIONS_PER_PATH = 256;

export type PlatformId = "linux" | "windows";
export type RootRelation = "equal" | "descendant" | "ancestor" | "traversed";
export type PathRisk = "missing-leaf" | "reparse-traversal" | "multiple-links";
export type RuntimeRole = "session-envelope" | "workflow-run";

export type RootRelationEvidence = Readonly<{
  readonly root: RootReference;
  readonly relations: readonly RootRelation[];
}>;

export type PathAuthorizationView = Readonly<{
  readonly literal: string;
  readonly canonicalDisplay: string;
  readonly relations: readonly RootRelationEvidence[];
  readonly terminalObject?: PlatformObjectIdentity;
  readonly traversedObjects: readonly PlatformObjectIdentity[];
  readonly risks: readonly PathRisk[];
}>;

type DomainFacts = Readonly<{ readonly platform: PlatformId; readonly token: object }>;
type WorkspaceFacts = Readonly<{
  readonly domain: PlatformDomain;
  readonly canonicalDisplay: string;
  readonly nativeIdentity: string;
}>;
type RootFacts = Readonly<{ readonly domain: PlatformDomain; readonly nativeIdentity: string }>;
type CatalogFacts = Readonly<{ readonly domain: PlatformDomain; readonly roots: readonly RootReference[] }>;
type ObjectFacts = Readonly<{ readonly domain: PlatformDomain; readonly nativeIdentity: string }>;
type PathFacts = PathAuthorizationView & Readonly<{
  readonly domain: PlatformDomain;
  readonly nativeIdentity: string;
}>;
type ProcessFacts = Readonly<{
  readonly domain: PlatformDomain;
  readonly pid: number;
  readonly creationIdentity: string;
}>;
type RuntimeRootFacts = Readonly<{
  readonly domain: PlatformDomain;
  readonly role: RuntimeRole;
  readonly workspace: WorkspaceIdentity;
  readonly path: PlatformPathProof;
}>;

function requireIssuer(issuer: symbol): void {
  if (issuer !== VALUE_ISSUER) throw new TypeError("unauthorized platform value issuance");
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\u0000");
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function sameDomain(left: PlatformDomain, right: PlatformDomain): boolean {
  return left === right;
}

export class PlatformDomain {
  #facts: DomainFacts;

  private constructor(issuer: symbol, platform: PlatformId) {
    requireIssuer(issuer);
    this.#facts = Object.freeze({ platform, token: Object.freeze({}) });
    Object.freeze(this);
  }

  static issue(issuer: symbol, platform: PlatformId): PlatformDomain {
    requireIssuer(issuer);
    if (platform !== "linux" && platform !== "windows") throw new TypeError("invalid platform domain");
    return new PlatformDomain(VALUE_ISSUER, platform);
  }

  static read(value: unknown, issuer?: symbol): DomainFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as PlatformDomain).#facts;
  }

  get platform(): PlatformId {
    return this.#facts.platform;
  }
}

export class WorkspaceIdentity {
  #facts: WorkspaceFacts;

  private constructor(issuer: symbol, facts: WorkspaceFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze(facts);
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: WorkspaceFacts): WorkspaceIdentity {
    requireIssuer(issuer);
    return new WorkspaceIdentity(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): WorkspaceFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as WorkspaceIdentity).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
  get canonicalDisplay(): string { return this.#facts.canonicalDisplay; }
}

export class RootReference {
  #facts: RootFacts;

  private constructor(issuer: symbol, facts: RootFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze(facts);
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: RootFacts): RootReference {
    requireIssuer(issuer);
    return new RootReference(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): RootFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as RootReference).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
}

export class RootCatalog {
  #facts: CatalogFacts;

  private constructor(issuer: symbol, facts: CatalogFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze({ ...facts, roots: Object.freeze([...facts.roots]) });
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: CatalogFacts): RootCatalog {
    requireIssuer(issuer);
    return new RootCatalog(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): CatalogFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as RootCatalog).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
  get roots(): readonly RootReference[] { return this.#facts.roots; }
}

export class PlatformObjectIdentity {
  #facts: ObjectFacts;

  private constructor(issuer: symbol, facts: ObjectFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze(facts);
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: ObjectFacts): PlatformObjectIdentity {
    requireIssuer(issuer);
    return new PlatformObjectIdentity(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): ObjectFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as PlatformObjectIdentity).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
}

export class PlatformPathProof {
  #facts: PathFacts;

  private constructor(issuer: symbol, facts: PathFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze({
      ...facts,
      relations: Object.freeze(facts.relations.map((entry) => Object.freeze({
        root: entry.root,
        relations: Object.freeze([...entry.relations]),
      }))),
      traversedObjects: Object.freeze([...facts.traversedObjects]),
      risks: Object.freeze([...facts.risks]),
    });
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: PathFacts): PlatformPathProof {
    requireIssuer(issuer);
    return new PlatformPathProof(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): PathFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as PlatformPathProof).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
}

export class ProcessIdentity {
  #facts: ProcessFacts;

  private constructor(issuer: symbol, facts: ProcessFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze(facts);
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: ProcessFacts): ProcessIdentity {
    requireIssuer(issuer);
    return new ProcessIdentity(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): ProcessFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as ProcessIdentity).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
  get pid(): number { return this.#facts.pid; }
}

export class RuntimeRoot {
  #facts: RuntimeRootFacts;

  private constructor(issuer: symbol, facts: RuntimeRootFacts) {
    requireIssuer(issuer);
    this.#facts = Object.freeze(facts);
    Object.freeze(this);
  }

  static issue(issuer: symbol, facts: RuntimeRootFacts): RuntimeRoot {
    requireIssuer(issuer);
    return new RuntimeRoot(VALUE_ISSUER, facts);
  }

  static read(value: unknown, issuer?: symbol): RuntimeRootFacts | undefined {
    if (issuer !== VALUE_ISSUER || !isObject(value) || !(#facts in value)) return undefined;
    return (value as RuntimeRoot).#facts;
  }

  get platform(): PlatformId { return this.#facts.domain.platform; }
  get domain(): PlatformDomain { return this.#facts.domain; }
  get role(): RuntimeRole { return this.#facts.role; }
  get workspace(): WorkspaceIdentity { return this.#facts.workspace; }
  get path(): PlatformPathProof { return this.#facts.path; }
}

export function isPlatformDomain(value: unknown): value is PlatformDomain {
  return PlatformDomain.read(value, VALUE_ISSUER) !== undefined;
}

export function isWorkspaceIdentity(value: unknown): value is WorkspaceIdentity {
  return WorkspaceIdentity.read(value, VALUE_ISSUER) !== undefined;
}

export function isRootCatalog(value: unknown): value is RootCatalog {
  return RootCatalog.read(value, VALUE_ISSUER) !== undefined;
}

export function isPlatformPathProof(value: unknown): value is PlatformPathProof {
  return PlatformPathProof.read(value, VALUE_ISSUER) !== undefined;
}

export function isProcessIdentity(value: unknown): value is ProcessIdentity {
  return ProcessIdentity.read(value, VALUE_ISSUER) !== undefined;
}

export function isRuntimeRoot(value: unknown): value is RuntimeRoot {
  return RuntimeRoot.read(value, VALUE_ISSUER) !== undefined;
}

export function projectPathAuthorization(value: unknown): PathAuthorizationView | undefined {
  const facts = PlatformPathProof.read(value, VALUE_ISSUER);
  if (!facts) return undefined;
  return Object.freeze({
    literal: facts.literal,
    canonicalDisplay: facts.canonicalDisplay,
    relations: facts.relations,
    ...(facts.terminalObject === undefined ? {} : { terminalObject: facts.terminalObject }),
    traversedObjects: facts.traversedObjects,
    risks: facts.risks,
  });
}

export function samePlatformObject(left: unknown, right: unknown): boolean {
  const leftFacts = PlatformObjectIdentity.read(left, VALUE_ISSUER);
  const rightFacts = PlatformObjectIdentity.read(right, VALUE_ISSUER);
  return !!leftFacts && !!rightFacts && sameDomain(leftFacts.domain, rightFacts.domain) &&
    leftFacts.nativeIdentity === rightFacts.nativeIdentity;
}

export function matchRootRelations(
  view: PathAuthorizationView,
  rootRefs: ReadonlySet<RootReference>,
): ReadonlySet<RootRelation> {
  const matched = new Set<RootRelation>();
  for (const entry of view.relations) {
    if (rootRefs.has(entry.root)) {
      for (const relation of entry.relations) {
        matched.add(relation);
      }
    }
  }
  return Object.freeze(matched);
}

export type PlatformValueIssuer = Readonly<{
  readonly domain: PlatformDomain;
  issueWorkspace(canonicalDisplay: string, nativeIdentity: string): WorkspaceIdentity;
  issueRootCatalog(nativeIdentities: readonly string[]): RootCatalog;
  issueObjectIdentity(nativeIdentity: string): PlatformObjectIdentity;
  issuePathProof(input: Readonly<{
    readonly literal: string;
    readonly canonicalDisplay: string;
    readonly nativeIdentity: string;
    readonly catalog: RootCatalog;
    readonly relations: readonly Readonly<{ readonly rootIndex: number; readonly relations: readonly RootRelation[] }>[];
    readonly terminalObject?: PlatformObjectIdentity;
    readonly traversedObjects?: readonly PlatformObjectIdentity[];
    readonly risks?: readonly PathRisk[];
  }>): PlatformPathProof;
  issueProcessIdentity(pid: number, creationIdentity: string): ProcessIdentity;
  issueRuntimeRoot(role: RuntimeRole, workspace: WorkspaceIdentity, path: PlatformPathProof): RuntimeRoot;
  readWorkspace(value: unknown): WorkspaceFacts | undefined;
  readPathProof(value: unknown): PathFacts | undefined;
  readProcessIdentity(value: unknown): ProcessFacts | undefined;
}>;

export function createPlatformValueIssuer(platform: PlatformId): PlatformValueIssuer {
  const domain = PlatformDomain.issue(VALUE_ISSUER, platform);
  const requireDomain = (candidate: PlatformDomain): void => {
    if (!sameDomain(candidate, domain)) throw new TypeError("platform domain mismatch");
  };
  const requireObjectDomain = (candidate: PlatformObjectIdentity): void => {
    const facts = PlatformObjectIdentity.read(candidate, VALUE_ISSUER);
    if (!facts) throw new TypeError("invalid platform object identity");
    requireDomain(facts.domain);
  };

  return Object.freeze({
    domain,
    issueWorkspace(canonicalDisplay, nativeIdentity) {
      if (!validText(canonicalDisplay) || !validText(nativeIdentity)) throw new TypeError("invalid workspace identity");
      return WorkspaceIdentity.issue(VALUE_ISSUER, { domain, canonicalDisplay, nativeIdentity });
    },
    issueRootCatalog(nativeIdentities) {
      if (!Array.isArray(nativeIdentities) || nativeIdentities.length === 0 || nativeIdentities.length > MAX_ROOTS ||
        !nativeIdentities.every(validText)) throw new TypeError("invalid root catalog");
      const roots = nativeIdentities.map((nativeIdentity) => RootReference.issue(VALUE_ISSUER, { domain, nativeIdentity }));
      return RootCatalog.issue(VALUE_ISSUER, { domain, roots });
    },
    issueObjectIdentity(nativeIdentity) {
      if (!validText(nativeIdentity)) throw new TypeError("invalid platform object identity");
      return PlatformObjectIdentity.issue(VALUE_ISSUER, { domain, nativeIdentity });
    },
    issuePathProof(input) {
      if (!validText(input.literal) || !validText(input.canonicalDisplay) || !validText(input.nativeIdentity) ||
        !Array.isArray(input.relations) || input.relations.length > MAX_RELATIONS_PER_PATH) {
        throw new TypeError("invalid platform path proof");
      }
      const catalog = RootCatalog.read(input.catalog, VALUE_ISSUER);
      if (!catalog) throw new TypeError("invalid root catalog");
      requireDomain(catalog.domain);
      const relations = input.relations.map((entry): RootRelationEvidence => {
        if (!Number.isSafeInteger(entry.rootIndex) || entry.rootIndex < 0 || entry.rootIndex >= catalog.roots.length ||
          !Array.isArray(entry.relations) || entry.relations.length === 0 ||
          !entry.relations.every((relation: RootRelation) => ["equal", "descendant", "ancestor", "traversed"].includes(relation))) {
          throw new TypeError("invalid root relation evidence");
        }
        return Object.freeze({
          root: catalog.roots[entry.rootIndex]!,
          relations: Object.freeze([...new Set<RootRelation>(entry.relations)]),
        });
      });
      if (input.terminalObject !== undefined) requireObjectDomain(input.terminalObject);
      const traversedObjects = input.traversedObjects ?? [];
      traversedObjects.forEach(requireObjectDomain);
      const risks = input.risks ?? [];
      if (!risks.every((risk) => ["missing-leaf", "reparse-traversal", "multiple-links"].includes(risk))) {
        throw new TypeError("invalid path risk");
      }
      return PlatformPathProof.issue(VALUE_ISSUER, {
        domain,
        literal: input.literal,
        canonicalDisplay: input.canonicalDisplay,
        nativeIdentity: input.nativeIdentity,
        relations,
        ...(input.terminalObject === undefined ? {} : { terminalObject: input.terminalObject }),
        traversedObjects,
        risks: Object.freeze([...new Set(risks)]),
      });
    },
    issueProcessIdentity(pid, creationIdentity) {
      if (!Number.isSafeInteger(pid) || pid <= 0 || !validText(creationIdentity)) throw new TypeError("invalid process identity");
      return ProcessIdentity.issue(VALUE_ISSUER, { domain, pid, creationIdentity });
    },
    issueRuntimeRoot(role, workspace, path) {
      if (role !== "session-envelope" && role !== "workflow-run") throw new TypeError("invalid runtime role");
      const workspaceFacts = WorkspaceIdentity.read(workspace, VALUE_ISSUER);
      const pathFacts = PlatformPathProof.read(path, VALUE_ISSUER);
      if (!workspaceFacts || !pathFacts) throw new TypeError("invalid runtime root evidence");
      requireDomain(workspaceFacts.domain);
      requireDomain(pathFacts.domain);
      return RuntimeRoot.issue(VALUE_ISSUER, { domain, role, workspace, path });
    },
    readWorkspace(value) {
      const facts = WorkspaceIdentity.read(value, VALUE_ISSUER);
      return facts && sameDomain(facts.domain, domain) ? facts : undefined;
    },
    readPathProof(value) {
      const facts = PlatformPathProof.read(value, VALUE_ISSUER);
      return facts && sameDomain(facts.domain, domain) ? facts : undefined;
    },
    readProcessIdentity(value) {
      const facts = ProcessIdentity.read(value, VALUE_ISSUER);
      return facts && sameDomain(facts.domain, domain) ? facts : undefined;
    },
  });
}
