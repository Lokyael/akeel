import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

type RootManifest = Readonly<{
  readonly pi?: Readonly<{
    readonly extensions?: readonly string[];
  }>;
}>;

const root = resolve(import.meta.dirname!, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as RootManifest;
const extensionPaths = (manifest.pi?.extensions ?? []).map((path) => resolve(root, path));

function registeredToolNames(result: Awaited<ReturnType<typeof discoverAndLoadExtensions>>): string[] {
  return result.extensions.flatMap((extension) => [...extension.tools.keys()]).sort();
}

test("Pi public loader loads every root extension without diagnostics", async () => {
  assert.equal(extensionPaths.length, 5);

  const result = await discoverAndLoadExtensions(extensionPaths, root, root);

  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, extensionPaths.length);
});

test("Pi public loader accepts every AKeel custom tool schema", async () => {
  const result = await discoverAndLoadExtensions(extensionPaths, root, root);
  const tools = result.extensions.flatMap((extension) => [...extension.tools.values()]);
  const expected = [
    "akeel_handoff",
    "akeel_publish_artifact",
    "akeel_run_artifact",
    "akeel_validate_records",
  ];

  assert.deepEqual(registeredToolNames(result), expected);
  for (const tool of tools) {
    assert.equal(typeof tool.definition.name, "string");
    assert.equal(typeof tool.definition.description, "string");
    assert.equal(typeof tool.definition.parameters, "object");
    assert.ok(tool.definition.parameters !== null);
    assert.equal(Array.isArray(tool.definition.parameters), false);
    assert.equal(typeof tool.definition.promptSnippet, "string");
    assert.ok(Array.isArray(tool.definition.promptGuidelines));
    assert.deepEqual(tool.definition.constrainedSampling, { type: "json_schema", strict: "prefer" });
  }
});

