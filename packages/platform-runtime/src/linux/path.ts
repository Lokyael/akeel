import { lstatSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  PathAuthority,
  PathResolutionRequest,
  PathResolutionResult,
  PlatformSession,
  PlatformSessionInput,
  RootCatalog,
  RootRelation,
  WorkspaceIdentity,
  WorkspaceIdentityStamp,
} from "../contracts";
import { createPlatformValueIssuer } from "../internal/sealed-values";

const MAX_SYMLINK_DEPTH = 40;
const MAX_ROOTS = 256;
const MAX_PATH_BYTES = 4_096;
const MAX_CATALOG_BYTES = 262_144;

export type LinuxResolvedPathEvidence = Readonly<{
  readonly candidate: string;
  readonly traversed: readonly string[];
  readonly traversedSymlink: boolean;
}>;

export type LinuxPathSession = PlatformSession & Readonly<{
  readonly path: PathAuthority;
}>;

export function resolveLinuxWorkspaceRoot(path: string): string {
  return resolveExistingDirectory(path);
}

export function createLinuxPathAuthority(
  issuer: ReturnType<typeof createPlatformValueIssuer>,
  _accessRoot: string,
  home: string | undefined,
  requireOpen: () => void,
): PathAuthority {
  const catalogRoots = new WeakMap<RootCatalog, readonly string[]>();

  return Object.freeze({
    domain: issuer.domain,
    async compileRootCatalog(candidateWorkspace: WorkspaceIdentity, nativeRoots: readonly string[]) {
      requireOpen();
      if (issuer.readWorkspace(candidateWorkspace) === undefined || !Array.isArray(nativeRoots) ||
        nativeRoots.length === 0 || nativeRoots.length > MAX_ROOTS) throw new TypeError("invalid Linux root catalog");
      let catalogBytes = 0;
      const roots = nativeRoots.map((root) => {
        const rootBytes = typeof root === "string" ? Buffer.byteLength(root, "utf8") : MAX_PATH_BYTES + 1;
        catalogBytes += rootBytes;
        const evidence = resolveLinuxPathEvidence("/", root, { pathKind: "literal" });
        if (!evidence || !root.startsWith("/") || rootBytes > MAX_PATH_BYTES || catalogBytes > MAX_CATALOG_BYTES) {
          throw new TypeError("invalid Linux root catalog");
        }
        return evidence.candidate;
      });
      const catalog = issuer.issueRootCatalog(roots);
      catalogRoots.set(catalog, Object.freeze(roots));
      return catalog;
    },
    async resolve(request: PathResolutionRequest): Promise<PathResolutionResult> {
      requireOpen();
      const workspaceFacts = issuer.readWorkspace(request.workspace);
      const roots = catalogRoots.get(request.catalog);
      const base = issuer.readWorkspace(request.base)?.canonicalDisplay ?? issuer.readPathProof(request.base)?.nativeIdentity;
      if (!workspaceFacts || !roots || base === undefined || typeof request.literal !== "string" || request.literal.includes("\u0000")) {
        return Object.freeze({ kind: "rejected", code: "invalid-input" });
      }
      const evidence = resolveLinuxPathEvidence(base, request.literal, {
        pathKind: request.kind,
        home,
      });
      if (!evidence) return Object.freeze({ kind: "rejected", code: "evidence-unavailable" });

      const terminal = tryObjectIdentity(evidence.candidate);
      const traversedObjects = evidence.traversed
        .map(tryObjectIdentity)
        .filter((value): value is Readonly<{ readonly identity: string; readonly links: number }> => value !== undefined)
        .map((identity) => issuer.issueObjectIdentity(identity.identity));
      const relations = roots.map((root, rootIndex) => ({
        rootIndex,
        relations: pathRelations(evidence, root),
      })).filter((entry) => entry.relations.length > 0);
      const proof = issuer.issuePathProof({
        literal: request.literal,
        canonicalDisplay: evidence.candidate,
        nativeIdentity: evidence.candidate,
        catalog: request.catalog,
        relations,
        ...(terminal === undefined ? {} : { terminalObject: issuer.issueObjectIdentity(terminal.identity) }),
        traversedObjects,
        risks: [
          ...(terminal === undefined ? ["missing-leaf" as const] : []),
          ...(evidence.traversedSymlink ? ["reparse-traversal" as const] : []),
          ...(terminal && terminal.links > 1 ? ["multiple-links" as const] : []),
        ],
      });
      return Object.freeze({ kind: "resolved", proof });
    },
    stampWorkspace(candidateWorkspace: WorkspaceIdentity): WorkspaceIdentityStamp {
      requireOpen();
      const facts = issuer.readWorkspace(candidateWorkspace);
      if (!facts) throw new TypeError("invalid Linux workspace identity");
      return Object.freeze({
        schemaVersion: 1,
        platform: "linux",
        canonicalDisplay: facts.canonicalDisplay,
        nativeIdentity: facts.nativeIdentity,
      });
    },
    async revalidateWorkspace(stamp: WorkspaceIdentityStamp) {
      requireOpen();
      if (!stamp || stamp.schemaVersion !== 1 || stamp.platform !== "linux" ||
        typeof stamp.canonicalDisplay !== "string" || typeof stamp.nativeIdentity !== "string") return undefined;
      try {
        const canonical = resolveExistingDirectory(stamp.canonicalDisplay);
        if (objectIdentity(canonical) !== stamp.nativeIdentity) return undefined;
        return issuer.issueWorkspace(canonical, stamp.nativeIdentity);
      } catch {
        return undefined;
      }
    },
  });
}

