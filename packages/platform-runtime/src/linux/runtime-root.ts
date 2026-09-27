import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type {
  PathAuthority,
  RuntimeRoot,
  RuntimeRootAuthority,
  RuntimeRole,
  WorkspaceIdentity,
} from "../contracts";
import type { PlatformValueIssuer } from "../internal/sealed-values";

export const LINUX_SESSIONS_BASE = "/tmp/akeel/sessions";
export const LINUX_RUNS_BASE = "/tmp/akeel/runs";

export function requireControlledDirectory(path: string, create = false): void {
  if (create) mkdirSync(path, { recursive: true, mode: 0o700 });
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o022) !== 0 ||
    (typeof process.getuid === "function" && stats.uid !== process.getuid())) {
    throw new TypeError("directory is not securely controlled");
  }
}

export const ensureControlledDirectory = requireControlledDirectory;

export function isControlledDirectory(path: string): boolean {
  try {
    requireControlledDirectory(path);
    return true;
  } catch {
    return false;
  }
}

export function createLinuxRuntimeRootAuthority(
  issuer: PlatformValueIssuer,
  pathAuthority: PathAuthority,
  requireOpen: () => void,
): RuntimeRootAuthority {
  const catalogCache = new WeakMap<WorkspaceIdentity, ReturnType<typeof pathAuthority.compileRootCatalog>>();

  const getCatalog = async (workspace: WorkspaceIdentity) => {
    let pending = catalogCache.get(workspace);
    if (!pending) {
      pending = pathAuthority.compileRootCatalog(workspace, [LINUX_SESSIONS_BASE, LINUX_RUNS_BASE]);
      catalogCache.set(workspace, pending);
    }
    return pending;
  };

  return Object.freeze({
    domain: issuer.domain,
    async create(role: RuntimeRole, workspace: WorkspaceIdentity): Promise<RuntimeRoot> {
      requireOpen();
      if (issuer.readWorkspace(workspace) === undefined) throw new TypeError("invalid workspace");
      const parent = role === "session-envelope" ? LINUX_SESSIONS_BASE : LINUX_RUNS_BASE;
      const prefix = role === "session-envelope" ? "session-" : "run-";
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      requireControlledDirectory(parent);

      let target = "";
      for (let attempt = 0; attempt < 8; attempt++) {
        const id = `${prefix}${randomBytes(16).toString("hex")}`;
        target = join(parent, id);
        if (!existsSync(target)) break;
        if (attempt === 7) throw new Error("failed to allocate unique runtime root");
      }

      mkdirSync(target, { mode: 0o700 });
      requireControlledDirectory(target);

      const catalog = await getCatalog(workspace);
      const resolved = await pathAuthority.resolve({
        workspace,
        catalog,
        base: workspace,
        literal: target,
        kind: "literal",
      });
      if (resolved.kind !== "resolved") {
        rmSync(target, { recursive: true, force: true });
        throw new Error("failed to issue path proof for runtime root");
      }

      return issuer.issueRuntimeRoot(role, workspace, resolved.proof);
    },
    async verify(root: RuntimeRoot): Promise<boolean> {
      requireOpen();
      const facts = issuer.readPathProof(root.path);
      if (!facts) return false;
      const display = facts.canonicalDisplay;
      const expectedParent = root.role === "session-envelope" ? LINUX_SESSIONS_BASE : LINUX_RUNS_BASE;
      if (!display.startsWith(`${expectedParent}/`)) return false;
      return isControlledDirectory(display);
    },
    async remove(root: RuntimeRoot): Promise<boolean> {
      requireOpen();
      const facts = issuer.readPathProof(root.path);
      if (!facts) return false;
      const display = facts.canonicalDisplay;
      const expectedParent = root.role === "session-envelope" ? LINUX_SESSIONS_BASE : LINUX_RUNS_BASE;
      if (!display.startsWith(`${expectedParent}/`)) return false;
      try {
        if (!isControlledDirectory(display)) return false;
        rmSync(display, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    },
  });
}
