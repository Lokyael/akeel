import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { atomicWriteTextNoClobber, ensureControlledDirectory as requireControlledDir } from "akeel-platform-runtime";

const MAX_ARTIFACT_BYTES = 1_048_576;
const MAX_SLOTS = 4;
const MAX_RUNS_PER_SESSION = 8;
const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export type ArtifactOwner = Readonly<{ readonly sessionId: string; readonly cwd: string }>;
type Owner = ArtifactOwner;
type Child = Readonly<{
  readonly sessionId: string;
  readonly herdrWorkspaceId: string;
  readonly herdrPaneId: string;
}>;
type SlotSpec = Readonly<{
  readonly name: string;
  readonly channel: "packet" | "artifact";
  readonly publisher: "owner" | "child";
  readonly mediaType: "text/markdown" | "application/json";
}>;
type Binding = Readonly<{
  readonly herdrWorkspaceId: string;
  readonly herdrPaneId: string;
  readonly herdrAgentName: string;
}>;
type StoredSlot = SlotSpec & Readonly<{
  readonly maxBytes: number;
  readonly expiresAt?: number;
  readonly capabilityDigest?: string;
}>;
type RunManifest = Readonly<{
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly kind: string;
  readonly createdAt: number;
  readonly owner: Owner;
  readonly slots: readonly StoredSlot[];
}>;
type Receipt = Readonly<{
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly slot: string;
  readonly digest: string;
  readonly bytes: number;
  readonly publisherSessionId: string;
  readonly publishedAt: number;
  readonly capabilityDigest?: string;
}>;

export type ArtifactExchange = Readonly<{
  readonly reserve: (
    owner: Owner,
    input: Readonly<{ readonly kind: string; readonly slots: readonly SlotSpec[] }>,
  ) => Readonly<{
    readonly runId: string;
    readonly paths: Readonly<Record<string, string>>;
    readonly capabilities: Readonly<Record<string, string>>;
  }>; 
  readonly put: (owner: Owner, runId: string, slot: string, content: string) => PublicationResult;
  readonly bind: (owner: Owner, runId: string, slot: string, binding: Binding) => void;
  readonly publish: (capability: string, child: Child, content: string) => PublicationResult;
  readonly status: (owner: Owner, runId: string) => Readonly<{ readonly slots: Readonly<Record<string, "pending" | "published">> }>;
  readonly collect: (owner: Owner, runId: string, slot: string) => Readonly<{ readonly content: string; readonly digest: string; readonly bytes: number }>;
}>;

export type PublicationResult = Readonly<{
  readonly status: "published" | "already-published";
  readonly digest: string;
  readonly bytes: number;
}>;

export type ArtifactRunQuota = Readonly<{
  readonly count: (owner: ArtifactOwner) => number;
  readonly record: (owner: ArtifactOwner, runId: string) => void;
}>;

export type ArtifactExchangeOptions = Readonly<{
  readonly root: string;
  readonly now?: () => number;
  readonly random?: (bytes: number) => Buffer;
  readonly quota?: ArtifactRunQuota;
}>;

function invalid(): never {
  throw new TypeError("artifact-exchange-invalid");
}

function denied(): never {
  throw new Error("artifact-exchange-denied");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIdentity(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function ownerKey(owner: Owner): string {
  return `${owner.sessionId}\u0000${owner.cwd}`;
}

function validateOwner(owner: Owner): void {
  if (!isRecord(owner) || !validIdentity(owner.sessionId) || typeof owner.cwd !== "string" || !owner.cwd.startsWith("/")) invalid();
}

function validateContent(content: string): number {
  if (typeof content !== "string" || content.includes("\u0000")) invalid();
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_ARTIFACT_BYTES) invalid();
  return bytes;
}

function digest(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function ensureControlledDirectory(path: string, create = false): void {
  try {
    requireControlledDir(path, create);
  } catch {
    denied();
  }
}

function atomicNoClobber(path: string, content: string, random: (bytes: number) => Buffer): void {
  try {
    atomicWriteTextNoClobber(path, content, random);
  } catch {
    denied();
  }
}

function parseCapability(capability: string): Readonly<{ runId: string; slot: string }> {
  if (typeof capability !== "string") invalid();
  const parts = capability.split(":");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^run-[a-f0-9]{32}$/.test(parts[1]!) || !SLUG.test(parts[2]!) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3]!)) denied();
  return { runId: parts[1]!, slot: parts[2]! };
}

function fileName(slot: StoredSlot): string {
  return `${slot.name}${slot.mediaType === "text/markdown" ? ".md" : ".json"}`;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === "string" && keys.includes(key));
}

