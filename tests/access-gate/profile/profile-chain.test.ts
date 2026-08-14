import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedProfiles } from "../../../src/access-gate/profile/types";
import { loadBuiltinProfiles } from "../shared/fixtures";

const profilesCache = loadBuiltinProfiles();

function profiles(): ResolvedProfiles {
  return profilesCache;
}

// ── root ──

test("keel-read: project-only reads, no writes, literal inspect Shell commands allowed", () => {
  const p = profiles().profiles["keel-read"];
  assert.equal(p.shellPolicy.inspect, "allow");
  assert.equal(p.shellPolicy.modify, "deny");
  assert.equal(p.shellPolicy.execute, "deny");
  assert.equal(p.shellPolicy.destroy, "deny");
  assert.equal(p.shellPolicy.unknown, "deny");
  assert.equal(p.pathPolicy.default.read, "deny");
  assert.equal(p.pathPolicy.default.write, "deny");
  assert.equal(p.pathPolicy.rules.length, 1);
  assert.equal(p.pathPolicy.rules[0]?.path, "project/**");
});

// ── branch 1: project-scoped coding ──

test("keel-code: inherits read's shellPolicy, overrides modify/execute/unknown to ask", () => {
  const p = profiles().profiles["keel-code"];
  // inspect: inherited from read (allow)
  assert.equal(p.shellPolicy.inspect, "allow");
  // overridden
  assert.equal(p.shellPolicy.modify, "ask");
  assert.equal(p.shellPolicy.execute, "ask");
  assert.equal(p.shellPolicy.unknown, "ask");
  // destroy: inherited from read (deny)
  assert.equal(p.shellPolicy.destroy, "deny");
  // path defaults: inherited from read (all deny)
  assert.equal(p.pathPolicy.default.write, "deny");
  // rules: code's src+test+tmp prepended before read's project/**
  assert.equal(p.pathPolicy.rules[0]?.path, "project/src/**");
  assert.equal(p.pathPolicy.rules[0]?.write, "allow");
});

// ── branch 2 root: filesystem-wide reads ──

test("keel-explore: inherits read's shellPolicy, overrides path defaults to allow reads everywhere", () => {
  const p = profiles().profiles["keel-explore"];
  // shell: inherited from read (no explicit shellPolicy in explore)
  assert.equal(p.shellPolicy.inspect, "allow");
  assert.equal(p.shellPolicy.modify, "deny");
  assert.equal(p.shellPolicy.execute, "deny");
  assert.equal(p.shellPolicy.destroy, "deny");
  assert.equal(p.shellPolicy.unknown, "deny");
  // path defaults: overrides read's deny→allow for read/list/search
  assert.equal(p.pathPolicy.default.read, "allow");
  assert.equal(p.pathPolicy.default.write, "deny");
});

// ── branch 2: planning ──

test("keel-plan: inherits explore's defaults, adds docs writes, execute denied", () => {
  const p = profiles().profiles["keel-plan"];
  assert.equal(p.shellPolicy.inspect, "allow");
  assert.equal(p.shellPolicy.modify, "ask");
  assert.equal(p.shellPolicy.execute, "deny");
  assert.equal(p.shellPolicy.unknown, "ask");
  assert.equal(p.shellPolicy.destroy, "deny");
  assert.equal(p.pathPolicy.default.read, "allow");
  assert.equal(p.pathPolicy.default.write, "deny");
  const paths = p.pathPolicy.rules.map((r) => r.path);
  assert.ok(paths.includes("project/docs/**"));
  assert.ok(paths.includes("project/CONTEXT.md"));
});

// ── branch 2: cautious full access ──

test("keel-query: inherits plan, explicitly allows execute with approval, adds project-wide writes requiring approval", () => {
  const p = profiles().profiles["keel-query"];
  // shell: execute explicitly overrides plan's deny with ask
  assert.equal(p.shellPolicy.modify, "ask");
  assert.equal(p.shellPolicy.execute, "ask");
  // path defaults: inherited from plan (from explore)
  assert.equal(p.pathPolicy.default.read, "allow");
  // rules: query's project/** prepended first (prepend merge)
  assert.equal(p.pathPolicy.rules[0]?.path, "project/**");
  assert.equal(p.pathPolicy.rules[0]?.write, "ask");
});

