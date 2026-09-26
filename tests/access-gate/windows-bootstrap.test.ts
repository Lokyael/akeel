import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import {
  WINDOWS_BOOTSTRAP_BLOCK_REASON,
  WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON,
  WINDOWS_DIRECT_SURFACES,
  discoverVerifiedPowerShell,
  freezeVerifiedPowerShellExecutable,
  installWindowsBootstrap,
  isOwnedWindowsPowerShellTool,
  isSupportedPowerShellHandshake,
  resolvePowerShellExecutable,
} from "../../packages/access-gate/src/access-gate/windows/bootstrap";
import {
  createPowerShellExecutor,
  MAX_POWER_SHELL_COMMAND_BYTES,
  MAX_POWER_SHELL_TIMEOUT_MS,
} from "../../packages/access-gate/src/access-gate/windows/executor";
import { issuePowerShellExecutionTicket } from "../../packages/access-gate/src/access-gate/windows/ticket";
import {
  installUnsupportedPlatformBoundary,
  UNSUPPORTED_PLATFORM_BLOCK_REASON,
} from "../../packages/access-gate/src/access-gate/index";
import { selectPlatformComposition } from "../../packages/access-gate/src/access-gate/platform";

const verified = freezeVerifiedPowerShellExecutable("C:\\Program Files\\PowerShell\\7\\pwsh.exe", {
  edition: "Core",
  major: 7,
  minor: 4,
  languageMode: "FullLanguage",
  processPath: "c:/program files/powershell/7/pwsh.exe",
  argumentPassing: "Standard",
});

 test("platform selection keeps Windows composition separate from Linux", () => {
  assert.equal(selectPlatformComposition("win32"), "windows");
  assert.equal(selectPlatformComposition("linux"), "linux");
  assert.equal(selectPlatformComposition("darwin"), "unsupported");
});

test("unsupported platforms install a static fail-closed boundary", () => {
  let handler: ((event: ToolCallEvent) => unknown) | undefined;
  installUnsupportedPlatformBoundary({
    on: ((name: string, candidate: (event: ToolCallEvent) => unknown) => {
      if (name === "tool_call") handler = candidate;
      return () => {};
    }) as never,
  });
  assert.deepEqual(handler?.({ type: "tool_call", toolName: "read", toolCallId: "x", input: {} }), {
    block: true,
    reason: UNSUPPORTED_PLATFORM_BLOCK_REASON,
  });
});

test("PowerShell handshake is closed and requires Core 7.4 FullLanguage Standard", () => {
  assert.equal(isSupportedPowerShellHandshake({
    edition: "Core", major: 7, minor: 4, languageMode: "FullLanguage",
    processPath: "C:\\pwsh.exe", argumentPassing: "Standard",
  }), true);
  assert.equal(isSupportedPowerShellHandshake({
    edition: "Desktop", major: 5, minor: 1, languageMode: "FullLanguage",
    processPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    argumentPassing: "Legacy",
  }), false);
  assert.throws(() => freezeVerifiedPowerShellExecutable("C:\\pwsh.exe", {
    edition: "Core", major: 7, minor: 4, languageMode: "FullLanguage",
    processPath: "C:\\other\\powershell.exe", argumentPassing: "Standard",
  }), /fully-qualified pwsh\.exe/u);
});

test("PowerShell resolution only considers pwsh.exe and freezes the verified identity", async () => {
  const seen: string[] = [];
  const executable = await resolvePowerShellExecutable({
    pathEnv: "C:\\old;C:\\PowerShell\\7",
    pathExists: async (candidate) => {
      seen.push(candidate);
      return candidate === "C:\\PowerShell\\7\\pwsh.exe";
    },
  });
  assert.equal(executable, "C:\\PowerShell\\7\\pwsh.exe");
  assert.deepEqual(seen, ["C:\\old\\pwsh.exe", "C:\\PowerShell\\7\\pwsh.exe"]);

  const discovered = await discoverVerifiedPowerShell({
    pathEnv: "C:\\PowerShell\\7",
    pathExists: async () => true,
    probe: async () => ({
      edition: "Core", major: 7, minor: 5, languageMode: "FullLanguage",
      processPath: "C:\\PowerShell\\7\\pwsh.exe", argumentPassing: "Standard",
    }),
  });
  assert.equal(discovered.path, "C:\\PowerShell\\7\\pwsh.exe");
  assert.equal(discovered.identity, "c:/powershell/7/pwsh.exe|Core|7.5|FullLanguage|Standard");

  const shimResolved = await discoverVerifiedPowerShell({
    pathEnv: "C:\\Users\\dev\\scoop\\shims",
    pathExists: async () => true,
    probe: async () => ({
      edition: "Core", major: 7, minor: 4, languageMode: "FullLanguage",
      processPath: "C:\\Users\\dev\\scoop\\apps\\powershell\\current\\pwsh.exe",
      argumentPassing: "Standard",
    }),
  });
  assert.equal(shimResolved.path, "C:\\Users\\dev\\scoop\\apps\\powershell\\current\\pwsh.exe");
});

