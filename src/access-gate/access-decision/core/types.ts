export type DirectSurface = "read" | "write" | "list" | "search";
export type PolicyMode = "allow" | "ask" | "deny";

type DirectRequestBase = Readonly<{
  readonly cwd: string;
  readonly hasUI: boolean;
}>;

export type DirectRequest =
  | (DirectRequestBase & Readonly<{
      readonly surface: "read";
      readonly arguments: Readonly<{ path: string; offset?: number; limit?: number }>;
    }>)
  | (DirectRequestBase & Readonly<{
      readonly surface: "write";
      readonly arguments: Readonly<{ path: string; content: string }>;
    }>)
  | (DirectRequestBase & Readonly<{
      readonly surface: "list";
      readonly arguments: Readonly<{ path?: string }>;
    }>)
  | (DirectRequestBase & Readonly<{
      readonly surface: "search";
      readonly arguments: Readonly<{ path?: string; pattern: string }>;
    }>);

export interface PolicyInput {
  readonly read: PolicyMode;
  readonly write: PolicyMode;
  readonly list?: PolicyMode;
  readonly search?: PolicyMode;
  readonly allowedRoots?: readonly string[];
  readonly blockedRoots?: readonly string[];
  readonly blockedPaths?: readonly string[];
}

export type Decision =
  | Readonly<{ kind: "allow" }>
  | Readonly<{ kind: "ask"; executed: false }>
  | Readonly<{
      kind: "deny";
      code: "invalid-request" | "resource-limit" | "policy-denied" | "no-ui" | "hard-boundary";
    }>;
