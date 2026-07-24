import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyTool, evaluateToolCall } from "../../src/access-gate/gate/evaluate";
import { TOOL_SCHEMAS } from "../../src/access-gate/gate/tool-schemas";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";

// ── classifyTool ──

void test("classify: read, write, edit, find, grep, ls are filesystem", () => {
  for (const surface of Object.keys(TOOL_SCHEMAS)) {
    assert.equal(classifyTool(surface).category, "filesystem", `${surface} should be filesystem`);
  }
});

void test("classify: bash is shell", () => {
  assert.equal(classifyTool("bash").category, "shell");
});

void test("classify: unknown tool surfpases passthrough", () => {
  // Gate 不应拦截它不认识的工具
  assert.equal(classifyTool("web_search").category, "passthrough");
  assert.equal(classifyTool("fetch_content").category, "passthrough");
  assert.equal(classifyTool("get_search_content").category, "passthrough");
  assert.equal(classifyTool("task").category, "passthrough");
  assert.equal(classifyTool("notify").category, "passthrough");
  assert.equal(classifyTool("nonexistent_tool_xyz").category, "passthrough");
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

void test("passthrough: web_search is allowed without schema", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-cat-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-stg-"));
  try {
    const result = await evaluateToolCall({
      surface: "web_search",
      args: { query: "test" },
      cwd: root,
      projectRoot: root,
      stagingDir: staging,
      profile: profile(),
    }, runtime());
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

void test("passthrough: fetch_content is allowed without schema", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-cat-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-stg-"));
  try {
    const result = await evaluateToolCall({
      surface: "fetch_content",
      args: { url: "https://example.com" },
      cwd: root,
      projectRoot: root,
      stagingDir: staging,
      profile: profile(),
    }, runtime());
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

void test("passthrough: passthrough tools ignore restrictive profiles", async () => {
  // 用最严格的 profile（全部 deny），passthrough 工具仍然允许
  const strict = profile();
  const root = mkdtempSync(join(tmpdir(), "pi-access-cat-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-stg-"));
  try {
    const result = await evaluateToolCall({
      surface: "web_search",
      args: { queries: ["a", "b"] },
      cwd: root,
      projectRoot: root,
      stagingDir: staging,
      profile: strict,
    }, runtime());
    assert.deepEqual(result, { kind: "allow" });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

// ── 已知工具仍然受 gate 管辖 ──

void test("filesystem: write is still denied under restrictive profile", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-cat-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-stg-"));
  try {
    const result = await evaluateToolCall({
      surface: "write",
      args: { path: "file.txt", content: "data" },
      cwd: root,
      projectRoot: root,
      stagingDir: staging,
      profile: profile(),
    }, runtime());
    assert.equal(result.kind, "block");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

void test("filesystem: TOOL_SCHEMAS 每个条目都有 category", () => {
  for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
    assert.ok(schema.category, `${name} must have a category`);
    assert.equal(schema.category, "filesystem", `${name} should be filesystem`);
  }
});
