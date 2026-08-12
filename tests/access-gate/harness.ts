// tests/access-gate/harness.ts
// 共享 extension harness：pi/ctx/sessionManager/footer 构造，供 index 与子代理会话集成测试复用。

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import accessGate from "../../src/access-gate/index";

export type Footer = { render(width: number): string[] };
export type FooterFactory = (
  tui: { requestRender(): void },
  theme: { fg(color: string, text: string): string },
  footerData: { getGitBranch(): string | null },
) => Footer;

export interface Harness {
  commands: Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>;
  handlers: Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>;
  ctx: ExtensionContext;
  pi: ExtensionAPI;
  startFooter(): Footer;
  getRenderRequests(): number;
  getNotifications(): { message: string; level: string }[];
}

export function createHarness(root: string): Harness {
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
    pi,
    startFooter(): Footer {
      assert.ok(footerFactory, "footer factory not installed");
      return footerFactory(
        { requestRender: () => renderRequests++ },
        { fg: (_color, text) => text },
        { getGitBranch: () => "main" },
      );
    },
    getRenderRequests: () => renderRequests,
    getNotifications: () => notifications,
  };
}

export function startSession() {
  const root = mkdtempSync(join(tmpdir(), "pi-access-"));
  const harness = createHarness(root);
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  accessGate(harness.pi);
  return { harness, root, cleanup };
}

// ─── env 构造/保存/恢复（子代理测试样板统一） ───

/** 构造独立 env 对象（默认空），供 env 参数化函数直接断言。 */
export function makeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

/** 应用构造 env 到 process.env 并执行 fn，finally 恢复原值（undefined=删除键）。 */
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
