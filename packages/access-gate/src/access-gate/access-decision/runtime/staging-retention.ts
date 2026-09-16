import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_STAGING_DIR_COUNT = 200;
export const MAX_STAGING_SIZE_BYTES = 500 * 1024 * 1024;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const STAGING_PREFIX = "stage-";
export const LOCK_FILENAME = ".session.lock";
export const STAMP_FILENAME = ".last_gc_check";

export type RetentionOptions = Readonly<{
  readonly now?: number;
  readonly retentionMs?: number;
  readonly maxCount?: number;
  readonly maxSizeBytes?: number;
}>;

type StagingDirCandidate = Readonly<{
  readonly fullPath: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}>;

export function writeSessionLock(stagingRoot: string): void {
  try {
    const lockPath = join(stagingRoot, LOCK_FILENAME);
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf8");
  } catch {
    // Non-fatal error during lock writing
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

function isOrphanDirectory(stagingPath: string): boolean {
  try {
    const lockPath = join(stagingPath, LOCK_FILENAME);
    if (!existsSync(lockPath)) return true;
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (typeof lock === "object" && lock !== null && typeof lock.pid === "number") {
      return !isProcessAlive(lock.pid);
    }
    return true;
  } catch {
    return true;
  }
}

function computeDirectorySizeBytes(dirPath: string): number {
  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += computeDirectorySizeBytes(fullPath);
        } else if (entry.isFile()) {
          total += statSync(fullPath).size;
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Skip unreadable directory
  }
  return total;
}

export function executeRetentionSweep(
  stagingParent: string,
  currentStagingRoot: string,
  options: RetentionOptions = {},
): void {
  const now = options.now ?? Date.now();
  const retentionMs = options.retentionMs ?? RETENTION_MS;
  const maxCount = options.maxCount ?? MAX_STAGING_DIR_COUNT;
  const maxSizeBytes = options.maxSizeBytes ?? MAX_STAGING_SIZE_BYTES;

  try {
    if (!existsSync(stagingParent)) return;
    const entries = readdirSync(stagingParent, { withFileTypes: true });
    const candidates: StagingDirCandidate[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(STAGING_PREFIX)) continue;
      const fullPath = join(stagingParent, entry.name);
      if (fullPath === currentStagingRoot) continue;
      if (!isOrphanDirectory(fullPath)) continue;

      try {
        const stats = statSync(fullPath);
        candidates.push(Object.freeze({
          fullPath,
          mtimeMs: stats.mtimeMs,
          sizeBytes: computeDirectorySizeBytes(fullPath),
        }));
      } catch {
        // Skip invalid directory entry
      }
    }

    const toDelete = new Set<string>();

    // Step 1: TTL eviction (older than 7 days)
    for (const item of candidates) {
      if (now - item.mtimeMs > retentionMs) {
        toDelete.add(item.fullPath);
      }
    }

    // Step 2: LRU eviction for remaining candidates (oldest first)
    const remaining = candidates
      .filter((item) => !toDelete.has(item.fullPath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Enforce count quota
    while (remaining.length > maxCount) {
      const oldest = remaining.shift()!;
      toDelete.add(oldest.fullPath);
    }

    // Enforce size quota
    let currentTotalSize = remaining.reduce((sum, item) => sum + item.sizeBytes, 0);
    while (currentTotalSize > maxSizeBytes && remaining.length > 0) {
      const oldest = remaining.shift()!;
      toDelete.add(oldest.fullPath);
      currentTotalSize -= oldest.sizeBytes;
    }

    // Step 3: Remove selected directories
    for (const path of toDelete) {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // Non-fatal deletion failure
      }
    }
  } catch {
    // Non-fatal sweep failure
  }
}

export function tryScheduleStagingRetention(
  stagingParent: string,
  currentStagingRoot: string,
): void {
  const stampPath = join(stagingParent, STAMP_FILENAME);
  const now = Date.now();

  try {
    if (existsSync(stampPath)) {
      const stampStat = statSync(stampPath);
      if (now - stampStat.mtimeMs < CHECK_INTERVAL_MS) {
        return;
      }
    }
    writeFileSync(stampPath, "", "utf8");
  } catch {
    return;
  }

  setImmediate(() => {
    executeRetentionSweep(stagingParent, currentStagingRoot);
  });
}
