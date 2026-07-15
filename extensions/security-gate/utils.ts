/**
 * security-gate/utils.ts — Shared path utilities.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the pi agent directory from env or fallback. */
export function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

/** Resolve ~ in paths to the home directory. */
export function resolveHome(path: string): string {
  if (path.startsWith("~")) return join(homedir(), path.slice(1));
  return path;
}
