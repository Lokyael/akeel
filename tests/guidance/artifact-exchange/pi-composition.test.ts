import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Value } from "typebox/value";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { installArtifactExchange } from "../../../packages/guidance/src/artifact-exchange/pi-composition";

type Tool = Readonly<{
  readonly execute: (...args: any[]) => Promise<any> | any;
}>;
type Handler = (event: unknown, context: ExtensionContext) => unknown | Promise<unknown>;
type Command = Readonly<{ readonly handler: (args: string, context: any) => unknown | Promise<unknown> }>;
type CustomEntry = Readonly<{ readonly type: "custom"; readonly customType: string; readonly data: unknown }>;

function fakePi(flag?: string) {
  const handlers = new Map<string, Handler>();
  const tools = new Map<string, Tool>();
  const commands = new Map<string, Command>();
  const entries: CustomEntry[] = [];
  let sessionEntries = entries;
  let active = ["read", "write"];
  let alive = true;
  const pi = {
    on(name: string, handler: Handler): void { handlers.set(name, handler); },
    registerFlag(): void {},
    registerCommand(name: string, command: Command): void { commands.set(name, command); },
    getFlag(name: string): unknown { return name === "akeel-artifact-capability" ? flag : undefined; },
    registerTool(tool: Tool & { name: string }): void { tools.set(tool.name, tool); },
    getActiveTools(): string[] { return [...active]; },
    setActiveTools(names: string[]): void { active = [...names]; },
    appendEntry(customType: string, data: unknown): void {
      if (!alive) throw new Error("stale-extension-context");
      sessionEntries.push({ type: "custom", customType, data });
    },
  } as unknown as ExtensionAPI;
  return {
    pi,
    handlers,
    tools,
    commands,
    entries,
    active: () => active,
    invalidate: () => { alive = false; },
    useEntries: (nextEntries: CustomEntry[]) => { sessionEntries = nextEntries; },
  };
}

function context(sessionId: string, entries: CustomEntry[] = []): ExtensionContext {
  return {
    cwd: "/workspace/project",
    hasUI: false,
    ui: {
      notify: () => {},
    },
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => `/sessions/${sessionId}.jsonl`,
      getBranch: () => entries,
      getEntries: () => entries,
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
        return `entry-${entries.length}`;
      },
    },
  } as unknown as ExtensionContext;
}

async function start(
  target: ReturnType<typeof fakePi>,
  sessionId: string,
  entries: CustomEntry[] = target.entries,
): Promise<void> {
  target.useEntries(entries);
  const handler = target.handlers.get("session_start");
  assert.ok(handler);
  await handler!({}, context(sessionId, entries));
}

async function execute(tool: Tool, params: unknown, ctx: ExtensionContext): Promise<any> {
  return tool.execute("call-1", params, undefined, undefined, ctx);
}

