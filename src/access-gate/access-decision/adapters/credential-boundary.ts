import { createCredentialBoundary, resolveExistingPath } from "../core/index";
import type { CredentialBoundary } from "../core/index";

export function createCredentialBoundaryForAgentDir(agentDir: string): CredentialBoundary {
  const canonicalRoot = resolveExistingPath(agentDir);
  const roots = canonicalRoot === undefined || canonicalRoot === agentDir
    ? [agentDir]
    : [agentDir, canonicalRoot];
  return createCredentialBoundary(roots);
}
