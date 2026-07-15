/**
 * snapshots.test.ts — Unit tests for snapshot create/list/restore/clean.
 *
 * Run: npx tsx extensions/security-gate/snapshots.test.ts
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createSnapshot, listSnapshots, restoreSnapshot, restoreLastN, cleanSnapshots } from "./snapshots";

// ─── Helpers ───

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { console.error("  FAIL:", msg); failed++; }
}

const TMP = join("/tmp", "pi-keel-snapshot-test-" + Date.now());
const snapDir = join(TMP, ".pi-keel", "snapshots");

function setup(): void {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function teardown(): void {
  rmSync(TMP, { recursive: true, force: true });
}

function writeFile(name: string, content: string): void {
  const dir = join(TMP, name.split("/").slice(0, -1).join("/"));
  if (dir !== TMP && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(TMP, name), content);
}

// ═══════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════

setup();

// ── 1. createSnapshot creates backup and manifest ──

writeFile("a.txt", "hello");
const snap1 = createSnapshot(TMP, "a.txt", "write");
assert(snap1 !== null, "createSnapshot returns entry");
assert(snap1!.file === "a.txt", "entry.file is correct");
assert(snap1!.tool === "write", "entry.tool is write");
assert(snap1!.bytes === 5, "entry.bytes is correct");
assert(existsSync(join(snapDir, snap1!.backup.split("/").pop()!)), "backup file exists");
assert(existsSync(join(snapDir, "manifest.jsonl")), "manifest file exists");

// ── 2. listSnapshots returns entries ──

const list1 = listSnapshots(TMP);
assert(list1.length === 1, "listSnapshots returns 1 entry");
assert(list1[0].file === "a.txt", "list entry file correct");
assert(list1[0].tool === "write", "list entry tool correct");

// ── 3. listSnapshots filters by file ──

writeFile("b.txt", "world");
createSnapshot(TMP, "b.txt", "edit");

const list2 = listSnapshots(TMP);
assert(list2.length === 2, "2 total snapshots");

const filtered = listSnapshots(TMP, "a.txt");
assert(filtered.length === 1, "filtered returns 1");
assert(filtered[0].file === "a.txt", "filtered file correct");

// ── 4. restoreSnapshot restores file content ──

writeFile("a.txt", "modified content");
assert(readFileSync(join(TMP, "a.txt"), "utf-8") === "modified content", "file modified");

const restored = restoreSnapshot(TMP, "a.txt");
assert(restored !== null, "restoreSnapshot returns entry");
assert(readFileSync(join(TMP, "a.txt"), "utf-8") === "hello", "file restored to original content");

// ── 5. restoreSnapshot with no filter restores most recent ──

const nofilter = restoreSnapshot(TMP);
assert(nofilter !== null, "restoreSnapshot (no filter) returns entry");

// ── 6. restoreSnapshot returns null for non-existent file ──

const missing = restoreSnapshot(TMP, "nonexistent.txt");
assert(missing === null, "restoreSnapshot returns null for missing file");

// ── 7. listSnapshots returns newest first ──

const newest = listSnapshots(TMP);
assert(newest.length >= 2, "has entries");
// First entry should be most recent (after restore, a.txt was most recently snapped)
assert(newest[0].timestamp >= newest[newest.length - 1].timestamp, "newest first");

// ── 8. pruneSnapshots keeps only max entries per file ──

// Create 12 snapshots for c.txt (max is 10)
for (let i = 0; i < 12; i++) {
  writeFile("c.txt", "content" + i);
  createSnapshot(TMP, "c.txt", "write");
}
const cSnaps = listSnapshots(TMP, "c.txt");
assert(cSnaps.length <= 10, "pruned to max 10 per file");

// ── 9. createSnapshot on non-existent file returns null ──

const nosuch = createSnapshot(TMP, "no-such-file.txt", "write");
assert(nosuch === null, "createSnapshot returns null for missing file");

// ── 10. nested file paths ──

writeFile("src/lib/utils.ts", "export const x = 1;");
const nested = createSnapshot(TMP, "src/lib/utils.ts", "edit");
assert(nested !== null, "nested path snapshot created");
assert(nested!.file === "src/lib/utils.ts", "nested path preserved");

const nestedList = listSnapshots(TMP, "src/lib/utils.ts");
assert(nestedList.length === 1, "nested path found in list");
assert(nestedList[0].tool === "edit", "nested tool type preserved");

// ── 11. two files with same basename don't collide ──

writeFile("src/a/config.ts", "a");
writeFile("lib/b/config.ts", "b");
createSnapshot(TMP, "src/a/config.ts", "write");
createSnapshot(TMP, "lib/b/config.ts", "edit");

const configA = listSnapshots(TMP, "src/a/config.ts");
const configB = listSnapshots(TMP, "lib/b/config.ts");
assert(configA.length === 1, "src/a/config.ts has 1 entry");
assert(configB.length === 1, "lib/b/config.ts has 1 entry");
assert(configA[0].file !== configB[0].file, "different files, different paths");
assert(configA[0].backup !== configB[0].backup, "different backup files");

// ── 12. cleanSnapshots removes everything ──

const count = cleanSnapshots(TMP);
assert(count > 0, "cleanSnapshots returns count");
assert(!existsSync(snapDir), "snapshot dir removed");

// ── 13. recreate after clean works ──

writeFile("after-clean.txt", "data");
const after = createSnapshot(TMP, "after-clean.txt", "write");
assert(after !== null, "createSnapshot works after clean");

// ═══════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════

console.log("\n" + "=".repeat(45));
console.log("  RESULTS:", passed, "passed,", failed, "failed");
console.log("=".repeat(45));

teardown();

if (failed > 0) process.exit(1);
