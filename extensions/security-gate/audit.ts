/**
 * security-gate/audit.ts — Unified audit logging with secret redaction.
 */

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveHome } from "./utils";

let resolvedLogPath: string | null = null;

export function initAuditLog(logPathTemplate: string): void {
  const resolved = resolveHome(logPathTemplate);
  const logDir = dirname(resolved);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  resolvedLogPath = resolved;
}

export function audit(
  ctx: ExtensionContext,
  surface: string,
  value: string,
  decision: string,
  source: string
): void {
  if (!resolvedLogPath) return;

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    session: ctx.sessionManager?.getSessionId?.() ?? "unknown",
    surface,
    value: value.length > 200 ? value.slice(0, 197) + "..." : value,
    decision,
    source,
  });

  try {
    appendFileSync(resolvedLogPath, entry + "\n");
  } catch {
    // Audit failure should not block operation
  }
}
