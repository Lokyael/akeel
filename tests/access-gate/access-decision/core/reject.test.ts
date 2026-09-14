import assert from "node:assert/strict";
import test from "node:test";
import {
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

const env = createCompileEnvironment({
  cwd: "/workspace/project",
  pathEvidence: createLinuxPathEvidence(),
});

test("canonical reject recognition produces complete closed shape", () => {
  const rejected = compileManagedCall({ surface: "read", arguments: {} }, env);
  assert.equal("kind" in rejected && rejected.kind === "reject", true);
  if (!("kind" in rejected) || rejected.kind !== "reject") return;

  assert.equal(rejected.code, "invalid-request");
  assert.equal(rejected.resourceClass, "input");
  assert.equal(rejected.anchor, "request");
});
