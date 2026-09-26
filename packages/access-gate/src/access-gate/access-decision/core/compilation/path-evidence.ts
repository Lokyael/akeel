import { resolveLinuxPathEvidence } from "akeel-platform-runtime";
import type { PathEvidencePort, ResolvedPathEvidence } from "./index";

const LINUX_PATH_EVIDENCE = Object.freeze({ resolve });

export function createLinuxPathEvidence(): PathEvidencePort {
  return LINUX_PATH_EVIDENCE;
}

function resolve(
  base: string,
  path: string,
  context: Readonly<{ readonly pathKind?: "home-relative" | "literal"; readonly home?: string }> = {},
): ResolvedPathEvidence | undefined {
  const evidence = resolveLinuxPathEvidence(base, path, context);
  return evidence === undefined
    ? undefined
    : Object.freeze({ candidate: evidence.candidate, traversed: evidence.traversed });
}
