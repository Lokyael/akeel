import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  MandatoryBoundaries,
  projectUnifiedAdmission,
  UnifiedAdmissionPlan,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";
import {
  CanonicalCompilation,
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

const env = createCompileEnvironment({
  cwd: "/workspace/project",
  pathEvidence: createLinuxPathEvidence(),
});

const policy = freezeUnifiedPolicySnapshot({
  paths: { read: "allow", write: "ask", edit: "deny", list: "deny", search: "deny", allowedRoots: [], blockedRoots: [], blockedPaths: [] },
  commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
});
const boundaries = createMandatoryBoundaries({ credentialRoots: ["/__test-agent-dir__"] });

test("canonical compilation is immutable and exposes no ledger fields", () => {
  const compilation = compileManagedCall({ surface: "read", arguments: { path: "README.md" } }, env);
  assert.ok(compilation instanceof CanonicalCompilation);

  assert.equal(Object.isFrozen(compilation), true);
  assert.deepEqual(Object.keys(compilation), []);
});

test("admission rejects a forged canonical compilation without throwing", () => {
  const compilation = compileManagedCall({ surface: "read", arguments: { path: "README.md" } }, env);
  assert.ok(compilation instanceof CanonicalCompilation);

  const copied = { ...compilation };
  assert.doesNotThrow(() => {
    assert.equal(projectUnifiedAdmission(copied), undefined);
  });

  const forgedProto = Object.create(CanonicalCompilation.prototype);
  assert.doesNotThrow(() => {
    assert.equal(projectUnifiedAdmission(forgedProto), undefined);
  });
});

test("policy rejects a forged admission plan without throwing", () => {
  const compilation = compileManagedCall({ surface: "read", arguments: { path: "README.md" } }, env);
  const admission = projectUnifiedAdmission(compilation);
  assert.ok(admission);

  const copied = { ...admission };
  assert.doesNotThrow(() => {
    assert.deepEqual(authorizeAdmission(copied, boundaries, policy), {
      kind: "deny",
      code: "invalid-admission",
    });
  });

  const forgedProto = Object.create(UnifiedAdmissionPlan.prototype);
  assert.doesNotThrow(() => {
    assert.deepEqual(authorizeAdmission(forgedProto, boundaries, policy), {
      kind: "deny",
      code: "invalid-admission",
    });
  });
});

test("authorization rejects forged mandatory boundaries without throwing", () => {
  const compilation = compileManagedCall({ surface: "read", arguments: { path: "README.md" } }, env);
  const admission = projectUnifiedAdmission(compilation);
  assert.ok(admission);

  const copied = { ...boundaries };
  assert.doesNotThrow(() => {
    assert.deepEqual(authorizeAdmission(admission, copied, policy), {
      kind: "deny",
      code: "invalid-admission",
    });
  });

  const forgedProto = Object.create(MandatoryBoundaries.prototype);
  assert.doesNotThrow(() => {
    assert.deepEqual(authorizeAdmission(admission, forgedProto, policy), {
      kind: "deny",
      code: "invalid-admission",
    });
  });
});
