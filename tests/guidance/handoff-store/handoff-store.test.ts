import assert from "node:assert/strict";
import test from "node:test";
import { createHandoffStore } from "../../../packages/guidance/src/handoff-store/index";
import type { SessionEntry } from "../../../packages/guidance/src/handoff-store/index";
import { createContinuationCapsule } from "../../../packages/guidance/src/handoff-document/index";

function sampleCapsule() {
  return createContinuationCapsule({
    taskRef: "docs/task.md#t-0145",
    authorityRefs: ["docs/decisions.md#d-092"],
    roots: ["next"],
    units: [{
      id: "next",
      kind: "next-action",
      statement: "Advance in-session handoff.",
      authority: "user-approved",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    }],
    checkpoint: {
      state: "incomplete",
      currentSlice: "Session-embedded handoff store",
      actualState: "In-session persistence under test.",
      nextActionId: "next",
    },
    workspace: { cwd: "/workspace/project", files: ["src/a.ts"] },
  });
}

test("prepares and retrieves an in-session capsule with zero filesystem writes", () => {
  const store = createHandoffStore();
  const capsule = sampleCapsule();
  const prepared = store.prepareCapsule(capsule);

  assert.equal(prepared.entry.type, "custom");
  assert.equal(prepared.entry.customType, "akeel:prepared-capsule");
  assert.match(prepared.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(prepared.content, /Advance in-session handoff/);

  const entries: SessionEntry[] = [prepared.entry];
  assert.equal(store.status(entries).state, "prepared");

  const active = store.getActiveCapsule(entries);
  assert.ok(active);
  assert.equal(active.digest, prepared.digest);
  assert.deepEqual(active.capsule, capsule);
});

test("in-session handoff advances through append-only switch, transfer, and reconciliation entries", () => {
  const store = createHandoffStore();
  const capsule = sampleCapsule();
  const sourceEntries: SessionEntry[] = [store.prepareCapsule(capsule).entry];

  assert.equal(store.status(sourceEntries).state, "prepared");

  const switchIntent = store.beginSwitch(sourceEntries, "source-session");
  sourceEntries.push(switchIntent);
  assert.equal(store.status(sourceEntries).state, "switch-started");

  const transferred = store.transfer(sourceEntries, "source-session", "successor-session");
  sourceEntries.push(transferred.sourceEntry);
  assert.equal(store.status(sourceEntries).state, "transferred");

  // Successor session receives the transfer entry in its entries
  const successorEntries: SessionEntry[] = [transferred.successorEntry];
  assert.equal(store.status(successorEntries).state, "transferred");

  const reconciliation = store.reconcile(successorEntries, "successor-session", {
    importedSemanticIds: ["next"],
    conflicts: [],
    unresolvedSemanticIds: [],
    workspaceVerified: true,
  });
  successorEntries.push(reconciliation.entry);
  assert.equal(store.status(successorEntries).state, "reconciled");
  assert.deepEqual(reconciliation.coveredSemanticIds, ["next"]);
});

test("cancelled and unresolved handoffs fail closed within session entries", () => {
  const store = createHandoffStore();
  const capsule = sampleCapsule();
  const sourceEntries: SessionEntry[] = [store.prepareCapsule(capsule).entry];

  sourceEntries.push(store.beginSwitch(sourceEntries, "source-session"));
  sourceEntries.push(store.cancelSwitch(sourceEntries, "source-session"));
  assert.equal(store.status(sourceEntries).state, "cancelled");

  assert.throws(
    () => store.transfer(sourceEntries, "source-session", "successor-session"),
    /handoff-store-denied/,
  );

  // Attempting reconciliation with unresolved item produces a blocked state record without crashing
  const freshEntries: SessionEntry[] = [store.prepareCapsule(capsule).entry];
  const transferred = store.transfer(freshEntries, "source-session", "successor-session");
  const successorEntries: SessionEntry[] = [transferred.successorEntry];

  const blocked = store.reconcile(successorEntries, "successor-session", {
    importedSemanticIds: [],
    conflicts: [],
    unresolvedSemanticIds: ["next"],
    workspaceVerified: true,
  });
  assert.equal(blocked.state, "blocked");
  successorEntries.push(blocked.entry);
  assert.equal(store.status(successorEntries).state, "blocked");
});

test("reconciled session can prepare a fresh outbound capsule and advance multi-hop handoffs", () => {
  const store = createHandoffStore();
  const capsule = sampleCapsule();
  const transferred = store.transfer([store.prepareCapsule(capsule).entry], "s1", "s2");
  const s2Entries: SessionEntry[] = [transferred.successorEntry];

  const reconciled = store.reconcile(s2Entries, "s2", {
    importedSemanticIds: ["next"],
    conflicts: [],
    unresolvedSemanticIds: [],
    workspaceVerified: true,
  });
  s2Entries.push(reconciled.entry);
  assert.equal(store.status(s2Entries).state, "reconciled");

  // S2 prepares a new outbound capsule for S3
  const s2Outbound = store.prepareCapsule(capsule);
  s2Entries.push(s2Outbound.entry);
  assert.equal(store.status(s2Entries).state, "prepared");

  const active = store.getActiveCapsule(s2Entries);
  assert.ok(active);
  assert.equal(active.origin, "outbound");
  assert.equal(active.digest, s2Outbound.digest);

  // S2 begins switch to S3
  const s2Switch = store.beginSwitch(s2Entries, "s2");
  s2Entries.push(s2Switch);
  assert.equal(store.status(s2Entries).state, "switch-started");
});

