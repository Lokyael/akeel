import assert from "node:assert/strict";
import test from "node:test";
import { hardDeny, profileDeny, requireApproval } from "../../src/access-gate/gate/decision/decision-builder";

test("hard deny gets guidance from catalog", () => {
  const d = hardDeny("dynamic-shell", "glob in command");
  assert.equal(d.disposition, "deny");
  if (d.disposition === "deny") {
    assert.equal(d.code, "dynamic-shell");
    assert.equal(d.enforcement, "hard");
    assert.ok(d.guidance.length > 0, "guidance should come from catalog");
    assert.equal(d.guidance[0]!.id, "batch-inspection-tools");
  }
});

test("security-sensitive code has no guidance", () => {
  const d = hardDeny("threat", "suspicious");
  assert.equal(d.disposition, "deny");
  if (d.disposition === "deny") {
    assert.equal(d.code, "threat");
    assert.deepEqual(d.guidance, []);
  }
});

test("profile deny gets guidance from catalog", () => {
  const d = profileDeny("path-denied", "write denied");
  assert.equal(d.disposition, "deny");
  if (d.disposition === "deny") {
    assert.equal(d.code, "path-denied");
    assert.equal(d.enforcement, "profile");
    assert.ok(d.guidance.length > 0, "path-denied should have profile-restriction guidance");
  }
});

test("approval decision", () => {
  const d = requireApproval([{ kind: "path", subject: "write: f.ts" }]);
  assert.equal(d.disposition, "ask");
  if (d.disposition === "ask") {
    assert.equal(d.code, "approval-required");
    assert.equal(d.approval.scope, "tool-call");
  }
});

test("resource-limit gets split-supported-commands guidance", () => {
  const d = hardDeny("resource-limit", "too large");
  assert.equal(d.disposition, "deny");
  if (d.disposition === "deny") {
    assert.ok(d.guidance.length > 0);
    assert.equal(d.guidance[0]!.id, "split-supported-commands");
  }
});