export function createArtifactExchange(options: ArtifactExchangeOptions): ArtifactExchange {
  if (!isRecord(options) || typeof options.root !== "string" || !options.root.startsWith("/")) invalid();
  const now = options.now ?? Date.now;
  const random = options.random ?? randomBytes;
  const sessionRunCounts = new Map<string, number>();
  const quota = options.quota ?? {
    count: (owner: ArtifactOwner) => sessionRunCounts.get(ownerKey(owner)) ?? 0,
    record: (owner: ArtifactOwner) => {
      const key = ownerKey(owner);
      sessionRunCounts.set(key, (sessionRunCounts.get(key) ?? 0) + 1);
    },
  } satisfies ArtifactRunQuota;

  function runRoot(runId: string): string {
    if (!/^run-[a-f0-9]{32}$/.test(runId)) invalid();
    return join(options.root, runId);
  }

  function loadManifest(runId: string): RunManifest {
    try {
      const root = runRoot(runId);
      ensureControlledDirectory(root);
      const control = join(root, "control");
      ensureControlledDirectory(control);
      const value: unknown = JSON.parse(readFileSync(join(control, "run.json"), "utf8"));
      if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "runId", "kind", "createdAt", "owner", "slots"]) ||
        value.schemaVersion !== 1 || value.runId !== runId || typeof value.kind !== "string" ||
        typeof value.createdAt !== "number" || !isRecord(value.owner) || !Array.isArray(value.slots)) denied();
      return value as unknown as RunManifest;
    } catch (error) {
      if (error instanceof Error && error.message === "artifact-exchange-denied") throw error;
      denied();
    }
  }

  function requireOwner(owner: Owner, manifest: RunManifest): void {
    validateOwner(owner);
    if (owner.sessionId !== manifest.owner.sessionId || owner.cwd !== manifest.owner.cwd) denied();
  }

  function requireSlot(manifest: RunManifest, name: string): StoredSlot {
    if (!SLUG.test(name)) invalid();
    const slot = manifest.slots.find((candidate) => candidate.name === name);
    if (!slot) denied();
    return slot;
  }

  function receiptPath(root: string, slot: StoredSlot): string {
    return join(root, "control", "receipts", `${slot.name}.json`);
  }

  function contentPath(root: string, slot: StoredSlot): string {
    return join(root, slot.channel === "artifact" ? "artifacts" : "packet", fileName(slot));
  }

  function readVerified(root: string, manifest: RunManifest, slot: StoredSlot): Readonly<{ content: string; receipt: Receipt }> | undefined {
    const receiptFile = receiptPath(root, slot);
    if (!existsSync(receiptFile)) return undefined;
    try {
      const receipt: unknown = JSON.parse(readFileSync(receiptFile, "utf8"));
      if (!isRecord(receipt) || receipt.schemaVersion !== 1 || receipt.runId !== manifest.runId || receipt.slot !== slot.name ||
        typeof receipt.digest !== "string" || typeof receipt.bytes !== "number" || typeof receipt.publisherSessionId !== "string" ||
        typeof receipt.publishedAt !== "number") denied();
      const content = readFileSync(contentPath(root, slot), "utf8");
      if (Buffer.byteLength(content, "utf8") !== receipt.bytes || digest(content) !== receipt.digest) denied();
      return { content, receipt: receipt as unknown as Receipt };
    } catch (error) {
      if (error instanceof Error && error.message === "artifact-exchange-denied") throw error;
      denied();
    }
  }

  function publishContent(
    manifest: RunManifest,
    slot: StoredSlot,
    publisherSessionId: string,
    content: string,
    capabilityDigest?: string,
  ): PublicationResult {
    const bytes = validateContent(content);
    const contentDigest = digest(content);
    const root = runRoot(manifest.runId);
    const existing = readVerified(root, manifest, slot);
    if (existing) {
      if (existing.receipt.digest !== contentDigest || existing.receipt.publisherSessionId !== publisherSessionId ||
        existing.receipt.capabilityDigest !== capabilityDigest) denied();
      return Object.freeze({ status: "already-published", digest: contentDigest, bytes });
    }

    const target = contentPath(root, slot);
    if (existsSync(target)) {
      const previous = readFileSync(target, "utf8");
      if (digest(previous) !== contentDigest) denied();
    } else {
      atomicNoClobber(target, content, random);
    }
    const receipt: Receipt = Object.freeze({
      schemaVersion: 1,
      runId: manifest.runId,
      slot: slot.name,
      digest: contentDigest,
      bytes,
      publisherSessionId,
      publishedAt: now(),
      ...(capabilityDigest === undefined ? {} : { capabilityDigest }),
    });
    atomicNoClobber(receiptPath(root, slot), JSON.stringify(receipt), random);
    return Object.freeze({ status: "published", digest: contentDigest, bytes });
  }

  return Object.freeze({
    reserve(owner, input) {
      validateOwner(owner);
      if (!isRecord(input) || typeof input.kind !== "string" || !SLUG.test(input.kind) || !Array.isArray(input.slots) ||
        input.slots.length === 0 || input.slots.length > MAX_SLOTS) invalid();
      const count = quota.count(owner);
      if (!Number.isSafeInteger(count) || count < 0 || count >= MAX_RUNS_PER_SESSION) denied();
      ensureControlledDirectory(options.root, true);
      const names = new Set<string>();
      const normalizedSlots: SlotSpec[] = [];
      for (const candidate of input.slots) {
        if (!isRecord(candidate) || typeof candidate.name !== "string" || !SLUG.test(candidate.name) || names.has(candidate.name) ||
          candidate.channel !== "packet" && candidate.channel !== "artifact" ||
          candidate.publisher !== "owner" && candidate.publisher !== "child" ||
          candidate.mediaType !== "text/markdown" && candidate.mediaType !== "application/json" ||
          candidate.publisher === "child" && candidate.channel !== "artifact") invalid();
        names.add(candidate.name);
        normalizedSlots.push(Object.freeze({
          name: candidate.name,
          channel: candidate.channel,
          publisher: candidate.publisher,
          mediaType: candidate.mediaType,
        }));
      }

      let runId = "";
      let root = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        runId = `run-${random(16).toString("hex")}`;
        root = runRoot(runId);
        if (!existsSync(root)) break;
        if (attempt === 7) denied();
      }
      quota.record(owner, runId);
      mkdirSync(root, { mode: 0o700 });
      ensureControlledDirectory(root);
      const capabilities: Record<string, string> = {};
      const paths: Record<string, string> = {};
      const slots: StoredSlot[] = [];
      for (const normalized of normalizedSlots) {
        if (normalized.publisher === "child") {
          const capability = `v1:${runId}:${normalized.name}:${random(32).toString("base64url")}`;
          capabilities[normalized.name] = capability;
          slots.push(Object.freeze({ ...normalized, maxBytes: MAX_ARTIFACT_BYTES, expiresAt: now() + CAPABILITY_TTL_MS, capabilityDigest: digest(capability) }));
        } else {
          slots.push(Object.freeze({ ...normalized, maxBytes: MAX_ARTIFACT_BYTES }));
        }
      }
      for (const directory of ["control", "control/bindings", "control/receipts", "packet", "artifacts", "quarantine", "transport", "transport/herdr"]) {
        mkdirSync(join(root, directory), { recursive: true, mode: 0o700 });
      }
      const manifest: RunManifest = Object.freeze({ schemaVersion: 1, runId, kind: input.kind, createdAt: now(), owner: Object.freeze({ ...owner }), slots: Object.freeze(slots) });
      for (const slot of slots) paths[slot.name] = contentPath(root, slot);
      atomicNoClobber(join(root, "control", "run.json"), JSON.stringify(manifest), random);
      return Object.freeze({ runId, paths: Object.freeze(paths), capabilities: Object.freeze(capabilities) });
    },

    put(owner, runId, name, content) {
      const manifest = loadManifest(runId);
      requireOwner(owner, manifest);
      const slot = requireSlot(manifest, name);
      if (slot.publisher !== "owner") denied();
      return publishContent(manifest, slot, owner.sessionId, content);
    },

    bind(owner, runId, name, binding) {
      const manifest = loadManifest(runId);
      requireOwner(owner, manifest);
      const slot = requireSlot(manifest, name);
      if (slot.publisher !== "child" || !isRecord(binding) || !validIdentity(binding.herdrWorkspaceId) ||
        !validIdentity(binding.herdrPaneId) || !validIdentity(binding.herdrAgentName)) invalid();
      atomicNoClobber(join(runRoot(runId), "control", "bindings", `${name}.json`), JSON.stringify(binding), random);
    },

    publish(capability, child, content) {
      const parsed = parseCapability(capability);
      if (!isRecord(child) || !validIdentity(child.sessionId) || !validIdentity(child.herdrWorkspaceId) || !validIdentity(child.herdrPaneId)) invalid();
      const manifest = loadManifest(parsed.runId);
      const slot = requireSlot(manifest, parsed.slot);
      const capabilityDigest = digest(capability);
      if (slot.publisher !== "child" || slot.capabilityDigest !== capabilityDigest || slot.expiresAt === undefined || now() > slot.expiresAt) denied();
      let binding: unknown;
      try {
        binding = JSON.parse(readFileSync(join(runRoot(parsed.runId), "control", "bindings", `${slot.name}.json`), "utf8"));
      } catch {
        denied();
      }
      if (!isRecord(binding) || binding.herdrWorkspaceId !== child.herdrWorkspaceId || binding.herdrPaneId !== child.herdrPaneId) denied();
      return publishContent(manifest, slot, child.sessionId, content, capabilityDigest);
    },

    status(owner, runId) {
      const manifest = loadManifest(runId);
      requireOwner(owner, manifest);
      const states: Record<string, "pending" | "published"> = {};
      const root = runRoot(runId);
      for (const slot of manifest.slots) states[slot.name] = readVerified(root, manifest, slot) ? "published" : "pending";
      return Object.freeze({ slots: Object.freeze(states) });
    },

    collect(owner, runId, name) {
      const manifest = loadManifest(runId);
      requireOwner(owner, manifest);
      const slot = requireSlot(manifest, name);
      const verified = readVerified(runRoot(runId), manifest, slot);
      if (!verified) denied();
      return Object.freeze({ content: verified.content, digest: verified.receipt.digest, bytes: verified.receipt.bytes });
    },
  });
}