export function createLinuxPathSession(input: PlatformSessionInput): LinuxPathSession {
  if (input.purpose !== "access-gate" && input.purpose !== "guidance") throw new TypeError("invalid Linux path session");
  const accessRoot = resolveExistingDirectory(input.cwd);
  const home = input.home === undefined ? undefined : resolveExistingDirectory(input.home);
  const issuer = createPlatformValueIssuer("linux");
  const workspace = issuer.issueWorkspace(accessRoot, objectIdentity(accessRoot));
  let closed = false;

  const requireOpen = (): void => {
    if (closed) throw new Error("Linux path session is closed");
  };

  const path = createLinuxPathAuthority(issuer, accessRoot, home, requireOpen);

  return Object.freeze({
    domain: issuer.domain,
    workspace,
    path,
    async close() {
      closed = true;
    },
  });
}

export function resolveLinuxPathEvidence(
  base: string,
  path: string,
  context: Readonly<{ readonly pathKind?: "home-relative" | "literal"; readonly home?: string }> = {},
): LinuxResolvedPathEvidence | undefined {
  if (typeof base !== "string" || !base.startsWith("/") || typeof path !== "string" || path.includes("\u0000") ||
    Buffer.byteLength(base, "utf8") + Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES) return undefined;
  const pathKind = context.pathKind ?? (path === "~" || path.startsWith("~/") ? "home-relative" : "literal");
  if (pathKind === "home-relative") {
    if (context.home === undefined || !context.home.startsWith("/") || context.home.includes("\u0000")) return undefined;
    path = path === "~" ? context.home : `${context.home}/${path.slice(2)}`;
  }
  return resolveAbsolute(path.startsWith("/") ? path : `${base}/${path}`);
}

function resolveExistingDirectory(path: string): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\u0000")) throw new TypeError("invalid Linux workspace");
  const canonical = realpathSync.native(path);
  if (!statSync(canonical).isDirectory()) throw new TypeError("invalid Linux workspace");
  return canonical;
}

function resolveAbsolute(path: string): LinuxResolvedPathEvidence | undefined {
  let current = "/";
  let traversedSymlink = false;
  const traversed: string[] = [current];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      traversed.push(current);
      continue;
    }
    current = join(current, part);
    traversed.push(current);
    const traversal = appendSymlinkTraversal(traversed, current);
    if (!traversal.complete) return undefined;
    traversedSymlink ||= traversal.sawSymlink;
    try {
      current = realpathSync.native(current);
    } catch {
      try {
        if (lstatSync(current).isSymbolicLink()) return undefined;
      } catch {
        // Missing non-symlink components remain lexical.
      }
    }
    traversed.push(current);
  }
  return Object.freeze({
    candidate: current,
    traversed: Object.freeze(traversed),
    traversedSymlink,
  });
}

function readlinkTarget(path: string): Readonly<{ readonly target: string; readonly base: string }> | undefined {
  try {
    return Object.freeze({ target: readlinkSync(path), base: dirname(path) });
  } catch {
    return undefined;
  }
}

function appendSymlinkTraversal(
  traversed: string[],
  path: string,
  seen = new Set<string>(),
  depth = 0,
): Readonly<{ readonly complete: boolean; readonly sawSymlink: boolean }> {
  if (depth > MAX_SYMLINK_DEPTH) return { complete: false, sawSymlink: false };
  let current = "/";
  let sawSymlink = false;
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    current = join(current, part);
    const target = readlinkTarget(current);
    if (target === undefined || seen.has(current)) continue;
    if (depth >= MAX_SYMLINK_DEPTH) return { complete: false, sawSymlink: true };
    sawSymlink = true;
    const targetPath = target.target.startsWith("/") ? target.target : `${target.base}/${target.target}`;
    seen.add(current);
    appendLexicalPrefixes(traversed, targetPath);
    const nested = appendSymlinkTraversal(traversed, targetPath, seen, depth + 1);
    if (!nested.complete) return nested;
    sawSymlink ||= nested.sawSymlink;
  }
  return { complete: true, sawSymlink };
}

function appendLexicalPrefixes(traversed: string[], path: string): void {
  let current = "/";
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    current = part === ".." ? dirname(current) : join(current, part);
    traversed.push(current);
  }
}

function pathRelations(evidence: LinuxResolvedPathEvidence, root: string): RootRelation[] {
  const relations: RootRelation[] = [];
  if (evidence.candidate === root) relations.push("equal");
  else if (isDescendant(evidence.candidate, root)) relations.push("descendant");
  else if (isDescendant(root, evidence.candidate)) relations.push("ancestor");
  if (evidence.traversed.some((candidate) => candidate === root || isDescendant(candidate, root))) relations.push("traversed");
  return relations;
}

function isDescendant(candidate: string, root: string): boolean {
  return root === "/" ? candidate.startsWith("/") && candidate !== "/" : candidate.startsWith(`${root}/`);
}

function tryObjectIdentity(path: string): Readonly<{ readonly identity: string; readonly links: number }> | undefined {
  try {
    const stats = lstatSync(path, { bigint: true });
    return Object.freeze({ identity: `${stats.dev}:${stats.ino}`, links: Number(stats.nlink) });
  } catch {
    return undefined;
  }
}

function objectIdentity(path: string): string {
  const identity = tryObjectIdentity(path);
  if (!identity) throw new TypeError("Linux object identity unavailable");
  return identity.identity;
}
