import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProfiles } from "../../../src/access-gate/profile/load";

test("loads the built-in profiles with keel-plan as the default", () => {
  const result = loadProfiles({ agentDir: "/tmp/pi-access-agent-does-not-exist" });
  assert.equal(result.defaultProfile, "keel-plan");
  assert.ok(result.profiles["keel-plan"]);
  assert.match(result.profiles["keel-plan"].description, /docs.*CONTEXT/);
});

test("global profiles override same-name built-ins and set the default", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  try {
    mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
    writeFileSync(join(agentDir, "pi-keel", "config.yaml"), [
      "defaultProfile: keel-develop",
      "profiles:",
      "  keel-develop:",
      "    extends: [keel-read]",
      "    description: Global develop profile.",
      "    shellPolicy:",
      "      unknown: ask",
      "",
    ].join("\n"));

    const result = loadProfiles({ agentDir });

    assert.equal(result.defaultProfile, "keel-develop");
    assert.equal(result.profiles["keel-develop"].description, "Global develop profile.");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("only the global pi-keel/config.yaml is read; no project config exists", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  try {
    // 项目级配置不存在，且不受任何 cwd/projectRoot 影响：
    // loadProfiles 只接受 agentDir 一个来源，没有项目级读取路径。
    const result = loadProfiles({ agentDir });
    assert.equal(result.defaultProfile, "keel-plan");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("invalid global profiles fail closed to keel-read", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  try {
    mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
    writeFileSync(join(agentDir, "pi-keel", "config.yaml"), "{ bad yaml [::");

    assert.equal(loadProfiles({ agentDir }).defaultProfile, "keel-read");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("invalid commands semantics also fail closed to keel-read (B), not crash on analysis", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  try {
    mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
    // 损坏 commands 段（class: bogus）→ config 层加载期校验 error → profile fail-closed
    writeFileSync(join(agentDir, "pi-keel", "config.yaml"), "commands:\n  commands:\n    badtool:\n      class: bogus\n");

    assert.equal(loadProfiles({ agentDir }).defaultProfile, "keel-read");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});
