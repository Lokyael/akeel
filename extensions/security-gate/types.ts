/**
 * security-gate/types.ts — Shared type definitions
 */

export type PermissionAction = "allow" | "deny" | "ask";
export type SecurityLevel = "strict" | "standard" | "permissive";

export interface SandboxConfig {
  enabled: boolean;
  filesystem: {
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
    allowRead: string[];
  };
  network: {
    allowNetwork: boolean;
    allowedDomains: string[];
  };
}

export interface AuditConfig {
  enabled: boolean;
  logPath: string;
  redactSecrets: boolean;
}

export interface PermissionConfig {
  "*": PermissionAction;
  path: Record<string, PermissionAction>;
  read: Record<string, PermissionAction> | PermissionAction;
  write: Record<string, PermissionAction> | PermissionAction;
  edit: Record<string, PermissionAction> | PermissionAction;
  external_directory: PermissionAction;
}

export interface SecurityConfig {
  level: SecurityLevel;
  sandbox: SandboxConfig;
  permission: PermissionConfig;
  audit: AuditConfig;
}

export interface Rule {
  surface: string;
  pattern: string;
  action: PermissionAction;
  source: "default" | "config" | "session";
}

export interface SessionRule extends Rule {
  source: "session";
}

// ─── Rollback / Snapshot types ───

export interface SnapshotEntry {
  file: string;       // original file path (relative to cwd)
  backup: string;     // backup file path (in .pi-keel/snapshots/)
  timestamp: string;  // ISO timestamp
  tool: string;       // "write" | "edit"
  bytes: number;      // original file size
}

export interface RollbackConfig {
  enabled: boolean;
  maxSnapshotsPerFile: number;  // default 10
}
