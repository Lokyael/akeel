import { spawn } from "node:child_process";
import { consumePowerShellExecutionTicket, type PowerShellExecutionTicket } from "./ticket";

export const MAX_POWER_SHELL_COMMAND_BYTES = 16_384;
export const MAX_POWER_SHELL_TIMEOUT_MS = 120_000;

export type PowerShellProcessResult = Readonly<{
  readonly exitCode: number | null;
  readonly output: string;
  readonly truncated: boolean;
}>;

export type PowerShellExecutionRequest = Readonly<{
  readonly toolCallId: string;
  readonly command: string;
  readonly cwd: string;
  /** Session-bound workspace identity; the bootstrap currently derives it from cwd. */
  readonly workspaceIdentity: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onData?: (chunk: string) => void;
}>;

export interface PowerShellExecutor {
  execute(ticket: PowerShellExecutionTicket, request: PowerShellExecutionRequest): Promise<PowerShellProcessResult>;
}

export type PowerShellProcessRunner = (
  executable: string,
  script: string,
  request: PowerShellExecutionRequest,
  environment: NodeJS.ProcessEnv,
) => Promise<PowerShellProcessResult>;

export function createPowerShellExecutor(
  executable: Readonly<{ readonly path: string; readonly identity: string }>,
  trustedPrefix: string,
  runner: PowerShellProcessRunner = runPowerShellProcess,
): PowerShellExecutor {
  return Object.freeze({
    async execute(ticket: PowerShellExecutionTicket, request: PowerShellExecutionRequest): Promise<PowerShellProcessResult> {
      if (Buffer.byteLength(request.command, "utf8") > MAX_POWER_SHELL_COMMAND_BYTES) {
        throw new Error("PowerShell command exceeds the bounded input size");
      }
      if (!Number.isFinite(request.timeoutMs ?? MAX_POWER_SHELL_TIMEOUT_MS) ||
        (request.timeoutMs ?? MAX_POWER_SHELL_TIMEOUT_MS) <= 0 ||
        (request.timeoutMs ?? MAX_POWER_SHELL_TIMEOUT_MS) > MAX_POWER_SHELL_TIMEOUT_MS) {
        throw new Error("PowerShell execution timeout is outside the bounded range");
      }
      const bound = consumePowerShellExecutionTicket(ticket, {
        toolCallId: request.toolCallId,
        command: request.command,
        workspaceIdentity: request.workspaceIdentity,
      });
      if (bound === undefined) throw new Error("PowerShell execution ticket is missing, replayed, or mismatched");

      // Execute the immutable command captured by the ticket, not a later
      // request object. The digest check remains a defence-in-depth check for
      // callers that present a separately decoded command string.
      const script = `${trustedPrefix};${bound.command}`;
      return runner(executable.path, script, request, {
        ...process.env,
        AKEEL_VERIFIED_PWSH: executable.path,
        AKEEL_PWSH_IDENTITY: executable.identity,
      });
    },
  });
}

async function runPowerShellProcess(
  executable: string,
  script: string,
  request: PowerShellExecutionRequest,
  environment: NodeJS.ProcessEnv,
): Promise<PowerShellProcessResult> {
  const child = spawn(executable, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    cwd: request.cwd,
    env: environment,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  const maxBytes = 512 * 1024;
  const append = (chunk: Buffer): void => {
    if (bytes >= maxBytes) {
      truncated = true;
      return;
    }
    const remaining = maxBytes - bytes;
    const selected = chunk.subarray(0, remaining);
    chunks.push(selected);
    bytes += selected.byteLength;
    if (selected.byteLength !== chunk.byteLength) truncated = true;
    request.onData?.(selected.toString("utf8"));
  };

  child.stdout.on("data", append);
  child.stderr.on("data", append);

  let timeout: NodeJS.Timeout | undefined;
  let abortHandler: (() => void) | undefined;
  const result = await new Promise<PowerShellProcessResult>((resolve, reject) => {
    let settled = false;
    const finish = (value: PowerShellProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (abortHandler !== undefined) request.signal?.removeEventListener("abort", abortHandler);
      resolve(value);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (abortHandler !== undefined) request.signal?.removeEventListener("abort", abortHandler);
      reject(error);
    };

    child.once("error", (error) => fail(error));
    child.once("close", (exitCode) => finish({
      exitCode,
      output: Buffer.concat(chunks).toString("utf8"),
      truncated,
    }));

    const timeoutMs = request.timeoutMs ?? MAX_POWER_SHELL_TIMEOUT_MS;
    timeout = setTimeout(() => child.kill(), timeoutMs);
    abortHandler = () => child.kill();
    request.signal?.addEventListener("abort", abortHandler, { once: true });
    if (request.signal?.aborted) child.kill();
  });

  return result;
}