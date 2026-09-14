import assert from "node:assert/strict";
import test from "node:test";
import { analyzeShellCommand } from "../../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation";

test("Shell analysis carries immutable semantic facts instead of identity sidecars", () => {
  const analysis = analyzeShellCommand("git -C repo diff -- src/app.ts");
  assert.equal(analysis.kind, "complete");
  if (analysis.kind !== "complete") return;
  const facts = (analysis as typeof analysis & { readonly semantic?: unknown }).semantic;
  assert.ok(facts);
  assert.ok(Object.isFrozen(facts));
  assert.deepEqual((facts as { readonly pathBases: readonly string[] }).pathBases, [
    "command-cwd",
    "invocation-cwd",
    "command-cwd",
  ]);
  assert.equal((facts as { readonly hardBoundary: boolean }).hardBoundary, true);
  assert.equal((facts as { readonly recursive: boolean }).recursive, true);
});
