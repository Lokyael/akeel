import assert from "node:assert/strict";
import test from "node:test";
import { createProjectContext } from "../../../../packages/access-gate/src/access-gate/access-decision";

test("project context freezes cwd, project root, and staging root", () => {
  const context = createProjectContext({
    cwd: "/workspace/project/src",
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });

  assert.deepEqual(context, {
    cwd: "/workspace/project/src",
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  assert.equal(Object.isFrozen(context), true);
});

test("project context rejects unknown fields and non-absolute paths", () => {
  assert.throws(
    () => createProjectContext({ cwd: "/", projectRoot: "/project", stagingRoot: "/tmp", extra: true }),
    { name: "TypeError", message: "invalid project context" },
  );
  assert.throws(
    () => createProjectContext({ cwd: "/", projectRoot: "project", stagingRoot: "/tmp" }),
    { name: "TypeError", message: "invalid project context" },
  );
});
