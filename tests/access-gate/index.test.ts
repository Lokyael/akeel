import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import accessGate from "../../src/access-gate/index";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

test("starts with the configured default profile and exposes only its name in the status", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-index-"));
  const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
  type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;
  const handlers = new Map<string, Handler>();
  const statuses = new Map<string, string | undefined>();
  try {
    const pi = {
      registerCommand(name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
        commands.set(name, options.handler);
      },
      on(event: string, handler: Handler) {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI;
    accessGate(pi);
    const ctx = {
      cwd: root,
      hasUI: true,
      ui: {
        select: async () => undefined,
        notify: () => undefined,
        setStatus: (id: string, value: string | undefined) => statuses.set(id, value),
      },
    } as unknown as ExtensionContext;

    await handlers.get("session_start")!(undefined, ctx);
    assert.equal(statuses.get("access-profile"), "plan");
    assert.ok(commands.has("profile"));
    await commands.get("profile")!("guarded-write", ctx);
    assert.equal(statuses.get("access-profile"), "guarded-write");
    await commands.get("profile")!("status", ctx);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resets the active profile on every session start", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-index-"));
  const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
  type Handler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;
  const handlers = new Map<string, Handler>();
  const statuses = new Map<string, string | undefined>();
  try {
    const pi = {
      registerCommand(name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
        commands.set(name, options.handler);
      },
      on(event: string, handler: Handler) {
        handlers.set(event, handler);
      },
    } as unknown as ExtensionAPI;
    accessGate(pi);
    const ctx = {
      cwd: root,
      hasUI: true,
      ui: {
        select: async () => undefined,
        notify: () => undefined,
        setStatus: (id: string, value: string | undefined) => statuses.set(id, value),
      },
    } as unknown as ExtensionContext;
    await handlers.get("session_start")!(undefined, ctx);
    await commands.get("profile")!("project-read", ctx);
    assert.equal(statuses.get("access-profile"), "project-read");
    await handlers.get("session_start")!(undefined, ctx);
    assert.equal(statuses.get("access-profile"), "plan");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
