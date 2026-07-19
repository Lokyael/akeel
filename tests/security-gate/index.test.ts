import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import securityGate from "../../src/security-gate/index";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const root = mkdtempSync(join(tmpdir(), "pi-keel-index-"));
mkdirSync(join(root, "src"));
mkdirSync(join(root, ".pi", "extensions", "security-gate"), { recursive: true });
writeFileSync(join(root, "src", "file.ts"), "before");
writeFileSync(join(root, ".pi", "extensions", "security-gate", "config.json"), JSON.stringify({ level: "strict" }));
const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
let toolHandler: ((event: { toolName: string; input: unknown }, ctx: ExtensionContext) => Promise<unknown>) | null = null;
let sessionStartHandler: ((event: unknown, ctx: ExtensionContext) => Promise<unknown>) | null = null;
const pi = {
  registerCommand(name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
    commands.set(name, options.handler);
  },
  on(event: string, handler: (...args: any[]) => Promise<unknown>) {
    if (event === "tool_call") toolHandler = handler as typeof toolHandler;
    if (event === "session_start") sessionStartHandler = handler as typeof sessionStartHandler;
  },
} as unknown as ExtensionAPI;
securityGate(pi);

const selections: Array<string | undefined> = [];
const notifications: string[] = [];
const ctx = {
  cwd: root,
  hasUI: true,
  ui: {
    select: async () => selections.shift(),
    notify: (message: string) => { notifications.push(message); },
  },
  sessionManager: { getSessionId: () => "test-session" },
} as unknown as ExtensionContext;

const call = async (toolName: string, input: unknown) => toolHandler!(
  { toolName, input },
  ctx,
);

const run = async () => {
  assert(!commands.has("rollback"), "rollback command is not registered");
  assert(sessionStartHandler !== null, "session_start handler is registered");

  await sessionStartHandler!(undefined, ctx);
  await commands.get("security")!("status", ctx);
  assert(notifications.some((message) => message.includes("Security Level: strict")), "status reports project-selected security level");

  const blocked = await call("write", { path: "src/file.ts", content: "after" });
  assert((blocked as { block?: boolean })?.block === true, "PLAN blocks source write before permission");
  selections.push("Allow once");
  await commands.get("build")!("", ctx);
  const allowed = await call("write", { path: "src/file.ts", content: "after" });
  assert(allowed === undefined, "BUILD Allow once permits source write");
  rmSync(root, { recursive: true, force: true });
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
};

void run();
