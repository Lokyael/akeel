// 集中配置加载（config.yaml，D-041）：分段结构、损坏 fail-closed

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, resetConfigCache, type ConfigLoad } from "../../../src/access-gate/config";

function agentDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "pi-keel-config-"));
  mkdirSync(join(dir, "pi-keel"), { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** 捕获 console.error 输出。 */
function captureError<T>(fn: () => T): { value: T; messages: string[] } {
  const messages: string[] = [];
  const original = console.error;
  console.error = (m: unknown) => { messages.push(String(m)); };
  try {
    return { value: fn(), messages };
  } finally {
    console.error = original;
  }
}

test("loads a complete config.yaml with all sections", () => {
  resetConfigCache();
  const { dir, cleanup } = agentDir();
  try {
    writeFileSync(join(dir, "pi-keel", "config.yaml"), [
      "defaultProfile: team-develop",
      "profiles:",
      "  team-develop:",
      "    description: Team dev",
      "    extends: [keel-develop]",
      "subagentProfiles:",
      "  worker: project",
      "commands:",
      "  aliases:",
      "    fd: find",
      "  commands:",
      "    docker:",
      "      class: execute",
      "      effects: [execute, network]",
      "",
    ].join("\n"));
    const result = loadConfig(dir);
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.value.defaultProfile, "team-develop");
    assert.equal((result.value.profiles!["team-develop"] as { description: string }).description, "Team dev");
    assert.equal(result.value.subagentProfiles!["worker"], "project");
    assert.equal(result.value.commands!.aliases!["fd"], "find");
    assert.equal(result.value.commands!.commands!["docker"].class, "execute");
  } finally {
    cleanup();
  }
});

test("missing config file returns none", () => {
  resetConfigCache();
  const { dir, cleanup } = agentDir();
  try {
    assert.equal(loadConfig(dir).kind, "none");
  } finally {
    cleanup();
  }
});

test("invalid YAML reports an error", () => {
  resetConfigCache();
  const { dir, cleanup } = agentDir();
  try {
    writeFileSync(join(dir, "pi-keel", "config.yaml"), "{ bad yaml: [unclosed");
    let result: ConfigLoad | undefined;
    const { messages } = captureError(() => { result = loadConfig(dir); });
    assert.equal(result!.kind, "error");
    assert.ok(messages.some((m) => m.includes("failed to load")), `expected parse error, got: ${messages.join(" | ")}`);
  } finally {
    cleanup();
  }
});

// B：加载即校验——commands 语义损坏在加载期报错并 fail-closed（不再等命令分析时抛）。

test("commands: invalid class fails at load (B)", () => {
  resetConfigCache();
  const { dir, cleanup } = agentDir();
  try {
    writeFileSync(join(dir, "pi-keel", "config.yaml"), "commands:\n  commands:\n    badtool:\n      class: bogus\n");
    let result: ConfigLoad | undefined;
    const { messages } = captureError(() => { result = loadConfig(dir); });
    assert.equal(result!.kind, "error");
    if (result!.kind === "error") assert.match(result!.message, /invalid class/);
    assert.ok(messages.some((m) => m.includes("invalid class")), `expected error, got: ${messages.join(" | ")}`);
  } finally {
    cleanup();
  }
});

test("commands: valid class passes load (B 反例)", () => {
  resetConfigCache();
  const { dir, cleanup } = agentDir();
  try {
    writeFileSync(join(dir, "pi-keel", "config.yaml"), "commands:\n  commands:\n    ok:\n      class: inspect\n      effects: [read]\n");
    const result = loadConfig(dir);
    assert.equal(result.kind, "ok");
  } finally {
    cleanup();
  }
});
