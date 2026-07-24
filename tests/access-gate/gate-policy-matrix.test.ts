import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { compileDirectToolCall, compileShellCall } from "../../src/access-gate/gate";
import { evaluateRequest } from "../../src/access-gate/gate/evaluate-request";
import type { CompleteAccessRequest, CompileResult, CompilerContext } from "../../src/access-gate/gate/access-request";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";

function context(): CompilerContext & { cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pi-policy-kernel-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-policy-kernel-stage-"));
  return {
    cwd: root,
    projectRoot: root,
    stagingDir: staging,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(staging, { recursive: true, force: true });
    },
  };
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

function complete(result: CompileResult): CompleteAccessRequest {
  assert.equal(result.kind, "complete");
  return result.request;
}

test("allows a complete direct read request through the kernel", async () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({ ...env, surface: "read", args: { path: "file.ts" } }));
    const decision = await evaluateRequest(request, profile(), { hasUI: false });
    assert.deepEqual(decision, { disposition: "allow" });
  } finally {
    env.cleanup();
  }
});

test("hard-denies blocked paths before profile evaluation", async () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({
      ...env,
      surface: "read",
      args: { path: join(homedir(), ".ssh", "id_rsa") },
    }));
    const decision = await evaluateRequest(request, profile({ pathPolicy: { default: { read: "allow", list: "allow", search: "allow", write: "allow" }, rules: [] } }), { hasUI: false });
    assert.equal(decision.disposition, "deny");
    if (decision.disposition === "deny") {
      assert.equal(decision.code, "blocked-path");
      assert.equal(decision.enforcement, "hard");
    }
  } finally {
    env.cleanup();
  }
});

test("aggregates all path approval evidence into one ask", async () => {
  const env = context();
  try {
    const request = complete(compileShellCall({ ...env, command: "echo data > first.txt > second.txt" }));
    const decision = await evaluateRequest(request, profile(), { hasUI: true });
    assert.equal(decision.disposition, "ask");
    if (decision.disposition === "ask") {
      assert.equal(decision.code, "approval-required");
      assert.equal(decision.approval.evidence.length >= 2, true);
    }
  } finally {
    env.cleanup();
  }
});

test("rejects a structurally copied request that was not issued by the compiler", async () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({ ...env, surface: "read", args: { path: "file.ts" } }));
    const copied = { ...request };
    Object.freeze(copied);
    const decision = await evaluateRequest(copied, profile(), { hasUI: false });
    assert.equal(decision.disposition, "deny");
    if (decision.disposition === "deny") assert.equal(decision.code, "invalid-tool-input");
  } finally {
    env.cleanup();
  }
});

// ─── Direct edit and ls through Policy Kernel ───

test("allows a complete direct ls request through the kernel", async () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({ ...env, surface: "ls", args: { path: "." } }));
    const decision = await evaluateRequest(request, profile(), { hasUI: false });
    assert.deepEqual(decision, { disposition: "allow" });
  } finally {
    env.cleanup();
  }
});

test("asks for a complete direct edit request through the kernel", async () => {
  const env = context();
  try {
    const request = complete(compileDirectToolCall({
      ...env, surface: "edit",
      args: { path: "file.ts", edits: [{ oldText: "old", newText: "new" }] },
    }));
    const decision = await evaluateRequest(request, profile(), { hasUI: true });
    assert.equal(decision.disposition, "ask");
    if (decision.disposition === "ask") {
      assert.equal(decision.code, "approval-required");
    }
  } finally {
    env.cleanup();
  }
});
