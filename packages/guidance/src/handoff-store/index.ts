import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

const MAX_HANDOFF_BYTES = 1_048_576;

type Source = Readonly<{ readonly sessionId: string; readonly cwd: string }>;
type Receipt = Readonly<{
  readonly schemaVersion: 1;
  readonly handoffId: string;
  readonly digest: string;
  readonly bytes: number;
  readonly sourceSessionId: string;
}>;

export type HandoffStore = Readonly<{
  readonly publish: (source: Source, content: string) => Readonly<{ readonly path: string; readonly digest: string; readonly bytes: number }>;
  readonly verify: (path: string) => Readonly<{ readonly content: string; readonly digest: string; readonly bytes: number; readonly sourceSessionId: string }>;
}>;

export type HandoffStoreOptions = Readonly<{
  readonly root: string;
  readonly random?: (bytes: number) => Buffer;
}>;

function invalid(): never {
  throw new TypeError("handoff-store-invalid");
}

function denied(): never {
  throw new Error("handoff-store-denied");
}

function digest(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function ensureDirectory(path: string, create = false): void {
  if (create) mkdirSync(path, { recursive: true, mode: 0o700 });
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o022) !== 0) denied();
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) denied();
}

function atomicNoClobber(path: string, content: string, random: (bytes: number) => Buffer): void {
  const temporary = join(dirname(path), `.tmp-${random(12).toString("hex")}`);
  let fd: number | undefined;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    linkSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch { /* exact temporary cleanup is best-effort */ }
  }
}

export function createHandoffStore(options: HandoffStoreOptions): HandoffStore {
  if (typeof options?.root !== "string" || !options.root.startsWith("/")) invalid();
  const root = resolve(options.root);
  const random = options.random ?? randomBytes;
  ensureDirectory(root, true);

  function parsePath(path: string): Readonly<{ handoffId: string; handoffRoot: string }> {
    if (typeof path !== "string" || basename(path) !== "handoff.md") denied();
    const handoffRoot = dirname(resolve(path));
    const handoffId = basename(handoffRoot);
    if (!/^handoff-[a-f0-9]{32}$/.test(handoffId) || dirname(handoffRoot) !== root) denied();
    ensureDirectory(handoffRoot);
    return { handoffId, handoffRoot };
  }

  return Object.freeze({
    publish(source, content) {
      if (typeof source?.sessionId !== "string" || source.sessionId.length === 0 || source.sessionId.length > 128 ||
        typeof source.cwd !== "string" || !source.cwd.startsWith("/") || typeof content !== "string" || content.includes("\u0000")) invalid();
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > MAX_HANDOFF_BYTES) invalid();

      let handoffId = "";
      let handoffRoot = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        handoffId = `handoff-${random(16).toString("hex")}`;
        handoffRoot = join(root, handoffId);
        try {
          mkdirSync(handoffRoot, { mode: 0o700 });
          break;
        } catch (error) {
          if (attempt === 7 || typeof error !== "object" || error === null || !("code" in error) || error.code !== "EEXIST") throw error;
        }
      }
      const contentDigest = digest(content);
      atomicNoClobber(join(handoffRoot, "handoff.json"), JSON.stringify({
        schemaVersion: 1,
        handoffId,
        source,
      }), random);
      const path = join(handoffRoot, "handoff.md");
      atomicNoClobber(path, content, random);
      const receipt: Receipt = Object.freeze({
        schemaVersion: 1,
        handoffId,
        digest: contentDigest,
        bytes,
        sourceSessionId: source.sessionId,
      });
      atomicNoClobber(join(handoffRoot, "receipt.json"), JSON.stringify(receipt), random);
      return Object.freeze({ path, digest: contentDigest, bytes });
    },

    verify(path) {
      const { handoffId, handoffRoot } = parsePath(path);
      try {
        const manifest: unknown = JSON.parse(readFileSync(join(handoffRoot, "handoff.json"), "utf8"));
        const receipt: unknown = JSON.parse(readFileSync(join(handoffRoot, "receipt.json"), "utf8"));
        if (typeof manifest !== "object" || manifest === null ||
          (manifest as { schemaVersion?: unknown }).schemaVersion !== 1 ||
          (manifest as { handoffId?: unknown }).handoffId !== handoffId ||
          typeof (manifest as { source?: unknown }).source !== "object" || (manifest as { source?: unknown }).source === null ||
          typeof receipt !== "object" || receipt === null || (receipt as Receipt).schemaVersion !== 1 ||
          (receipt as Receipt).handoffId !== handoffId || typeof (receipt as Receipt).digest !== "string" ||
          typeof (receipt as Receipt).bytes !== "number" || typeof (receipt as Receipt).sourceSessionId !== "string" ||
          (manifest as { source: { sessionId?: unknown } }).source.sessionId !== (receipt as Receipt).sourceSessionId) denied();
        const content = readFileSync(join(handoffRoot, "handoff.md"), "utf8");
        const typed = receipt as Receipt;
        if (Buffer.byteLength(content, "utf8") !== typed.bytes || digest(content) !== typed.digest) denied();
        return Object.freeze({ content, digest: typed.digest, bytes: typed.bytes, sourceSessionId: typed.sourceSessionId });
      } catch (error) {
        if (error instanceof Error && error.message === "handoff-store-denied") throw error;
        denied();
      }
    },
  });
}
