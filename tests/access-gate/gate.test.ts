import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateToolCall } from "../../src/access-gate/gate/decision/evaluate";
import type { GateRuntime } from "../../src/access-gate/gate/host";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";
import { makeContext } from "./helpers";

function profile(overrides?: Partial<ResolvedProfile>): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { inspect: "allow", modify: "ask", execute: "deny", destroy: "deny", unknown: "ask" },
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
    shellPolicy: { inspect: "allow", modify: "allow", execute: "deny", destroy: "deny", unknown: "ask" },
    pathPolicy: {
      default: { read: "deny", list: "deny", search: "deny", write: "deny" },
      rules: [{ path: "project/**", read: "allow", list: "allow", search: "allow", write: "allow" }],
    },
  });
}

async function evaluateBash(command: string, activeProfile = profile(), selection?: string): Promise<Awaited<ReturnType<typeof evaluateToolCall>>> {
  const ctx = makeContext("pi-access-gate-");
  try {
    return await evaluateToolCall({
      surface: "bash",
      args: { command },
      cwd: ctx.cwd,
      projectRoot: ctx.projectRoot,
      stagingDir: ctx.stagingDir,
      profile: activeProfile,
    }, { hasUI: true, select: async () => selection });
  } finally {
    ctx.cleanup();
  }
}

async function evaluateTool(
  surface: string,
  args: Record<string, unknown>,
  runtime: GateRuntime,
  options: { profile?: ResolvedProfile; prepare?: (root: string) => void } = {},
): Promise<Awaited<ReturnType<typeof evaluateToolCall>>> {
  const ctx = makeContext("pi-access-gate-");
  try {
    options.prepare?.(ctx.cwd);
    return await evaluateToolCall({
      surface,
      args,
      cwd: ctx.cwd,
      projectRoot: ctx.projectRoot,
      stagingDir: ctx.stagingDir,
      profile: options.profile ?? profile(),
    }, runtime);
  } finally {
    ctx.cleanup();
  }
}

test("allows a project read through the direct read tool", async () => {
  const { runtime } = makeRuntime();
  const result = await evaluateTool("read", { path: "file.ts" }, runtime, {
    prepare: (root) => writeFileSync(join(root, "file.ts"), "source"),
  });
  assert.deepEqual(result, { kind: "allow" });
});

test("allows task document writes but denies source writes", async () => {
  const planProfile = profile({
    name: "plan",
    shellPolicy: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
    pathPolicy: {
      default: { read: "deny", list: "deny", search: "deny", write: "deny" },
      rules: [
        { path: "project/**", read: "allow", list: "allow", search: "allow" },
        { path: "project/docs/**", write: "allow" },
      ],
    },
  });
  const runtime = { hasUI: true, select: async () => "Deny" };
  const planResult = await evaluateTool("write", { path: "docs/task.md", content: "task" }, runtime, {
    profile: planProfile,
    prepare: (root) => mkdirSync(join(root, "docs")),
  });
  const sourceResult = await evaluateTool("write", { path: "src/main.ts", content: "code" }, runtime, { profile: planProfile });
  assert.deepEqual(planResult, { kind: "allow" });
  assert.equal(sourceResult.kind, "block");
});

test("asks once for a guarded project write", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const result = await evaluateTool("write", { path: "src/main.ts", content: "code" }, runtime);
  assert.deepEqual(result, { kind: "allow" });
  assert.equal(prompts.length, 1);
});

test("asks for an unknown network command", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const result = await evaluateTool("bash", { command: "git clone https://example.test/repo /tmp/repo" }, runtime);
  assert.deepEqual(result, { kind: "allow" });
  assert.equal(prompts.length, 1);
});

test("ask prompt shows the literal form of an unknown command", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const result = await evaluateTool("bash", { command: "sh -c 'rm -rf /'" }, runtime);
  assert.deepEqual(result, { kind: "allow" });
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0]!.includes("unknown command"));
  assert.ok(prompts[0]!.includes("literal form: sh -c 'rm -rf /'"));
  assert.equal(prompts[0]!.includes("unknown command: sh"), false, "literal 已含可执行名，不重复");
});

test("ask prompt shows the literal form of an xargs bulk edit", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const command = "xargs sed -i 's/agent_feedback/handler_feedback/g'";
  const result = await evaluateTool("bash", { command }, runtime);
  assert.deepEqual(result, { kind: "allow" });
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0]!.includes(`literal form: ${command}`));
});

test("ask prompt shows the literal form of a modeled modify command", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const command = "sed -i 's/x/y/' src/main.ts";
  const result = await evaluateTool("bash", { command }, runtime);
  assert.deepEqual(result, { kind: "allow" });
  assert.ok(prompts[0]!.includes(`literal form: ${command}`));
});

