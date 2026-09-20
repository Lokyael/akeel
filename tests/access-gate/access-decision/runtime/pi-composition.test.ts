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
} from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";

type Handler = (event: unknown, context: ExtensionContext) => unknown | Promise<unknown>;

function fakePi(): { readonly handlers: Map<string, Handler>; readonly commands: Map<string, (args: string, context: ExtensionContext) => unknown | Promise<unknown>>; readonly pi: ExtensionAPI } {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, (args: string, context: ExtensionContext) => unknown | Promise<unknown>>();
  const pi = {
    on(event: string, handler: Handler): () => void {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    },
    registerCommand(name: string, options: { handler: (args: string, context: ExtensionContext) => unknown | Promise<unknown> }): void {
      commands.set(name, options.handler);
    },
  } as unknown as ExtensionAPI;
  return { handlers, commands, pi };
}

function context(
  cwd: string,
  hasUI: boolean,
  confirm: (title: string, message: string) => Promise<boolean>,
  mode?: ExtensionContext["mode"],
  select: (prompt: string, options: string[], settings?: unknown) => Promise<string | undefined> = async () => undefined,
  notify: (message: string, level?: "info" | "warning" | "error") => void = () => {},
): ExtensionContext {
  return {
    cwd,
    mode,
    hasUI,
    ui: { confirm, select, notify, setStatus(): void {} },
  } as unknown as ExtensionContext;
}

const options: PiCompositionOptions = {
  policyConfig: { paths: { read: "allow", write: "ask" } },
  projectRoot: "/workspace/project",
  stagingRoot: "/tmp/akeel",
};

const builtinPresets = {
  review: { paths: { read: "allow" }, commands: { inspect: "allow" } },
  guided: { paths: { read: "allow", write: "ask", edit: "ask" }, commands: { inspect: "allow", modify: "ask", execute: "ask" } },
  develop: { paths: { read: "allow", write: "allow", edit: "allow" }, commands: { inspect: "allow", modify: "allow", execute: "allow" } },
} as const;

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

test("Pi composition rejects a project root that differs from the session cwd", async () => {
  const { handlers, pi } = fakePi();
  installPiAccessDecision(pi, { ...options, projectRoot: "/workspace/other" });
  const hostContext = context("/workspace/project", false, async () => false);

  await invoke(handlers, "session_start", {}, hostContext);

  assert.deepEqual(
    await invoke(handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, hostContext),
    { block: true, reason: "Blocked because the decision service is not initialized." },
  );
});

test("explicitly off access gate passes managed calls while retaining the extension and enables via policy command", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: { accessGate: "off" },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  let notification = "";
  const hostContext = context("/workspace/project", false, async () => false, undefined, async () => undefined, (message) => {
    notification = message;
  });

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
  assert.equal(await invoke(handlers, "tool_call", null, hostContext), undefined);

  const policyCommand = commands.get("policy");
  assert.ok(policyCommand);
  await policyCommand!("develop", hostContext);
  assert.equal(notification, "Active AKeel policy: develop.");
});

