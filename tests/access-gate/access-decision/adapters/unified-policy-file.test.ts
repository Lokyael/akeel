import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const adapters = await import("../../../../packages/access-gate/src/access-gate/access-decision/adapters/index");

test("the unified policy loader returns one decoded review fallback", (t) => {
  const loadDecodedPolicyFile = (adapters as Record<string, unknown>).loadDecodedPolicyFile;
  assert.equal(typeof loadDecodedPolicyFile, "function");
  const root = mkdtempSync(join(tmpdir(), "akeel-unified-policy-"));
  t.after(() => import("node:fs").then(({ rmSync }) => rmSync(root, { recursive: true, force: true })));

  assert.deepEqual((loadDecodedPolicyFile as Function)(root).activePreset, "review");
  mkdirSync(join(root, "akeel"));
  writeFileSync(join(root, "akeel", "policy.yaml"), "presets: invalid\n");
  const fallback = (loadDecodedPolicyFile as Function)(root);
  assert.equal(fallback.kind, "enabled");
  assert.equal(fallback.activePreset, "review");
  assert.deepEqual(Reflect.ownKeys(fallback.snapshots.review), ["paths", "commands"]);
});
