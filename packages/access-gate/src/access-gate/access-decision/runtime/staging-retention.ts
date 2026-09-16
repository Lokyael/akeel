import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_STAGING_DIR_COUNT = 200;
export const MAX_STAGING_SIZE_BYTES = 500 * 1024 * 1024;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const SESSION_PREFIX = "session-";
export const LOCK_FILENAME = "lock.json";
export const MANIFEST_FILENAME = "session.json";
export const STAMP_FILENAME = ".last_gc_check";

export type RetentionOptions = Readonly<{
  readonly now?: number;
  readonly retentionMs?: number;
  readonly maxCount?: number;
  readonly maxSizeBytes?: number;
}>;

type SessionCandidate = Readonly<{
  readonly fullPath: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}>;

export function writeSessionManifest(sessionRoot: string): void {
  writeFileSync(join(sessionRoot, MANIFEST_FILENAME), JSON.stringify({
    schemaVersion: 1,
    kind: "session",
    sessionId: basename(sessionRoot),
    createdAt: Date.now(),
  }), { encoding: "utf8", mode: 0o600 });
}

export function writeSessionLock(sessionRoot: string): void {
  try {
    writeFileSync(join(sessionRoot, LOCK_FILENAME), JSON.stringify({
      pid: process.pid,
      createdAt: Date.now(),
    }), { encoding: "utf8", mode: 0o600 });
  } catch {
    // A missing lock makes an interrupted envelope eligible only after retention.
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "EPERM";
  }
}

function isOwnedSessionEnvelope(sessionPath: string): boolean {
  try {
    const sessionStats = lstatSync(sessionPath);
    const manifestStats = lstatSync(join(sessionPath, MANIFEST_FILENAME));
    if (!sessionStats.isDirectory() || sessionStats.isSymbolicLink() || (sessionStats.mode & 0o022) !== 0 ||
      !manifestStats.isFile() || manifestStats.isSymbolicLink() ||
      typeof process.getuid === "function" && sessionStats.uid !== process.getuid()) return false;
    const manifest = JSON.parse(readFileSync(join(sessionPath, MANIFEST_FILENAME), "utf8"));
    return typeof manifest === "object" && manifest !== null &&
      manifest.schemaVersion === 1 && manifest.kind === "session" &&
      manifest.sessionId === basename(sessionPath);
  } catch {
    return false;
  }
}

function isOrphanDirectory(sessionPath: string): boolean {
  try {
    const lock = JSON.parse(readFileSync(join(sessionPath, LOCK_FILENAME), "utf8"));
    return typeof lock === "object" && lock !== null && typeof lock.pid === "number"
      ? !isProcessAlive(lock.pid)
      : true;
  } catch {
    return true;
  }
}

function computeDirectorySizeBytes(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) total += computeDirectorySizeBytes(fullPath);
        else if (entry.isFile()) total += statSync(fullPath).size;
      } catch {
        // Inaccessible entries are not counted and therefore are not deletion evidence.
      }
    }
  } catch {
    // An inaccessible candidate contributes no quota evidence.
  }
  return total;
}

export function executeRetentionSweep(
  sessionsParent: string,
  currentSessionRoot: string,
  options: RetentionOptions = {},
): void {
  const now = options.now ?? Date.now();
  const retentionMs = options.retentionMs ?? RETENTION_MS;
  const maxCount = options.maxCount ?? MAX_STAGING_DIR_COUNT;
  const maxSizeBytes = options.maxSizeBytes ?? MAX_STAGING_SIZE_BYTES;

  try {
    if (!existsSync(sessionsParent)) return;
    const candidates: SessionCandidate[] = [];
    for (const entry of readdirSync(sessionsParent, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(SESSION_PREFIX)) continue;
      const fullPath = join(sessionsParent, entry.name);
      if (fullPath === currentSessionRoot || !isOwnedSessionEnvelope(fullPath) || !isOrphanDirectory(fullPath)) continue;
      try {
        const stats = statSync(fullPath);
        candidates.push(Object.freeze({
          fullPath,
          mtimeMs: stats.mtimeMs,
          sizeBytes: computeDirectorySizeBytes(fullPath),
        }));
      } catch {
        // Invalid candidates are retained.
      }
    }

    const toDelete = new Set<string>();
    for (const item of candidates) {
      if (now - item.mtimeMs > retentionMs) toDelete.add(item.fullPath);
    }

    const remaining = candidates
      .filter((item) => !toDelete.has(item.fullPath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    while (remaining.length > maxCount) toDelete.add(remaining.shift()!.fullPath);

    let currentTotalSize = remaining.reduce((sum, item) => sum + item.sizeBytes, 0);
    while (currentTotalSize > maxSizeBytes && remaining.length > 0) {
      const oldest = remaining.shift()!;
      toDelete.add(oldest.fullPath);
      currentTotalSize -= oldest.sizeBytes;
    }

    for (const path of toDelete) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // Retention is best-effort and never blocks session startup.
      }
    }
  } catch {
    // Retention is best-effort and never blocks session startup.
  }
}

export function tryScheduleStagingRetention(sessionsParent: string, currentSessionRoot: string): void {
  const stampPath = join(sessionsParent, STAMP_FILENAME);
  const now = Date.now();
  try {
    if (existsSync(stampPath) && now - statSync(stampPath).mtimeMs < CHECK_INTERVAL_MS) return;
    writeFileSync(stampPath, "", { encoding: "utf8", mode: 0o600 });
  } catch {
    return;
  }
  setImmediate(() => executeRetentionSweep(sessionsParent, currentSessionRoot));
}
