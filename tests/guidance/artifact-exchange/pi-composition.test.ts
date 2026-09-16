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

function fakePi(flag?: string) {
  const handlers = new Map<string, Handler>();
  const tools = new Map<string, Tool>();
  let active = ["read", "write"];
  const pi = {
    on(name: string, handler: Handler): void { handlers.set(name, handler); },
    registerFlag(): void {},
    getFlag(name: string): unknown { return name === "akeel-artifact-capability" ? flag : undefined; },
    registerTool(tool: Tool & { name: string }): void { tools.set(tool.name, tool); },
    getActiveTools(): string[] { return [...active]; },
    setActiveTools(names: string[]): void { active = [...names]; },
  } as unknown as ExtensionAPI;
  return { pi, handlers, tools, active: () => active };
}

function context(sessionId: string): ExtensionContext {
  return {
    cwd: "/workspace/project",
    hasUI: false,
    ui: {},
    sessionManager: { getSessionId: () => sessionId },
  } as unknown as ExtensionContext;
}

async function start(target: ReturnType<typeof fakePi>, sessionId: string): Promise<void> {
  const handler = target.handlers.get("session_start");
  assert.ok(handler);
  await handler!({}, context(sessionId));
}

async function execute(tool: Tool, params: unknown, ctx: ExtensionContext): Promise<any> {
  return tool.execute("call-1", params, undefined, undefined, ctx);
}

test("ordinary and capability sessions activate mutually exclusive artifact tools", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const ownerPi = fakePi();
    installArtifactExchange(ownerPi.pi, { root, handoffRoot: join(root, "handoffs") });
    await start(ownerPi, "owner-session");
    assert.equal(ownerPi.active().includes("akeel_run_artifact"), true);
    assert.equal(ownerPi.active().includes("akeel_publish_artifact"), false);
    assert.equal(ownerPi.active().includes("akeel_handoff"), true);

    const handoffTool = ownerPi.tools.get("akeel_handoff");
    assert.ok(handoffTool);
    const publishedHandoff = await execute(handoffTool!, { action: "publish", content: "handoff body" }, context("owner-session"));
    const verifiedHandoff = await execute(handoffTool!, { action: "verify", path: publishedHandoff.content[0].text }, context("successor-session"));
    assert.equal(verifiedHandoff.content[0].text, "handoff body");

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
    installArtifactExchange(childPi.pi, { root, handoffRoot: join(root, "handoffs") });
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

test("publisher fails with static errors when Herdr topology is unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-artifact-pi-"));
  chmodSync(root, 0o700);
  try {
    const childPi = fakePi("invalid-capability");
    installArtifactExchange(childPi.pi, { root, handoffRoot: join(root, "handoffs") });
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
