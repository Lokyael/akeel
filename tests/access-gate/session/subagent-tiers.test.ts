// 子代理档位（D-039）：agent→档位映射、钳制（min）、父档位号判定

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProfiles } from "../../../src/access-gate/profile/load";
import {
  effectiveSubagentTier,
  isSubagentProcess,
  parentTierOf,
  resolveSubagentTier,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_TIER_PROFILE,
} from "../../../src/access-gate/profile/tiers";
import { withEnv } from "../harness";

function builtinProfiles() {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-keel-tiers-"));
  try {
    return loadProfiles({ agentDir });
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
}

test("builtin agent mapping resolves to tiers", () => {
  assert.equal(resolveSubagentTier("worker", undefined), "project");
  assert.equal(resolveSubagentTier("delegate", undefined), "project");
  assert.equal(resolveSubagentTier("reviewer", undefined), "project");
  assert.equal(resolveSubagentTier("scout", undefined), "scratch");
  assert.equal(resolveSubagentTier("researcher", undefined), "scratch");
  assert.equal(resolveSubagentTier("oracle", undefined), "scratch");
});

test("unknown agent falls back to scratch, then to * override", () => {
  assert.equal(resolveSubagentTier("custom", undefined), "scratch");
  assert.equal(resolveSubagentTier(undefined, undefined), "scratch");
  assert.equal(resolveSubagentTier("custom", { "*": "project" }), "project");
});

test("explicit override wins over builtin and *", () => {
  assert.equal(resolveSubagentTier("worker", { worker: "scratch" }), "scratch");
  assert.equal(resolveSubagentTier("worker", { "*": "scratch" }), "project");
  assert.equal(resolveSubagentTier("custom", { custom: "project", "*": "scratch" }), "project");
});

test("effective tier is min(mapped, parent tier)", () => {
  assert.equal(effectiveSubagentTier("project", "1"), "project");
  assert.equal(effectiveSubagentTier("project", "0"), "scratch");
  assert.equal(effectiveSubagentTier("project", undefined), "scratch");
  assert.equal(effectiveSubagentTier("scratch", "1"), "scratch");
  assert.equal(effectiveSubagentTier("scratch", "0"), "scratch");
  assert.equal(effectiveSubagentTier("scratch", undefined), "scratch");
});

test("parent tier: project-writable profiles are 1, others 0", () => {
  const profiles = builtinProfiles();
  assert.equal(parentTierOf(profiles.profiles["keel-code"]!), "1");
  assert.equal(parentTierOf(profiles.profiles["keel-develop"]!), "1");
  assert.equal(parentTierOf(profiles.profiles["keel-subagent-project"]!), "1");
  assert.equal(parentTierOf(profiles.profiles["keel-build"]!), "1");
  assert.equal(parentTierOf(profiles.profiles["keel-plan"]!), "0");
  assert.equal(parentTierOf(profiles.profiles["keel-query"]!), "0");
  assert.equal(parentTierOf(profiles.profiles["keel-read"]!), "0");
  assert.equal(parentTierOf(profiles.profiles["keel-explore"]!), "0");
  assert.equal(parentTierOf(profiles.profiles["keel-subagent-scratch"]!), "0");
});

test("tier resolves to builtin profile name", () => {
  assert.equal(SUBAGENT_TIER_PROFILE.scratch, "keel-subagent-scratch");
  assert.equal(SUBAGENT_TIER_PROFILE.project, "keel-subagent-project");
});

test("isSubagentProcess detects the child env only when present and non-empty", async () => {
  await withEnv({ [SUBAGENT_CHILD_ENV]: undefined }, async () => {
    assert.equal(isSubagentProcess(), false);
    process.env[SUBAGENT_CHILD_ENV] = "";
    assert.equal(isSubagentProcess(), false);
    process.env[SUBAGENT_CHILD_ENV] = "1";
    assert.equal(isSubagentProcess(), true);
  });
});
