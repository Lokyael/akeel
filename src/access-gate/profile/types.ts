import type { CommandClass, ProfileDecision, PathOperation } from "../domain";

export type { CommandClass, ProfileDecision, PathOperation } from "../domain";

export type ShellPolicy = Record<CommandClass, ProfileDecision>;

export type PathDecisions = Partial<Record<PathOperation, ProfileDecision>>;

export interface PathRule extends PathDecisions {
  path: string;
}

export interface PathPolicy {
  default: Record<PathOperation, ProfileDecision>;
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