test("Pi public runtime dispatches handoff replacement through fresh session context", async () => {
  const agentDir = mkdtempSync(resolve(tmpdir(), "akeel-pi-agent-"));
  const sessionDir = mkdtempSync(resolve(tmpdir(), "akeel-pi-sessions-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    let runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
    const createRuntime = async ({ cwd, agentDir: currentAgentDir, sessionManager, sessionStartEvent }: {
      cwd: string;
      agentDir: string;
      sessionManager: SessionManager;
      sessionStartEvent?: { type: "session_start"; reason: "startup" | "reload" | "new" | "resume" | "fork"; previousSessionFile?: string };
    }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir: currentAgentDir,
        modelRuntime,
        resourceLoaderOptions: {
          additionalExtensionPaths: extensionPaths,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
        },
      });
      const result = await createAgentSessionFromServices({
        services,
        sessionManager,
        noTools: "all",
        sessionStartEvent,
      });
      return { ...result, services, diagnostics: services.diagnostics };
    };

    runtime = await createAgentSessionRuntime(createRuntime, {
      cwd: root,
      agentDir,
      sessionManager: SessionManager.create(root, sessionDir),
    });

    const bind = async (session: typeof runtime.session): Promise<void> => {
      await session.bindExtensions({
        mode: "tui",
        uiContext: {
          select: async () => undefined,
          confirm: async () => false,
          input: async () => undefined,
          notify: () => {},
          setStatus: () => {},
        } as never,
        commandContextActions: {
          waitForIdle: () => session.waitForIdle(),
          newSession: (options) => runtime.newSession(options),
          fork: (entryId, options) => runtime.fork(entryId, options),
          navigateTree: (targetId, options) => runtime.session.navigateTree(targetId, options),
          switchSession: (sessionPath, options) => runtime.switchSession(sessionPath, options),
          reload: () => session.reload(),
        },
        shutdownHandler: () => {},
      });
    };
    runtime.setRebindSession(bind);
    await bind(runtime.session);
    const sourceSessionId = runtime.session.sessionManager.getSessionId();

    await runtime.session.prompt("/handoff");

    assert.notEqual(runtime.session.sessionManager.getSessionId(), sourceSessionId);
    assert.equal(runtime.session.sessionManager.getHeader()?.parentSession !== undefined, true);
    const successorBranch = runtime.session.sessionManager.getBranch();
    const continuationIndex = successorBranch.findIndex((entry) =>
      entry.type === "custom" && entry.customType === "akeel:continuation-capsule");
    const kickoffIndex = successorBranch.findIndex((entry) =>
      entry.type === "custom_message" && entry.customType === "akeel:session-handoff");
    assert.ok(continuationIndex >= 0);
    assert.ok(kickoffIndex > continuationIndex);
    const kickoff = successorBranch[kickoffIndex];
    assert.equal(kickoff.type, "custom_message");
    if (kickoff.type === "custom_message") {
      assert.equal(kickoff.display, false);
      assert.ok(kickoff.details && typeof kickoff.details === "object");
      assert.equal(typeof (kickoff.details as Record<string, unknown>).digest, "string");
    }
    await runtime.dispose();
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test("Pi public runtime dispatches Access Gate decisions through the real ExtensionRunner", async () => {
  const agentDir = mkdtempSync(resolve(tmpdir(), "akeel-pi-agent-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const result = await discoverAndLoadExtensions(extensionPaths, root, root);
    const sessionManager = SessionManager.inMemory(root);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    const modelRegistry = new ModelRegistry(modelRuntime);
    const runner = new ExtensionRunner(result.extensions, result.runtime, root, sessionManager, modelRegistry);
    let activeTools = ["read", "write", "edit", "ls", "grep", "find", "bash"];
    const statuses = new Map<string, string | undefined>();

    runner.bindCore({
      sendMessage: () => {},
      sendUserMessage: () => {},
      appendEntry: (customType, data) => { sessionManager.appendCustomEntry(customType, data); },
      setSessionName: (name) => { sessionManager.appendSessionInfo(name); },
      getSessionName: () => sessionManager.getSessionName(),
      setLabel: () => {},
      getActiveTools: () => [...activeTools],
      getAllTools: () => [],
      setActiveTools: (names) => { activeTools = [...names]; },
      refreshTools: () => {},
      getCommands: () => [],
      setModel: async () => false,
      getThinkingLevel: () => "off",
      setThinkingLevel: () => {},
    }, {
      getModel: () => undefined,
      getScopedModels: () => [],
      isIdle: () => true,
      isProjectTrusted: () => true,
      getSignal: () => undefined,
      abort: () => {},
      hasPendingMessages: () => false,
      shutdown: () => {},
      getContextUsage: () => undefined,
      compact: () => {},
      getSystemPrompt: () => "",
      getSystemPromptOptions: () => ({ cwd: root }),
    });
    runner.bindCommandContext();
    runner.setUIContext({
      select: async () => undefined,
      confirm: async () => false,
      input: async () => undefined,
      notify: () => {},
      setStatus: (key: string, value: string | undefined) => { statuses.set(key, value); },
    } as never, "tui");

    await runner.emit({ type: "session_start", reason: "startup" });
    const decision = await runner.emitToolCall({
      type: "tool_call",
      toolName: "write",
      toolCallId: "runtime-write",
      input: { path: "notes.md", content: "blocked" },
    });

    assert.deepEqual(decision, {
      block: true,
      reason: "The current session is read-only; prompt the user to switch policy.",
    });
    assert.equal(typeof statuses.get("akeel-policy"), "string");

    const beforeAgentStart = await runner.emitBeforeAgentStart("inspect", undefined, { cwd: root });
    assert.match(beforeAgentStart.systemPromptOptions.sections?.akeel_principles ?? "", /Core Behavioral Principles/u);

    const projected = await runner.emitContext([
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "test-call", name: "bash", arguments: { command: "npm test" } }],
      },
      {
        role: "toolResult",
        toolCallId: "test-call",
        toolName: "bash",
        content: [{ type: "text", text: "\nℹ tests 1\nℹ pass 1\n\nCommand exited with code 0" }],
        isError: false,
      },
    ] as never);
    assert.equal((projected[1] as { content: Array<{ text: string }> }).content[0]?.text, "All tests passed\n\nCommand exited with code 0");

    await runner.emit({ type: "session_shutdown", reason: "quit" });
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
