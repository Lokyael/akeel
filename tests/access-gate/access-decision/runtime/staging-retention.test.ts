import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeRetentionSweep,
  isProcessAlive,
  tryScheduleStagingRetention,
  writeSessionLock,
  LOCK_FILENAME,
  STAMP_FILENAME,
} from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/staging-retention";

function createTestHarness(): { readonly stagingParent: string; readonly cleanup: () => void } {
  const stagingParent = mkdtempSync(join(tmpdir(), "akeel-retention-test-"));
  return {
    stagingParent,
    cleanup: () => rmSync(stagingParent, { recursive: true, force: true }),
  };
}

function makeStageDir(parent: string, name: string, mtimeMs?: number): string {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  if (mtimeMs !== undefined) {
    const time = new Date(mtimeMs);
    utimesSync(dir, time, time);
  }
  return dir;
}

test("writeSessionLock writes valid json with process pid and timestamp", () => {
  const harness = createTestHarness();
  try {
    const stageDir = makeStageDir(harness.stagingParent, "stage-active");
    writeSessionLock(stageDir);

    const lockPath = join(stageDir, LOCK_FILENAME);
    assert.equal(existsSync(lockPath), true);
    const content = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.equal(content.pid, process.pid);
    assert.equal(typeof content.createdAt, "number");
  } finally {
    harness.cleanup();
  }
});

test("isProcessAlive correctly detects current and non-existent processes", () => {
  assert.equal(isProcessAlive(process.pid), true);
  // Negative or non-safe integer PIDs return false
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(0), false);
  // Extremely high PID does not exist
  assert.equal(isProcessAlive(4_194_304), false);
});

test("retention sweep preserves directories within 7 days TTL under budget", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const dir = makeStageDir(harness.stagingParent, "stage-recent", threeDaysAgo);

    executeRetentionSweep(harness.stagingParent, join(harness.stagingParent, "stage-current"), { now });
    assert.equal(existsSync(dir), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep deletes orphan directories older than 7 days TTL", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    const deadDir = makeStageDir(harness.stagingParent, "stage-old", eightDaysAgo);
    // Write dead lock file
    writeFileSync(join(deadDir, LOCK_FILENAME), JSON.stringify({ pid: 4_194_304, createdAt: eightDaysAgo }), "utf8");
    utimesSync(deadDir, new Date(eightDaysAgo), new Date(eightDaysAgo));

    executeRetentionSweep(harness.stagingParent, join(harness.stagingParent, "stage-current"), { now });
    assert.equal(existsSync(deadDir), false);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep never deletes active session directories even if older than 7 days", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const activeDir = makeStageDir(harness.stagingParent, "stage-active", tenDaysAgo);
    // Lock belongs to current active process
    writeSessionLock(activeDir);
    utimesSync(activeDir, new Date(tenDaysAgo), new Date(tenDaysAgo));

    executeRetentionSweep(harness.stagingParent, join(harness.stagingParent, "stage-current"), { now });
    assert.equal(existsSync(activeDir), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep never deletes the current session staging root", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const currentRoot = makeStageDir(harness.stagingParent, "stage-current", tenDaysAgo);

    executeRetentionSweep(harness.stagingParent, currentRoot, { now });
    assert.equal(existsSync(currentRoot), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep enforces LRU count quota by evicting oldest orphan directories", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const d1 = makeStageDir(harness.stagingParent, "stage-1", now - 5 * 24 * 60 * 60 * 1000);
    const d2 = makeStageDir(harness.stagingParent, "stage-2", now - 4 * 24 * 60 * 60 * 1000);
    const d3 = makeStageDir(harness.stagingParent, "stage-3", now - 3 * 24 * 60 * 60 * 1000);
    const d4 = makeStageDir(harness.stagingParent, "stage-4", now - 2 * 24 * 60 * 60 * 1000);

    // With maxCount = 2, the oldest two (d1 and d2) should be evicted
    executeRetentionSweep(harness.stagingParent, join(harness.stagingParent, "stage-current"), {
      now,
      maxCount: 2,
    });

    assert.equal(existsSync(d1), false);
    assert.equal(existsSync(d2), false);
    assert.equal(existsSync(d3), true);
    assert.equal(existsSync(d4), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep enforces LRU size quota by evicting oldest orphan directories", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const d1 = makeStageDir(harness.stagingParent, "stage-1", now - 5 * 24 * 60 * 60 * 1000);
    writeFileSync(join(d1, "payload.bin"), Buffer.alloc(1024 * 1024 * 2)); // 2MB
    utimesSync(d1, new Date(now - 5 * 24 * 60 * 60 * 1000), new Date(now - 5 * 24 * 60 * 60 * 1000));

    const d2 = makeStageDir(harness.stagingParent, "stage-2", now - 2 * 24 * 60 * 60 * 1000);
    writeFileSync(join(d2, "payload.bin"), Buffer.alloc(1024 * 1024 * 2)); // 2MB
    utimesSync(d2, new Date(now - 2 * 24 * 60 * 60 * 1000), new Date(now - 2 * 24 * 60 * 60 * 1000));

    // With maxSizeBytes = 3MB, d1 (oldest) should be evicted to fit within budget
    executeRetentionSweep(harness.stagingParent, join(harness.stagingParent, "stage-current"), {
      now,
      maxSizeBytes: 3 * 1024 * 1024,
    });

    assert.equal(existsSync(d1), false);
    assert.equal(existsSync(d2), true);
  } finally {
    harness.cleanup();
  }
});

test("retention sweep ignores non-matching directories and files (path jail)", () => {
  const harness = createTestHarness();
  try {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const handoffs = makeStageDir(harness.stagingParent, "handoffs", tenDaysAgo);
    const randomFile = join(harness.stagingParent, "stage-file.txt");
    writeFileSync(randomFile, "data");
    utimesSync(randomFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

    executeRetentionSweep(harness.stagingParent, join(harness.stagingParent, "stage-current"), { now });
    assert.equal(existsSync(handoffs), true);
    assert.equal(existsSync(randomFile), true);
  } finally {
    harness.cleanup();
  }
});

test("tryScheduleStagingRetention throttles execution when stamp is fresh", () => {
  const harness = createTestHarness();
  try {
    const stampPath = join(harness.stagingParent, STAMP_FILENAME);
    // Write fresh stamp (1 hour ago)
    writeFileSync(stampPath, "", "utf8");

    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
    const deadDir = makeStageDir(harness.stagingParent, "stage-old", eightDaysAgo);

    // Should throttle and do nothing
    tryScheduleStagingRetention(harness.stagingParent, join(harness.stagingParent, "stage-current"));
    assert.equal(existsSync(deadDir), true);
  } finally {
    harness.cleanup();
  }
});
