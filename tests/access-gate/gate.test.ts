import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateToolCall } from "../../src/access-gate/gate/evaluate";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";

function profile(overrides?: Partial<ResolvedProfile>): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { readOnly: "allow", mutating: "ask", unclassified: "ask" },
    pathPolicy: {
      default: { read: "deny", list: "deny", search: "deny", write: "deny" },
      rules: [
        { path: "project/**", read: "allow", list: "allow", search: "allow", write: "ask" },
        { path: "project/docs/**", write: "allow" },
        { path: "staging/**", read: "allow", list: "allow", search: "allow", write: "allow" },
      ],
    },
    ...overrides,
  };
}

function makeRuntime(selections: string[] = []) {
  const prompts: string[] = [];
  return {
    prompts,
    runtime: {
      hasUI: true,
      select: async (prompt: string) => {
        prompts.push(prompt);
        return selections.shift();
      },
    },
  };
}

function projectWriteProfile(): ResolvedProfile {
  return profile({
    shellPolicy: { readOnly: "allow", mutating: "allow", unclassified: "ask" },
    pathPolicy: {
      default: { read: "deny", list: "deny", search: "deny", write: "deny" },
      rules: [{ path: "project/**", read: "allow", list: "allow", search: "allow", write: "allow" }],
    },
  });
}

async function evaluateBash(command: string, activeProfile = profile()): Promise<Awaited<ReturnType<typeof evaluateToolCall>>> {
  const root = mkdtempSync(join(tmpdir(), "pi-access-gate-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    return await evaluateToolCall({
      surface: "bash",
      args: { command },
      cwd: root,
      projectRoot: root,
      stagingDir: staging,
      profile: activeProfile,
    }, { hasUI: true, select: async () => undefined });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
}

test("allows a project read through the direct read tool", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-gate-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    writeFileSync(join(root, "file.ts"), "source");
    const { runtime } = makeRuntime();
    const result = await evaluateToolCall({
      surface: "read",
      args: { path: "file.ts" },
      cwd: root,
      projectRoot: root,
      stagingDir: staging,
      profile: profile(),
    }, runtime);
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("allows task document writes but denies source writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-gate-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    mkdirSync(join(root, "docs"));
    const planProfile = profile({
      name: "plan",
      shellPolicy: { readOnly: "allow", mutating: "deny", unclassified: "deny" },
      pathPolicy: {
        default: { read: "deny", list: "deny", search: "deny", write: "deny" },
        rules: [
          { path: "project/**", read: "allow", list: "allow", search: "allow" },
          { path: "project/docs/**", write: "allow" },
        ],
      },
    });
    const planResult = await evaluateToolCall({ surface: "write", args: { path: "docs/task.md", content: "task" }, cwd: root, projectRoot: root, stagingDir: staging, profile: planProfile }, { hasUI: true, select: async () => "Deny" });
    const sourceResult = await evaluateToolCall({ surface: "write", args: { path: "src/main.ts", content: "code" }, cwd: root, projectRoot: root, stagingDir: staging, profile: planProfile }, { hasUI: true, select: async () => "Deny" });
    assert.deepEqual(planResult, { kind: "allow" });
    assert.equal(sourceResult.kind, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("asks once for a guarded project write", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-gate-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    const { runtime, prompts } = makeRuntime(["Allow once"]);
    const result = await evaluateToolCall({ surface: "write", args: { path: "src/main.ts", content: "code" }, cwd: root, projectRoot: root, stagingDir: staging, profile: profile() }, runtime);
    assert.deepEqual(result, { kind: "allow" });
    assert.equal(prompts.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("asks for an unclassified network command", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-gate-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    const { runtime, prompts } = makeRuntime(["Allow once"]);
    const result = await evaluateToolCall({ surface: "bash", args: { command: "git clone https://example.test/repo /tmp/repo" }, cwd: root, projectRoot: root, stagingDir: staging, profile: profile() }, runtime);
    assert.deepEqual(result, { kind: "allow" });
    assert.equal(prompts.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("hard dangerous commands are denied without asking", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-gate-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    const { runtime, prompts } = makeRuntime(["Allow once"]);
    const result = await evaluateToolCall({ surface: "bash", args: { command: "rm -rf /" }, cwd: root, projectRoot: root, stagingDir: staging, profile: profile() }, runtime);
    assert.equal(result.kind, "block");
    assert.equal(prompts.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("denies mutating commands that target protected paths", async () => {
  const result = await evaluateBash("touch ~/.ssh/authorized_keys");
  assert.equal(result.kind, "block");
});

test("checks source paths for shell copies", async () => {
  const result = await evaluateBash("cp ~/.ssh/id_rsa project/leak");
  assert.equal(result.kind, "block");
});

test("denies search roots outside the project", async () => {
  const result = await evaluateBash("find /etc -maxdepth 1");
  assert.equal(result.kind, "block");
});

test("tracks directory changes before checking relative reads", async () => {
  const result = await evaluateBash("cd /etc && cat shadow");
  assert.equal(result.kind, "block");
});

test("checks every file redirection", async () => {
  const result = await evaluateBash("echo data > project/docs/task.md > ~/.ssh/authorized_keys", projectWriteProfile());
  assert.equal(result.kind, "block");
});

test("does not allow package scripts through the read-only policy", async () => {
  const result = await evaluateBash("npm run test");
  assert.equal(result.kind, "block");
});

test("does not allow build hooks through the read-only policy", async () => {
  const cargoResult = await evaluateBash("cargo build");
  const goResult = await evaluateBash("go build ./...");
  assert.equal(cargoResult.kind, "block");
  assert.equal(goResult.kind, "block");
});

test("checks git source and checkout paths", async () => {
  const addResult = await evaluateBash("git add ~/.ssh/id_rsa", projectWriteProfile());
  const checkoutResult = await evaluateBash("git checkout -- ~/.ssh/id_rsa", projectWriteProfile());
  assert.equal(addResult.kind, "block");
  assert.equal(checkoutResult.kind, "block");
});
