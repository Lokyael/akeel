import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startSession, withEnv } from "./harness";

async function withAgentFiles(
  policy: string | undefined,
  legacyConfig: string | undefined,
  run: (agentDir: string, harness: ReturnType<typeof startSession>["harness"]) => Promise<void>,
): Promise<void> {
  const agentDir = mkdtempSync(join(tmpdir(), "akeel-extension-agent-"));
  mkdirSync(join(agentDir, "akeel"), { recursive: true });
  if (policy !== undefined) writeFileSync(join(agentDir, "akeel", "policy.yaml"), policy);
  if (legacyConfig !== undefined) writeFileSync(join(agentDir, "akeel", "config.yaml"), legacyConfig);

  await withEnv({ PI_CODING_AGENT_DIR: agentDir }, async () => {
    const session = startSession();
    try {
      await run(agentDir, session.harness);
    } finally {
      session.cleanup();
    }
  });
  rmSync(agentDir, { recursive: true, force: true });
}

async function invoke(
  harness: ReturnType<typeof startSession>["harness"],
  event: unknown,
): Promise<unknown> {
  const handler = harness.handlers.get("tool_call");
  assert.ok(handler, "production extension must register tool_call");
  return handler(event, harness.ctx);
}

test("production extension registers only the new decision composition", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    assert.equal(harness.commands.has("profile"), false);
    assert.equal(harness.hasFooterFactory(), false);
    assert.equal(harness.handlers.has("session_start"), true);
    assert.equal(harness.handlers.has("session_shutdown"), true);
  });
});

test("unowned tools pass through even before the managed decision service initializes", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    assert.equal(await invoke(harness, { toolName: "unowned-tool", input: {} }), undefined);
  });
});

test("legacy config is ignored and the built-in review policy remains active", async () => {
  await withAgentFiles(
    undefined,
    "paths:\n  read: allow\n",
    async (_agentDir, harness) => {
      await harness.handlers.get("session_start")!(undefined, harness.ctx);
      assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);
      assert.deepEqual(
        await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "updated\n" } }),
        { block: true, reason: "The current session is read-only; switch policy with /policy before retrying this modification." },
      );
    },
  );
});

test("missing and malformed external policy use the built-in review baseline", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);
    assert.deepEqual(
      await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "updated\n" } }),
      { block: true, reason: "The current session is read-only; switch policy with /policy before retrying this modification." },
    );
  });

  await withAgentFiles("paths: [", undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);
    assert.deepEqual(
      await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "updated\n" } }),
      { block: true, reason: "The current session is read-only; switch policy with /policy before retrying this modification." },
    );
  });
});

test("an invalid external policy is ignored as a whole", async () => {
  await withAgentFiles(
    "paths:\n  read: allow\n  write: allow\nunknown: value\n",
    undefined,
    async (_agentDir, harness) => {
      await harness.handlers.get("session_start")!(undefined, harness.ctx);
      assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);
      assert.deepEqual(
        await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "updated\n" } }),
        { block: true, reason: "The current session is read-only; switch policy with /policy before retrying this modification." },
      );
    },
  );
});

test("managed calls use the new allow, confirm, and deny host contract exactly once", async () => {
  const policy = [
    "paths:",
    "  read: allow",
    "  write: ask",
    "  edit: deny",
    "  list: allow",
    "  search: allow",
    "commands:",
    "  inspect: allow",
    "  modify: deny",
    "  execute: deny",
    "  destroy: deny",
    "  unknown: deny",
    "",
  ].join("\n");

  await withAgentFiles(policy, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);

    harness.setConfirmResult(true);
    assert.equal(
      await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "secret" } }),
      undefined,
    );
    assert.equal(harness.getConfirmCalls(), 1);

    harness.setConfirmResult(false);
    assert.deepEqual(
      await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "secret" } }),
      { block: true, reason: "Blocked by user." },
    );
    assert.equal(harness.getConfirmCalls(), 2);

    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "mkdir generated" } }),
      { block: true, reason: "Blocked by access policy." },
    );

    assert.equal(await invoke(harness, { toolName: "unowned-tool", input: {} }), undefined);
  });
});

test("session shutdown removes the new decision service", async () => {
  await withAgentFiles("paths:\n  read: allow\n", undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    await harness.handlers.get("session_shutdown")!(undefined, harness.ctx);
    assert.deepEqual(
      await invoke(harness, { toolName: "read", input: { path: "README.md" } }),
      { block: true, reason: "Blocked because the decision service is not initialized." },
    );
  });
});
