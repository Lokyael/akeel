import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";
import {
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

const compilation = () => compileManagedCall(
  { surface: "read", arguments: { path: "README.md" } },
  createCompileEnvironment({ cwd: "/workspace/project", pathEvidence: createLinuxPathEvidence() }),
);
const policy = freezeUnifiedPolicySnapshot({
  paths: { read: "allow", write: "ask", edit: "deny", list: "deny", search: "deny", allowedRoots: [], blockedRoots: [], blockedPaths: [] },
  commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
});
const boundaries = createMandatoryBoundaries({ credentialRoots: ["/__test-agent-dir__"] });

test("Admission is a sealed opaque projection of a complete Canonical compilation", () => {
  const canonical = compilation();
  assert.equal("kind" in canonical && canonical.kind === "reject", false);
  if ("kind" in canonical && canonical.kind === "reject") return;

  const admission = projectUnifiedAdmission(canonical);
  assert.ok(admission);
  assert.notEqual(admission, canonical);
  assert.equal(Object.isFrozen(admission), true);
  assert.deepEqual(Object.keys(admission), []);
});

test("a structurally copied Admission cannot enter the Authorization facade", () => {
  const admission = projectUnifiedAdmission(compilation());
  assert.ok(admission);

  assert.deepEqual(authorizeAdmission({ ...admission }, boundaries, policy), {
    kind: "deny",
    code: "invalid-admission",
  });
});
