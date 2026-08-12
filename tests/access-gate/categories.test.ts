import assert from "node:assert/strict";
import test from "node:test";
import { classifyTool, evaluateToolCall } from "../../src/access-gate/gate/decision/evaluate";
import { TOOL_SCHEMAS } from "../../src/access-gate/gate/plan/tool-schemas";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";
import { makeContext } from "./helpers";

// ── classifyTool ──

test("classify: read, write, edit, find, grep, ls are filesystem", () => {
  for (const surface of Object.keys(TOOL_SCHEMAS)) {
    assert.equal(classifyTool(surface), "filesystem", `${surface} should be filesystem`);
  }
});

test("classify: bash is shell", () => {
  assert.equal(classifyTool("bash"), "shell");
});

test("classify: unknown tool surfaces passthrough", () => {
  // Gate 不应拦截它不认识的工具
  assert.equal(classifyTool("web_search"), "passthrough");
  assert.equal(classifyTool("fetch_content"), "passthrough");
  assert.equal(classifyTool("get_search_content"), "passthrough");
  assert.equal(classifyTool("task"), "passthrough");
  assert.equal(classifyTool("notify"), "passthrough");
  assert.equal(classifyTool("nonexistent_tool_xyz"), "passthrough");
});

// ── passthrough 行为 ──

function profile(): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
    pathPolicy: { default: { read: "deny", list: "deny", search: "deny", write: "deny" }, rules: [] },
  };
}

function runtime() {
  return { hasUI: false } as const;
}

test("passthrough: web_search is allowed without schema", async () => {
  const ctx = makeContext("pi-access-cat-");
  try {
    const result = await evaluateToolCall({
      surface: "web_search",
      args: { query: "test" },
      cwd: ctx.cwd,
      projectRoot: ctx.projectRoot,
      stagingDir: ctx.stagingDir,
      profile: profile(),
    }, runtime());
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    ctx.cleanup();
  }
});

test("passthrough: fetch_content is allowed without schema", async () => {
  const ctx = makeContext("pi-access-cat-");
  try {
    const result = await evaluateToolCall({
      surface: "fetch_content",
      args: { url: "https://example.com" },
      cwd: ctx.cwd,
      projectRoot: ctx.projectRoot,
      stagingDir: ctx.stagingDir,
      profile: profile(),
    }, runtime());
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    ctx.cleanup();
  }
});

test("passthrough: passthrough tools ignore restrictive profiles", async () => {
  // 用最严格的 profile（全部 deny），passthrough 工具仍然允许
  const ctx = makeContext("pi-access-cat-");
  try {
    const result = await evaluateToolCall({
      surface: "web_search",
      args: { queries: ["a", "b"] },
      cwd: ctx.cwd,
      projectRoot: ctx.projectRoot,
      stagingDir: ctx.stagingDir,
      profile: profile(),
    }, runtime());
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    ctx.cleanup();
  }
});

// ── 已知工具仍然受 gate 管辖 ──

test("filesystem: write is still denied under restrictive profile", async () => {
  const ctx = makeContext("pi-access-cat-");
  try {
    const result = await evaluateToolCall({
      surface: "write",
      args: { path: "file.txt", content: "data" },
      cwd: ctx.cwd,
      projectRoot: ctx.projectRoot,
      stagingDir: ctx.stagingDir,
      profile: profile(),
    }, runtime());
    assert.equal(result.kind, "block");
  } finally {
    ctx.cleanup();
  }
});

test("filesystem: TOOL_SCHEMAS derive category from registry membership", () => {
  for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
    assert.equal("category" in schema, false, `${name} should not duplicate its derived category`);
  }
});
