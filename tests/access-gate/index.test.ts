import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startSession, type Footer, type Harness } from "./harness";

async function startSessionWithFooter(): Promise<{ harness: Harness; footer: Footer; cleanup: () => void }> {
  const { harness, cleanup } = startSession();
  await harness.handlers.get("session_start")!(undefined, harness.ctx);
  const footer = harness.startFooter();
  return { harness, footer, cleanup };
}

test("reports invalid global profile configuration at session start", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-invalid-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "profiles.json"), "{ bad json");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.ok(harness.getNotifications().some((entry) => entry.level === "error" && entry.message.includes("failed to load")));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    cleanup();
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("/profile status reports the complete resolved policy", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-status-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "profiles.json"), JSON.stringify({
    defaultProfile: "status-test",
    profiles: {
      "status-test": {
        description: "Status test profile.",
        shellPolicy: { inspect: "allow", modify: "ask", execute: "deny", destroy: "deny", unknown: "ask" },
        pathPolicy: {
          default: { read: "allow", list: "allow", search: "ask", write: "deny" },
          rules: [{ path: "project/docs/**", write: "allow" }],
        },
      },
    },
  }));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    await harness.commands.get("profile")!("status", harness.ctx);
    const message = harness.getNotifications().at(-1)?.message ?? "";
    assert.match(message, /Shell:\n  inspect=allow modify=ask execute=deny destroy=deny unknown=ask/);
    assert.match(message, /Path defaults:\n  read=allow list=allow search=ask write=deny/);
    assert.match(message, /Path rules:\n  project\/docs\/\*\*: write=allow/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    cleanup();
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("renders the active Profile in a two-line Footer and refreshes after switching", async () => {
  const { harness, footer, cleanup } = await startSessionWithFooter();
  try {
    let lines = footer.render(120);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /plan$/);
    assert.doesNotMatch(lines[0]!, /Profile:/);
    await harness.commands.get("profile")!("query", harness.ctx);
    lines = footer.render(120);
    assert.match(lines[0]!, /query$/);
    assert.ok(harness.getRenderRequests() > 0);
  } finally {
    cleanup();
  }
});

test("resets the active Profile and Footer on every session start", async () => {
  const { harness, footer, cleanup } = await startSessionWithFooter();
  try {
    await harness.commands.get("profile")!("read", harness.ctx);
    assert.match(footer.render(120)[0]!, /read$/);

    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    const resetFooter = harness.startFooter();
    assert.match(resetFooter.render(120)[0]!, /plan$/);
  } finally {
    cleanup();
  }
});
