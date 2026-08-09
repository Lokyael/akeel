// tests/access-gate/subagent-session.test.ts
// 子代理会话集成（D-039）：session_start env 检测 → 初始档位（映射+钳制）；
// PI_KEEL_PARENT_TIER 传播（普通会话=自身档位号；子代理=自身生效档供孙代理继承）

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PARENT_TIER_ENV, SUBAGENT_CHILD_AGENT_ENV, SUBAGENT_CHILD_ENV } from "../../src/access-gate/profile/tiers";
import { startSession, type Harness } from "./harness";

function snapshotSubagentEnv(): Record<string, string | undefined> {
  return {
    [SUBAGENT_CHILD_ENV]: process.env[SUBAGENT_CHILD_ENV],
    [SUBAGENT_CHILD_AGENT_ENV]: process.env[SUBAGENT_CHILD_AGENT_ENV],
    [PARENT_TIER_ENV]: process.env[PARENT_TIER_ENV],
  };
}

function restoreSubagentEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function firstLine(harness: Harness): string {
  return harness.startFooter().render(120)[0]!;
}

test("subagent worker with parent tier 1 starts in keel-subagent-project", async () => {
  const saved = snapshotSubagentEnv();
  process.env[SUBAGENT_CHILD_ENV] = "1";
  process.env[SUBAGENT_CHILD_AGENT_ENV] = "worker";
  process.env[PARENT_TIER_ENV] = "1";
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.match(firstLine(harness), /subagent-project/);
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});

test("subagent worker with missing parent tier falls back to scratch (fail-closed)", async () => {
  const saved = snapshotSubagentEnv();
  process.env[SUBAGENT_CHILD_ENV] = "1";
  process.env[SUBAGENT_CHILD_AGENT_ENV] = "worker";
  delete process.env[PARENT_TIER_ENV];
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.match(firstLine(harness), /subagent-scratch/);
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});

test("subagent worker with parent tier 0 is clamped to scratch", async () => {
  const saved = snapshotSubagentEnv();
  process.env[SUBAGENT_CHILD_ENV] = "1";
  process.env[SUBAGENT_CHILD_AGENT_ENV] = "worker";
  process.env[PARENT_TIER_ENV] = "0";
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.match(firstLine(harness), /subagent-scratch/);
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});

test("subagent scout stays scratch even with parent tier 1", async () => {
  const saved = snapshotSubagentEnv();
  process.env[SUBAGENT_CHILD_ENV] = "1";
  process.env[SUBAGENT_CHILD_AGENT_ENV] = "scout";
  process.env[PARENT_TIER_ENV] = "1";
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.match(firstLine(harness), /subagent-scratch/);
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});

test("subagentProfiles override maps worker to scratch", async () => {
  const saved = snapshotSubagentEnv();
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-subagent-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "profiles.json"), JSON.stringify({
    subagentProfiles: { worker: "scratch" },
  }));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env[SUBAGENT_CHILD_ENV] = "1";
  process.env[SUBAGENT_CHILD_AGENT_ENV] = "worker";
  process.env[PARENT_TIER_ENV] = "1";
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.match(firstLine(harness), /subagent-scratch/);
  } finally {
    restoreSubagentEnv(saved);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    cleanup();
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("non-subagent session starts in default profile and publishes parent tier 0", async () => {
  const saved = snapshotSubagentEnv();
  delete process.env[SUBAGENT_CHILD_ENV];
  delete process.env[SUBAGENT_CHILD_AGENT_ENV];
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.match(firstLine(harness), /plan$/);
    assert.equal(process.env[PARENT_TIER_ENV], "0");
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});

test("/profile switch updates the published parent tier", async () => {
  const saved = snapshotSubagentEnv();
  delete process.env[SUBAGENT_CHILD_ENV];
  delete process.env[SUBAGENT_CHILD_AGENT_ENV];
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(process.env[PARENT_TIER_ENV], "0");
    await harness.commands.get("profile")!("code", harness.ctx);
    assert.equal(process.env[PARENT_TIER_ENV], "1");
    assert.match(firstLine(harness), /code$/);
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});

test("subagent session publishes its effective tier for grandchildren", async () => {
  const saved = snapshotSubagentEnv();
  process.env[SUBAGENT_CHILD_ENV] = "1";
  process.env[SUBAGENT_CHILD_AGENT_ENV] = "worker";
  process.env[PARENT_TIER_ENV] = "1";
  const { harness, cleanup } = startSession();
  try {
    await harness.handlers.get("session_start")!(undefined, harness.ctx);
    assert.equal(process.env[PARENT_TIER_ENV], "1");
  } finally {
    restoreSubagentEnv(saved);
    cleanup();
  }
});
