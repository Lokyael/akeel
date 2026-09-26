import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const lifecycleGeneration = 1;

const RUNTIME_VECTOR = [
  "if ($PSNativeCommandArgumentPassing -ne 'Standard' -or $OutputEncoding.CodePage -ne 65001 -or [Console]::InputEncoding.CodePage -ne 65001 -or [Console]::OutputEncoding.CodePage -ne 65001 -or $PSDefaultParameterValues['*:Encoding'] -ne 'utf8NoBOM') { exit 97 }",
  "Write-Output 'akeel-runtime-ok'",
].join("; ");

const FIXED_VECTORS = [
  { name: "runtime", command: RUNTIME_VECTOR, expected: /akeel-runtime-ok/u },
  { name: "git-version", command: "git.exe --version", expected: /git version /iu },
  { name: "node-version", command: "node.exe --version", expected: /^v\d+\.\d+/u },
  { name: "npm-version", command: "npm.cmd --version", expected: /^\d+\.\d+/u },
] as const;

const ARGUMENT_VECTOR = ["", "space value", "中文", "trailing\\"] as const;
const ARGUMENT_COMMAND_SUFFIX = "'' 'space value' '中文' 'trailing\\'";

function request(toolCallId: string, command: string, generation = lifecycleGeneration) {
  return {
    toolCallId,
    command,
    lifecycleGeneration: generation,
    timeoutMs: TRACER_TIMEOUT_MS,
  };
}

async function executeVector(
  executor: PowerShellExecutor,
  name: string,
  command: string,
  expected: RegExp,
  cwd = workspaceIdentity,
): Promise<string> {
  const toolCallId = `windows-tracer-${name}`;
  const ticket = issueTracerExecutionTicket(toolCallId, command, workspaceIdentity, cwd, lifecycleGeneration);
  const result = await executor.execute(ticket, request(toolCallId, command));
  assert.equal(result.exitCode, 0, `${name} vector exited unsuccessfully: ${result.output}`);
  assert.match(result.output, expected, `${name} vector did not produce expected output`);
  console.log(`${name}: ${result.output.trim()}`);

  await assert.rejects(
    () => executor.execute(ticket, request(toolCallId, command)),
    /missing, replayed, or mismatched/u,
    `${name} ticket was replayable`,
  );
  return result.output;
}

function assertArgumentVector(name: string, output: string): void {
  const line = output.split(/\r?\n/u).find((candidate) => candidate.startsWith("AKEEL_ARGV:"));
  assert.ok(line, `${name} did not emit argument evidence: ${output}`);
  assert.deepEqual(JSON.parse(line.slice("AKEEL_ARGV:".length)), ARGUMENT_VECTOR, `${name} changed native arguments`);
}

async function executeArgumentVectors(executor: PowerShellExecutor, root: string): Promise<void> {
  writeFileSync(join(root, "argv-probe.cjs"),
    "process.stdout.write('AKEEL_ARGV:' + JSON.stringify(process.argv.slice(2)) + '\\n');\n", "utf8");
  writeFileSync(join(root, "package.json"), JSON.stringify({
    private: true,
    scripts: { "argv-probe": "node.exe argv-probe.cjs" },
  }), "utf8");

  const nodeOutput = await executeVector(
    executor,
    "node-argv",
    `node.exe argv-probe.cjs ${ARGUMENT_COMMAND_SUFFIX}`,
    /AKEEL_ARGV:/u,
    root,
  );
  assertArgumentVector("node.exe", nodeOutput);

  const npmOutput = await executeVector(
    executor,
    "npm-argv",
    `npm.cmd run argv-probe -- ${ARGUMENT_COMMAND_SUFFIX}`,
    /AKEEL_ARGV:/u,
    root,
  );
  assertArgumentVector("npm.cmd", npmOutput);

  await executeVector(executor, "git-init", "git.exe init --quiet 'repo 中文'", /^$/u, root);
  const gitOutput = await executeVector(
    executor,
    "git-path",
    "git.exe -C 'repo 中文' rev-parse --show-toplevel",
    /repo 中文/iu,
    root,
  );
  assert.match(gitOutput.replace(/\\/gu, "/"), /\/repo 中文\s*$/u, "git.exe changed the spaced Unicode path");
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Windows bootstrap tracer requires a native Windows checkout; it is not a Linux mock.");
  }

  const executable = await discoverVerifiedPowerShell();
  const executor = createPowerShellExecutor(executable, WINDOWS_RUNTIME_PREFIX);
  const tracerRoot = mkdtempSync(join(tmpdir(), "akeel-windows-tracer-"));
  console.log(`verified pwsh: ${executable.path}`);

  try {
    for (const vector of FIXED_VECTORS) {
      await executeVector(executor, vector.name, vector.command, vector.expected);
    }
    await executeArgumentVectors(executor, tracerRoot);
  } finally {
    rmSync(tracerRoot, { recursive: true, force: true });
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

  const lifecycleTicket = issueTracerExecutionTicket(
    "windows-tracer-lifecycle",
    "Write-Output 'lifecycle'",
    workspaceIdentity,
  );
  await assert.rejects(
    () => executor.execute(
      lifecycleTicket,
      request("windows-tracer-lifecycle", "Write-Output 'lifecycle'", lifecycleGeneration + 1),
    ),
    /missing, replayed, or mismatched/u,
    "stale lifecycle ticket reached the executor",
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
