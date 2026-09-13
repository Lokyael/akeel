import { createLinuxPathEvidence } from "./compilation/index";
import type { ResolvedPathEvidence } from "./compilation/index";

export type ShellPathContext = Readonly<{
  readonly home?: string;
  readonly pathKind?: "home-relative" | "literal";
}>;

export type ResolvedShellPath = ResolvedPathEvidence;

const LINUX_PATH_EVIDENCE = createLinuxPathEvidence();

export function resolveShellPath(
  cwd: string,
  path: string,
  context: ShellPathContext = {},
): string | undefined {
  return resolveShellPathWithTraversal(cwd, path, context)?.candidate;
}

export function resolveShellPathWithTraversal(
  cwd: string,
  path: string,
  context: ShellPathContext = {},
): ResolvedShellPath | undefined {
  return LINUX_PATH_EVIDENCE.resolve(cwd, path, context);
}

export function resolveExistingPath(path: string): string | undefined {
  return resolveExistingPathWithTraversal(path)?.candidate;
}

export function resolveExistingPathWithTraversal(path: string): ResolvedShellPath | undefined {
  return LINUX_PATH_EVIDENCE.resolve("/", path, { pathKind: "literal" });
}
