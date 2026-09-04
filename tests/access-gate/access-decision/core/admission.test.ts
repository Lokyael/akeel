import assert from "node:assert/strict";
import test from "node:test";
import {
  compileDirect,
  evaluateAdmission,
  freezePolicySnapshot,
  isCanonicalReject,
  projectAdmission,
} from "../../../../src/access-gate/access-decision/core/index";

const request = {
  surface: "read",
  arguments: { path: "README.md" },
  cwd: "/workspace/project",
  hasUI: false,
} as const;

test("Admission is a sealed opaque projection of a complete Canonical compilation", () => {
  const compilation = compileDirect(request);
  assert.equal(isCanonicalReject(compilation), false);
  if (isCanonicalReject(compilation)) return;

  const admission = projectAdmission(compilation);
  assert.ok(admission);
  assert.notEqual(admission, compilation);
  assert.equal(Object.isFrozen(admission), true);
  assert.deepEqual(Object.keys(admission), []);
});

test("a structurally copied Admission cannot enter the Policy Kernel", () => {
  const compilation = compileDirect(request);
  const admission = projectAdmission(compilation);
  assert.ok(admission);

  const copied = { ...admission };
  assert.deepEqual(evaluateAdmission(copied, freezePolicySnapshot({ read: "allow", write: "ask" })), {
    kind: "deny",
    code: "invalid-request",
  });
});
