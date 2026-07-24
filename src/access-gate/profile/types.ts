export type Decision = "allow" | "ask" | "deny";
export type PathOperation = "read" | "list" | "search" | "write";

export interface ShellPolicy {
  inspect: Decision;
  modify: Decision;
  execute: Decision;
  destroy: Decision;
  unknown: Decision;
}

export type PathDecisions = Partial<Record<PathOperation, Decision>>;

export interface PathRule extends PathDecisions {
  path: string;
}

export interface PathPolicy {
  default: Record<PathOperation, Decision>;
  rules: PathRule[];
}

export interface RawProfile {
  description: string;
  extends?: readonly string[];
  shellPolicy?: Partial<ShellPolicy>;
  pathPolicy?: {
    default?: PathDecisions;
    rules?: readonly PathRule[];
  };
}

export interface ResolvedProfile {
  name: string;
  description: string;
  shellPolicy: ShellPolicy;
  pathPolicy: PathPolicy;
}

export interface RawProfiles {
  defaultProfile?: string;
  profiles: Record<string, RawProfile>;
}

export interface ResolvedProfiles {
  defaultProfile: string;
  profiles: Record<string, ResolvedProfile>;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
