export type PlatformId = "linux" | "windows";

export type RootRelation = "equal" | "descendant" | "ancestor" | "traversed";
export type RuntimeRole = "session" | "staging" | "workflow";
export type ProcessIdentity = Readonly<{
  readonly pid: number;
  readonly creationIdentity: object;
}>;

declare const platformDomainBrand: unique symbol;
declare const workspaceIdentityBrand: unique symbol;
declare const pathProofBrand: unique symbol;
declare const runtimeRootBrand: unique symbol;
declare const rootCatalogBrand: unique symbol;
declare const executionBindingBrand: unique symbol;

export type PlatformDomain = Readonly<{
  readonly platform: PlatformId;
  readonly token: object;
  readonly [platformDomainBrand]: true;
}>;

export type WorkspaceIdentity = Readonly<{
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly token: object;
  readonly [workspaceIdentityBrand]: true;
}>;

export type RootRelationEvidence = Readonly<{
  readonly rootId: string;
  readonly relations: readonly RootRelation[];
}>;

export type PlatformPathProof = Readonly<{
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly display: string;
  readonly relations: readonly RootRelationEvidence[];
  readonly terminalObject?: object;
  readonly traversedObjects: readonly object[];
  readonly riskFlags: readonly string[];
  readonly [pathProofBrand]: true;
}>;

export type RootCatalog = Readonly<{
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly roots: readonly string[];
  readonly [rootCatalogBrand]: true;
}>;

export type RuntimeRoot = Readonly<{
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly role: RuntimeRole;
  readonly workspace: WorkspaceIdentity;
  readonly path: PlatformPathProof;
  readonly [runtimeRootBrand]: true;
}>;

export type ExecutionBinding = Readonly<{
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly workspace: WorkspaceIdentity;
  readonly token: object;
  readonly [executionBindingBrand]: true;
}>;

export type PathResolutionRequest = Readonly<{
  readonly workspace: WorkspaceIdentity;
  readonly literal: string;
  readonly kind: "literal" | "home-relative";
}>;

export interface PathAuthority {
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly rootCatalog: RootCatalog;
  resolve(request: PathResolutionRequest): Promise<PlatformPathProof | undefined>;
}

export interface PrivateFilesystemAuthority {
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  createRuntimeRoot(role: RuntimeRole, workspace: WorkspaceIdentity): Promise<RuntimeRoot>;
  verifyRuntimeRoot(root: RuntimeRoot): Promise<boolean>;
  removeRuntimeRoot(root: RuntimeRoot): Promise<boolean>;
}

export interface ProcessAuthority {
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  current(): Promise<ProcessIdentity>;
  isAlive(identity: ProcessIdentity): Promise<boolean>;
}

export type ExecutionRequest = Readonly<{
  readonly binding: ExecutionBinding;
  readonly toolCallId: string;
  readonly input: unknown;
  readonly cwd: WorkspaceIdentity;
  readonly signal?: AbortSignal;
}>;

export type ExecutionResult = Readonly<{
  readonly exitCode: number | null;
  readonly output: string;
  readonly truncated: boolean;
}>;

export interface ExecutionBridge {
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  bind(input: Readonly<{
    readonly toolCallId: string;
    readonly workspace: WorkspaceIdentity;
    readonly approvedInput: unknown;
  }>): Promise<ExecutionBinding | undefined>;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}

export interface RuntimeRootAuthority {
  readonly platform: PlatformId;
  readonly domain: PlatformDomain;
  readonly filesystem: PrivateFilesystemAuthority;
  readonly process: ProcessAuthority;
  createSessionRoot(workspace: WorkspaceIdentity): Promise<RuntimeRoot>;
  createWorkflowRoot(workspace: WorkspaceIdentity): Promise<RuntimeRoot>;
}
