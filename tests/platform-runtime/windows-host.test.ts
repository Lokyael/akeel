import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  MAX_HOST_REQUEST_BYTES,
  MAX_HOST_RESPONSE_BYTES,
  parseHostResponse,
  serializeHostRequest,
} from "../../packages/platform-runtime/src/windows/protocol";
import {
  WindowsHostClient,
  createHostDriverScript,
  type HostProcessSpawner,
} from "../../packages/platform-runtime/src/windows";

test("protocol serialization and parsing strictly enforce budgets and versions", () => {
  const request = {
    version: 1 as const,
    seq: 42,
    type: "ping" as const,
  };
  const line = serializeHostRequest(request);
  assert.equal(line.endsWith("\n"), true);

  const parsed = parseHostResponse(JSON.stringify({
    version: 1,
    seq: 42,
    ok: true,
    data: { pong: true },
  }));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.data, { pong: true });
  }

  assert.throws(
    () => serializeHostRequest({
      version: 1,
      seq: 1,
      type: "parse-ast",
      script: "x".repeat(MAX_HOST_REQUEST_BYTES),
    }),
    /exceeds maximum allowed byte budget/u,
  );

  assert.throws(
    () => parseHostResponse("x".repeat(MAX_HOST_RESPONSE_BYTES + 1)),
    /exceeds maximum allowed byte budget/u,
  );

  assert.throws(
    () => parseHostResponse("{ bad json"),
    /was not valid JSON/u,
  );

  assert.throws(
    () => parseHostResponse(JSON.stringify({ version: 99, seq: 1, ok: true })),
    /protocol contract violated/u,
  );
});

function createMockProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const emitter = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    killed: boolean;
    kill: () => void;
  };
  emitter.stdin = stdin;
  emitter.stdout = stdout;
  emitter.killed = false;
  emitter.kill = () => {
    emitter.killed = true;
    emitter.emit("exit", 0, null);
  };
  return emitter;
}

test("createHostDriverScript sets up UTF-8 no BOM and handles JSONL dispatch", () => {
  const script = createHostDriverScript();
  assert.match(script, /\$utf8NoBom = \[System\.Text\.UTF8Encoding\]::new\(\$false\)/u);
  assert.match(script, /\[System\.Management\.Automation\.Language\.Parser\]::ParseInput/u);
  assert.match(script, /\[System\.Diagnostics\.Process\]::GetCurrentProcess/u);
});

test("WindowsHostClient dispatches requests and matches response sequence numbers", async () => {
  const proc = createMockProcess();
  let receivedInput = "";
  proc.stdin.on("data", (chunk: Buffer) => {
    receivedInput += chunk.toString("utf8");
    if (receivedInput.endsWith("\n")) {
      const parsed = JSON.parse(receivedInput.trim());
      proc.stdout.write(`${JSON.stringify({ version: 1, seq: parsed.seq, ok: true, data: { success: true } })}\n`);
      receivedInput = "";
    }
  });

  const spawner: HostProcessSpawner = () => proc as never;
  const client = new WindowsHostClient({ executablePath: "C:\\pwsh.exe", spawner });

  const result = await client.request({ type: "ping" });
  assert.deepEqual(result, { success: true });
  assert.equal(client.isAlive(), true);

  await client.close();
  assert.equal(client.isAlive(), false);
  await assert.rejects(() => client.request({ type: "ping" }), /closed/u);
});

test("WindowsHostClient fails closed when host process crashes or exits", async () => {
  const proc = createMockProcess();
  const spawner: HostProcessSpawner = () => proc as never;
  const client = new WindowsHostClient({ executablePath: "C:\\pwsh.exe", spawner });

  const pending = client.request({ type: "ping" });
  proc.emit("exit", 1, null);

  await assert.rejects(() => pending, /host process exited/u);
  assert.equal(client.isAlive(), false);
  await assert.rejects(() => client.request({ type: "ping" }), /closed|terminated/u);
});

test("WindowsHostClient enforces timeout budgets fail-closed", async () => {
  const proc = createMockProcess();
  const spawner: HostProcessSpawner = () => proc as never;
  const client = new WindowsHostClient({
    executablePath: "C:\\pwsh.exe",
    spawner,
    defaultTimeoutMs: 50,
  });

  await assert.rejects(
    () => client.request({ type: "ping" }),
    /timed out/u,
  );
  assert.equal(client.isAlive(), false);
});

test("WindowsHostClient rejects mismatched or out-of-order sequence numbers", async () => {
  const proc = createMockProcess();
  proc.stdin.on("data", () => {
    // Send response with wrong sequence number
    proc.stdout.write(`${JSON.stringify({ version: 1, seq: 9999, ok: true, data: {} })}\n`);
  });

  const spawner: HostProcessSpawner = () => proc as never;
  const client = new WindowsHostClient({ executablePath: "C:\\pwsh.exe", spawner });

  await assert.rejects(
    () => client.request({ type: "ping" }),
    /sequence mismatch|protocol contract violated/u,
  );
  assert.equal(client.isAlive(), false);
});
