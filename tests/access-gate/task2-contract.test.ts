import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateToolCall } from "../../src/access-gate/gate/evaluate";
import { compileShellCall } from "../../src/access-gate/gate/shell-compiler";
import { analyzeSemantics } from "../../src/access-gate/command-semantics/registry";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";

function context() {
  const root = mkdtempSync(join(tmpdir(), "pi-task2-contract-"));
  const stagingDir = mkdtempSync(join(tmpdir(), "pi-task2-contract-stage-"));
  return { cwd: root, projectRoot: root, stagingDir, cleanup: () => {
    rmSync(root, { recursive: true, force: true });
    rmSync(stagingDir, { recursive: true, force: true });
  } };
}

function allowAllProfile(): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { readOnly: "allow", mutating: "allow", unclassified: "allow" },
    pathPolicy: {
      default: { read: "allow", list: "allow", search: "allow", write: "allow" },
      rules: [],
    },
  };
}

test("runtime rejects an unknown tool before the legacy evaluator can allow it", async () => {
  const env = context();
  try {
    const result = await evaluateToolCall({
      surface: "unknown-tool",
      args: {},
      cwd: env.cwd,
      projectRoot: env.projectRoot,
      stagingDir: env.stagingDir,
      profile: allowAllProfile(),
    }, { hasUI: false });
    assert.equal(result.kind, "block");
    assert.equal(result.code, "unknown-tool");
  } finally {
    env.cleanup();
  }
});

test("assigns stable codes to headless approval and user denial", async () => {
  const env = context();
  try {
    const input = {
      surface: "write",
      args: { path: "file", content: "text" },
      cwd: env.cwd,
      projectRoot: env.projectRoot,
      stagingDir: env.stagingDir,
      profile: {
        ...allowAllProfile(),
        shellPolicy: { readOnly: "allow", mutating: "ask", unclassified: "allow" },
        pathPolicy: { default: { read: "allow", list: "allow", search: "allow", write: "ask" }, rules: [] },
      } satisfies ResolvedProfile,
    };
    const headless = await evaluateToolCall(input, { hasUI: false });
    const denied = await evaluateToolCall(input, { hasUI: true, select: async () => "Deny" });
    assert.equal(headless.kind, "block");
    assert.equal(denied.kind, "block");
    assert.equal(headless.code, "approval-required");
    assert.equal(denied.code, "user-denied");
  } finally {
    env.cleanup();
  }
});

test("legacy evaluator blocks carry stable path and shell policy codes", async () => {
  const env = context();
  try {
    const pathDenied = await evaluateToolCall({
      surface: "write",
      args: { path: "file", content: "text" },
      cwd: env.cwd,
      projectRoot: env.projectRoot,
      stagingDir: env.stagingDir,
      profile: {
        ...allowAllProfile(),
        pathPolicy: { default: { read: "allow", list: "allow", search: "allow", write: "deny" }, rules: [] },
      },
    }, { hasUI: false });
    const blockedPath = await evaluateToolCall({
      surface: "read",
      args: { path: join(homedir(), ".ssh/id_rsa") },
      cwd: env.cwd,
      projectRoot: env.projectRoot,
      stagingDir: env.stagingDir,
      profile: allowAllProfile(),
    }, { hasUI: false });
    const shellDenied = await evaluateToolCall({
      surface: "bash",
      args: { command: "echo ok" },
      cwd: env.cwd,
      projectRoot: env.projectRoot,
      stagingDir: env.stagingDir,
      profile: { ...allowAllProfile(), shellPolicy: { readOnly: "deny", mutating: "allow", unclassified: "allow" } },
    }, { hasUI: false });
    assert.equal(pathDenied.kind, "block");
    assert.equal(blockedPath.kind, "block");
    assert.equal(shellDenied.kind, "block");
    assert.equal(pathDenied.code, "path-denied");
    assert.equal(blockedPath.code, "blocked-path");
    assert.equal(shellDenied.code, "shell-policy-denied");
  } finally {
    env.cleanup();
  }
});

test("runtime converts malformed tool args into a structured reject", async () => {
  const env = context();
  try {
    const result = await evaluateToolCall({
      surface: "read",
      args: null,
      cwd: env.cwd,
      projectRoot: env.projectRoot,
      stagingDir: env.stagingDir,
      profile: allowAllProfile(),
    }, { hasUI: false });
    assert.equal(result.kind, "block");
    assert.equal(result.code, "invalid-tool-input");
  } finally {
    env.cleanup();
  }
});

test("rejects shell input beyond the analysis budget", () => {
  const env = context();
  try {
    const result = compileShellCall({ ...env, command: `echo ${"x".repeat(70_000)}` });
    assert.equal(result.kind, "reject");
    assert.equal(result.code, "resource-limit");
  } finally {
    env.cleanup();
  }
});

test("records coverage and resource usage for a complete request", () => {
  const env = context();
  try {
    const result = compileShellCall({ ...env, command: "cat file > output" });
    assert.equal(result.kind, "complete");
    assert.equal(result.request.coverage.commandCount, 1);
    assert.equal(result.request.coverage.pathOperationCount, 2);
    assert.equal(result.request.resourceUsage.operationCount, result.request.operations.length);
  } finally {
    env.cleanup();
  }
});

test("preserves destructive and permission effects in command semantics", () => {
  const env = context();
  try {
    const rm = parse(lex("rm file").tokens).program.commands[0]!;
    const chmod = parse(lex("chmod 600 file").tokens).program.commands[0]!;
    const rmSemantics = analyzeSemantics(rm, env);
    const chmodSemantics = analyzeSemantics(chmod, env);
    assert.ok(rmSemantics.effects.includes("delete"));
    assert.ok(chmodSemantics.effects.includes("permissionChange"));
  } finally {
    env.cleanup();
  }
});
