import { admissionFacts, shellAdmissionFacts } from "./admission";

const rootsByBoundary = new WeakMap<object, readonly string[]>();
const TEMPLATE_MARKERS = new Set(["template", "sample", "example", "skeleton"]);
const CREDENTIAL_BASENAME = "auth.json";

export type CredentialBoundary = object;

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

export function createCredentialBoundary(roots: readonly string[]): CredentialBoundary {
  if (!Array.isArray(roots) || roots.length === 0 || !roots.every(isAbsolutePath)) {
    throw new TypeError("invalid credential boundary");
  }
  const boundary = Object.freeze({});
  rootsByBoundary.set(boundary, Object.freeze([...new Set(roots)]));
  return boundary;
}

function protectedBasename(name: string): boolean {
  if (name === CREDENTIAL_BASENAME) return true;
  if (!name.startsWith(CREDENTIAL_BASENAME)) return false;
  const suffix = name.slice(CREDENTIAL_BASENAME.length);
  if (!/^[.~_-]/.test(suffix)) return false;
  const tokens = suffix.split(/[^A-Za-z0-9]+/).filter((token) => token.length > 0);
  return !tokens.some((token) => TEMPLATE_MARKERS.has(token));
}

function directArtifactName(path: string, root: string): string | undefined {
  const prefix = root === "/" ? "/" : `${root}/`;
  if (!path.startsWith(prefix)) return undefined;
  const relative = path.slice(prefix.length);
  if (relative.length === 0 || relative.includes("/")) return undefined;
  return relative;
}

function matchesRoot(path: string, roots: readonly string[]): boolean {
  for (const root of roots) {
    const name = directArtifactName(path, root);
    if (name !== undefined && protectedBasename(name)) return true;
  }
  return false;
}

export function pathHitsCredentialBoundary(
  candidate: string,
  traversed: readonly string[],
  boundary: CredentialBoundary,
): boolean {
  const roots = rootsByBoundary.get(boundary);
  if (roots === undefined) return true;
  return matchesRoot(candidate, roots) || traversed.some((path) => matchesRoot(path, roots));
}

export function directAdmissionHitsCredentialBoundary(admission: unknown, boundary: CredentialBoundary): boolean {
  const facts = admissionFacts(admission);
  if (facts === undefined) return true;
  return pathHitsCredentialBoundary(facts.resolvedCandidate, facts.traversed, boundary);
}

export function shellAdmissionHitsCredentialBoundary(admission: unknown, boundary: CredentialBoundary): boolean {
  const facts = shellAdmissionFacts(admission);
  if (facts === undefined) return true;
  return facts.operations.some((operation) => operation.paths.some((path) =>
    pathHitsCredentialBoundary(path.candidate, path.traversed, boundary)));
}
