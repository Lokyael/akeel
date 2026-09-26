import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import {
  DEFAULT_HOST_TIMEOUT_MS,
  HostErrorResponse,
  HostRequestPayload,
  HostResponse,
  parseHostResponse,
  serializeHostRequest,
  WINDOWS_HOST_PROTOCOL_VERSION,
} from "./protocol";

export type HostProcess = Readonly<{
  stdin: Writable;
  stdout: Readable;
  killed: boolean;
  kill: (signal?: NodeJS.Signals) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
}>;

export type HostProcessSpawner = (
  executable: string,
  args: readonly string[],
  options: Readonly<Record<string, unknown>>,
) => HostProcess;

export type WindowsHostClientOptions = Readonly<{
  executablePath: string;
  spawner?: HostProcessSpawner;
  defaultTimeoutMs?: number;
  onHostError?: (error: Error) => void;
}>;

type PendingRequest = {
  readonly seq: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
};

export class WindowsHostClient {
  readonly #executablePath: string;
  readonly #spawner: HostProcessSpawner;
  readonly #timeoutMs: number;
  readonly #onHostError?: (error: Error) => void;

  #process: HostProcess | undefined;
  #seq = 0;
  #pending = new Map<number, PendingRequest>();
  #stdoutBuffer = "";
  #closed = false;
  #terminatedError: Error | undefined;

  constructor(options: WindowsHostClientOptions) {
    if (!options.executablePath || typeof options.executablePath !== "string") {
      throw new TypeError("executablePath must be a non-empty string");
    }
    this.#executablePath = options.executablePath;
    this.#spawner = options.spawner ?? defaultSpawner;
    this.#timeoutMs = options.defaultTimeoutMs ?? DEFAULT_HOST_TIMEOUT_MS;
    this.#onHostError = options.onHostError;
  }

  isAlive(): boolean {
    return !this.#closed && this.#terminatedError === undefined &&
      this.#process !== undefined && !this.#process.killed;
  }

  async request<T = unknown>(payload: HostRequestPayload, timeoutMs?: number): Promise<T> {
    if (this.#closed || this.#terminatedError !== undefined) {
      const detail = this.#terminatedError ? `: ${this.#terminatedError.message}` : "";
      throw new Error(`Windows host client is closed or terminated${detail}`);
    }
    const proc = this.#ensureProcess();
    const seq = ++this.#seq;
    const requestMessage = Object.freeze({
      version: WINDOWS_HOST_PROTOCOL_VERSION,
      seq,
      ...payload,
    });
    const serialized = serializeHostRequest(requestMessage);

    const actualTimeout = timeoutMs ?? this.#timeoutMs;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(seq);
        const err = new Error(`Windows host request seq=${seq} timed out after ${actualTimeout}ms`);
        this.#terminate(err);
        reject(err);
      }, actualTimeout);

      this.#pending.set(seq, {
        seq,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      try {
        proc.stdin.write(serialized, "utf8");
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(seq);
        const err = error instanceof Error ? error : new Error(String(error));
        this.#terminate(err);
        reject(err);
      }
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#terminate(new Error("Windows host client closed gracefully"));
  }

  #ensureProcess(): HostProcess {
    if (this.#process !== undefined && !this.#process.killed) {
      return this.#process;
    }
    if (this.#closed || this.#terminatedError !== undefined) {
      throw new Error("Windows host client is closed and cannot spawn new process");
    }

    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
    ];

    const proc = this.#spawner(this.#executablePath, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer | string) => {
      this.#onStdoutData(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    proc.on("exit", (code: number | null, signal: string | null) => {
      const exitReason = `Windows host process exited (code=${code}, signal=${signal})`;
      this.#terminate(new Error(exitReason));
    });

    proc.on("error", (error: Error) => {
      this.#terminate(error);
    });

    this.#process = proc;
    return proc;
  }

  #onStdoutData(text: string): void {
    this.#stdoutBuffer += text;
    while (true) {
      const newlineIndex = this.#stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const line = this.#stdoutBuffer.slice(0, newlineIndex);
      this.#stdoutBuffer = this.#stdoutBuffer.slice(newlineIndex + 1);
      if (line.trim().length === 0) continue;

      let response: HostResponse;
      try {
        response = parseHostResponse(line);
      } catch (error) {
        this.#terminate(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      const pending = this.#pending.get(response.seq);
      if (!pending) {
        // Sequence mismatch or unexpected message -> protocol desync
        this.#terminate(new Error(`Windows host protocol sequence mismatch: received unexpected seq=${response.seq}`));
        return;
      }

      this.#pending.delete(response.seq);
      clearTimeout(pending.timer);

      if (response.ok) {
        pending.resolve(response.data);
      } else {
        const errResp = response as HostErrorResponse;
        pending.reject(new Error(`Windows host error [${errResp.code ?? "unknown"}]: ${errResp.error}`));
      }
    }
  }

  #terminate(error: Error): void {
    if (this.#terminatedError !== undefined) return;
    this.#terminatedError = error;
    if (this.#process !== undefined && !this.#process.killed) {
      try {
        this.#process.kill();
      } catch {
        // ignore kill error
      }
    }
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#stdoutBuffer = "";
    if (this.#onHostError && !this.#closed) {
      this.#onHostError(error);
    }
  }
}

function defaultSpawner(
  executable: string,
  args: readonly string[],
  options: Readonly<Record<string, unknown>>,
): HostProcess {
  return spawn(executable, [...args], options) as unknown as HostProcess;
}
