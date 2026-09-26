import assert from "node:assert/strict";
import {
  discoverVerifiedPowerShell,
  issueTracerExecutionTicket,
  WINDOWS_RUNTIME_PREFIX,
} from "../packages/access-gate/src/access-gate/windows/bootstrap";
import {
  createPowerShellExecutor,
  MAX_POWER_SHELL_TIMEOUT_MS,
  type PowerShellExecutor,
} from "../packages/access-gate/src/access-gate/windows/executor";
import type { PowerShellExecutionTicket } from "../packages/access-gate/src/access-gate/windows/ticket";

const TRACER_TIMEOUT_MS = Math.min(30_000, MAX_POWER_SHELL_TIMEOUT_MS);
const workspaceIdentity = process.cwd();

const RUNTIME_VECTOR = [
  "if ($PSNativeCommandArgumentPassing -ne 'Standard' -or $OutputEncoding.CodePage -ne 65001 -or [Console]::InputEncoding.CodePage -ne 65001 -or [Console]::OutputEncoding.CodePage -ne 65001 -or $PSDefaultParameterValues['*:Encoding'] -ne 'utf8NoBOM') { exit 97 }",
  "Write-Output 'akeel-runtime-ok'",
].join("; ");

const FIXED_VECTORS = [
  { name: "runtime", command: RUNTIME_VECTOR, expected: /akeel-runtime-ok/u },
  { name: "git", command: "git.exe --version", expected: /git version /iu },
  { name: "node", command: "node.exe --version", expected: /^v\d+\.\d+/u },
  { name: "npm", command: "npm.cmd --version", expected: /^\d+\.\d+/u },
] as const;

function request(toolCallId: string, command: string, identity = workspaceIdentity) {
  return {
    toolCallId,
    command,
    cwd: workspaceIdentity,
    workspaceIdentity: identity,
    timeoutMs: TRACER_TIMEOUT_MS,
  };
}

async function executeVector(
  executor: PowerShellExecutor,
  name: string,
  command: string,
  expected: RegExp,
): Promise<void> {
  const toolCallId = `windows-tracer-${name}`;
  const ticket = issueTracerExecutionTicket(toolCallId, command, workspaceIdentity);
  const result = await executor.execute(ticket, request(toolCallId, command));
  assert.equal(result.exitCode, 0, `${name} vector exited unsuccessfully: ${result.output}`);
  assert.match(result.output, expected, `${name} vector did not produce expected output`);
  console.log(`${name}: ${result.output.trim()}`);

  await assert.rejects(
    () => executor.execute(ticket, request(toolCallId, command)),
    /missing, replayed, or mismatched/u,
    `${name} ticket was replayable`,
  );
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Windows bootstrap tracer requires a native Windows checkout; it is not a Linux mock.");
  }

  const executable = await discoverVerifiedPowerShell();
  const executor = createPowerShellExecutor(executable, WINDOWS_RUNTIME_PREFIX);
  console.log(`verified pwsh: ${executable.path}`);

  for (const vector of FIXED_VECTORS) {
    await executeVector(executor, vector.name, vector.command, vector.expected);
  }

  const mutationCommand = "Write-Output 'tracer-original'";
  const mutationTicket = issueTracerExecutionTicket(
    "windows-tracer-mutation",
    mutationCommand,
    workspaceIdentity,
  );
  await assert.rejects(
    () => executor.execute(
      mutationTicket,
      request("windows-tracer-mutation", "Write-Output 'tracer-mutated'"),
    ),
    /missing, replayed, or mismatched/u,
    "mutated command reached the executor",
  );

  const workspaceTicket = issueTracerExecutionTicket(
    "windows-tracer-workspace",
    "Write-Output 'workspace'",
    workspaceIdentity,
  );
  await assert.rejects(
    () => executor.execute(
      workspaceTicket,
      request("windows-tracer-workspace", "Write-Output 'workspace'", `${workspaceIdentity}-changed`),
    ),
    /missing, replayed, or mismatched/u,
    "workspace mutation reached the executor",
  );

  await assert.rejects(
    () => executor.execute(
      Object.freeze({}) as PowerShellExecutionTicket,
      request("windows-tracer-missing", "Write-Output 'missing'"),
    ),
    /missing, replayed, or mismatched/u,
    "missing ticket reached the executor",
  );

  console.log("Windows bootstrap tracer passed.");
}

await main();
