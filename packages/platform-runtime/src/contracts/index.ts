export {
  PlatformDomain,
  PlatformObjectIdentity,
  PlatformPathProof,
  ProcessIdentity,
  RootCatalog,
  RootReference,
  RuntimeRoot,
  WorkspaceIdentity,
  isPlatformDomain,
  isPlatformPathProof,
  isProcessIdentity,
  isRootCatalog,
  isRuntimeRoot,
  isWorkspaceIdentity,
  projectPathAuthorization,
  samePlatformObject,
  type PathAuthorizationView,
  type PathRisk,
  type PlatformId,
  type RootRelation,
  type RootRelationEvidence,
  type RuntimeRole,
} from "../internal/sealed-values";

import type {
  PlatformDomain,
  PlatformId,
  PlatformPathProof,
  ProcessIdentity,
  RootCatalog,
  RuntimeRoot,
  RuntimeRole,
  WorkspaceIdentity,
} from "../internal/sealed-values";

export const PLATFORM_RUNTIME_CONTRACT_VERSION = 1 as const;

export type PlatformSessionPurpose = "access-gate" | "guidance";

export type PlatformSessionInput = Readonly<{
  readonly purpose: PlatformSessionPurpose;
  readonly cwd: string;
  readonly home?: string;
}>;

export type WorkspaceIdentityStamp = Readonly<{
  readonly schemaVersion: 1;
  readonly platform: PlatformId;
  readonly canonicalDisplay: string;
  readonly nativeIdentity: string;
}>;

export type ProcessIdentityStamp = Readonly<{
  readonly schemaVersion: 1;
  readonly platform: PlatformId;
  readonly pid: number;
  readonly creationIdentity: string;
}>;

export type ProcessLiveness = "alive" | "dead" | "unknown";

export type PathResolutionFailureCode =
  | "invalid-input"
  | "unsupported-path"
  | "evidence-unavailable"
  | "resource-limit";

export type PathResolutionResult =
  | Readonly<{ readonly kind: "resolved"; readonly proof: PlatformPathProof }>
  | Readonly<{ readonly kind: "rejected"; readonly code: PathResolutionFailureCode }>;

export type PathResolutionRequest = Readonly<{
  readonly workspace: WorkspaceIdentity;
  readonly catalog: RootCatalog;
  readonly base: WorkspaceIdentity | PlatformPathProof;
  readonly literal: string;
  readonly kind: "literal" | "home-relative";
}>;

export interface PathAuthority {
  readonly domain: PlatformDomain;
  compileRootCatalog(workspace: WorkspaceIdentity, nativeRoots: readonly string[]): Promise<RootCatalog>;
  resolve(request: PathResolutionRequest): Promise<PathResolutionResult>;
  stampWorkspace(workspace: WorkspaceIdentity): WorkspaceIdentityStamp;
  revalidateWorkspace(stamp: WorkspaceIdentityStamp): Promise<WorkspaceIdentity | undefined>;
}

export interface ProcessAuthority {
  readonly domain: PlatformDomain;
  current(): Promise<ProcessIdentity>;
  stamp(identity: ProcessIdentity): ProcessIdentityStamp;
  liveness(stamp: ProcessIdentityStamp): Promise<ProcessLiveness>;
}

export interface RuntimeRootAuthority {
  readonly domain: PlatformDomain;
  create(role: RuntimeRole, workspace: WorkspaceIdentity): Promise<RuntimeRoot>;
  verify(root: RuntimeRoot): Promise<boolean>;
  remove(root: RuntimeRoot): Promise<boolean>;
}

export interface PrivateFilesystemAuthority {
  readonly domain: PlatformDomain;
  ensureDirectory(root: RuntimeRoot, relativeComponents: readonly string[]): Promise<void>;
  readText(root: RuntimeRoot, relativeComponents: readonly string[], maxBytes: number): Promise<string | undefined>;
}

export type AtomicPublicationResult = Readonly<{
  readonly status: "published" | "already-published";
  readonly bytes: number;
  readonly digest: string;
}>;

export interface AtomicTextPublicationAuthority {
  readonly domain: PlatformDomain;
  publish(input: Readonly<{
    readonly root: RuntimeRoot;
    readonly relativeComponents: readonly string[];
    readonly content: string;
  }>): Promise<AtomicPublicationResult>;
}

export interface PlatformSession {
  readonly domain: PlatformDomain;
  readonly workspace: WorkspaceIdentity;
  close(): Promise<void>;
}
