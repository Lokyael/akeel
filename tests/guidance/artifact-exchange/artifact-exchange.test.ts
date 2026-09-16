import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createArtifactExchange } from "../../../packages/guidance/src/artifact-exchange/index";

function harness(now = 1_800_000_000_000) {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-exchange-"));
  chmodSync(root, 0o700);
  let clock = now;
  const exchange = createArtifactExchange({ root, now: () => clock });
  return {
    root,
    exchange,
    advance(ms: number): void { clock += ms; },
    cleanup(): void { rmSync(root, { recursive: true, force: true }); },
  };
}

const owner = Object.freeze({ sessionId: "owner-session", cwd: "/workspace/project" });
const child = Object.freeze({
  sessionId: "child-session",
  herdrWorkspaceId: "workspace-1",
  herdrPaneId: "workspace-1:pane-1",
});

test("a bound child capability publishes one verified artifact for its owner", () => {
  const h = harness();
  try {
    const reservation = h.exchange.reserve(owner, {
      kind: "code-review",
      slots: [{ name: "engineering", channel: "artifact", publisher: "child", mediaType: "text/markdown" }],
    });
    const capability = reservation.capabilities.engineering;
    assert.equal(typeof capability, "string");

    h.exchange.bind(owner, reservation.runId, "engineering", {
      herdrWorkspaceId: child.herdrWorkspaceId,
      herdrPaneId: child.herdrPaneId,
      herdrAgentName: "engineering-reviewer",
    });
    const receipt = h.exchange.publish(capability!, child, "# Review\n\nNo findings.\n");
    assert.equal(receipt.status, "published");
    assert.equal(receipt.bytes, 23);

    const collected = h.exchange.collect(owner, reservation.runId, "engineering");
    assert.equal(collected.content, "# Review\n\nNo findings.\n");
    assert.equal(collected.digest, receipt.digest);
    assert.equal(h.exchange.status(owner, reservation.runId).slots.engineering, "published");

    const runRoot = join(h.root, reservation.runId);
    assert.equal(statSync(runRoot).mode & 0o777, 0o700);
    assert.equal(statSync(join(runRoot, "control", "run.json")).mode & 0o777, 0o600);
  } finally {
    h.cleanup();
  }
});

test("owner packet publication is separate from child artifact authority", () => {
  const h = harness();
  try {
    const reservation = h.exchange.reserve(owner, {
      kind: "grill-docs",
      slots: [
        { name: "packet", channel: "packet", publisher: "owner", mediaType: "text/markdown" },
        { name: "candidate", channel: "artifact", publisher: "child", mediaType: "text/markdown" },
      ],
    });
    h.exchange.put(owner, reservation.runId, "packet", "# Packet\n");
    assert.equal(h.exchange.status(owner, reservation.runId).slots.packet, "published");
    assert.throws(
      () => h.exchange.put(owner, reservation.runId, "candidate", "not child output"),
      /artifact-exchange-denied/,
    );
  } finally {
    h.cleanup();
  }
});

test("capability binding, expiry, owner identity, and replay fail closed", () => {
  const h = harness();
  try {
    const reservation = h.exchange.reserve(owner, {
      kind: "code-review",
      slots: [{ name: "result", channel: "artifact", publisher: "child", mediaType: "text/markdown" }],
    });
    const capability = reservation.capabilities.result!;

    assert.throws(() => h.exchange.publish(capability, child, "result"), /artifact-exchange-denied/);
    h.exchange.bind(owner, reservation.runId, "result", {
      herdrWorkspaceId: child.herdrWorkspaceId,
      herdrPaneId: child.herdrPaneId,
      herdrAgentName: "reviewer",
    });
    assert.throws(
      () => h.exchange.publish(capability, { ...child, herdrPaneId: "wrong:pane" }, "result"),
      /artifact-exchange-denied/,
    );
    assert.throws(
      () => h.exchange.collect({ sessionId: "other", cwd: owner.cwd }, reservation.runId, "result"),
      /artifact-exchange-denied/,
    );

    h.advance(24 * 60 * 60 * 1000 + 1);
    assert.throws(() => h.exchange.publish(capability, child, "result"), /artifact-exchange-denied/);
  } finally {
    h.cleanup();
  }
});

test("publication is no-clobber and collect detects artifact tampering", () => {
  const h = harness();
  try {
    const reservation = h.exchange.reserve(owner, {
      kind: "code-review",
      slots: [{ name: "result", channel: "artifact", publisher: "child", mediaType: "text/markdown" }],
    });
    h.exchange.bind(owner, reservation.runId, "result", {
      herdrWorkspaceId: child.herdrWorkspaceId,
      herdrPaneId: child.herdrPaneId,
      herdrAgentName: "reviewer",
    });
    const capability = reservation.capabilities.result!;
    const first = h.exchange.publish(capability, child, "first");
    const retry = h.exchange.publish(capability, child, "first");
    assert.equal(retry.status, "already-published");
    assert.equal(retry.digest, first.digest);
    assert.throws(() => h.exchange.publish(capability, child, "different"), /artifact-exchange-denied/);

    const artifactPath = join(h.root, reservation.runId, "artifacts", "result.md");
    writeFileSync(artifactPath, "tampered", "utf8");
    assert.throws(() => h.exchange.collect(owner, reservation.runId, "result"), /artifact-exchange-denied/);
  } finally {
    h.cleanup();
  }
});

test("invalid slot names, excessive runs, and oversized content are bounded", () => {
  const h = harness();
  try {
    assert.throws(() => h.exchange.reserve(owner, {
      kind: "code-review",
      slots: [{ name: "../escape", channel: "artifact", publisher: "child", mediaType: "text/markdown" }],
    }), /artifact-exchange-invalid/);
    assert.deepEqual(readdirSync(h.root), []);

    const reservation = h.exchange.reserve(owner, {
      kind: "code-review",
      slots: [{ name: "result", channel: "artifact", publisher: "child", mediaType: "text/markdown" }],
    });
    h.exchange.bind(owner, reservation.runId, "result", {
      herdrWorkspaceId: child.herdrWorkspaceId,
      herdrPaneId: child.herdrPaneId,
      herdrAgentName: "reviewer",
    });
    assert.throws(
      () => h.exchange.publish(reservation.capabilities.result!, child, "x".repeat(1_048_577)),
      /artifact-exchange-invalid/,
    );

    const manifest = JSON.parse(readFileSync(join(h.root, reservation.runId, "control", "run.json"), "utf8"));
    assert.equal(manifest.slots[0].capabilityDigest.startsWith("sha256:"), true);
    assert.equal(JSON.stringify(manifest).includes(reservation.capabilities.result!), false);
  } finally {
    h.cleanup();
  }
});
