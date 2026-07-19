/**
 * security-gate/types.ts — Shared type definitions
 */

export type PermissionAction = "allow" | "deny" | "ask";
export type SecurityLevel = "strict" | "standard" | "permissive";

// ─── Pipeline result types (T1) ───

/** Unified result for bash and permission pipelines. */
export type PipelineResult =
  | { kind: "allow" }
  | { kind: "block"; reason: string };

/** PLAN gate result — only allow/block, no ask. */
export type PlanGateResult =
  | { kind: "allow" }
  | { kind: "block"; reason: string };

// ─── Configuration types ───

export interface PermissionConfig {
  "*": PermissionAction;
  path: Record<string, PermissionAction>;
  /** Immutable path patterns — cannot be overridden by config. */
  hardPath?: string[];
  read: Record<string, PermissionAction> | PermissionAction;
  write: Record<string, PermissionAction> | PermissionAction;
  edit: Record<string, PermissionAction> | PermissionAction;
  external_directory: PermissionAction;
  bash: Record<string, PermissionAction>;
}

export interface SecurityConfig {
  level: SecurityLevel;
  permission: PermissionConfig;
}

export interface Rule {
  surface: string;
  pattern: string;
  action: PermissionAction;
  source: "default" | "config";
}
