import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectContext } from "./project-context";
import type { ProjectContext } from "./project-context";
import { tryScheduleStagingRetention, writeSessionLock, writeSessionManifest } from "./staging-retention";

export type ProjectLifecycle = Readonly<{
  readonly context: ProjectContext;
  readonly dispose: () => void;
}>;

function accessRoot(cwd: string): string {
  try {
    const root = realpathSync(cwd);
    if (!statSync(root).isDirectory()) throw new TypeError("not a directory");
    return root;
  } catch {
    throw new TypeError("invalid project lifecycle");
  }
}

function requireControlledDirectory(path: string): void {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o022) !== 0 ||
    typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new TypeError("invalid project lifecycle");
  }
}

export function createProjectLifecycle(cwd: string): ProjectLifecycle {
  if (typeof cwd !== "string" || !cwd.startsWith("/") || cwd.includes("\u0000")) {
    throw new TypeError("invalid project lifecycle");
  }
  const root = accessRoot(cwd);
  const sessionsParent = join(tmpdir(), "akeel", "sessions");
  mkdirSync(sessionsParent, { recursive: true, mode: 0o700 });
  requireControlledDirectory(sessionsParent);
  const sessionRoot = mkdtempSync(join(sessionsParent, "session-"));
  requireControlledDirectory(sessionRoot);
  const stagingRoot = join(sessionRoot, "staging");
  try {
    mkdirSync(stagingRoot, { mode: 0o700 });
    writeSessionManifest(sessionRoot);
    writeSessionLock(sessionRoot);
    tryScheduleStagingRetention(sessionsParent, sessionRoot);
  } catch {
    rmSync(sessionRoot, { recursive: true, force: true });
    throw new TypeError("invalid project lifecycle");
  }

  let disposed = false;
  return Object.freeze({
    context: createProjectContext({ cwd, projectRoot: root, stagingRoot }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rmSync(sessionRoot, { recursive: true, force: true });
    },
  });
}
