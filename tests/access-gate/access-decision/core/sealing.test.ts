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

test("canonical compilation is immutable and exposes no ledger fields", () => {
  const compilation = compileDirect(request);
  assert.equal(isCanonicalReject(compilation), false);
  if (isCanonicalReject(compilation)) return;

  assert.equal(Object.isFrozen(compilation), true);
  assert.deepEqual(Object.keys(compilation), []);
});

test("admission rejects a forged canonical compilation without throwing", () => {
  const compilation = compileDirect(request);
  assert.equal(isCanonicalReject(compilation), false);
  if (isCanonicalReject(compilation)) return;

  const forged = Object.create(Object.getPrototypeOf(compilation));
  assert.doesNotThrow(() => {
    assert.equal(projectAdmission(forged), undefined);
  });
});

test("policy rejects a forged admission plan without throwing", () => {
  const compilation = compileDirect(request);
  const admission = projectAdmission(compilation);
  assert.ok(admission);

  const forged = Object.create(Object.getPrototypeOf(admission));
  assert.doesNotThrow(() => {
    assert.deepEqual(evaluateAdmission(forged, freezePolicySnapshot({ read: "allow", write: "ask" })), {
      kind: "deny",
      code: "invalid-request",
    });
  });
});
