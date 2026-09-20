import { createHash } from "node:crypto";
import {
  reconcileContinuationCapsule,
  renderContinuationCapsule,
} from "../handoff-document/index";
import type {
  ContinuationCapsule,
  ReconciliationReport,
} from "../handoff-document/index";

export type SessionEntry = Readonly<{
  readonly type: "custom";
  readonly customType: string;
  readonly data: unknown;
}>;

export type HandoffState =
  | "none"
  | "prepared"
  | "switch-started"
  | "cancelled"
  | "transferred"
  | "reconciled"
  | "blocked";

export type HandoffStatus = Readonly<{
  readonly state: HandoffState;
  readonly digest?: string;
  readonly sourceSessionId?: string;
  readonly successorSessionId?: string;
}>;

export type PreparedCapsuleData = Readonly<{
  readonly capsule: ContinuationCapsule;
  readonly digest: string;
  readonly content: string;
}>;

export type SwitchIntentData = Readonly<{
  readonly digest: string;
  readonly sourceSessionId: string;
}>;

export type HandoffSwitchedData = Readonly<{
  readonly digest: string;
  readonly sourceSessionId: string;
  readonly successorSessionId: string;
}>;

export type ContinuationCapsuleData = Readonly<{
  readonly capsule: ContinuationCapsule;
  readonly digest: string;
  readonly content: string;
  readonly sourceSessionId: string;
  readonly successorSessionId: string;
}>;

export type ReconciliationData = Readonly<{
  readonly digest: string;
  readonly successorSessionId: string;
  readonly coveredSemanticIds: readonly string[];
}>;

export type HandoffStore = Readonly<{
  readonly prepareCapsule: (capsule: ContinuationCapsule) => Readonly<{
    readonly digest: string;
    readonly content: string;
    readonly entry: SessionEntry;
  }>;
  readonly getActiveCapsule: (entries: readonly unknown[]) => Readonly<{
    readonly capsule: ContinuationCapsule;
    readonly digest: string;
    readonly content: string;
    readonly origin?: "inbound" | "outbound";
  }> | undefined;
  readonly status: (entries: readonly unknown[]) => HandoffStatus;
  readonly beginSwitch: (entries: readonly unknown[], sourceSessionId: string) => SessionEntry;
  readonly cancelSwitch: (entries: readonly unknown[], sourceSessionId: string) => SessionEntry;
  readonly createSuccessorEntry: (
    entries: readonly unknown[],
    sourceSessionId: string,
    successorSessionId: string,
  ) => SessionEntry;
  readonly reconcile: (
    entries: readonly unknown[],
    successorSessionId: string,
    report: ReconciliationReport,
  ) => Readonly<{
    readonly state: "reconciled" | "blocked";
    readonly entry: SessionEntry;
    readonly coveredSemanticIds: readonly string[];
  }>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function customEntry(customType: string, data: unknown): SessionEntry {
  return Object.freeze({
    type: "custom" as const,
    customType,
    data: Object.freeze(data as object),
  });
}

function findEntryData<T>(entries: readonly unknown[], customType: string): T | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const raw = entries[index];
    if (!isRecord(raw) || raw.type !== "custom" || raw.customType !== customType || !raw.data) continue;
    return raw.data as T;
  }
  return undefined;
}

