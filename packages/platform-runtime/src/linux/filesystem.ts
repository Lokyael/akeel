import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  AtomicPublicationResult,
  AtomicTextPublicationAuthority,
  PrivateFilesystemAuthority,
  RuntimeRoot,
  RuntimeRootAuthority,
} from "../contracts";
import type { PlatformValueIssuer } from "../internal/sealed-values";

const COMPONENT_PATTERN = /^[A-Za-z0-9_.-]+$/u;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function validateComponents(components: readonly string[]): string {
  if (!Array.isArray(components) || components.length === 0) {
    throw new TypeError("invalid relative components");
  }
  for (const component of components) {
    if (typeof component !== "string" || component.length === 0 || component === "." || component === ".." ||
      component.includes("/") || component.includes("\\") || !COMPONENT_PATTERN.test(component)) {
      throw new TypeError(`invalid relative components: ${component}`);
    }
  }
  return join(...components);
}

function resolveControlledTarget(
  root: RuntimeRoot,
  relativeComponents: readonly string[],
  issuer: PlatformValueIssuer,
): Readonly<{ rootPath: string; targetPath: string }> {
  const pathFacts = issuer.readPathProof(root.path);
  if (!pathFacts) throw new TypeError("invalid runtime root path");
  const rel = validateComponents(relativeComponents);
  const targetPath = join(pathFacts.canonicalDisplay, rel);
  return Object.freeze({ rootPath: pathFacts.canonicalDisplay, targetPath });
}

function sha256Digest(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function createLinuxFilesystemAuthorities(
  issuer: PlatformValueIssuer,
  runtimeAuthority: RuntimeRootAuthority,
  requireOpen: () => void,
): Readonly<{
  filesystem: PrivateFilesystemAuthority;
  publication: AtomicTextPublicationAuthority;
}> {
  const filesystem: PrivateFilesystemAuthority = Object.freeze({
    domain: issuer.domain,
    async ensureDirectory(root: RuntimeRoot, relativeComponents: readonly string[]): Promise<void> {
      requireOpen();
      if (!(await runtimeAuthority.verify(root))) throw new Error("runtime root verification failed");
      const { targetPath } = resolveControlledTarget(root, relativeComponents, issuer);
      mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    },
    async readText(
      root: RuntimeRoot,
      relativeComponents: readonly string[],
      maxBytes: number,
    ): Promise<string | undefined> {
      requireOpen();
      if (!(await runtimeAuthority.verify(root))) throw new Error("runtime root verification failed");
      const { targetPath } = resolveControlledTarget(root, relativeComponents, issuer);
      if (!existsSync(targetPath)) return undefined;
      const stats = lstatSync(targetPath);
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maxBytes) {
        throw new Error("target file is invalid or exceeds maxBytes");
      }
      return readFileSync(targetPath, "utf8");
    },
  });

  const publication: AtomicTextPublicationAuthority = Object.freeze({
    domain: issuer.domain,
    async publish(input: Parameters<AtomicTextPublicationAuthority["publish"]>[0]): Promise<AtomicPublicationResult> {
      requireOpen();
      if (typeof input.content !== "string") throw new TypeError("content must be string");
      const bytes = Buffer.byteLength(input.content, "utf8");
      if (bytes > MAX_FILE_BYTES) throw new Error("content exceeds max allowed size");

      if (!(await runtimeAuthority.verify(input.root))) throw new Error("runtime root verification failed");
      const { targetPath } = resolveControlledTarget(input.root, input.relativeComponents, issuer);
      const digest = sha256Digest(input.content);

      if (existsSync(targetPath)) {
        const stats = lstatSync(targetPath);
        if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("target already exists as non-file");
        const existing = readFileSync(targetPath, "utf8");
        if (sha256Digest(existing) === digest) {
          return Object.freeze({ status: "already-published", bytes, digest });
        }
        throw new Error("target already exists with conflicting content");
      }

      const targetDir = dirname(targetPath);
      mkdirSync(targetDir, { recursive: true, mode: 0o700 });

      const tempPath = join(targetDir, `.tmp-${randomBytes(12).toString("hex")}`);
      let fd: number | undefined;
      try {
        fd = openSync(tempPath, "wx", 0o600);
        writeFileSync(fd, input.content, "utf8");
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        linkSync(tempPath, targetPath);
      } finally {
        if (fd !== undefined) closeSync(fd);
        try { unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
      }

      return Object.freeze({ status: "published", bytes, digest });
    },
  });

  return Object.freeze({ filesystem, publication });
}
