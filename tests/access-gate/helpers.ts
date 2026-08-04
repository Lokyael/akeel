import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { CompilerContext } from "../../src/access-gate/gate/access-request";
import { resolveProfiles } from "../../src/access-gate/profile/resolve";
import type { ResolvedProfiles } from "../../src/access-gate/profile/types";

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

/** Load and resolve the built-in profiles from builtins.json (fail-fast at module load). */
export function loadBuiltinProfiles(): ResolvedProfiles {
  const builtinsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/access-gate/profile/builtins.json");
  const result = resolveProfiles(JSON.parse(readFileSync(builtinsPath, "utf-8")));
  if (!result.ok) throw new Error(`builtins resolution failed: ${result.error}`);
  return result.value;
}