export function createHandoffStore(): HandoffStore {
  return Object.freeze({
    prepareCapsule(capsule: ContinuationCapsule) {
      if (!capsule || typeof capsule !== "object") invalid();
      const content = renderContinuationCapsule(capsule);
      const capsuleDigest = digest(JSON.stringify(capsule));
      const entryData: PreparedCapsuleData = Object.freeze({
        capsule,
        digest: capsuleDigest,
        content,
      });
      return Object.freeze({
        digest: capsuleDigest,
        content,
        entry: customEntry("akeel:prepared-capsule", entryData),
      });
    },

    getActiveCapsule(entries: readonly unknown[]) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const raw = entries[index];
        if (!isRecord(raw) || raw.type !== "custom" || typeof raw.customType !== "string") continue;
        if (raw.customType === "akeel:prepared-capsule") {
          const prepared = raw.data as PreparedCapsuleData;
          return Object.freeze({
            capsule: prepared.capsule,
            digest: prepared.digest,
            content: prepared.content,
            origin: "outbound" as const,
          });
        }
        if (raw.customType === "akeel:continuation-capsule") {
          const continuation = raw.data as ContinuationCapsuleData;
          return Object.freeze({
            capsule: continuation.capsule,
            digest: continuation.digest,
            content: continuation.content,
            origin: "inbound" as const,
          });
        }
      }
      return undefined;
    },

    status(entries: readonly unknown[]) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const raw = entries[index];
        if (!isRecord(raw) || raw.type !== "custom" || typeof raw.customType !== "string") continue;
        if (raw.customType === "akeel:reconciliation") {
          const data = raw.data as ReconciliationData;
          return Object.freeze({ state: "reconciled", digest: data?.digest, successorSessionId: data?.successorSessionId });
        }
        if (raw.customType === "akeel:reconciliation-blocked") {
          const data = raw.data as ReconciliationData;
          return Object.freeze({ state: "blocked", digest: data?.digest, successorSessionId: data?.successorSessionId });
        }
        if (raw.customType === "akeel:handoff-switched") {
          const data = raw.data as HandoffSwitchedData;
          return Object.freeze({ state: "transferred", digest: data?.digest, sourceSessionId: data?.sourceSessionId, successorSessionId: data?.successorSessionId });
        }
        if (raw.customType === "akeel:switch-cancelled") {
          const data = raw.data as SwitchIntentData;
          return Object.freeze({ state: "cancelled", digest: data?.digest, sourceSessionId: data?.sourceSessionId });
        }
        if (raw.customType === "akeel:switch-intent") {
          const data = raw.data as SwitchIntentData;
          return Object.freeze({ state: "switch-started", digest: data?.digest, sourceSessionId: data?.sourceSessionId });
        }
        if (raw.customType === "akeel:continuation-capsule") {
          const data = raw.data as ContinuationCapsuleData;
          return Object.freeze({ state: "transferred", digest: data?.digest, sourceSessionId: data?.sourceSessionId, successorSessionId: data?.successorSessionId });
        }
        if (raw.customType === "akeel:prepared-capsule") {
          const data = raw.data as PreparedCapsuleData;
          return Object.freeze({ state: "prepared", digest: data?.digest });
        }
      }
      return Object.freeze({ state: "none" });
    },

    beginSwitch(entries: readonly unknown[], sourceSessionId: string) {
      const currentStatus = this.status(entries);
      if (currentStatus.state !== "prepared" || !currentStatus.digest || !sourceSessionId) denied();
      return customEntry("akeel:switch-intent", Object.freeze({
        digest: currentStatus.digest,
        sourceSessionId,
      } satisfies SwitchIntentData));
    },

    cancelSwitch(entries: readonly unknown[], sourceSessionId: string) {
      const currentStatus = this.status(entries);
      if (currentStatus.state !== "switch-started" || !currentStatus.digest || currentStatus.sourceSessionId !== sourceSessionId) denied();
      return customEntry("akeel:switch-cancelled", Object.freeze({
        digest: currentStatus.digest,
        sourceSessionId,
      } satisfies SwitchIntentData));
    },

    createSuccessorEntry(entries: readonly unknown[], sourceSessionId: string, successorSessionId: string) {
      const currentStatus = this.status(entries);
      if ((currentStatus.state !== "switch-started" && currentStatus.state !== "prepared") ||
        !currentStatus.digest || !sourceSessionId || !successorSessionId || sourceSessionId === successorSessionId) denied();
      const active = this.getActiveCapsule(entries);
      if (!active || active.digest !== currentStatus.digest) denied();

      return customEntry("akeel:continuation-capsule", Object.freeze({
        capsule: active.capsule,
        digest: active.digest,
        content: active.content,
        sourceSessionId,
        successorSessionId,
      } satisfies ContinuationCapsuleData));
    },

    reconcile(entries: readonly unknown[], successorSessionId: string, report: ReconciliationReport) {
      const currentStatus = this.status(entries);
      if ((currentStatus.state !== "transferred" && currentStatus.state !== "blocked") || !currentStatus.digest) denied();
      const continuation = findEntryData<ContinuationCapsuleData>(entries, "akeel:continuation-capsule");
      if (!continuation || continuation.successorSessionId !== successorSessionId || continuation.digest !== currentStatus.digest) denied();

      const result = reconcileContinuationCapsule(continuation.capsule, report);
      if (result.status === "ready") {
        const entry = customEntry("akeel:reconciliation", Object.freeze({
          digest: currentStatus.digest,
          successorSessionId,
          coveredSemanticIds: result.coveredSemanticIds,
        } satisfies ReconciliationData));

        return Object.freeze({
          state: "reconciled" as const,
          entry,
          coveredSemanticIds: result.coveredSemanticIds,
        });
      }

      const entry = customEntry("akeel:reconciliation-blocked", Object.freeze({
        digest: currentStatus.digest,
        successorSessionId,
        coveredSemanticIds: result.coveredSemanticIds,
      } satisfies ReconciliationData));

      return Object.freeze({
        state: "blocked" as const,
        entry,
        coveredSemanticIds: result.coveredSemanticIds,
      });
    },
  });
}
