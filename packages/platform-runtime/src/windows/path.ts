import { win32 } from "node:path";
import type {
  PathAuthority,
  PathResolutionFailureCode,
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

const MAX_ROOTS = 256;
const MAX_PATH_BYTES = 4_096;
const MAX_CATALOG_BYTES = 262_144;
const MAX_TRAVERSAL_DEPTH = 32;

const WINDOWS_RESERVED_NAMES = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const FORBIDDEN_CHARS = /[<>"|?*\x00-\x1F]/u;
const NAMESPACE_OR_DEVICE_PATTERN = /^\\\\[?.]\\/u;
const DRIVE_RELATIVE_PATTERN = /^[A-Za-z]:(?![\\/])/u;

export type WindowsPathSyntaxValidation =
  | Readonly<{ ok: true; isAbsolute: boolean; driveLetter?: string; components: readonly string[] }>
  | Readonly<{ ok: false; code: PathResolutionFailureCode; reason: string }>;

export function validateWindowsPathSyntax(rawPath: string): WindowsPathSyntaxValidation {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return Object.freeze({ ok: false, code: "invalid-input", reason: "path is empty" });
  }
  if (Buffer.byteLength(rawPath, "utf8") > MAX_PATH_BYTES) {
    return Object.freeze({ ok: false, code: "resource-limit", reason: "path exceeds byte budget" });
  }

  // 1. Reject namespace, device, and rooted namespace forms (\\?\, \\.\)
  if (NAMESPACE_OR_DEVICE_PATTERN.test(rawPath) || rawPath.startsWith("\\\\?\\") || rawPath.startsWith("\\??\\")) {
    return Object.freeze({ ok: false, code: "unsupported-path", reason: "namespace and device paths are forbidden" });
  }

  // 2. Reject UNC paths (\\server\share)
  if (rawPath.startsWith("\\\\") || rawPath.startsWith("//")) {
    return Object.freeze({ ok: false, code: "unsupported-path", reason: "UNC paths are forbidden in v1" });
  }

  // 3. Reject drive-relative paths (C:file.txt)
  if (DRIVE_RELATIVE_PATTERN.test(rawPath)) {
    return Object.freeze({ ok: false, code: "unsupported-path", reason: "drive-relative paths are forbidden" });
  }

  // 4. Reject rooted-without-drive paths (\Windows\System32 or /foo)
  if ((rawPath.startsWith("\\") || rawPath.startsWith("/")) && !/^[A-Za-z]:[\\/]/u.test(rawPath)) {
    return Object.freeze({ ok: false, code: "unsupported-path", reason: "rooted-without-drive paths are forbidden" });
  }

  // 5. Check drive-absolute format (C:\...)
  const isAbsolute = /^[A-Za-z]:[\\/]/u.test(rawPath);
  let driveLetter: string | undefined;
  let remainingPath = rawPath;

  if (isAbsolute) {
    driveLetter = rawPath[0]!.toUpperCase();
    remainingPath = rawPath.slice(2); // strip "C:"
  }

  // 6. Reject ADS alternate data streams (colon anywhere else)
  if (remainingPath.includes(":")) {
    return Object.freeze({ ok: false, code: "unsupported-path", reason: "alternate data streams (ADS) are forbidden" });
  }

  // 7. Split into components by / or \
  const rawComponents = remainingPath.split(/[\\/]/u).filter((c) => c.length > 0);
  if (rawComponents.length > MAX_TRAVERSAL_DEPTH) {
    return Object.freeze({ ok: false, code: "resource-limit", reason: "path traversal depth exceeds budget" });
  }

  for (const component of rawComponents) {
    if (FORBIDDEN_CHARS.test(component)) {
      return Object.freeze({ ok: false, code: "unsupported-path", reason: `forbidden characters in component: ${component}` });
    }
    if (component.endsWith(" ") || component.endsWith(".")) {
      if (component !== "." && component !== "..") {
        return Object.freeze({ ok: false, code: "unsupported-path", reason: `component ends with trailing dot or space: ${component}` });
      }
    }
    if (WINDOWS_RESERVED_NAMES.test(component)) {
      return Object.freeze({ ok: false, code: "unsupported-path", reason: `reserved device name: ${component}` });
    }
  }

  return Object.freeze({
    ok: true,
    isAbsolute,
    ...(driveLetter !== undefined ? { driveLetter } : {}),
    components: Object.freeze(rawComponents),
  });
}

export function normalizeWindowsAbsolutePath(
  rawPath: string,
): Readonly<{ canonicalDisplay: string; traversed: readonly string[] }> | undefined {
  const validation = validateWindowsPathSyntax(rawPath);
  if (!validation.ok || !validation.isAbsolute || !validation.driveLetter) return undefined;

  const traversedDisplays: string[] = [`${validation.driveLetter}:\\`];
  const components: string[] = [];
  for (const comp of validation.components) {
    if (comp === ".") continue;
    if (comp === "..") {
      if (components.length > 0) components.pop();
      traversedDisplays.push(formatWindowsPath(validation.driveLetter, components));
      continue;
    }
    components.push(comp);
    traversedDisplays.push(formatWindowsPath(validation.driveLetter, components));
  }

  return Object.freeze({
    canonicalDisplay: formatWindowsPath(validation.driveLetter, components),
    traversed: Object.freeze(traversedDisplays),
  });
}

export function normalizeWindowsLexicalPath(
  base: string,
  rawPath: string,
): Readonly<{ canonicalDisplay: string; traversed: readonly string[] }> | undefined {
  if (rawPath === "" || rawPath === ".") {
    return normalizeWindowsAbsolutePath(base);
  }
  const baseValidation = validateWindowsPathSyntax(base);
  if (!baseValidation.ok || !baseValidation.isAbsolute || !baseValidation.driveLetter) return undefined;
  const pathValidation = validateWindowsPathSyntax(rawPath);
  if (!pathValidation.ok) return undefined;

  let driveLetter = baseValidation.driveLetter;
  let components: string[] = [];

  if (pathValidation.isAbsolute) {
    driveLetter = pathValidation.driveLetter!;
    components = [];
  } else {
    // Resolve relative components against base
    components = [...baseValidation.components];
  }

  const traversedDisplays: string[] = [`${driveLetter}:\\`];
  for (const comp of pathValidation.components) {
    if (comp === ".") continue;
    if (comp === "..") {
      if (components.length > 0) {
        components.pop();
      }
      traversedDisplays.push(formatWindowsPath(driveLetter, components));
      continue;
    }
    components.push(comp);
    traversedDisplays.push(formatWindowsPath(driveLetter, components));
  }

  const canonicalDisplay = formatWindowsPath(driveLetter, components);
  return Object.freeze({
    canonicalDisplay,
    traversed: Object.freeze(traversedDisplays),
  });
}

function formatWindowsPath(drive: string, components: readonly string[]): string {
  if (components.length === 0) return `${drive}:\\`;
  return `${drive}:\\${components.join("\\")}`;
}

function normalizeKey(path: string): string {
  return win32.normalize(path).toLowerCase();
}

function isDescendantPath(candidateKey: string, rootKey: string): boolean {
  if (rootKey.endsWith("\\")) {
    return candidateKey.startsWith(rootKey) && candidateKey !== rootKey;
  }
  return candidateKey.startsWith(`${rootKey}\\`);
}

function computeWindowsPathRelations(
  candidateDisplay: string,
  traversedDisplays: readonly string[],
  rootDisplay: string,
): RootRelation[] {
  const candidateKey = normalizeKey(candidateDisplay);
  const rootKey = normalizeKey(rootDisplay);
  const relations: RootRelation[] = [];

  if (candidateKey === rootKey) {
    relations.push("equal");
  } else if (isDescendantPath(candidateKey, rootKey)) {
    relations.push("descendant");
  } else if (isDescendantPath(rootKey, candidateKey)) {
    relations.push("ancestor");
  }

  for (const traversed of traversedDisplays) {
    const traversedKey = normalizeKey(traversed);
    if (traversedKey === rootKey || isDescendantPath(traversedKey, rootKey)) {
      relations.push("traversed");
      break;
    }
  }

  return relations;
}

export type WindowsPathSession = PlatformSession & Readonly<{
  readonly path: PathAuthority;
  readonly compileCatalogSync: (nativeRoots: readonly string[]) => RootCatalog;
}>;

export function compileWindowsRootCatalogSync(
  issuer: ReturnType<typeof createPlatformValueIssuer>,
  workspace: WorkspaceIdentity,
  nativeRoots: readonly string[],
): Readonly<{ catalog: RootCatalog; nativeRoots: readonly string[] }> {
  if (issuer.readWorkspace(workspace) === undefined || !Array.isArray(nativeRoots) ||
    nativeRoots.length === 0 || nativeRoots.length > MAX_ROOTS) {
    throw new TypeError("invalid Windows root catalog input");
  }
  let catalogBytes = 0;
  const normalizedRoots = nativeRoots.map((root) => {
    const rootBytes = typeof root === "string" ? Buffer.byteLength(root, "utf8") : MAX_PATH_BYTES + 1;
    catalogBytes += rootBytes;
    const validation = validateWindowsPathSyntax(root);
    if (!validation.ok || !validation.isAbsolute || rootBytes > MAX_PATH_BYTES || catalogBytes > MAX_CATALOG_BYTES) {
      throw new TypeError(`invalid Windows root catalog path: ${root}`);
    }
    const lexical = normalizeWindowsAbsolutePath(root);
    if (!lexical) throw new TypeError(`failed to normalize root: ${root}`);
    return lexical.canonicalDisplay;
  });

  const catalog = issuer.issueRootCatalog(normalizedRoots);
  return Object.freeze({ catalog, nativeRoots: Object.freeze(normalizedRoots) });
}

export type WindowsPathAuthority = PathAuthority & Readonly<{
  compileRootCatalogSync: (candidateWorkspace: WorkspaceIdentity, nativeRoots: readonly string[]) => RootCatalog;
}>;

export function createWindowsPathAuthority(
  issuer: ReturnType<typeof createPlatformValueIssuer>,
  _accessRoot: string,
  requireOpen: () => void,
): WindowsPathAuthority {
  const catalogRoots = new WeakMap<RootCatalog, readonly string[]>();

  const compileSync = (candidateWorkspace: WorkspaceIdentity, nativeRoots: readonly string[]): RootCatalog => {
    requireOpen();
    const compiled = compileWindowsRootCatalogSync(issuer, candidateWorkspace, nativeRoots);
    catalogRoots.set(compiled.catalog, compiled.nativeRoots);
    return compiled.catalog;
  };

  return Object.freeze({
    domain: issuer.domain,
    compileRootCatalogSync: compileSync,
    async compileRootCatalog(candidateWorkspace: WorkspaceIdentity, nativeRoots: readonly string[]): Promise<RootCatalog> {
      return compileSync(candidateWorkspace, nativeRoots);
    },
    async resolve(request: PathResolutionRequest): Promise<PathResolutionResult> {
      requireOpen();
      const workspaceFacts = issuer.readWorkspace(request.workspace);
      const roots = catalogRoots.get(request.catalog);
      const baseDisplay = issuer.readWorkspace(request.base)?.canonicalDisplay ?? issuer.readPathProof(request.base)?.canonicalDisplay;
      if (!workspaceFacts || !roots || baseDisplay === undefined) {
        return Object.freeze({ kind: "rejected", code: "invalid-input" });
      }

      const syntax = validateWindowsPathSyntax(request.literal);
      if (!syntax.ok) {
        return Object.freeze({ kind: "rejected", code: syntax.code });
      }

      const lexical = normalizeWindowsLexicalPath(baseDisplay, request.literal);
      if (!lexical) {
        return Object.freeze({ kind: "rejected", code: "unsupported-path" });
      }

      const relations = roots.map((root, rootIndex) => ({
        rootIndex,
        relations: computeWindowsPathRelations(lexical.canonicalDisplay, lexical.traversed, root),
      })).filter((entry) => entry.relations.length > 0);

      const terminal = issuer.issueObjectIdentity(`win32:${normalizeKey(lexical.canonicalDisplay)}`);
      const proof = issuer.issuePathProof({
        literal: request.literal,
        canonicalDisplay: lexical.canonicalDisplay,
        nativeIdentity: normalizeKey(lexical.canonicalDisplay),
        catalog: request.catalog,
        relations,
        terminalObject: terminal,
        traversedObjects: [terminal],
        risks: [],
      });

      return Object.freeze({ kind: "resolved", proof });
    },
    stampWorkspace(candidateWorkspace: WorkspaceIdentity): WorkspaceIdentityStamp {
      requireOpen();
      const facts = issuer.readWorkspace(candidateWorkspace);
      if (!facts) throw new TypeError("invalid Windows workspace identity");
      return Object.freeze({
        schemaVersion: 1,
        platform: "windows",
        canonicalDisplay: facts.canonicalDisplay,
        nativeIdentity: facts.nativeIdentity,
      });
    },
    async revalidateWorkspace(stamp: WorkspaceIdentityStamp) {
      requireOpen();
      if (!stamp || stamp.schemaVersion !== 1 || stamp.platform !== "windows" ||
        typeof stamp.canonicalDisplay !== "string" || typeof stamp.nativeIdentity !== "string") {
        return undefined;
      }
      const validation = validateWindowsPathSyntax(stamp.canonicalDisplay);
      if (!validation.ok || !validation.isAbsolute) return undefined;
      const expectedKey = normalizeKey(stamp.canonicalDisplay);
      if (stamp.nativeIdentity !== expectedKey) return undefined;
      return issuer.issueWorkspace(stamp.canonicalDisplay, stamp.nativeIdentity);
    },
  });
}

export function createWindowsPathSession(input: PlatformSessionInput): WindowsPathSession {
  if (input.purpose !== "access-gate" && input.purpose !== "guidance") {
    throw new TypeError("invalid Windows path session input");
  }
  const syntax = validateWindowsPathSyntax(input.cwd);
  if (!syntax.ok || !syntax.isAbsolute) {
    throw new TypeError(`invalid Windows cwd: ${input.cwd}`);
  }
  const lexical = normalizeWindowsAbsolutePath(input.cwd);
  if (!lexical) throw new TypeError(`failed to normalize Windows cwd: ${input.cwd}`);

  const issuer = createPlatformValueIssuer("windows");
  const nativeIdentity = normalizeKey(lexical.canonicalDisplay);
  const workspace = issuer.issueWorkspace(lexical.canonicalDisplay, nativeIdentity);

  let closed = false;
  const requireOpen = (): void => {
    if (closed) throw new Error("Windows path session is closed");
  };

  const path = createWindowsPathAuthority(issuer, lexical.canonicalDisplay, requireOpen);

  return Object.freeze({
    domain: issuer.domain,
    workspace,
    path,
    compileCatalogSync(nativeRoots: readonly string[]): RootCatalog {
      requireOpen();
      return path.compileRootCatalogSync(workspace, nativeRoots);
    },
    async close(): Promise<void> {
      closed = true;
    },
  });
}
