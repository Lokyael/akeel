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
        { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
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
      { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
    );
  });

  await withAgentFiles("paths: [", undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);
    assert.deepEqual(
      await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "updated\n" } }),
      { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
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
        { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
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
    "  opaque: deny",
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

test("session start reloads updated policy.yaml from agent directory", async () => {
  await withAgentFiles("accessGate: off\n", undefined, async (agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(await invoke(harness, { toolName: "bash", input: { command: "mkdir generated" } }), undefined);

    writeFileSync(join(agentDir, "akeel", "policy.yaml"), "preset: review\n");

    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "mkdir generated" } }),
      { block: true, reason: "Blocked by access policy." },
    );
  });
});

test("synchronizes active policy badge into 2-line footer decorator without extra statusline", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    assert.equal(harness.hasFooterFactory(), false);
    assert.equal(harness.getStatus("akeel-policy"), undefined);

    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(harness.hasFooterFactory(), true);
    assert.equal(harness.getStatus("akeel-policy"), undefined);

    let lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ R$/);

    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand, "policy command must be registered");

    await policyCommand("develop", harness.ctx);
    lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ D$/);

    await policyCommand("guided", harness.ctx);
    lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ G$/);

    await harness.handlers.get("session_shutdown")!(undefined, harness.ctx);
    assert.equal(harness.hasFooterFactory(), false);
  });
});

test("reflects off mode in 2-line footer decorator and can enable gate via /policy", async () => {
  await withAgentFiles("accessGate: off\n", undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(harness.hasFooterFactory(), true);
    assert.equal(harness.getStatus("akeel-policy"), undefined);

    let lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ off$/);

    // 在 off 模式下，工具调用直接放行
    assert.equal(await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "hello" } }), undefined);

    // 通过 /policy develop 动态启用 Access Gate
    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand);

    await policyCommand("develop", harness.ctx);
    lines = harness.renderFooter(120);
    assert.match(lines[0]!, /🛡️ D$/);

    // 此时 Gate 已启用，受 develop 规则管辖
    harness.setConfirmResult(true);
    assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);

    // 再通过 /policy off 关闭门禁
    harness.setConfirmResult(true);
    await policyCommand("off", harness.ctx);
    lines = harness.renderFooter(120);
    assert.match(lines[0]!, /🛡️ off$/);

    // 恢复 passthrough
    assert.equal(await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "again" } }), undefined);

    await harness.handlers.get("session_shutdown")!(undefined, harness.ctx);
    assert.equal(harness.hasFooterFactory(), false);
  });
});

test("supports custom preset badges and disambiguation in 2-line footer decorator", async () => {
  const policy = [
    "presets:",
    "  custom-work:",
    "    badge: CW",
    "    paths: { read: allow, write: ask, edit: ask, list: allow, search: allow, allowedRoots: [], blockedRoots: [], blockedPaths: [] }",
    "    commands: { inspect: allow, modify: ask, execute: deny, opaque: ask, destroy: deny, unknown: deny }",
    "  audit-one:",
    "    paths: { read: allow, write: deny, edit: deny, list: allow, search: allow, allowedRoots: [], blockedRoots: [], blockedPaths: [] }",
    "    commands: { inspect: allow, modify: deny, execute: deny, opaque: deny, destroy: deny, unknown: deny }",
    "  audit-two:",
    "    paths: { read: allow, write: deny, edit: deny, list: allow, search: allow, allowedRoots: [], blockedRoots: [], blockedPaths: [] }",
    "    commands: { inspect: allow, modify: deny, execute: deny, opaque: deny, destroy: deny, unknown: deny }",
    "activePreset: custom-work",
    "",
  ].join("\n");

  await withAgentFiles(policy, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    let lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ CW$/);

    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand);

    await policyCommand("audit-one", harness.ctx);
    lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ AO$/);

    await policyCommand("audit-two", harness.ctx);
    lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /🛡️ AT$/);
  });
});

test("chains and preserves downstream plugin footers while maintaining 2 lines", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    // 模拟第三方插件在 AKeel 之后调用 setFooter
    harness.ctx.ui.setFooter((_tui, _theme, _data) => ({
      render: (_w: number) => ["CustomPluginLine1", "CustomPluginLine2"],
      invalidate: () => {},
    }));

    const lines = harness.renderFooter(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /^CustomPluginLine1\s+🛡️ R$/);
    assert.equal(lines[1], "CustomPluginLine2");
  });
});