test("execution tickets bind call, command, cwd, workspace, and lifecycle and are single-use", async () => {
  const calls: Array<{ executable: string; script: string; cwd: string }> = [];
  const executor = createPowerShellExecutor(verified, "$trusted = $true", async (executable, script, request) => {
    calls.push({ executable, script, cwd: request.cwd });
    return { exitCode: 0, output: "ok", truncated: false };
  });
  const ticket = issuePowerShellExecutionTicket({
    toolCallId: "call-1",
    command: "Write-Output ok",
    cwd: "C:\\approved",
    workspaceIdentity: "C:\\workspace",
    lifecycleGeneration: 7,
  });

  assert.deepEqual(await executor.execute(ticket, {
    toolCallId: "call-1",
    command: "Write-Output ok",
    lifecycleGeneration: 7,
  }), { exitCode: 0, output: "ok", truncated: false });
  assert.deepEqual(calls, [{
    executable: verified.path,
    script: "$trusted = $true;Write-Output ok",
    cwd: "C:\\approved",
  }]);
  await assert.rejects(() => executor.execute(ticket, {
    toolCallId: "call-1", command: "Write-Output ok", lifecycleGeneration: 7,
  }), /missing, replayed, or mismatched/u);

  const mutated = issuePowerShellExecutionTicket({
    toolCallId: "call-2", command: "Write-Output ok", cwd: "C:\\approved",
    workspaceIdentity: "C:\\workspace", lifecycleGeneration: 7,
  });
  await assert.rejects(() => executor.execute(mutated, {
    toolCallId: "call-2", command: "Write-Output changed", lifecycleGeneration: 7,
  }), /missing, replayed, or mismatched/u);
  await assert.rejects(() => executor.execute(mutated, {
    toolCallId: "call-2", command: "Write-Output ok", lifecycleGeneration: 7,
  }), /missing, replayed, or mismatched/u);

  const stale = issuePowerShellExecutionTicket({
    toolCallId: "call-3", command: "Write-Output ok", cwd: "C:\\approved",
    workspaceIdentity: "C:\\workspace", lifecycleGeneration: 7,
  });
  await assert.rejects(() => executor.execute(stale, {
    toolCallId: "call-3", command: "Write-Output ok", lifecycleGeneration: 8,
  }), /missing, replayed, or mismatched/u);
  assert.equal(calls.length, 1);
});

test("executor rejects unbounded command and timeout inputs before spawn", async () => {
  let spawned = 0;
  const executor = createPowerShellExecutor(verified, "$true", async () => {
    spawned++;
    return { exitCode: 0, output: "", truncated: false };
  });
  const oversized = "x".repeat(MAX_POWER_SHELL_COMMAND_BYTES + 1);
  const oversizedTicket = issuePowerShellExecutionTicket({
    toolCallId: "bounded-command",
    command: oversized,
    cwd: "C:\\workspace",
    workspaceIdentity: "C:\\workspace",
    lifecycleGeneration: 1,
  });
  await assert.rejects(() => executor.execute(oversizedTicket, {
    toolCallId: "bounded-command",
    command: oversized,
    lifecycleGeneration: 1,
  }), /bounded input size/u);
  const timeoutTicket = issuePowerShellExecutionTicket({
    toolCallId: "bounded-timeout",
    command: "Write-Output ok",
    cwd: "C:\\workspace",
    workspaceIdentity: "C:\\workspace",
    lifecycleGeneration: 1,
  });
  await assert.rejects(() => executor.execute(timeoutTicket, {
    toolCallId: "bounded-timeout",
    command: "Write-Output ok",
    lifecycleGeneration: 1,
    timeoutMs: MAX_POWER_SHELL_TIMEOUT_MS + 1,
  }), /bounded range/u);
  assert.equal(spawned, 0);
});

