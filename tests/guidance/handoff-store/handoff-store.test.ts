import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHandoffStore } from "../../../packages/guidance/src/handoff-store/index";

function harness() {
  const root = mkdtempSync(join(tmpdir(), "akeel-handoff-store-"));
  chmodSync(root, 0o700);
  return { root, store: createHandoffStore({ root }), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("source session atomically publishes a successor-verifiable handoff", () => {
  const h = harness();
  try {
    const result = h.store.publish({ sessionId: "source-session", cwd: "/workspace/project" }, "# Handoff\n\nContinue T-0116.\n");
    assert.match(result.path, /handoff-[a-f0-9]{32}[/\\]handoff\.md$/);
    assert.equal(statSync(dirname(result.path)).mode & 0o777, 0o700);
    assert.equal(statSync(result.path).mode & 0o777, 0o600);

    const verified = h.store.verify(result.path);
    assert.equal(verified.content, "# Handoff\n\nContinue T-0116.\n");
    assert.equal(verified.digest, result.digest);
    assert.equal(verified.sourceSessionId, "source-session");
  } finally {
    h.cleanup();
  }
});

test("handoff verification rejects paths outside the store and tampering", () => {
  const h = harness();
  const outside = join(tmpdir(), "akeel-handoff-outside.md");
  try {
    writeFileSync(outside, "outside", "utf8");
    assert.throws(() => h.store.verify(outside), /handoff-store-denied/);

    const result = h.store.publish({ sessionId: "source-session", cwd: "/workspace/project" }, "original");
    writeFileSync(result.path, "tampered", "utf8");
    assert.throws(() => h.store.verify(result.path), /handoff-store-denied/);

    const manifestResult = h.store.publish({ sessionId: "source-session", cwd: "/workspace/project" }, "manifest-bound");
    writeFileSync(join(dirname(manifestResult.path), "handoff.json"), JSON.stringify({ schemaVersion: 1, handoffId: "wrong" }), "utf8");
    assert.throws(() => h.store.verify(manifestResult.path), /handoff-store-denied/);
  } finally {
    h.cleanup();
    rmSync(outside, { force: true });
  }
});

test("handoff content and source identity are bounded", () => {
  const h = harness();
  try {
    assert.throws(
      () => h.store.publish({ sessionId: "", cwd: "/workspace/project" }, "content"),
      /handoff-store-invalid/,
    );
    assert.throws(
      () => h.store.publish({ sessionId: "source-session", cwd: "/workspace/project" }, "x".repeat(1_048_577)),
      /handoff-store-invalid/,
    );
  } finally {
    h.cleanup();
  }
});
