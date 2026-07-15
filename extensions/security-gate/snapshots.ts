/**
 * security-gate/snapshots.ts — File backup before write/edit for /rollback recovery.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, dirname } from "node:path";
import type { SnapshotEntry } from "./types";

const SNAPSHOT_DIR = ".pi-keel/snapshots";
const AUDIT_FILE = ".pi-keel/audit.jsonl";
const DEFAULT_MAX_SNAPSHOTS = 10;

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Create a snapshot of a file before it is modified.
export function createSnapshot(
  cwd: string,
  filePath: string,
  tool: "write" | "edit"
): SnapshotEntry | null {
  const fullPath = join(cwd, filePath);
  if (!existsSync(fullPath)) return null;

  const snapDir = join(cwd, SNAPSHOT_DIR);
  ensureDir(snapDir);

  const stat = statSync(fullPath);
  const ts = timestamp();
  const backupName = `${ts}_${basename(filePath)}`;
  const backupPath = join(snapDir, backupName);

  copyFileSync(fullPath, backupPath);

  const entry: SnapshotEntry = {
    file: filePath,
    backup: join(SNAPSHOT_DIR, backupName),
    timestamp: new Date().toISOString(),
    tool,
    bytes: stat.size,
  };

  // Write audit entry
  appendAudit(cwd, entry);

  // Cleanup old snapshots for this file
  pruneSnapshots(cwd, filePath, DEFAULT_MAX_SNAPSHOTS);

  return entry;
}

// List snapshots, optionally filtered by file.
export function listSnapshots(cwd: string, fileFilter?: string): SnapshotEntry[] {
  const snapDir = join(cwd, SNAPSHOT_DIR);
  if (!existsSync(snapDir)) return [];

  const entries: SnapshotEntry[] = [];
  const files = readdirSync(snapDir).sort().reverse(); // newest first

  for (const name of files) {
    // Parse timestamp from filename: YYYY-MM-DDTHH-mm-ss_originalname.ext
    const match = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.+)$/);
    if (!match) continue;

    const ts = match[1].replace(/-/g, (c, i) => i === 13 || i === 16 ? ":" : c === 10 ? "T" : c);
    const originalFile = resolveOriginalPath(cwd, entries, match[2]);

    if (fileFilter && originalFile !== fileFilter) continue;

    const backupPath = join(snapDir, name);
    try {
      const stat = statSync(backupPath);
      entries.push({
        file: originalFile || match[2],
        backup: join(SNAPSHOT_DIR, name),
        timestamp: ts,
        tool: "write",
        bytes: stat.size,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return entries;
}

// Restore the most recent snapshot (optionally for a specific file).
export function restoreSnapshot(cwd: string, filePath?: string): SnapshotEntry | null {
  const snapshots = listSnapshots(cwd, filePath);
  if (snapshots.length === 0) return null;

  const target = snapshots[0];
  const sourcePath = join(cwd, target.backup);
  const destPath = join(cwd, target.file);

  if (!existsSync(sourcePath)) return null;

  // Ensure destination directory exists
  ensureDir(dirname(destPath));

  // Restore from backup
  copyFileSync(sourcePath, destPath);
  return target;
}

// Restore the last N snapshots across all files.
export function restoreLastN(cwd: string, count: number): SnapshotEntry[] {
  const all = listSnapshots(cwd);
  const restored: SnapshotEntry[] = [];

  // Group by file, take most recent per file
  const seen = new Set<string>();
  for (const snap of all) {
    if (seen.has(snap.file)) continue;
    seen.add(snap.file);
    const result = restoreSnapshot(cwd, snap.file);
    if (result) restored.push(result);
    if (restored.length >= count) break;
  }

  return restored;
}

// Delete all snapshots.
export function cleanSnapshots(cwd: string): number {
  const snapDir = join(cwd, SNAPSHOT_DIR);
  if (!existsSync(snapDir)) return 0;

  let count = 0;
  const files = readdirSync(snapDir);
  for (const name of files) {
    unlinkSync(join(snapDir, name));
    count++;
  }
  return count;
}

// ─── Internal helpers ───

function appendAudit(cwd: string, entry: SnapshotEntry): void {
  const auditPath = join(cwd, AUDIT_FILE);
  ensureDir(dirname(auditPath));

  const line = JSON.stringify(entry) + "\n";
  try {
    // Use sync append for reliability during tool calls
    const fd = require("node:fs").openSync(auditPath, "a");
    require("node:fs").writeSync(fd, line);
    require("node:fs").closeSync(fd);
  } catch {
    // Audit failure should not block the tool call
  }
}

function pruneSnapshots(cwd: string, filePath: string, max: number): void {
  const snapshots = listSnapshots(cwd, filePath);
  if (snapshots.length <= max) return;

  // Delete oldest (keep the newest 'max')
  const toDelete = snapshots.slice(max);
  for (const snap of toDelete) {
    const snapPath = join(cwd, snap.backup);
    try { unlinkSync(snapPath); } catch { /* ignore */ }
  }
}

function resolveOriginalPath(cwd: string, existing: SnapshotEntry[], backupName: string): string | null {
  // Try to find a matching snapshot that already has a resolved file path
  for (const e of existing) {
    if (basename(e.backup) === backupName) return e.file;
  }
  return null;
}