test("Windows bootstrap verifies exact ownership, controls the active set, and remains fail-closed", async () => {
  const handlers = new Map<string, (event: ToolCallEvent) => unknown>();
  type SourceInfo = { path: string; source: string; scope: "user" | "project" | "temporary"; origin: "package" | "top-level"; baseDir?: string };
  type Tool = { name: string; description: string; parameters: object; sourceInfo: SourceInfo };
  const builtin = (name: string): Tool => ({
    name, description: name, parameters: {},
    sourceInfo: { path: `<builtin:${name}>`, source: "builtin", scope: "temporary", origin: "top-level" },
  });
  const ownerEntryPath = "C:\\repo\\packages\\access-gate\\src\\access-gate\\index.ts";
  const ownerSource: SourceInfo = {
    path: ownerEntryPath,
    source: "npm:akeel-access-gate@0.1.0",
    scope: "user",
    origin: "package",
    baseDir: "C:\\repo\\packages\\access-gate\\src\\access-gate",
  };
  const tools = new Map<string, Tool>();
  for (const name of [...WINDOWS_DIRECT_SURFACES, "bash", "powershell"]) tools.set(name, builtin(name));
  let active: string[] = ["read", "bash"];
  let registered: { name: string; execute: (...args: any[]) => Promise<unknown> } | undefined;
  const pi = {
    registerTool(tool: { name: string; execute: (...args: any[]) => Promise<unknown> }) {
      registered = tool;
      tools.set("powershell", { name: tool.name, description: "akeel", parameters: {}, sourceInfo: ownerSource });
    },
    getAllTools: () => [...tools.values()],
    getActiveTools: () => active,
    setActiveTools: (names: string[]) => { active = names; },
    on: (name: string, handler: (event: ToolCallEvent) => unknown) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
  } as unknown as ExtensionAPI;

  let resolutionCount = 0;
  let releaseSecondStart: (() => void) | undefined;
  const initializationErrors: string[] = [];
  installWindowsBootstrap(pi, {
    ownerEntryPath,
    resolvePowerShell: async () => {
      resolutionCount++;
      if (resolutionCount === 2) await new Promise<void>((resolve) => { releaseSecondStart = resolve; });
      if (resolutionCount === 3) throw new Error("probe failed");
      return verified;
    },
    executor: createPowerShellExecutor(verified, "$true", async () => ({ exitCode: 0, output: "", truncated: false })),
    onInitializationError: (message) => initializationErrors.push(message),
  });
  assert.ok(registered);
  tools.set("third_party", {
    name: "third_party", description: "third party", parameters: {},
    sourceInfo: { path: "C:\\repo\\third-party\\index.ts", source: "local", scope: "project", origin: "top-level" },
  });
  active.push("third_party");
  assert.equal(isOwnedWindowsPowerShellTool(tools.get("powershell")!, ownerEntryPath), true);
  assert.equal(isOwnedWindowsPowerShellTool({
    name: "powershell",
    sourceInfo: { ...ownerSource, path: "C:\\evil\\packages\\access-gate\\index.ts" },
  }, ownerEntryPath), false);

  assert.deepEqual(handlers.get("tool_call")!({ type: "tool_call", toolName: "third_party", toolCallId: "x", input: {} }), {
    block: true,
    reason: WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON,
  });
  const firstStart = handlers.get("session_start")!({ type: "session_start", reason: "startup" } as never);
  assert.equal(active.length, 0);
  await firstStart;
  assert.deepEqual(active, [...WINDOWS_DIRECT_SURFACES, "powershell"]);
  assert.deepEqual(handlers.get("tool_call")!({ type: "tool_call", toolName: "powershell", toolCallId: "x", input: { command: "Get-ChildItem" } }), {
    block: true,
    reason: WINDOWS_BOOTSTRAP_BLOCK_REASON,
  });

  const secondStart = handlers.get("session_start")!({ type: "session_start", reason: "reload" } as never);
  assert.equal(active.length, 0);
  assert.deepEqual(handlers.get("tool_call")!({ type: "tool_call", toolName: "read", toolCallId: "x", input: { path: "file.txt" } }), {
    block: true,
    reason: WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON,
  });
  releaseSecondStart?.();
  await secondStart;
  assert.deepEqual(active, [...WINDOWS_DIRECT_SURFACES, "powershell"]);

  active.push("third_party");
  const failedStart = handlers.get("session_start")!({ type: "session_start", reason: "reload" } as never);
  assert.equal(active.length, 0);
  await failedStart;
  assert.equal(active.length, 0);
  assert.deepEqual(initializationErrors, ["probe failed"]);
  assert.deepEqual(handlers.get("tool_call")!({ type: "tool_call", toolName: "third_party", toolCallId: "x", input: {} }), {
    block: true,
    reason: WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON,
  });
});
