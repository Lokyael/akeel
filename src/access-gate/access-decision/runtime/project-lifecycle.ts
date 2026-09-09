import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectContext } from "./project-context";
import type { ProjectContext } from "./project-context";

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

export function createProjectLifecycle(cwd: string): ProjectLifecycle {
  if (typeof cwd !== "string" || !cwd.startsWith("/") || cwd.includes("\u0000")) {
    throw new TypeError("invalid project lifecycle");
  }
  const root = accessRoot(cwd);
  const stagingParent = join(tmpdir(), "akeel");
  mkdirSync(stagingParent, { recursive: true });
  const stagingRoot = mkdtempSync(join(stagingParent, "access-decision-"));
  let disposed = false;
  return Object.freeze({
    context: createProjectContext({ cwd, projectRoot: root, stagingRoot }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rmSync(stagingRoot, { recursive: true, force: true });
    },
  });
}
