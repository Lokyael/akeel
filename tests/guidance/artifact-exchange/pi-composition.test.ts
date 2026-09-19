import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  let active = ["read", "write"];
  const pi = {
    on(name: string, handler: Handler): void { handlers.set(name, handler); },
    registerFlag(): void {},
    registerCommand(name: string, command: Command): void { commands.set(name, command); },
    getFlag(name: string): unknown { return name === "akeel-artifact-capability" ? flag : undefined; },
    registerTool(tool: Tool & { name: string }): void { tools.set(tool.name, tool); },
    getActiveTools(): string[] { return [...active]; },
    setActiveTools(names: string[]): void { active = [...names]; },
    appendEntry(customType: string, data: unknown): void { entries.push({ type: "custom", customType, data }); },
  } as unknown as ExtensionAPI;
  return { pi, handlers, tools, commands, entries, active: () => active };
}

function context(sessionId: string, entries: readonly CustomEntry[] = []): ExtensionContext {
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
    },
  } as unknown as ExtensionContext;
}

async function start(target: ReturnType<typeof fakePi>, sessionId: string): Promise<void> {
  const handler = target.handlers.get("session_start");
  assert.ok(handler);
  await handler!({}, context(sessionId, target.entries));
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

test("single /akeel-handoff command synthesizes capsule and replaces session in one step with inline args", async () => {
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
        await options.withSession(successorContext);
        return { cancelled: false };
      },
    };

    const command = ownerPi.commands.get("akeel-handoff")!;
    assert.ok(command);
    // User executes single command with inline next action
    await command.handler("Implement the next slice directly", commandContext);

    assert.equal(parentSession, "/sessions/source-session.jsonl");
    assert.equal(sent.length, 1);
    assert.match(sent[0]!, /<akeel-session-handoff>/);
    assert.match(sent[0]!, /Implement the next slice directly/);
    assert.match(sent[0]!, /Parser is recursive descent/);

    // Old session has switched entry and tools frozen on restart
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:handoff-switched"), true);
    await start(ownerPi, "source-session");
    assert.deepEqual(ownerPi.active(), []);

    // Successor session start activates handoff and inspection tools without owner artifact delegation
    await start(ownerPi, "successor-session");
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), false);

    // Successor hydrates captured semantics from the continuation capsule
    const successorHandoff = ownerPi.tools.get("akeel_handoff")!;
    const hydratedStatus = await execute(successorHandoff, { action: "status" }, context("successor-session", ownerPi.entries));
    const hydratedIds = hydratedStatus.details.result.units.map((u: any) => u.id);
    assert.equal(hydratedIds.includes("active-assumption"), true);
    assert.equal(hydratedIds.includes("user-next-action"), true);

    // Successor reconciles directly and is promoted to active Owner
    const reconciled = await execute(successorHandoff, { action: "reconcile", payload: {
      importedSemanticIds: ["active-assumption", "user-next-action"],
      conflicts: [],
      unresolvedSemanticIds: [],
      workspaceVerified: true,
    } }, context("successor-session", ownerPi.entries));
    assert.equal(reconciled.details.result.state, "reconciled");
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), true);

    // Successor survives session restart/reboot with full owner tools intact
    await start(ownerPi, "successor-session");
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), true);
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);

    // Multi-hop handoff: successor (S2) can initiate another handoff to S3 without deadlock
    const s3Entries: CustomEntry[] = [];
    const s3Context = {
      ...context("session-3", s3Entries),
      sendUserMessage: async (msg: string) => { sent.push(msg); },
    };
    const s2CommandContext = {
      ...context("successor-session", ownerPi.entries),
      isIdle: () => true,
      newSession: async (options: any) => {
        parentSession = options.parentSession;
        await options.withSession(s3Context);
        return { cancelled: false };
      },
    };
    await command.handler("Implement slice in S3", s2CommandContext);
    assert.equal(sent.length, 2);
    assert.match(sent[1]!, /Implement slice in S3/);
    assert.match(sent[1]!, /\[user-next-action-2\] Implement slice in S3/);

    // S2 is now retired and frozen on start, while S3 can start
    await start(ownerPi, "successor-session");
    assert.deepEqual(ownerPi.active(), []);
    await start(ownerPi, "session-3");
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

test("/akeel-handoff view inspects active capsule without switching session", async () => {
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

    const command = ownerPi.commands.get("akeel-handoff")!;
    assert.ok(command);
    await command.handler("view", commandContext);

    assert.ok(notifiedText);
    assert.match(notifiedText!, /View test action/);
    assert.equal(ownerPi.entries.some((entry) => entry.customType === "akeel:switch-intent"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/akeel-handoff view logs capsule to console when hasUI is false", async () => {
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

      const command = ownerPi.commands.get("akeel-handoff")!;
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
