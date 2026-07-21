import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
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
      notify: () => undefined,
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
    pi,
  };
}

test("renders the active Profile in a two-line Footer and refreshes after switching", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-index-"));
  try {
    const harness = createHarness(root);
    accessGate(harness.pi);
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    const footer = harness.startFooter();

    let lines = footer.render(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /plan$/);
    assert.doesNotMatch(lines[0]!, /Profile:/);
    await harness.commands.get("profile")!("guarded-write", harness.ctx);
    lines = footer.render(120);
    assert.match(lines[0]!, /guarded-write$/);
    assert.ok(harness.getRenderRequests() > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resets the active Profile and Footer on every session start", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-index-"));
  try {
    const harness = createHarness(root);
    accessGate(harness.pi);
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    const footer = harness.startFooter();
    await harness.commands.get("profile")!("project-read", harness.ctx);
    assert.match(footer.render(120)[0]!, /project-read$/);

    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    const resetFooter = harness.startFooter();
    assert.match(resetFooter.render(120)[0]!, /plan$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