test("hard destroy commands are denied without asking", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const result = await evaluateTool("bash", { command: "rm -rf /" }, runtime);
  assert.equal(result.kind, "block");
  assert.equal(prompts.length, 0);
});

test("dynamic shell deny keeps diagnostic words readable", async () => {
  // 固定诊断串 "dynamic shell token" 中的 token 是术语；类别化设计下无掩码，
  // 固定诊断词原样展示。
  const result = await evaluateBash("echo $(whoami)");
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("dynamic shell"));
});

test("path deny reason names the operation without repeating the path", async () => {
  // 模型侧 deny 只携带操作类型分类，不重复具体路径（模型已持有命令）。
  const result = await evaluateBash("cp ~/.ssh/id_rsa project/leak");
  assert.equal(result.kind, "block");
  assert.ok(result.reason.includes("read path denied"));
  assert.equal(result.reason.includes("id_rsa"), false);
  assert.equal(result.reason.includes("~/.ssh"), false);
});

test("direct write ask keeps the full path for consent", async () => {
  // Direct 工具无 literal form，ask 侧 path 证据必须保留完整路径供人类同意。
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  await evaluateTool("write", { path: "src/main.ts", content: "code" }, runtime);
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0]!.includes("write path: src/main.ts"));
});

test("denies modify commands that target protected paths", async () => {
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

test("checks every search root in a multi-root command", async () => {
  const result = await evaluateBash("rg pattern project/docs /etc");
  assert.equal(result.kind, "block");
});

test("checks files read by non-recursive grep", async () => {
  const result = await evaluateBash("grep pattern /etc/passwd");
  assert.equal(result.kind, "block");
});

test("checks explicit files in read-only file commands", async () => {
  const headResult = await evaluateBash("head -n 5 /etc/passwd");
  const catResult = await evaluateBash("cat /etc/passwd");
  assert.equal(headResult.kind, "block");
  assert.equal(catResult.kind, "block");
});

test("checks positional files in text-transform commands", async () => {
  const sedResult = await evaluateBash("sed 's/x/y/' /etc/passwd");
  const awkResult = await evaluateBash("awk '{ print $1 }' /etc/passwd");
  const sortResult = await evaluateBash("sort /etc/passwd");
  const uniqResult = await evaluateBash("uniq /etc/passwd");
  assert.equal(sedResult.kind, "block");
  assert.equal(awkResult.kind, "block");
  assert.equal(sortResult.kind, "block");
  assert.equal(uniqResult.kind, "block");
});

test("allows text-transform reads inside the project", async () => {
  const result = await evaluateBash("sed 's/x/y/' project/docs/README.md");
  assert.equal(result.kind, "allow");
});

test("allows rg context options without treating the count as a search root", async () => {
  const result = await evaluateBash("rg -n -C 3 pattern AGENTS.md");
  assert.deepEqual(result, { kind: "allow" });
});

test("allows stderr discard to /dev/null without allowing other external writes", async () => {
  const result = await evaluateBash("rg pattern project/docs 2>/dev/null");
  assert.equal(result.kind, "allow");
});

test("tracks directory changes before checking relative reads", async () => {
  const result = await evaluateBash("cd /etc && cat shadow");
  assert.equal(result.kind, "block");
});

test("does not ask for cd when the target path is allowed", async () => {
  const result = await evaluateBash("cd . && grep -rn pattern src/");
  assert.deepEqual(result, { kind: "allow" });
});

test("checks every file redirection", async () => {
  const result = await evaluateBash("echo data > project/docs/task.md > ~/.ssh/authorized_keys", projectWriteProfile());
  assert.equal(result.kind, "block");
});

test("does not allow package scripts through the inspect-only policy", async () => {
  const result = await evaluateBash("npm run test");
  assert.equal(result.kind, "block");
});

test("does not allow build hooks through the inspect-only policy", async () => {
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

test("allows staging already deleted project files with git rm after approval", async () => {
  const result = await evaluateBash(
    "git rm docs/2026-07-19-access-gate-rewrite-design.md docs/2026-07-19-profile-access-gate-plan.md",
    projectWriteProfile(),
    "Allow once",
  );
  assert.deepEqual(result, { kind: "allow" });
});

test("denies git rm on protected paths", async () => {
  const result = await evaluateBash("git rm ~/.ssh/id_rsa", projectWriteProfile());
  assert.equal(result.kind, "block");
});

test("allows the compound git refresh inspection after fetch approval", async () => {
  const command = "git fetch --prune origin && git status --short --branch && git rev-list --left-right --count origin/main...HEAD && git log --oneline --decorate origin/main..HEAD";
  const activeProfile = profile({
    shellPolicy: { inspect: "allow", modify: "ask", execute: "deny", destroy: "deny", unknown: "deny" },
    pathPolicy: {
      default: { read: "allow", list: "allow", search: "allow", write: "allow" },
      rules: [],
    },
  });
  const result = await evaluateBash(command, activeProfile, "Allow once");
  assert.deepEqual(result, { kind: "allow" });
});

test("denies opaque command semantics even when unknown commands are allowed", async () => {
  const activeProfile = profile({
    shellPolicy: { inspect: "allow", modify: "allow", execute: "deny", destroy: "deny", unknown: "allow" },
    pathPolicy: {
      default: { read: "allow", list: "allow", search: "allow", write: "allow" },
      rules: [],
    },
  });
  const result = await evaluateBash("git unknown-subcommand", activeProfile, "Allow once");
  assert.equal(result.kind, "block");
  assert.equal(result.code, "opaque-command");
  assert.ok(result.reason.includes("Shell form cannot be approved"));
  assert.equal(result.reason.includes("opaque-command"), false);
});

test("ask without UI reports that the operation was not executed", async () => {
  const result = await evaluateTool("write", { path: "src/main.ts", content: "code" }, { hasUI: false });
  assert.equal(result.kind, "block");
  assert.equal(result.code, "approval-required");
  assert.ok(result.reason.includes("was not executed"));
  assert.ok(result.reason.includes("no interactive approval UI"));
});

test("user denial reports the operation was not executed", async () => {
  const result = await evaluateTool("write", { path: "src/main.ts", content: "code" }, { hasUI: true, select: async () => "Deny" });
  assert.equal(result.kind, "block");
  assert.equal(result.code, "user-denied");
  assert.ok(result.reason.includes("The user denied the operation"));
  assert.ok(result.reason.includes("was not executed"));
});

test("git config read is allowed without asking", async () => {
  const { runtime, prompts } = makeRuntime();
  const result = await evaluateTool("bash", { command: "git config user.name" }, runtime);
  assert.deepEqual(result, { kind: "allow" });
  assert.equal(prompts.length, 0);
});

test("git config write ask keeps the target path for consent", async () => {
  const activeProfile = profile({
    pathPolicy: {
      default: { read: "deny", list: "deny", search: "deny", write: "ask" },
      rules: [
        { path: "project/**", read: "allow", list: "allow", search: "allow", write: "ask" },
        { path: "staging/**", read: "allow", list: "allow", search: "allow", write: "allow" },
      ],
    },
  });
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  const result = await evaluateTool("bash", { command: "git config --global user.name zev" }, runtime, { profile: activeProfile });
  assert.deepEqual(result, { kind: "allow" });
  assert.ok(prompts[0]!.includes(".gitconfig"), `prompt should show target path (got: ${prompts[0]})`);
});

test("git config local write is blocked by .git protection", async () => {
  const result = await evaluateTool("bash", { command: "git config user.name zev" }, { hasUI: true, select: async () => "Allow once" });
  assert.equal(result.kind, "block");
  assert.equal(result.code, "blocked-path");
});

test("multi-line commands are separated and the second command is gated", async () => {
  // 回归锁：修复前 `cat a.txt\nrm x` 被解析为单一 cat[inspect] → allow（rm 不可见）；
  // 修复后两个命令，rm[modify] 触发审批 → Deny → block。
  const result = await evaluateBash("cat a.txt\nrm x", profile(), "Deny");
  assert.equal(result.kind, "block");
  assert.equal(result.code, "user-denied");
});

test("multi-line commands with trailing whitespace before the newline are still gated", async () => {
  // 回归锁：换行前有尾随空格/制表符时换行仍必须是分隔符（否则 rm 再次被首词带过）
  const spaced = await evaluateBash("cat a.txt \nrm x", profile(), "Deny");
  assert.equal(spaced.kind, "block");
  const tabbed = await evaluateBash("cat a.txt\t\nrm x", profile(), "Deny");
  assert.equal(tabbed.kind, "block");
});

test("multi-line inspect chain stays allowed command-by-command", async () => {
  // 多行只读链不受影响：cat + wc 均为 inspect → allow。
  const result = await evaluateBash("cat a.txt\nwc -l a.txt");
  assert.deepEqual(result, { kind: "allow" });
});

test("<> open-readwrite redirect gates the write side", async () => {
  // `<>` O_RDWR 按 write 侧建模（D-043 write⇒read 一致性：允许写即允许读）；
  // 写意图必须受 PathPolicy 约束（project write=ask → 审批 → Deny → block）
  const result = await evaluateBash("cat <> out.txt", profile(), "Deny");
  assert.equal(result.kind, "block");
});
