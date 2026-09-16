import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeRetentionSweep,
  isProcessAlive,
  tryScheduleStagingRetention,
  writeSessionLock,
  writeSessionManifest,
  LOCK_FILENAME,
  STAMP_FILENAME,
} from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/staging-retention";

function createTestHarness(): { readonly sessionsParent: string; readonly cleanup: () => void } {
  const sessionsParent = mkdtempSync(join(tmpdir(), "akeel-retention-test-"));
  return {
    sessionsParent,
    cleanup: () => rmSync(sessionsParent, { recursive: true, force: true }),
  };
}

function makeSessionDir(parent: string, name: string, mtimeMs?: number): string {
  const dir = join(parent, name);
  mkdirSync(join(dir, "staging"), { recursive: true });
  chmodSync(dir, 0o700);
  chmodSync(join(dir, "staging"), 0o700);
  writeSessionManifest(dir);
  if (mtimeMs !== undefined) {
    const time = new Date(mtimeMs);
    utimesSync(dir, time, time);
  }
  return dir;
}

test("writeSessionLock writes valid json with process pid and timestamp", () => {
  const harness = createTestHarness();
  try {
    const sessionDir = makeSessionDir(harness.sessionsParent, "session-active");
    writeSessionLock(sessionDir);

    const content = JSON.parse(readFileSync(join(sessionDir, LOCK_FILENAME), "utf8"));
    assert.equal(content.pid, process.pid);
    assert.equal(typeof content.createdAt, "number");
  } finally {
    harness.cleanup();
  }
});

test("isProcessAlive correctly detects current and non-existent processes", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(4_194_304), false);
});

test("retention sweep preserves recent session envelopes under budget", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const dir = makeSessionDir(harness.sessionsParent, "session-recent", now - 3 * 24 * 60 * 60 * 1000);
    executeRetentionSweep(harness.sessionsParent, join(harness.sessionsParent, "session-current"), { now });
    assert.equal(existsSync(dir), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep deletes orphan session envelopes older than 7 days", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const old = now - 8 * 24 * 60 * 60 * 1000;
    const deadDir = makeSessionDir(harness.sessionsParent, "session-old", old);
    writeFileSync(join(deadDir, LOCK_FILENAME), JSON.stringify({ pid: 4_194_304, createdAt: old }), "utf8");
    utimesSync(deadDir, new Date(old), new Date(old));

    executeRetentionSweep(harness.sessionsParent, join(harness.sessionsParent, "session-current"), { now });
    assert.equal(existsSync(deadDir), false);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep never deletes active or current session envelopes", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const old = now - 10 * 24 * 60 * 60 * 1000;
    const active = makeSessionDir(harness.sessionsParent, "session-active", old);
    const current = makeSessionDir(harness.sessionsParent, "session-current", old);
    writeSessionLock(active);
    utimesSync(active, new Date(old), new Date(old));

    executeRetentionSweep(harness.sessionsParent, current, { now });
    assert.equal(existsSync(active), true);
    assert.equal(existsSync(current), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep enforces count quota by evicting oldest orphan sessions", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const d1 = makeSessionDir(harness.sessionsParent, "session-1", now - 5 * 86_400_000);
    const d2 = makeSessionDir(harness.sessionsParent, "session-2", now - 4 * 86_400_000);
    const d3 = makeSessionDir(harness.sessionsParent, "session-3", now - 3 * 86_400_000);
    const d4 = makeSessionDir(harness.sessionsParent, "session-4", now - 2 * 86_400_000);

    executeRetentionSweep(harness.sessionsParent, join(harness.sessionsParent, "session-current"), { now, maxCount: 2 });
    assert.equal(existsSync(d1), false);
    assert.equal(existsSync(d2), false);
    assert.equal(existsSync(d3), true);
    assert.equal(existsSync(d4), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep enforces size quota by evicting oldest orphan sessions", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const d1 = makeSessionDir(harness.sessionsParent, "session-1", now - 5 * 86_400_000);
    writeFileSync(join(d1, "staging", "payload.bin"), Buffer.alloc(2 * 1024 * 1024));
    utimesSync(d1, new Date(now - 5 * 86_400_000), new Date(now - 5 * 86_400_000));
    const d2 = makeSessionDir(harness.sessionsParent, "session-2", now - 2 * 86_400_000);
    writeFileSync(join(d2, "staging", "payload.bin"), Buffer.alloc(2 * 1024 * 1024));
    utimesSync(d2, new Date(now - 2 * 86_400_000), new Date(now - 2 * 86_400_000));

    executeRetentionSweep(harness.sessionsParent, join(harness.sessionsParent, "session-current"), {
      now,
      maxSizeBytes: 3 * 1024 * 1024,
    });
    assert.equal(existsSync(d1), false);
    assert.equal(existsSync(d2), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep ignores unknown entries and symlinked session candidates", () => {
  const harness = createTestHarness();
  const target = mkdtempSync(join(tmpdir(), "akeel-session-target-"));
  try {
    const old = Date.now() - 10 * 86_400_000;
    const unknown = makeSessionDir(harness.sessionsParent, "handoffs", old);
    const file = join(harness.sessionsParent, "session-file.txt");
    writeFileSync(file, "data");
    symlinkSync(target, join(harness.sessionsParent, "session-link"), "dir");

    executeRetentionSweep(harness.sessionsParent, join(harness.sessionsParent, "session-current"), { now: Date.now() });
    assert.equal(existsSync(unknown), true);
    assert.equal(existsSync(file), true);
    assert.equal(existsSync(target), true);
  } finally {
    harness.cleanup();
    rmSync(target, { recursive: true, force: true });
  }
});

test("retention sweep preserves malformed or provenance-mismatched session envelopes", () => {
  const harness = createTestHarness();
  try {
    const old = Date.now() - 10 * 86_400_000;
    const malformed = makeSessionDir(harness.sessionsParent, "session-malformed", old);
    writeFileSync(join(malformed, "session.json"), "{}", "utf8");
    const mismatched = makeSessionDir(harness.sessionsParent, "session-mismatched", old);
    writeFileSync(join(mismatched, "session.json"), JSON.stringify({
      schemaVersion: 1,
      kind: "session",
      sessionId: "session-other",
    }), "utf8");

    executeRetentionSweep(harness.sessionsParent, join(harness.sessionsParent, "session-current"), { now: Date.now() });
    assert.equal(existsSync(malformed), true);
    assert.equal(existsSync(mismatched), true);
  } finally {
    harness.cleanup();
  }
});

test("tryScheduleStagingRetention throttles execution when stamp is fresh", () => {
  const harness = createTestHarness();
  try {
    writeFileSync(join(harness.sessionsParent, STAMP_FILENAME), "", "utf8");
    const old = Date.now() - 8 * 86_400_000;
    const deadDir = makeSessionDir(harness.sessionsParent, "session-old", old);

    tryScheduleStagingRetention(harness.sessionsParent, join(harness.sessionsParent, "session-current"));
    assert.equal(existsSync(deadDir), true);
  } finally {
    harness.cleanup();
  }
});
