import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CompilerContext } from "../../src/access-gate/gate/access-request";

/** Shared temp workspace for access-gate tests. */
export function makeContext(
  prefix: string,
  prepare?: (root: string) => void,
): CompilerContext & { cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const staging = mkdtempSync(join(tmpdir(), `${prefix}-staging`));
  prepare?.(root);
  return {
    cwd: root,
    projectRoot: root,
    stagingDir: staging,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(staging, { recursive: true, force: true });
    },
  };
}
