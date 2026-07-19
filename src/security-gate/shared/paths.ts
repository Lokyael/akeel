/**
 * shared/paths.ts — Shared path utilities.
 *
 * Provides getAgentDir for config resolution.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the pi agent directory from env or fallback. */
export function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}