test("ordinary and capability sessions activate mutually exclusive artifact tools", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "owner-session");
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), true);
    assert.equal(ownerPi.active().includes("akeel_publish_artifact"), false);
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);

    const ownerTool = ownerPi.tools.get("akeel_run_artifact");
    assert.ok(ownerTool);
    const reserved = await execute(ownerTool!, {
      action: "reserve",
      kind: "code-review",
      slots: [{ name: "result", channel: "artifact", publisher: "child", mediaType: "text/markdown" }],
    }, context("owner-session"));
    const reservation = reserved.details.result;
    await execute(ownerTool!, {
      action: "bind",
      runId: reservation.runId,
      slot: "result",
      herdrWorkspaceId: "workspace-1",
      herdrPaneId: "workspace-1:pane-1",
      herdrAgentName: "reviewer",
    }, context("owner-session"));

    const childPi = fakePi(reservation.capabilities.result);
    installArtifactExchange(childPi.pi, { root });
    await start(childPi, "child-session");
    assert.equal(childPi.active().includes("akeel_run_artifact"), false);
    assert.equal(childPi.active().includes("akeel_publish_artifact"), true);
    assert.equal(childPi.active().includes("akeel_handoff"), false);

    const previousWorkspace = process.env.HERDR_WORKSPACE_ID;
    const previousPane = process.env.HERDR_PANE_ID;
    process.env.HERDR_WORKSPACE_ID = "workspace-1";
    process.env.HERDR_PANE_ID = "workspace-1:pane-1";
    try {
      const publisher = childPi.tools.get("akeel_publish_artifact");
      assert.ok(publisher);
      await execute(publisher!, { content: "verified result" }, context("child-session"));
    } finally {
      if (previousWorkspace === undefined) delete process.env.HERDR_WORKSPACE_ID;
      else process.env.HERDR_WORKSPACE_ID = previousWorkspace;
      if (previousPane === undefined) delete process.env.HERDR_PANE_ID;
      else process.env.HERDR_PANE_ID = previousPane;
    }

    const collected = await execute(ownerTool!, {
      action: "collect",
      runId: reservation.runId,
      slot: "result",
    }, context("owner-session"));
    assert.equal(collected.content[0].text, "verified result");
    assert.equal(collected.details.result.bytes, 15);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("owner records live semantics and prepares an in-session continuation capsule", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "owner-session");
    const handoff = ownerPi.tools.get("akeel_handoff")!;
    const ownerContext = context("owner-session", ownerPi.entries);

    await assert.rejects(() => execute(handoff, { action: "record", payload: {
      id: "malformed",
      kind: "risk",
      authority: "observed",
      status: "live",
      sourceRef: "session:entry-0",
    } }, ownerContext), /Handoff operation failed/);

    await execute(handoff, { action: "record", payload: {
      id: "next",
      kind: "next-action",
      statement: "Continue in the successor.",
      authority: "user-approved",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    } }, ownerContext);

    const prepared = await execute(handoff, { action: "prepare", payload: {
      taskRef: "docs/task.md#t-0145",
      authorityRefs: ["docs/decisions.md#d-092"],
      roots: ["next"],
      checkpoint: {
        state: "incomplete",
        currentSlice: "Pi ledger tool",
        actualState: "The capsule is prepared.",
        nextActionId: "next",
      },
      workspace: { cwd: "/workspace/project", files: [] },
    } }, ownerContext);

    assert.match(prepared.content[0].text, /^sha256:[a-f0-9]{64}$/);
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:semantic-ledger"), true);
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:prepared-capsule"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("owner closes captured semantics only with a closure destination and status reflects the reduced ledger", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "owner-session");
    const handoff = ownerPi.tools.get("akeel_handoff")!;
    const ownerContext = context("owner-session", ownerPi.entries);

    await execute(handoff, { action: "record", payload: {
      id: "old",
      kind: "assumption",
      statement: "The old assumption.",
      authority: "inferred",
      status: "live",
      sourceRef: "session:entry-1",
    } }, ownerContext);
    await execute(handoff, { action: "record", payload: {
      id: "dependent",
      kind: "next-action",
      statement: "A live unit still depends on the old assumption.",
      authority: "inferred",
      status: "live",
      sourceRef: "session:entry-2",
      dependsOn: ["old"],
    } }, ownerContext);

    await assert.rejects(() => execute(handoff, { action: "close", payload: {
      id: "old",
      status: "superseded",
      closure: {
        disposition: "superseded",
        basisRef: "docs/decisions.md#d-092",
        destinationRef: "docs/decisions.md#d-092",
      },
    } }, ownerContext), /Handoff operation failed/);

    await execute(handoff, { action: "close", payload: {
      id: "dependent",
      status: "closed",
      closure: {
        disposition: "irrelevant",
        basisRef: "docs/decisions.md#d-092",
        destinationRef: "docs/decisions.md#d-092",
      },
    } }, ownerContext);
    await execute(handoff, { action: "close", payload: {
      id: "old",
      status: "superseded",
      closure: {
        disposition: "superseded",
        basisRef: "docs/decisions.md#d-092",
        destinationRef: "docs/decisions.md#d-092",
      },
    } }, ownerContext);

    const status = await execute(handoff, { action: "status" }, ownerContext);
    const parsed = status.details.result.units;
    assert.equal(parsed[0].status, "superseded");
    assert.equal(parsed[0].closure.destinationRef, "docs/decisions.md#d-092");

    await assert.rejects(() => execute(handoff, { action: "close", payload: {
      id: "old",
      status: "closed",
    } }, ownerContext), /Handoff operation failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("single /handoff command synthesizes capsule and replaces session in one step with inline args", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "source-session");
    const sourceContext = context("source-session", ownerPi.entries);

    // Record an active assumption without calling prepare beforehand
    const handoffTool = ownerPi.tools.get("akeel_handoff")!;
    await execute(handoffTool, { action: "record", payload: {
      id: "active-assumption",
      kind: "assumption",
      statement: "Parser is recursive descent.",
      authority: "inferred",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    } }, sourceContext);

    const sent: string[] = [];
    let parentSession: string | undefined;
    const successorEntries: CustomEntry[] = [];
    const successorContext = {
      ...context("successor-session", successorEntries),
      sendUserMessage: async (message: string) => { sent.push(message); },
    };
    const commandContext = {
      ...sourceContext,
      isIdle: () => true,
      newSession: async (options: any) => {
        parentSession = options.parentSession;
        await options.setup(successorContext.sessionManager);
        await options.withSession(successorContext);
        return { cancelled: false };
      },
    };

    const command = ownerPi.commands.get("handoff")!;
    assert.ok(command);
    // User executes single command with inline next action
    await command.handler("Implement the next slice directly", commandContext);

    assert.equal(parentSession, "/sessions/source-session.jsonl");
    assert.equal(sent.length, 1);
    assert.match(sent[0]!, /<akeel-session-handoff>/);
    assert.match(sent[0]!, /Implement the next slice directly/);
    assert.match(sent[0]!, /Parser is recursive descent/);
    assert.match(sent[0]!, /importedSemanticIds/);
    assert.match(sent[0]!, /workspaceVerified/);

    // Old session keeps its switch intent and tools freeze on restart.
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:switch-intent"), true);
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:handoff-switched"), false);
    assert.equal(successorEntries.some((entry) => entry.customType === "akeel:continuation-capsule"), true);
    await start(ownerPi, "source-session");
    assert.deepEqual(ownerPi.active(), []);

    // Successor session start activates handoff and inspection tools without owner artifact delegation
    await start(ownerPi, "successor-session", successorEntries);
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), false);

    // Successor hydrates captured semantics from the continuation capsule
    const successorHandoff = ownerPi.tools.get("akeel_handoff")!;
    const hydratedStatus = await execute(successorHandoff, { action: "status" }, context("successor-session", successorEntries));
    const hydratedIds = hydratedStatus.details.result.units.map((u: any) => u.id);
    assert.equal(hydratedIds.includes("active-assumption"), true);
    assert.equal(hydratedIds.includes("user-next-action"), true);

    // Successor reconciles directly and is promoted to active Owner
    const reconciled = await execute(successorHandoff, { action: "reconcile", payload: {
      importedSemanticIds: ["active-assumption", "user-next-action"],
      conflicts: [],
      unresolvedSemanticIds: [],
      workspaceVerified: true,
    } }, context("successor-session", successorEntries));
    assert.equal(reconciled.details.result.state, "reconciled");
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), true);

    // Successor survives session restart/reboot with full owner tools intact
    await start(ownerPi, "successor-session", successorEntries);
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), true);
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);

    // Multi-hop handoff: successor (S2) can initiate another handoff to S3 without deadlock
    const s3Entries: CustomEntry[] = [];
    const s3Context = {
      ...context("session-3", s3Entries),
      sendUserMessage: async (msg: string) => { sent.push(msg); },
    };
    const s2CommandContext = {
      ...context("successor-session", successorEntries),
      isIdle: () => true,
      newSession: async (options: any) => {
        parentSession = options.parentSession;
        await options.setup(s3Context.sessionManager);
        await options.withSession(s3Context);
        return { cancelled: false };
      },
    };
    await command.handler("Implement slice in S3", s2CommandContext);
    assert.equal(sent.length, 2);
    assert.match(sent[1]!, /Implement slice in S3/);
    assert.match(sent[1]!, /\[user-next-action-2\] Implement slice in S3/);

    // S2 is now retired and frozen on start, while S3 can start
    await start(ownerPi, "successor-session", successorEntries);
    assert.deepEqual(ownerPi.active(), []);
    await start(ownerPi, "session-3", s3Entries);
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);

    // Isolated source session with switch-intent entry safely freezes tools on restart
    const isolatedSourceEntries: CustomEntry[] = [
      {
        type: "custom",
        customType: "akeel:switch-intent",
        data: { digest: "sha256:abcd", sourceSessionId: "isolated-source" },
      },
    ];
    const isolatedPi = fakePi();
    installArtifactExchange(isolatedPi.pi, { root });
    const isolatedHandler = isolatedPi.handlers.get("session_start");
    assert.ok(isolatedHandler);
    await isolatedHandler!({}, context("isolated-source", isolatedSourceEntries));
    assert.deepEqual(isolatedPi.active(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/handoff writes the successor receipt through setup before using the fresh context", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "source-session");
    const sourceContext = context("source-session", ownerPi.entries);
    const successorEntries: CustomEntry[] = [];
    const sent: string[] = [];
    const successorManager = {
      getSessionId: () => "successor-session",
      appendCustomEntry(customType: string, data: unknown): string {
        successorEntries.push({ type: "custom", customType, data });
        return `entry-${successorEntries.length}`;
      },
    };
    const successorContext = {
      ...context("successor-session", successorEntries),
      sendUserMessage: async (message: string) => { sent.push(message); },
    };
    const commandContext = {
      ...sourceContext,
      isIdle: () => true,
      newSession: async (options: any) => {
        ownerPi.invalidate();
        assert.equal(typeof options.setup, "function");
        await options.setup(successorManager);
        await options.withSession(successorContext);
        return { cancelled: false };
      },
    };

    const command = ownerPi.commands.get("handoff")!;
    await command.handler("Continue in the successor", commandContext);

    assert.equal(sent.length, 1);
    assert.equal(successorEntries.some((entry) => entry.customType === "akeel:continuation-capsule"), true);
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:handoff-switched"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/handoff view inspects active capsule without switching session", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "source-session");
    const sourceContext = context("source-session", ownerPi.entries);

    const handoffTool = ownerPi.tools.get("akeel_handoff")!;
    await execute(handoffTool, { action: "record", payload: {
      id: "next",
      kind: "next-action",
      statement: "View test action.",
      authority: "user-approved",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    } }, sourceContext);
    await execute(handoffTool, { action: "prepare" }, sourceContext);

    let notifiedText: string | undefined;
    const commandContext = {
      ...sourceContext,
      hasUI: true,
      ui: {
        notify: (msg: string) => { notifiedText = msg; },
      },
      isIdle: () => true,
      newSession: async () => {
        throw new Error("newSession should not be called on view");
      },
    };

    const command = ownerPi.commands.get("handoff")!;
    assert.ok(command);
    await command.handler("view", commandContext);

    assert.ok(notifiedText);
    assert.match(notifiedText!, /View test action/);
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:switch-intent"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/handoff view logs capsule to console when hasUI is false", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "source-session");
    const sourceContext = context("source-session", ownerPi.entries);

    const handoffTool = ownerPi.tools.get("akeel_handoff")!;
    await execute(handoffTool, { action: "record", payload: {
      id: "next",
      kind: "next-action",
      statement: "Non-UI view test action.",
      authority: "user-approved",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    } }, sourceContext);
    await execute(handoffTool, { action: "prepare" }, sourceContext);

    const logged: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logged.push(msg); };

    try {
      const commandContext = {
        ...sourceContext,
        hasUI: false,
        isIdle: () => true,
        newSession: async () => {
          throw new Error("newSession should not be called on view");
        },
      };

      const command = ownerPi.commands.get("handoff")!;
      assert.ok(command);
      await command.handler("view", commandContext);

      assert.equal(logged.length, 1);
      assert.match(logged[0]!, /Non-UI view test action/);
    } finally {
      console.log = origLog;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/handoff view notifies gracefully without throwing when no capsule is active", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "source-session");
    const sourceContext = context("source-session", ownerPi.entries);

    let warningNotified: string | undefined;
    const uiContext = {
      ...sourceContext,
      hasUI: true,
      ui: {
        notify: (msg: string, level?: string) => {
          if (level === "warning") warningNotified = msg;
        },
      },
      isIdle: () => true,
    };

    const command = ownerPi.commands.get("handoff")!;
    assert.ok(command);
    await command.handler("view", uiContext);
    assert.equal(warningNotified, "No active continuation capsule found.");

    const logged: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logged.push(msg); };
    try {
      const nonUiContext = {
        ...sourceContext,
        hasUI: false,
        isIdle: () => true,
      };
      await command.handler("view", nonUiContext);
      assert.equal(logged.length, 1);
      assert.equal(logged[0]!, "No active continuation capsule found.");
    } finally {
      console.log = origLog;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/handoff recovers cleanly after a cancelled replacement and succeeds on retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "source-session");
    const sourceContext = context("source-session", ownerPi.entries);

    const handoffTool = ownerPi.tools.get("akeel_handoff")!;
    await execute(handoffTool, { action: "record", payload: {
      id: "retry-task",
      kind: "requirement",
      statement: "Verify cancellation and retry loop.",
      authority: "user-approved",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    } }, sourceContext);

    const command = ownerPi.commands.get("handoff")!;
    assert.ok(command);

    // 1. First attempt: user cancels replacement
    const cancelledContext = {
      ...sourceContext,
      isIdle: () => true,
      newSession: async () => ({ cancelled: true }),
    };
    await command.handler("", cancelledContext);

    // Session has recorded the cancellation entry
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:switch-cancelled"), true);

    // 2. Second attempt: user retries without arguments and confirms replacement
    const sentMessages: string[] = [];
    let successorSessionFile: string | undefined;
    const successorEntries: CustomEntry[] = [];
    const successorCtx = {
      ...context("retry-successor", successorEntries),
      sendUserMessage: async (msg: string) => { sentMessages.push(msg); },
    };
    const confirmedContext = {
      ...sourceContext,
      isIdle: () => true,
      newSession: async (options: any) => {
        successorSessionFile = options.parentSession;
        await options.setup(successorCtx.sessionManager);
        await options.withSession(successorCtx);
        return { cancelled: false };
      },
    };

    // Retry must succeed without hitting the 'cancelled' state deadlock
    await command.handler("", confirmedContext);

    assert.equal(successorSessionFile, "/sessions/source-session.jsonl");
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0]!, /<akeel-session-handoff>/);
    assert.match(sentMessages[0]!, /Verify cancellation and retry loop/);

    // Successor can hydrate and reconcile
    await start(ownerPi, "retry-successor", successorEntries);
    const successorHandoff = ownerPi.tools.get("akeel_handoff")!;
    const status = await execute(successorHandoff, { action: "status" }, context("retry-successor", successorEntries));
    const liveIds = status.details.result.units.filter((u: any) => u.status === "live").map((u: any) => u.id);
    assert.equal(liveIds.includes("retry-task"), true);

    const reconciled = await execute(successorHandoff, { action: "reconcile", payload: {
      importedSemanticIds: liveIds,
      conflicts: [],
      unresolvedSemanticIds: [],
      workspaceVerified: true,
    } }, context("retry-successor", successorEntries));
    assert.equal(reconciled.details.result.state, "reconciled");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("semanticUnits isolates historical entries and preserves continuation capsule snapshot closures", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "isolated-session");

    // Manually construct a branch with historical record, a continuation capsule, and a fresh record
    const syntheticBranch: CustomEntry[] = [
      {
        type: "custom",
        customType: "akeel:semantic-ledger",
        data: {
          action: "record",
          unit: {
            id: "historical-unit",
            kind: "assumption",
            statement: "Original live statement before snapshot.",
            authority: "inferred",
            status: "live",
            sourceRef: "session:entry-0",
          },
        },
      },
      {
        type: "custom",
        customType: "akeel:continuation-capsule",
        data: {
          digest: "sha256:1111222233334444",
          content: "Rendered continuation capsule.",
          sourceSessionId: "parent-session",
          successorSessionId: "isolated-session",
          capsule: {
            schemaVersion: 1,
            taskRef: "docs/task.md#t-0145",
            authorityRefs: [],
            roots: ["next-step"],
            checkpoint: {
              state: "incomplete",
              currentSlice: "Snapshot isolation",
              actualState: "Capsule loaded.",
              nextActionId: "next-step",
            },
            workspace: { cwd: "/workspace/project", files: [] },
            units: [
              {
                id: "historical-unit",
                kind: "assumption",
                statement: "Original live statement before snapshot.",
                authority: "inferred",
                status: "superseded",
                sourceRef: "session:entry-0",
                closure: {
                  disposition: "superseded",
                  basisRef: "auto-synthesis",
                  destinationRef: "next-step",
                },
              },
              {
                id: "next-step",
                kind: "next-action",
                statement: "Continue in successor.",
                authority: "user-approved",
                status: "live",
                sourceRef: "docs/task.md#t-0145",
              },
            ],
            liveSemantics: [
              {
                id: "next-step",
                kind: "next-action",
                statement: "Continue in successor.",
                authority: "user-approved",
                status: "live",
                sourceRef: "docs/task.md#t-0145",
              },
            ],
            closures: [
              {
                semanticId: "historical-unit",
                disposition: "superseded",
                basisRef: "auto-synthesis",
                destinationRef: "next-step",
              },
            ],
          },
        },
      },
      {
        type: "custom",
        customType: "akeel:semantic-ledger",
        data: {
          action: "record",
          unit: {
            id: "fresh-unit",
            kind: "finding",
            statement: "New finding recorded in current session.",
            authority: "observed",
            status: "live",
            sourceRef: "session:entry-3",
          },
        },
      },
    ];

    const ctx = context("isolated-session", syntheticBranch);
    const handoffTool = ownerPi.tools.get("akeel_handoff")!;
    const status = await execute(handoffTool, { action: "status" }, ctx);
    const units: any[] = status.details.result.units;

    const historical = units.find((u) => u.id === "historical-unit");
    assert.ok(historical);
    // Crucial: historical-unit MUST remain superseded as recorded in the capsule snapshot
    assert.equal(historical.status, "superseded");
    assert.equal(historical.closure?.destinationRef, "next-step");

    const fresh = units.find((u) => u.id === "fresh-unit");
    assert.ok(fresh);
    assert.equal(fresh.status, "live");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepare action fails closed on workspace cwd mismatch and canReuseActive respects cwd change", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "cwd-session");
    const handoff = ownerPi.tools.get("akeel_handoff")!;
    const ownerCtx = context("cwd-session", ownerPi.entries);

    await execute(handoff, { action: "record", payload: {
      id: "next",
      kind: "next-action",
      statement: "Continue.",
      authority: "user-approved",
      status: "live",
      sourceRef: "docs/task.md#t-0145",
    } }, ownerCtx);

    // 1. Prepare with mismatched cwd must throw staticFailure
    await assert.rejects(() => execute(handoff, { action: "prepare", payload: {
      taskRef: "docs/task.md#t-0145",
      authorityRefs: [],
      roots: ["next"],
      checkpoint: {
        state: "incomplete",
        currentSlice: "CWD check",
        actualState: "Testing cwd mismatch.",
        nextActionId: "next",
      },
      workspace: { cwd: "/other/workspace/project", files: [] },
    } }, ownerCtx), /Handoff operation failed/);

    // 2. Prepare with valid cwd succeeds
    await execute(handoff, { action: "prepare", payload: {
      taskRef: "docs/task.md#t-0145",
      authorityRefs: [],
      roots: ["next"],
      checkpoint: {
        state: "incomplete",
        currentSlice: "CWD check",
        actualState: "Testing valid cwd.",
        nextActionId: "next",
      },
      workspace: { cwd: "/workspace/project", files: [] },
    } }, ownerCtx);

    // 3. Changing context cwd forces canReuseActive to false and re-synthesizes capsule with new cwd
    const changedCwdContext = {
      ...ownerCtx,
      cwd: "/new/workspace/project",
      isIdle: () => true,
      newSession: async (options: any) => {
        const successorEntries: CustomEntry[] = [];
        const successorCtx = {
          ...context("cwd-successor", successorEntries),
          cwd: "/new/workspace/project",
          sendUserMessage: async () => {},
        };
        await options.setup(successorCtx.sessionManager);
        await options.withSession(successorCtx);
        return { cancelled: false };
      },
    };

    const command = ownerPi.commands.get("handoff")!;
    assert.ok(command);
    await command.handler("", changedCwdContext);

    // The prepared capsule appended for the switch must contain the new cwd
    const lastPrepared = [...ownerPi.entries].reverse().find((e) => e.customType === "akeel:prepared-capsule");
    assert.ok(lastPrepared);
    assert.equal((lastPrepared!.data as any).capsule.workspace.cwd, "/new/workspace/project");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/handoff notifies error when session is not idle without throwing", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    await start(ownerPi, "busy-session");

    let notifiedError: string | undefined;
    const busyContext = {
      ...context("busy-session", ownerPi.entries),
      hasUI: true,
      ui: {
        notify: (msg: string, level?: string) => {
          if (level === "error") notifiedError = msg;
        },
      },
      isIdle: () => false,
    };

    const command = ownerPi.commands.get("handoff")!;
    assert.ok(command);
    await command.handler("", busyContext);
    assert.equal(notifiedError, "Handoff session replacement failed: session is not idle.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publisher fails with static errors when Herdr topology is unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const childPi = fakePi("invalid-capability");
    installArtifactExchange(childPi.pi, { root });
    await start(childPi, "child-session");
    const publisher = childPi.tools.get("akeel_publish_artifact");
    assert.ok(publisher);
    await assert.rejects(
      () => execute(publisher!, { content: "result" }, context("child-session")),
      /Artifact publication failed\./,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("akeel_handoff registers strongly-typed payload parameter schema and validates payloads", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root });
    const handoffTool = ownerPi.tools.get("akeel_handoff") as any;
    assert.ok(handoffTool);
    assert.equal(handoffTool.parameters.additionalProperties, false);
    assert.ok(handoffTool.parameters.properties.payload);
    assert.equal(handoffTool.parameters.properties.payload.anyOf.length, 4);

    const validRecord = {
      action: "record",
      payload: {
        id: "rec-1",
        kind: "finding",
        statement: "Valid finding statement.",
        authority: "observed",
        status: "live",
        sourceRef: "docs/task.md",
      },
    };
    assert.equal(Value.Check(handoffTool.parameters, validRecord), true);

    const invalidRecordMissingStatement = {
      action: "record",
      payload: {
        id: "rec-1",
        kind: "finding",
        authority: "observed",
        status: "live",
        sourceRef: "docs/task.md",
      },
    };
    assert.equal(Value.Check(handoffTool.parameters, invalidRecordMissingStatement), false);

    const validClose = {
      action: "close",
      payload: {
        id: "rec-1",
        status: "closed",
        closure: {
          disposition: "materialized",
          basisRef: "commit-123",
          destinationRef: "docs/task.md",
        },
      },
    };
    assert.equal(Value.Check(handoffTool.parameters, validClose), true);

    const validReconcile = {
      action: "reconcile",
      payload: {
        importedSemanticIds: ["rec-1"],
        conflicts: [],
        unresolvedSemanticIds: [],
        workspaceVerified: true,
      },
    };
    assert.equal(Value.Check(handoffTool.parameters, validReconcile), true);

    const validReconcileBlocked = {
      action: "reconcile",
      payload: {
        importedSemanticIds: ["rec-1"],
        conflicts: [{ semanticId: "rec-1", observedReality: "drifted" }],
        unresolvedSemanticIds: [],
        workspaceVerified: false,
      },
    };
    assert.equal(Value.Check(handoffTool.parameters, validReconcileBlocked), true);

    const prepareWithoutFiles = {
      action: "prepare",
      payload: {
        taskRef: "docs/task.md",
        authorityRefs: [],
        roots: ["rec-1"],
        checkpoint: {
          state: "incomplete",
          currentSlice: "Schema validation",
          actualState: "Checking workspace files.",
          nextActionId: "rec-1",
        },
        workspace: { cwd: "/workspace/project" },
      },
    };
    assert.equal(Value.Check(handoffTool.parameters, prepareWithoutFiles), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
