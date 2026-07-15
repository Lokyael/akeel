/**
 * security-gate/snapshots.ts — File backup before write/edit for /rollback recovery.
 *
 * Uses manifest.jsonl for metadata (short keys), UUID-named backup files.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, appendFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { SnapshotEntry } from "./types";

const SNAPSHOT_DIR = ".pi-keel/snapshots";
const MANIFEST = "manifest.jsonl";
const DEFAULT_MAX_SNAPSHOTS = 10;

// ─── Path helpers ───

function snapDir(cwd: string): string {
  return join(cwd, SNAPSHOT_DIR);
}

function manifestPath(cwd: string): string {
  return join(snapDir(cwd), MANIFEST);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── Manifest I/O ───

interface ManifestEntry {
  b: string;   // backup filename (UUID)
  f: string;   // original file path
  t: string;   // tool: "write" | "edit"
  ts: string;  // ISO timestamp
  s: number;   // bytes
}

function readManifest(cwd: string): ManifestEntry[] {
  const mp = manifestPath(cwd);
  if (!existsSync(mp)) return [];
  const entries: ManifestEntry[] = [];
  for (const line of readFileSync(mp, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { entries.push(JSON.parse(trimmed)); }
    catch { /* skip corrupt lines */ }
  }
  return entries;
}

function writeManifest(cwd: string, entries: ManifestEntry[]): void {
  const mp = manifestPath(cwd);
  ensureDir(dirname(mp));
  writeFileSync(mp, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
}

function appendManifest(cwd: string, entry: ManifestEntry): void {
  const mp = manifestPath(cwd);
  ensureDir(dirname(mp));
  appendFileSync(mp, JSON.stringify(entry) + "\n");
}

// ─── Old snapshot cleanup ───

function clearOldSnapshots(cwd: string): void {
  const sd = snapDir(cwd);
  if (!existsSync(sd)) return;
  for (const name of readdirSync(sd)) {
    unlinkSync(join(sd, name));
  }
}

// ─── Public API ───

const cleanedDirs = new Set<string>();

function ensureClean(cwd: string): void {
  if (cleanedDirs.has(cwd)) return;
  cleanedDirs.add(cwd);
  clearOldSnapshots(cwd);
}

// Create a snapshot of a file before it is modified.
export function createSnapshot(
  cwd: string,
  filePath: string,
  tool: "write" | "edit"
): SnapshotEntry | null {
  ensureClean(cwd);

  const fullPath = join(cwd, filePath);
  if (!existsSync(fullPath)) return null;

  const sd = snapDir(cwd);
  ensureDir(sd);

  const stat = statSync(fullPath);
  const backupName = randomUUID().replace(/-/g, "");
  const backupPath = join(sd, backupName);

  copyFileSync(fullPath, backupPath);

  const entry: SnapshotEntry = {
    file: filePath,
    backup: join(SNAPSHOT_DIR, backupName),
    timestamp: new Date().toISOString(),
    tool,
    bytes: stat.size,
  };

  // Write manifest
  appendManifest(cwd, {
    b: backupName,
    f: filePath,
    t: tool,
    ts: entry.timestamp,
    s: stat.size,
  });

  // Cleanup old snapshots for this file
  pruneSnapshots(cwd, filePath, DEFAULT_MAX_SNAPSHOTS);

  return entry;
}

// List snapshots, optionally filtered by file.
export function listSnapshots(cwd: string, fileFilter?: string): SnapshotEntry[] {
  ensureClean(cwd);

  const sd = snapDir(cwd);
  const entries: ManifestEntry[] = readManifest(cwd);

  // Filter by file, newest first
  const filtered = fileFilter
    ? entries.filter(e => e.f === fileFilter)
    : entries;
  filtered.sort((a, b) => b.ts.localeCompare(a.ts));

  return filtered.map(e => ({
    file: e.f,
    backup: join(SNAPSHOT_DIR, e.b),
    timestamp: e.ts,
    tool: e.t as "write" | "edit",
    bytes: e.s,
  }));
}

// Restore the most recent snapshot (optionally for a specific file).
export function restoreSnapshot(cwd: string, filePath?: string): SnapshotEntry | null {
  const snapshots = listSnapshots(cwd, filePath);
  if (snapshots.length === 0) return null;

  const target = snapshots[0];
  const sourcePath = join(cwd, target.backup);
  const destPath = join(cwd, target.file);

  if (!existsSync(sourcePath)) return null;

  ensureDir(dirname(destPath));
  copyFileSync(sourcePath, destPath);
  return target;
}

// Restore the last N snapshots across all files.
export function restoreLastN(cwd: string, count: number): SnapshotEntry[] {
  const all = listSnapshots(cwd);
  const restored: SnapshotEntry[] = [];
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
  const sd = snapDir(cwd);
  if (!existsSync(sd)) return 0;

  const count = readManifest(cwd).length;
  rmSync(sd, { recursive: true, force: true });
  cleanedDirs.delete(cwd);
  return count;
}

// ─── Internal ───

function pruneSnapshots(cwd: string, filePath: string, max: number): void {
  const entries = readManifest(cwd);
  const fileEntries = entries.filter(e => e.f === filePath);

  if (fileEntries.length <= max) return;

  // Sort newest first, delete oldest
  fileEntries.sort((a, b) => b.ts.localeCompare(a.ts));
  const toDelete = fileEntries.slice(max);
  const sd = snapDir(cwd);

  for (const e of toDelete) {
    try { unlinkSync(join(sd, e.b)); } catch { /* ignore */ }
  }

  // Rewrite manifest without deleted entries
  const keep = new Set(toDelete.map(e => e.b));
  writeManifest(cwd, entries.filter(e => !keep.has(e.b)));
}
