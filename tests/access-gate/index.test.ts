import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import accessGate from "../../src/access-gate/index";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Footer = { render(width: number): string[] };
type FooterFactory = (
  tui: { requestRender(): void },
  theme: { fg(color: string, text: string): string },
  footerData: { getGitBranch(): string | null },
) => Footer;

function createHarness(root: string) {
  const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
  type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;
  const handlers = new Map<string, Handler>();
  let footerFactory: FooterFactory | undefined;
  let renderRequests = 0;
  const notifications: { message: string; level: string }[] = [];
  const sessionManager = {
    getSessionId: () => "test-session",
    getCwd: () => root,
    getSessionName: () => undefined,
    getEntries: () => [],
    buildContextEntries: () => [],
  };
  const pi = {
    registerCommand(name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
      commands.set(name, options.handler);
    },
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: root,
    hasUI: true,
    sessionManager,
    ui: {
      select: async () => undefined,
      notify: (message: string, level: string) => { notifications.push({ message, level }); },
      setFooter: (factory: FooterFactory | undefined) => {
        footerFactory = factory;
      },
      getContextUsage: () => ({ percent: 35.2, contextWindow: 272000 }),
    },
  } as unknown as ExtensionContext;

  return {
    commands,
    handlers,
    ctx,
    startFooter(): Footer {
      assert.ok(footerFactory);
      return footerFactory(
        { requestRender: () => renderRequests++ },
        { fg: (_color, text) => text },
        { getGitBranch: () => "main" },
      );
    },
    getRenderRequests: () => renderRequests,
    getNotifications: () => notifications,
    pi,
  };
}

/** Create a harness, start a session, and return the harness + footer. */
function startSession() {
  const root = mkdtempSync(join(tmpdir(), "pi-access-index-"));
  const harness = createHarness(root);
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  accessGate(harness.pi);
  return { harness, root, cleanup };
}

async function startSessionWithFooter(): Promise<{ harness: ReturnType<typeof createHarness>; footer: Footer; cleanup: () => void }> {
  const { harness, cleanup } = startSession();
  await harness.handlers.get("session_start")!(undefined, harness.ctx);
  const footer = harness.startFooter();
  return { harness, footer, cleanup };
}

test("reports invalid global profile configuration at session start", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-invalid-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "profiles.json"), "{ bad json");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.ok(harness.getNotifications().some((entry) => entry.level === "error" && entry.message.includes("failed to load")));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    cleanup();
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("/profile status reports the complete resolved policy", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-status-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "profiles.json"), JSON.stringify({
    defaultProfile: "status-test",
    profiles: {
      "status-test": {
        description: "Status test profile.",
        shellPolicy: { inspect: "allow", modify: "ask", execute: "deny", destroy: "deny", unknown: "ask" },
        pathPolicy: {
          default: { read: "allow", list: "allow", search: "ask", write: "deny" },
          rules: [{ path: "project/docs/**", write: "allow" }],
        },
      },
    },
  }));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    await harness.commands.get("profile")!("status", harness.ctx);
    const message = harness.getNotifications().at(-1)?.message ?? "";
    assert.match(message, /Shell:\n  inspect=allow modify=ask execute=deny destroy=deny unknown=ask/);
    assert.match(message, /Path defaults:\n  read=allow list=allow search=ask write=deny/);
    assert.match(message, /Path rules:\n  project\/docs\/\*\*: write=allow/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    cleanup();
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("renders the active Profile in a two-line Footer and refreshes after switching", async () => {
  const { harness, footer, cleanup } = await startSessionWithFooter();
  try {
    let lines = footer.render(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /plan$/);
    assert.doesNotMatch(lines[0]!, /Profile:/);
    await harness.commands.get("profile")!("query", harness.ctx);
    lines = footer.render(120);
    assert.match(lines[0]!, /query$/);
    assert.ok(harness.getRenderRequests() > 0);
  } finally {
    cleanup();
  }
});

test("resets the active Profile and Footer on every session start", async () => {
  const { harness, footer, cleanup } = await startSessionWithFooter();
  try {
    await harness.commands.get("profile")!("read", harness.ctx);
    assert.match(footer.render(120)[0]!, /read$/);

    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    const resetFooter = harness.startFooter();
    assert.match(resetFooter.render(120)[0]!, /plan$/);
  } finally {
    cleanup();
  }
});
