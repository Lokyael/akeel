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
import { createPowerShellExecutor } from "../../packages/access-gate/src/access-gate/windows/executor";
import { issuePowerShellExecutionTicket } from "../../packages/access-gate/src/access-gate/windows/ticket";
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

test("execution tickets bind call id, command, and workspace and are single-use", async () => {
  const calls: Array<{ executable: string; script: string }> = [];
  const executor = createPowerShellExecutor(verified, "$trusted = $true", async (executable, script) => {
    calls.push({ executable, script });
    return { exitCode: 0, output: "ok", truncated: false };
  });
  const ticket = issuePowerShellExecutionTicket({
    toolCallId: "call-1",
    command: "Write-Output ok",
    workspaceIdentity: "C:\\workspace",
  });

  assert.deepEqual(await executor.execute(ticket, {
    toolCallId: "call-1",
    command: "Write-Output ok",
    cwd: "C:\\workspace",
  }), { exitCode: 0, output: "ok", truncated: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.executable, verified.path);
  assert.match(calls[0]?.script ?? "", /^\$trusted = \$true;Write-Output ok/u);
  await assert.rejects(() => executor.execute(ticket, {
    toolCallId: "call-1", command: "Write-Output ok", cwd: "C:\\workspace",
  }), /missing, replayed, or mismatched/u);

  const mutated = issuePowerShellExecutionTicket({
    toolCallId: "call-2", command: "Write-Output ok", workspaceIdentity: "C:\\workspace",
  });
  await assert.rejects(() => executor.execute(mutated, {
    toolCallId: "call-2", command: "Write-Output changed", cwd: "C:\\workspace",
  }), /missing, replayed, or mismatched/u);
  assert.equal(calls.length, 1);
});

test("Windows bootstrap owns powershell, removes bash, and remains fail-closed", async () => {
  const handlers = new Map<string, (event: ToolCallEvent) => unknown>();
  const tools = new Map<string, { name: string; description: string; parameters: object; sourceInfo: { path: string; source: string } }>();
  for (const name of [...WINDOWS_DIRECT_SURFACES, "bash"]) {
    tools.set(name, { name, description: name, parameters: {}, sourceInfo: { path: `<builtin:${name}>`, source: "builtin" } });
  }
  tools.set("powershell", { name: "powershell", description: "builtin", parameters: {}, sourceInfo: { path: "<builtin:powershell>", source: "builtin" } });
  let active = ["read", "bash"];
  let registered: { name: string; execute: (...args: any[]) => Promise<unknown> } | undefined;
  const pi = {
    registerTool(tool: { name: string; execute: (...args: any[]) => Promise<unknown> }) {
      registered = tool;
      tools.set("powershell", { name: tool.name, description: "akeel", parameters: {}, sourceInfo: { path: "./packages/access-gate/src/access-gate", source: "local" } });
    },
    getAllTools: () => [...tools.values()],
    getActiveTools: () => active,
    setActiveTools: (names: string[]) => { active = names; },
    on: (name: string, handler: (event: ToolCallEvent) => unknown) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
  } as unknown as ExtensionAPI;

  installWindowsBootstrap(pi, {
    resolvePowerShell: async () => verified,
    executor: createPowerShellExecutor(verified, "$true", async () => ({ exitCode: 0, output: "", truncated: false })),
  });
  assert.ok(registered);
  assert.equal(isOwnedWindowsPowerShellTool(tools.get("powershell")!), true);

  const beforeStart = handlers.get("tool_call")!({ type: "tool_call", toolName: "powershell", toolCallId: "x", input: { command: "Get-ChildItem" } });
  assert.deepEqual(beforeStart, { block: true, reason: WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON });
  await handlers.get("session_start")!({ type: "session_start", reason: "startup" } as never);
  assert.equal(active.includes("bash"), false);
  assert.equal(active.includes("powershell"), true);
  assert.deepEqual(handlers.get("tool_call")!({ type: "tool_call", toolName: "powershell", toolCallId: "x", input: { command: "Get-ChildItem" } }), {
    block: true,
    reason: WINDOWS_BOOTSTRAP_BLOCK_REASON,
  });
  assert.deepEqual(handlers.get("tool_call")!({ type: "tool_call", toolName: "read", toolCallId: "x", input: { path: "file.txt" } }), {
    block: true,
    reason: WINDOWS_BOOTSTRAP_BLOCK_REASON,
  });
  assert.equal(handlers.get("tool_call")!({ type: "tool_call", toolName: "unowned", toolCallId: "x", input: {} }), undefined);
});