// ── branch 2: productive full access ──

test("keel-develop: inherits query, explicitly keeps execute approval, overrides write ask→allow", () => {
  const p = profiles().profiles["keel-develop"];
  // inspect: inherited from plan (allow)
  assert.equal(p.shellPolicy.inspect, "allow");
  // modify: inherited, remains ask — but write path is allow via pathPolicy
  assert.equal(p.shellPolicy.modify, "ask");
  // execute: explicitly inherited as ask from query, not plan's deny
  // Regression guard: interpreters and build tools still require approval.
  assert.equal(p.shellPolicy.execute, "ask");
  assert.equal(p.shellPolicy.unknown, "ask");
  assert.equal(p.shellPolicy.destroy, "deny");
  // rules: develop's project/** {write:allow} prepended, shadowing query's {write:ask}
  assert.equal(p.pathPolicy.rules[0]?.path, "project/**");
  assert.equal(p.pathPolicy.rules[0]?.write, "allow");
});

// ── branch 2: full trust ──

test("keel-build: inherits develop, overrides modify ask→allow and execute ask→allow", () => {
  const p = profiles().profiles["keel-build"];
  // inspect/unknown: inherited from develop
  assert.equal(p.shellPolicy.inspect, "allow");
  assert.equal(p.shellPolicy.unknown, "ask");
  // modify: overridden to allow — git add/commit/push without approval
  assert.equal(p.shellPolicy.modify, "allow");
  // execute: overridden to allow — full trust for scripts and build tools
  assert.equal(p.shellPolicy.execute, "allow");
  // destroy: inherited — must stay deny
  assert.equal(p.shellPolicy.destroy, "deny");
  // path rules: home config writes ask; /tmp/** and project/** stay allow
  assert.equal(p.pathPolicy.rules[0]?.path, "~/**");
  assert.equal(p.pathPolicy.rules[0]?.write, "ask");
  assert.equal(p.pathPolicy.rules[1]?.path, "/tmp/**");
  assert.equal(p.pathPolicy.rules[1]?.write, "allow");
  assert.equal(p.pathPolicy.rules[2]?.path, "project/**");
  assert.equal(p.pathPolicy.rules[2]?.write, "allow");
});

// ── chain integrity ──

test("chain: all profiles have distinct descriptions", () => {
  const names = Object.keys(profiles().profiles);
  const descriptions = names.map((n) => profiles().profiles[n].description);
  assert.equal(new Set(descriptions).size, names.length);
});

test("chain: only read, explore, and sub-agent tiers deny all commands", () => {
  for (const [name, p] of Object.entries(profiles().profiles)) {
    if (name === "keel-read" || name === "keel-explore" || name === "keel-subagent-scratch" || name === "keel-subagent-project") {
      assert.equal(p.shellPolicy.modify, "deny", `${name}: should deny modify`);
      assert.equal(p.shellPolicy.execute, "deny", `${name}: should deny execute`);
    } else {
      assert.notEqual(p.shellPolicy.modify, "deny", `${name}: should allow or ask modify`);
    }
  }
});

test("chain: only keel-build allows execute", () => {
  for (const [name, p] of Object.entries(profiles().profiles)) {
    if (name === "keel-build") {
      assert.equal(p.shellPolicy.execute, "allow", `${name}: should allow execute`);
    } else {
      assert.notEqual(p.shellPolicy.execute, "allow", `${name}: execute must not be allow`);
    }
  }
});

test("chain: no profile allows destroy", () => {
  for (const [, p] of Object.entries(profiles().profiles)) {
    assert.notEqual(p.shellPolicy.destroy, "allow", `${p.name}: destroy must never be allowed`);
  }
});
