import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createProjectContext } from "./project-context";
import type { ProjectContext } from "./project-context";

export type ProjectLifecycle = Readonly<{
  readonly context: ProjectContext;
  readonly dispose: () => void;
}>;

function projectRoot(cwd: string): string {
  let current: string;
  try {
    current = realpathSync(cwd);
    if (!statSync(current).isDirectory()) throw new TypeError("not a directory");
  } catch {
    throw new TypeError("invalid project lifecycle");
  }

  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new TypeError("invalid project lifecycle");
    current = parent;
  }
}

export function createProjectLifecycle(cwd: string): ProjectLifecycle {
  if (typeof cwd !== "string" || !cwd.startsWith("/") || cwd.includes("\u0000")) {
    throw new TypeError("invalid project lifecycle");
  }
  const root = projectRoot(cwd);
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
