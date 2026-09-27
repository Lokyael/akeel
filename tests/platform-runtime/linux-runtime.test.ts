import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  isProcessIdentity,
  isRuntimeRoot,
  projectPathAuthorization,
} from "../../packages/platform-runtime/src";
import {
  createLinuxPlatformSession,
} from "../../packages/platform-runtime/src/linux";

test("Linux process authority identifies current process and evaluates liveness", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-linux-proc-"));
  try {
    const session = await createLinuxPlatformSession({ purpose: "access-gate", cwd: root });
    const current = await session.process.current();
    assert.equal(isProcessIdentity(current), true);
    assert.equal(current.pid, process.pid);

    const stamp = session.process.stamp(current);
    assert.equal(stamp.platform, "linux");
    assert.equal(stamp.pid, process.pid);
    assert.equal(await session.process.liveness(stamp), "alive");

    const deadStamp = {
      schemaVersion: 1 as const,
      platform: "linux" as const,
      pid: 999_999_999,
      creationIdentity: "dead",
    };
    assert.equal(await session.process.liveness(deadStamp), "dead");
    await session.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Linux runtime root authority creates, verifies, and removes controlled directories", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-linux-root-"));
  try {
    const session = await createLinuxPlatformSession({ purpose: "access-gate", cwd: root });
    const sessionRoot = await session.runtime.create("session-envelope", session.workspace);
    assert.equal(isRuntimeRoot(sessionRoot), true);
    assert.equal(sessionRoot.role, "session-envelope");

    const view = projectPathAuthorization(sessionRoot.path);
    assert.ok(view);
    assert.match(view.canonicalDisplay, /[/\\\\]tmp[/\\\\]akeel[/\\\\]sessions[/\\\\]session-[a-f0-9]+$/u);
    assert.equal(existsSync(view.canonicalDisplay), true);
    assert.equal(statSync(view.canonicalDisplay).mode & 0o777, 0o700);
    assert.equal(await session.runtime.verify(sessionRoot), true);

    const workflowRoot = await session.runtime.create("workflow-run", session.workspace);
    assert.equal(workflowRoot.role, "workflow-run");
    const workflowView = projectPathAuthorization(workflowRoot.path);
    assert.ok(workflowView);
    assert.match(workflowView.canonicalDisplay, /[/\\\\]tmp[/\\\\]akeel[/\\\\]runs[/\\\\]run-[a-f0-9]+$/u);
    assert.equal(await session.runtime.verify(workflowRoot), true);

    assert.equal(await session.runtime.remove(sessionRoot), true);
    assert.equal(existsSync(view.canonicalDisplay), false);
    assert.equal(await session.runtime.verify(sessionRoot), false);
    await session.runtime.remove(workflowRoot);
    await session.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Linux private filesystem and publication authorities support bounded safe atomic writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-linux-fs-"));
  try {
    const session = await createLinuxPlatformSession({ purpose: "guidance", cwd: root });
    const runRoot = await session.runtime.create("workflow-run", session.workspace);

    await session.filesystem.ensureDirectory(runRoot, ["control", "receipts"]);
    const runView = projectPathAuthorization(runRoot.path)!;
    assert.equal(existsSync(join(runView.canonicalDisplay, "control", "receipts")), true);

    const published = await session.publication.publish({
      root: runRoot,
      relativeComponents: ["packet", "input.json"],
      content: '{"ok":true}',
    });
    assert.equal(published.status, "published");
    assert.equal(published.bytes, 11);
    assert.match(published.digest, /^sha256:[a-f0-9]{64}$/u);

    const read = await session.filesystem.readText(runRoot, ["packet", "input.json"], 1024);
    assert.equal(read, '{"ok":true}');

    const idempotent = await session.publication.publish({
      root: runRoot,
      relativeComponents: ["packet", "input.json"],
      content: '{"ok":true}',
    });
    assert.equal(idempotent.status, "already-published");

    await assert.rejects(
      () => session.publication.publish({
        root: runRoot,
        relativeComponents: ["packet", "input.json"],
        content: '{"ok":false}',
      }),
      /already exists|conflict/u,
    );

    await assert.rejects(
      () => session.filesystem.ensureDirectory(runRoot, ["..", "escape"]),
      /invalid relative components/u,
    );

    await session.runtime.remove(runRoot);
    await session.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
