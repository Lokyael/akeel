// tests/access-gate/subagent-init.test.ts
// 子代理会话初始化编排（T-052 C1）：applySubagentProfile / publishParentTier 函数级测试。
// env 参数化——构造对象直接断言，不依赖全局 process.env 与 harness。

import assert from "node:assert/strict";
import test from "node:test";
import { applySubagentProfile, publishParentTier } from "../../src/access-gate/session/subagent-init";
import { createProfileState } from "../../src/access-gate/session/profile-state";
import { loadBuiltinProfiles } from "./helpers";
import { PARENT_TIER_ENV, SUBAGENT_CHILD_AGENT_ENV, SUBAGENT_CHILD_ENV } from "../../src/access-gate/profile/tiers";
import type { ResolvedProfiles } from "../../src/access-gate/profile/types";

const profiles = loadBuiltinProfiles();

function makeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

function makeState(profilesOverride: ResolvedProfiles = profiles) {
  return createProfileState(profilesOverride);
}

test("applySubagentProfile maps worker to project when parent tier is 1", () => {
  const state = makeState();
  const env = makeEnv({ [SUBAGENT_CHILD_ENV]: "1", [SUBAGENT_CHILD_AGENT_ENV]: "worker", [PARENT_TIER_ENV]: "1" });
  applySubagentProfile(profiles, state, env);
  assert.equal(state.getName(), "keel-subagent-project");
});

test("applySubagentProfile clamps worker to scratch on missing parent tier (fail-closed)", () => {
  const state = makeState();
  const env = makeEnv({ [SUBAGENT_CHILD_ENV]: "1", [SUBAGENT_CHILD_AGENT_ENV]: "worker" });
  applySubagentProfile(profiles, state, env);
  assert.equal(state.getName(), "keel-subagent-scratch");
});

test("applySubagentProfile clamps worker to scratch on parent tier 0", () => {
  const state = makeState();
  const env = makeEnv({ [SUBAGENT_CHILD_ENV]: "1", [SUBAGENT_CHILD_AGENT_ENV]: "worker", [PARENT_TIER_ENV]: "0" });
  applySubagentProfile(profiles, state, env);
  assert.equal(state.getName(), "keel-subagent-scratch");
});

test("applySubagentProfile keeps scout at scratch even with parent tier 1", () => {
  const state = makeState();
  const env = makeEnv({ [SUBAGENT_CHILD_ENV]: "1", [SUBAGENT_CHILD_AGENT_ENV]: "scout", [PARENT_TIER_ENV]: "1" });
  applySubagentProfile(profiles, state, env);
  assert.equal(state.getName(), "keel-subagent-scratch");
});

test("applySubagentProfile honors subagentProfiles override (worker to scratch)", () => {
  const overridden = loadBuiltinProfiles();
  overridden.subagentProfiles = { worker: "scratch" };
  const state = makeState(overridden);
  const env = makeEnv({ [SUBAGENT_CHILD_ENV]: "1", [SUBAGENT_CHILD_AGENT_ENV]: "worker", [PARENT_TIER_ENV]: "1" });
  applySubagentProfile(overridden, state, env);
  assert.equal(state.getName(), "keel-subagent-scratch");
});

test("applySubagentProfile leaves the state untouched for a non-subagent env", () => {
  const state = makeState();
  const env = makeEnv({ [PARENT_TIER_ENV]: "1" });
  applySubagentProfile(profiles, state, env);
  assert.equal(state.getName(), profiles.defaultProfile);
});

test("applySubagentProfile skips when the tier profile is missing", () => {
  const env = makeEnv({ [SUBAGENT_CHILD_ENV]: "1", [SUBAGENT_CHILD_AGENT_ENV]: "worker", [PARENT_TIER_ENV]: "1" });
  const minimal = createProfileState({
    defaultProfile: "keel-plan",
    profiles: { "keel-plan": profiles.profiles["keel-plan"]! },
  });
  applySubagentProfile({ defaultProfile: "keel-plan", profiles: { "keel-plan": profiles.profiles["keel-plan"]! } }, minimal, env);
  assert.equal(minimal.getName(), "keel-plan");
});

test("publishParentTier writes 1 for a project-writable profile", () => {
  const env = makeEnv();
  const state = makeState();
  state.set("keel-code");
  publishParentTier(state, env);
  assert.equal(env[PARENT_TIER_ENV], "1");
});

test("publishParentTier writes 0 for keel-plan", () => {
  const env = makeEnv();
  const state = makeState();
  publishParentTier(state, env);
  assert.equal(env[PARENT_TIER_ENV], "0");
});

test("publishParentTier writes the effective tier for a sub-agent profile", () => {
  const env = makeEnv();
  const state = makeState();
  state.set("keel-subagent-project");
  publishParentTier(state, env);
  assert.equal(env[PARENT_TIER_ENV], "1");
});
