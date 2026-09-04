import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import accessGate from "../../src/access-gate/index";

type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;

export interface Harness {
  readonly commands: Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>;
  readonly handlers: Map<string, Handler>;
  readonly ctx: ExtensionContext;
  readonly pi: ExtensionAPI;
  setConfirmResult(value: boolean): void;
  getConfirmCalls(): number;
  hasFooterFactory(): boolean;
}

function createHarness(root: string): Harness {
  const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
  const handlers = new Map<string, Handler>();
  let confirmResult = false;
  let confirmCalls = 0;
  let footerInstalled = false;
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
      confirm: async () => {
        confirmCalls++;
        return confirmResult;
      },
      setFooter: () => {
        footerInstalled = true;
      },
    },
  } as unknown as ExtensionContext;

  return {
    commands,
    handlers,
    ctx,
    pi,
    setConfirmResult: (value) => { confirmResult = value; },
    getConfirmCalls: () => confirmCalls,
    hasFooterFactory: () => footerInstalled,
  };
}

export function startSession() {
  const root = mkdtempSync(join(tmpdir(), "pi-access-"));
  mkdirSync(join(root, ".git"));
  const harness = createHarness(root);
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  accessGate(harness.pi);
  return { harness, root, cleanup };
}

export async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void,
): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
