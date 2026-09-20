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
    assert.equal(harness.getStatus("akeel-policy"), undefined);
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

test("publishes the active policy badge through the host status API", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    assert.equal(harness.getStatus("akeel-policy"), undefined);

    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ R");

    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand, "policy command must be registered");

    await policyCommand("develop", harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ D");

    await policyCommand("guided", harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ G");

    await harness.handlers.get("session_shutdown")!(undefined, harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), undefined);
  });
});

test("publishes off mode through the host status API and can re-enable the gate", async () => {
  await withAgentFiles("accessGate: off\n", undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ off");

    assert.equal(await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "hello" } }), undefined);

    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand);
    await policyCommand("develop", harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ D");

    harness.setConfirmResult(true);
    assert.equal(await invoke(harness, { toolName: "read", input: { path: "README.md" } }), undefined);

    await policyCommand("off", harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ off");
    assert.equal(await invoke(harness, { toolName: "write", input: { path: "notes.md", content: "again" } }), undefined);

    await harness.handlers.get("session_shutdown")!(undefined, harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), undefined);
  });
});

test("publishes custom preset badges through the host status API", async () => {
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
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ CW");

    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand);

    await policyCommand("audit-one", harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ AO");

    await policyCommand("audit-two", harness.ctx);
    assert.equal(harness.getStatus("akeel-policy"), "🛡️ AT");
  });
});

test("bounded rm integrates with host approval across review, develop, and no-UI modes", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    // review preset denies rm
    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "rm temp.txt" } }),
      { block: true, reason: "Blocked by access policy." },
    );

    // Switch to develop preset (where destroy is ask)
    const policyCommand = harness.commands.get("policy");
    assert.ok(policyCommand);
    await policyCommand("develop", harness.ctx);

    // User confirms: allowed
    harness.setConfirmResult(true);
    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "rm temp.txt" } }),
      undefined,
    );

    // User denies: blocked
    harness.setConfirmResult(false);
    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "rm temp.txt" } }),
      { block: true, reason: "Blocked by user." },
    );

    // Hard boundary (e.g. sensitive path) remains blocked even in develop
    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "rm .git/config" } }),
      {
        block: true,
        reason: "Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user.",
        terminate: true,
      },
    );

    // Recursive rm remains blocked by security boundary
    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "rm -r temp_dir" } }),
      { block: true, reason: "Blocked because the shell syntax is unsupported." },
    );

    // No-UI context fails closed
    const noUiCtx = { ...harness.ctx, hasUI: false };
    const handler = harness.handlers.get("tool_call");
    assert.ok(handler);
    assert.deepEqual(
      await handler({ toolName: "bash", input: { command: "rm temp.txt" } }, noUiCtx),
      { block: true, reason: "Blocked because approval UI is unavailable." },
    );
  });
});

test("redirection to /dev/null is admitted end-to-end under review mode", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    // review preset allows git status 2>/dev/null without block
    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "git status 2>/dev/null" } }),
      undefined,
    );

    // review preset allows echo hello > /dev/null
    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "echo hello > /dev/null" } }),
      undefined,
    );

    // Non-/dev/null redirection is blocked
    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "echo hello > /dev/sda" } }),
      {
        block: true,
        reason: "Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user.",
        terminate: true,
      },
    );
  });
});

test("bounded coreutils inspection tools wc, cut, and stat are admitted end-to-end under review mode", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "wc -l README.md" } }),
      undefined,
    );

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "cut -d: -f1 README.md" } }),
      undefined,
    );

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "stat README.md" } }),
      undefined,
    );

    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "wc --files0-from=file" } }),
      { block: true, reason: "Blocked because the shell syntax is unsupported." },
    );
  });
});

test("bounded coreutils inspection tools diff, file, du, and df are admitted end-to-end under review mode", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "diff README.md package.json" } }),
      undefined,
    );

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "file README.md" } }),
      undefined,
    );

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "df -h" } }),
      undefined,
    );

    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "diff --diff-program=prog a b" } }),
      { block: true, reason: "Blocked because the shell syntax is unsupported." },
    );

    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "file -z README.md" } }),
      { block: true, reason: "Blocked because the shell syntax is unsupported." },
    );
  });
});

test("system path-form coreutils inspection tools are admitted end-to-end under review mode while custom scripts and rm are blocked", async () => {
  await withAgentFiles(undefined, undefined, async (_agentDir, harness) => {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);

    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "/bin/cat README.md" } }),
      undefined,
    );
    assert.equal(
      await invoke(harness, { toolName: "bash", input: { command: "/usr/bin/diff README.md package.json" } }),
      undefined,
    );

    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "/bin/rm README.md" } }),
      {
        block: true,
        reason: "Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user.",
        terminate: true,
      },
    );

    assert.deepEqual(
      await invoke(harness, { toolName: "bash", input: { command: "./scripts/build.sh" } }),
      { block: true, reason: "Blocked by access policy." },
    );
  });
});
