import assert from "node:assert/strict";
import test from "node:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { compileDirectToolCall, compileShellCall } from "../../src/access-gate/gate";
import { evaluateRequest } from "../../src/access-gate/gate/evaluate-request";
import type { CompilerContext } from "../../src/access-gate/gate/access-request";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";
import { complete, loadBuiltinProfiles, makeContext } from "./helpers";

const builtinProfiles = loadBuiltinProfiles();

function context(): CompilerContext & { cleanup: () => void } {
  return makeContext("pi-policy-kernel-");
}

function profile(overrides?: Partial<ResolvedProfile>): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { inspect: "allow", modify: "ask", execute: "deny", destroy: "deny", unknown: "deny" },
    pathPolicy: {
      default: { read: "allow", list: "allow", search: "allow", write: "ask" },
      rules: [],
    },
    ...overrides,
  };
}

test("allows a complete direct read request through the kernel synchronously", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({ ...env, surface: "read", args: { path: "file.ts" } }));
    const decision = evaluateRequest(request, profile());
    assert.equal(decision instanceof Promise, false);
    assert.deepEqual(decision, { disposition: "allow" });
  } finally {
    env.cleanup();
  }
});

test("hard-denies blocked paths before profile evaluation", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({
      ...env,
      surface: "read",
      args: { path: join(homedir(), ".ssh", "id_rsa") },
    }));
    const decision = evaluateRequest(request, profile({ pathPolicy: { default: { read: "allow", list: "allow", search: "allow", write: "allow" }, rules: [] } }));
    assert.equal(decision.disposition, "deny");
    if (decision.disposition === "deny") {
      assert.equal(decision.code, "blocked-path");
      assert.equal(decision.enforcement, "hard");
    }
  } finally {
    env.cleanup();
  }
});

test("aggregates all path approval evidence into one ask", () => {
  const env = context();
  try {
    const request = complete(compileShellCall({ ...env, command: "echo data > first.txt > second.txt" }));
    const decision = evaluateRequest(request, profile());
    assert.equal(decision.disposition, "ask");
    if (decision.disposition === "ask") {
      assert.equal(decision.code, "approval-required");
      assert.equal(decision.approval.evidence.length >= 2, true);
    }
  } finally {
    env.cleanup();
  }
});

test("rejects a structurally copied request that was not issued by the compiler", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({ ...env, surface: "read", args: { path: "file.ts" } }));
    const copied = { ...request };
    Object.freeze(copied);
    const decision = evaluateRequest(copied, profile());
    assert.equal(decision.disposition, "deny");
    if (decision.disposition === "deny") assert.equal(decision.code, "invalid-tool-input");
  } finally {
    env.cleanup();
  }
});

// ─── Direct edit and ls through Policy Kernel ───

test("allows a complete direct ls request through the kernel", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({ ...env, surface: "ls", args: { path: "." } }));
    const decision = evaluateRequest(request, profile());
    assert.deepEqual(decision, { disposition: "allow" });
  } finally {
    env.cleanup();
  }
});

test("asks for a complete direct edit request through the kernel", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({
      ...env, surface: "edit",
      args: { path: "file.ts", edits: [{ oldText: "old", newText: "new" }] },
    }));
    const decision = evaluateRequest(request, profile());
    assert.equal(decision.disposition, "ask");
    if (decision.disposition === "ask") {
      assert.equal(decision.code, "approval-required");
    }
  } finally {
    env.cleanup();
  }
});

// ─── 路径可执行与 tsx 在真实 builtins Profile 下的决策矩阵 ───

test("path-form local binary follows execute policy across builtin profiles", () => {
  const env = context();
  try {
    for (const cmd of ["./node_modules/.bin/tsx run.ts", "tsx run.ts", "npx tsx run.ts"]) {
      const request = complete(compileShellCall({ ...env, command: cmd }));

      const plan = evaluateRequest(request, builtinProfiles.profiles["keel-plan"]!);
      assert.equal(plan.disposition, "deny", `${cmd}: keel-plan should deny execute`);
      if (plan.disposition === "deny") {
        assert.equal(plan.enforcement, "profile", `${cmd}: keel-plan deny is profile-level`);
      }

      const develop = evaluateRequest(request, builtinProfiles.profiles["keel-develop"]!);
      assert.equal(develop.disposition, "ask", `${cmd}: keel-develop should ask`);

      const build = evaluateRequest(request, builtinProfiles.profiles["keel-build"]!);
      assert.equal(build.disposition, "allow", `${cmd}: keel-build should allow`);
    }
  } finally {
    env.cleanup();
  }
});

test("bare unknown command stays ask in plan (unknown policy bucket)", () => {
  const env = context();
  try {
    const request = complete(compileShellCall({ ...env, command: "mycustomtool --help" }));
    const plan = evaluateRequest(request, builtinProfiles.profiles["keel-plan"]!);
    assert.equal(plan.disposition, "ask", "bare unknown should stay ask in plan");
  } finally {
    env.cleanup();
  }
});

test("keel-build asks for home config writes; keel-develop keeps denying them (T-055)", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({
      ...env,
      surface: "write",
      args: { path: "~/.npmrc", content: "registry=registry.npmjs.org" },
    }));
    const build = evaluateRequest(request, builtinProfiles.profiles["keel-build"]!);
    assert.equal(build.disposition, "ask");
    if (build.disposition === "ask") assert.equal(build.code, "approval-required");
    const develop = evaluateRequest(request, builtinProfiles.profiles["keel-develop"]!);
    assert.equal(develop.disposition, "deny");
    if (develop.disposition === "deny") assert.equal(develop.enforcement, "profile");
  } finally {
    env.cleanup();
  }
});

test("keel-build still hard-denies blocked home paths despite the ~/** rule (T-055)", () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({
      ...env,
      surface: "write",
      args: { path: join(homedir(), ".ssh", "id_rsa"), content: "secret" },
    }));
    const decision = evaluateRequest(request, builtinProfiles.profiles["keel-build"]!);
    assert.equal(decision.disposition, "deny");
    if (decision.disposition === "deny") {
      assert.equal(decision.code, "blocked-path");
      assert.equal(decision.enforcement, "hard");
    }
  } finally {
    env.cleanup();
  }
});

test("od read command compiles and is allowed under keel-plan (T-040)", () => {
  const env = context();
  try {
    const request = complete(compileShellCall({ ...env, command: "od -c file.bin" }));
    const decision = evaluateRequest(request, builtinProfiles.profiles["keel-plan"]!);
    assert.deepEqual(decision, { disposition: "allow" }, "od should compile to inspect and be allowed under keel-plan");
  } finally {
    env.cleanup();
  }
});
