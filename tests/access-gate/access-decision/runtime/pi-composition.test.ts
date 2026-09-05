import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  installGlobalPiAccessDecision,
  installPiAccessDecision,
  type PiCompositionOptions,
} from "../../../../src/access-gate/access-decision";

type Handler = (event: unknown, context: ExtensionContext) => unknown | Promise<unknown>;

function fakePi(): { readonly handlers: Map<string, Handler>; readonly commands: Map<string, (args: string, context: ExtensionContext) => unknown | Promise<unknown>>; readonly pi: ExtensionAPI } {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, (args: string, context: ExtensionContext) => unknown | Promise<unknown>>();
  const pi = {
    on(event: string, handler: Handler): void {
      handlers.set(event, handler);
    },
    registerCommand(name: string, options: { handler: (args: string, context: ExtensionContext) => unknown | Promise<unknown> }): void {
      commands.set(name, options.handler);
    },
  } as unknown as ExtensionAPI;
  return { handlers, commands, pi };
}

function context(cwd: string, hasUI: boolean, confirm: (title: string, message: string) => Promise<boolean>): ExtensionContext {
  return {
    cwd,
    hasUI,
    ui: { confirm, notify(): void {}, setStatus(): void {} },
  } as unknown as ExtensionContext;
}

const options: PiCompositionOptions = {
  policyConfig: { paths: { read: "allow", write: "ask" } },
  projectRoot: "/workspace/project",
  stagingRoot: "/tmp/akeel",
};

async function invoke(handlers: Map<string, Handler>, name: string, event: unknown, hostContext: ExtensionContext): Promise<unknown> {
  const handler = handlers.get(name);
  assert.ok(handler, `missing ${name} handler`);
  return handler(event, hostContext);
}

test("Pi production composition fails closed before session initialization", async () => {
  const { handlers, pi } = fakePi();
  installPiAccessDecision(pi, options);

  assert.deepEqual(
    await invoke(handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, context("/workspace/project", false, async () => false)),
    { block: true, reason: "Blocked because the decision service is not initialized." },
  );
});

test("explicitly disabled access gate passes managed calls while retaining the extension", async () => {
  const { handlers, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: { accessGate: "disabled" },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  const hostContext = context("/workspace/project", false, async () => false);

  await invoke(handlers, "session_start", {}, hostContext);

  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "write", input: "not-an-object" }, hostContext),
    undefined,
  );
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "bash", input: { command: "not statically safe" } }, hostContext),
    undefined,
  );
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "web_search", input: { query: "skills" } }, hostContext),
    undefined,
  );
});

test("Pi production composition creates the service at session start and routes tool calls", async () => {
  const { handlers, pi } = fakePi();
  installPiAccessDecision(pi, options);
  const hostContext = context("/workspace/project", true, async () => true);

  await invoke(handlers, "session_start", {}, hostContext);

  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, hostContext),
    undefined,
  );
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\n" } }, hostContext),
    undefined,
  );
});

test("Pi global composition loads only the new policy.yaml and denies when absent", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "akeel-global-policy-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "akeel-global-project-"));
  mkdirSync(join(agentDir, "akeel"), { recursive: true });
  mkdirSync(join(projectRoot, ".git"));
  try {
    const blocked = fakePi();
    installGlobalPiAccessDecision(blocked.pi, { agentDir });
    const hostContext = context(projectRoot, false, async () => false);
    await invoke(blocked.handlers, "session_start", {}, hostContext);
    assert.deepEqual(
      await invoke(blocked.handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, hostContext),
      { block: true, reason: "Blocked by access policy." },
    );

    writeFileSync(join(agentDir, "akeel", "policy.yaml"), "paths:\n  read: allow\n");
    const allowed = fakePi();
    installGlobalPiAccessDecision(allowed.pi, { agentDir });
    await invoke(allowed.handlers, "session_start", {}, hostContext);
    assert.equal(
      await invoke(allowed.handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, hostContext),
      undefined,
    );
    await invoke(blocked.handlers, "session_shutdown", {}, hostContext);
    await invoke(allowed.handlers, "session_shutdown", {}, hostContext);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("Pi policy command switches presets and keeps the active state visible", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: {
        review: { paths: { read: "allow" }, commands: { inspect: "allow" } },
        guided: { paths: { read: "allow", write: "ask", edit: "ask" }, commands: { inspect: "allow", modify: "ask", execute: "ask" } },
        develop: { paths: { read: "allow", write: "allow", edit: "allow" }, commands: { inspect: "allow", modify: "allow", execute: "allow" } },
      },
      activePreset: "review",
    },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  const hostContext = context("/workspace/project", true, async () => true);
  await invoke(handlers, "session_start", {}, hostContext);
  const command = commands.get("policy");
  assert.ok(command);

  await command!("develop", hostContext);
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\n" } }, hostContext),
    undefined,
  );
  await command!("unknown", hostContext);
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\n" } }, hostContext),
    undefined,
  );
});

test("Pi production composition clears the service at session shutdown", async () => {
  const { handlers, pi } = fakePi();
  installPiAccessDecision(pi, options);
  const hostContext = context("/workspace/project", false, async () => false);

  await invoke(handlers, "session_start", {}, hostContext);
  await invoke(handlers, "session_shutdown", {}, hostContext);

  assert.deepEqual(
    await invoke(handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, hostContext),
    { block: true, reason: "Blocked because the decision service is not initialized." },
  );
});