test("Pi composition hard-denies an agent credential variant under an allowing policy", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "akeel-credential-boundary-"));
  const { handlers, pi } = fakePi();
  try {
    installPiAccessDecision(pi, {
      ...options,
      agentDir,
      policyConfig: { paths: { read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow" } },
    });
    const hostContext = context("/workspace/project", false, async () => false);
    await invoke(handlers, "session_start", {}, hostContext);

    assert.deepEqual(
      await invoke(handlers, "tool_call", { toolName: "read", input: { path: join(agentDir, "auth.json.bak") } }, hostContext),
      {
        block: true,
        reason: "Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user.",
        terminate: true,
      },
    );
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
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

test("Pi composition uses the session-start HOME instead of host-context home", async () => {
  const previousHome = process.env.HOME;
  process.env.HOME = "/workspace/project/session-home";
  try {
    const { handlers, pi } = fakePi();
    installPiAccessDecision(pi, {
      policyConfig: { paths: { read: "allow" }, commands: { inspect: "allow" } },
      projectRoot: "/workspace/project",
      stagingRoot: "/tmp/akeel",
    });
    const hostContext = {
      ...context("/workspace/project", false, async () => false),
      home: "/outside/host-home",
    } as ExtensionContext;
    await invoke(handlers, "session_start", {}, hostContext);

    assert.equal(
      await invoke(handlers, "tool_call", { toolName: "bash", input: { command: "cat ~/input.txt" } }, hostContext),
      undefined,
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test("Pi global composition uses the built-in review policy when external policy is absent", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "akeel-global-policy-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "akeel-global-project-"));
  mkdirSync(join(agentDir, "akeel"), { recursive: true });
  mkdirSync(join(projectRoot, ".git"));
  try {
    const blocked = fakePi();
    installGlobalPiAccessDecision(blocked.pi, { agentDir });
    const hostContext = context(projectRoot, false, async () => false);
    await invoke(blocked.handlers, "session_start", {}, hostContext);
    assert.equal(
      await invoke(blocked.handlers, "tool_call", { toolName: "read", input: { path: "README.md" } }, hostContext),
      undefined,
    );
    assert.deepEqual(
      await invoke(blocked.handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\n" } }, hostContext),
      { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
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

test("native TUI policy command presents presets and applies the selected preset", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: {
        ...builtinPresets,
        audit: {
          paths: { read: "allow", write: "deny", edit: "deny", list: "allow", search: "allow" },
          commands: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
        },
      },
      activePreset: "review",
    },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  let prompt = "";
  let options: string[] = [];
  const hostContext = context(
    "/workspace/project",
    true,
    async () => true,
    "tui",
    async (receivedPrompt, receivedOptions) => {
      prompt = receivedPrompt;
      options = receivedOptions;
      return "develop — Daily development";
    },
  );
  await invoke(handlers, "session_start", {}, hostContext);
  const command = commands.get("policy");
  assert.ok(command);

  await command!("", hostContext);

  assert.equal(prompt, "Select AKeel policy preset:");
  assert.deepEqual(options, [
    "review — Read-only review",
    "guided — Interactive approval",
    "develop — Daily development",
    "audit",
    "off — Bypass Access Gate for this session",
  ]);
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\\n" } }, hostContext),
    undefined,
  );
});

test("explicit policy command switches to a custom preset", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: {
        audit: {
          paths: { read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow" },
          commands: { inspect: "allow", modify: "allow", execute: "deny", destroy: "deny", unknown: "deny" },
        },
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

  await command!("audit", hostContext);

  assert.deepEqual(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\\n" } }, hostContext),
    undefined,
  );
});

test("cancelling the native TUI policy selector keeps the active preset", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: builtinPresets,
      activePreset: "review",
    },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  const hostContext = context("/workspace/project", true, async () => true, "tui", async () => undefined);
  await invoke(handlers, "session_start", {}, hostContext);
  const command = commands.get("policy");
  assert.ok(command);

  await command!("", hostContext);

  assert.deepEqual(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\\n" } }, hostContext),
    { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
  );
});

test("non-TUI policy command does not open a native selector", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: builtinPresets,
      activePreset: "review",
    },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  let selectCalls = 0;
  const hostContext = context(
    "/workspace/project",
    true,
    async () => true,
    "rpc",
    async () => {
      selectCalls++;
      return "develop — Daily development";
    },
  );
  await invoke(handlers, "session_start", {}, hostContext);
  const command = commands.get("policy");
  assert.ok(command);

  await command!("", hostContext);

  assert.equal(selectCalls, 0);
  assert.deepEqual(
    await invoke(handlers, "tool_call", { toolName: "write", input: { path: "notes.md", content: "updated\\n" } }, hostContext),
    { block: true, reason: "The current session is read-only; prompt the user to switch policy." },
  );
});

test("policy status reports the active preset without opening the selector", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: builtinPresets,
      activePreset: "review",
    },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  let selectCalls = 0;
  let notification = "";
  const hostContext = context(
    "/workspace/project",
    true,
    async () => true,
    "tui",
    async () => {
      selectCalls++;
      return undefined;
    },
    (message) => { notification = message; },
  );
  await invoke(handlers, "session_start", {}, hostContext);
  const command = commands.get("policy");
  assert.ok(command);

  await command!("status", hostContext);

  assert.equal(selectCalls, 0);
  assert.equal(notification, "Active AKeel policy: review.");
});

test("Pi policy command switches presets and keeps the active state visible", async () => {
  const { handlers, commands, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      presets: builtinPresets,
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

test("Pi composition keeps relative tool paths anchored to the session-start cwd", async () => {
  const { handlers, pi } = fakePi();
  installPiAccessDecision(pi, {
    policyConfig: {
      paths: {
        read: "allow",
        blockedPaths: ["/workspace/project/subdir/README.md"],
      },
    },
    projectRoot: "/workspace/project",
    stagingRoot: "/tmp/akeel",
  });
  const sessionContext = context("/workspace/project", false, async () => false);
  await invoke(handlers, "session_start", {}, sessionContext);

  assert.equal(
    await invoke(
      handlers,
      "tool_call",
      { toolName: "read", input: { path: "README.md" } },
      context("/workspace/project/subdir", false, async () => false),
    ),
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

test("Pi composition automatically equips capability asset roots with read-only admission and write hard-block", async () => {
  const { handlers, pi } = fakePi();
  const agentDir = "/tmp/test-agent-env";
  installPiAccessDecision(pi, {
    ...options,
    agentDir,
    policyConfig: {
      presets: {
        develop: {
          paths: { read: "allow", write: "allow", edit: "allow" },
          commands: { inspect: "allow", modify: "allow", execute: "allow" },
        },
      },
      activePreset: "develop",
    },
  });
  const hostContext = context("/workspace/project", false, async () => false);
  await invoke(handlers, "session_start", {}, hostContext);

  // 1. Reading a skill asset in agentDir/skills is allowed (even outside project cwd)
  assert.equal(
    await invoke(handlers, "tool_call", { toolName: "read", input: { path: `${agentDir}/skills/survey/SKILL.md` } }, hostContext),
    undefined,
  );

  // 2. Writing to a skill asset is blocked with static reason (anti-tamper invariant under develop)
  const writeBlock = await invoke(handlers, "tool_call", { toolName: "write", input: { path: `${agentDir}/skills/survey/SKILL.md`, content: "tamper" } }, hostContext);
  assert.equal((writeBlock as any)?.block, true);

  // 3. Credential artifact auth.json in agentDir remains blocked
  const credBlock = await invoke(handlers, "tool_call", { toolName: "read", input: { path: `${agentDir}/auth.json` } }, hostContext);
  assert.equal((credBlock as any)?.block, true);
});

test("Pi composition disposal cleans up active session and unregisters handlers", async () => {
  const { handlers, pi } = fakePi();
  const dispose = installPiAccessDecision(pi, options);
  assert.equal(handlers.size, 3);
  dispose();
  assert.equal(handlers.size, 0);
});
