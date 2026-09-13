import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const core = await import("../../../../../packages/access-gate/src/access-gate/access-decision/core/index");

test("the trusted Linux path port preserves lexical and symlink-target traversal evidence", (t) => {
  const createLinuxPathEvidence = (core as Record<string, unknown>).createLinuxPathEvidence;
  assert.equal(typeof createLinuxPathEvidence, "function");

  const root = mkdtempSync(join(tmpdir(), "akeel-path-evidence-"));
  t.after(() => import("node:fs").then(({ rmSync }) => rmSync(root, { recursive: true, force: true })));
  const target = join(root, "target");
  mkdirSync(target);
  const link = join(root, "link");
  symlinkSync(target, link);

  const evidence = (createLinuxPathEvidence as Function)().resolve(root, "link/missing.txt");
  assert.equal(evidence.candidate, join(target, "missing.txt"));
  assert.ok(evidence.traversed.includes(link));
  assert.ok(evidence.traversed.includes(target));
});
