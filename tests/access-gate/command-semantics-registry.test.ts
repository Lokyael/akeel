// tests/access-gate/command-semantics-registry.test.ts
// registry.ts：注册表 fail-fast 守卫、无 adapter 命令回退分类、scopeKey 显式作用域键（D-024）

import { defineAdapterTests } from "./helpers";
import { buildCommandIndex, scopeKey } from "../../src/access-gate/command-semantics/registry";
import type { CommandAdapter, CommandSemantics } from "../../src/access-gate/command-semantics/types";
import assert from "node:assert/strict";
import test from "node:test";

function stubAdapter(names: string[]): CommandAdapter {
  const sem: CommandSemantics = {
    commandClass: "unknown",
    effects: [],
    intents: [],
    hardRule: null,
    opaque: false,
    reason: "stub",
  };
  return { names, analyze: () => sem };
}

test("registry: duplicate command registration fails fast", () => {
  assert.throws(
    () => buildCommandIndex([stubAdapter(["a"]), stubAdapter(["a"])]),
    /duplicate command registration: a/,
  );
});

test("registry: distinct command registration succeeds", () => {
  const index = buildCommandIndex([stubAdapter(["a"]), stubAdapter(["b"])]);
  assert.equal(index.size, 2);
  assert.equal(index.get("b")?.names[0], "b");
});

defineAdapterTests("registry", [
  { cmd: "unknowncmd file.txt", name: "bare-name unknown command falls through", cls: "unknown", intents: [] },
  { cmd: "mycustomtool --help", name: "bare-name executable without adapter stays unknown", cls: "unknown", opaque: false },
  { cmd: "./node_modules/.bin/some-tool run.ts", name: "path-form executable without adapter classifies as execute", cls: "execute", opaque: false },
  { cmd: "/usr/local/bin/mytool --version", name: "absolute path-form executable classifies as execute", cls: "execute" },
  { cmd: "scripts/deploy.sh -x", name: "relative path-form script classifies as execute", cls: "execute" },
  { cmd: "../bin/helper --help", name: "parent path-form helper classifies as execute", cls: "execute" },
  { cmd: "/bin/sed 's/x/y/' file.txt", name: "path form of other adapters resolves by basename", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
]);

// ─── scopeKey（D-024 显式作用域键：精确优先、最长前缀、./ 对称归一化）───

test("scopeKey: 精确键命中裸名", () => {
  assert.equal(scopeKey({ mytool: {} }, "mytool"), "mytool");
});

test("scopeKey: 精确键 ./ 归一化对称生效（键带 ./ / 名带 ./）", () => {
  assert.equal(scopeKey({ "./bin/mytool": {} }, "bin/mytool"), "./bin/mytool");
  assert.equal(scopeKey({ "bin/mytool": {} }, "./bin/mytool"), "bin/mytool");
});

test("scopeKey: 路径前缀键命中（键以 / 结尾）", () => {
  assert.equal(scopeKey({ "bin/": {} }, "bin/scripts/deploy"), "bin/");
});

test("scopeKey: 最长路径前缀优先", () => {
  assert.equal(scopeKey({ "bin/": {}, "bin/scripts/": {} }, "bin/scripts/deploy"), "bin/scripts/");
});

test("scopeKey: 前缀键不做裸名回退（名无 / 不参与前缀匹配）", () => {
  assert.equal(scopeKey({ "bin/": {} }, "bin"), null);
});

test("scopeKey: 精确键优先于前缀键", () => {
  assert.equal(scopeKey({ "bin/mytool": {}, "bin/": {} }, "bin/mytool"), "bin/mytool");
});

test("scopeKey: 前缀键 ./ 归一化对称生效", () => {
  assert.equal(scopeKey({ "./bin/": {} }, "bin/scripts/deploy"), "./bin/");
  assert.equal(scopeKey({ "bin/": {} }, "./bin/scripts/deploy"), "bin/");
});

test("scopeKey: 非真前缀不命中", () => {
  assert.equal(scopeKey({ "bin/": {} }, "binx/tool"), null);
});

test("scopeKey: 未命中返回 null", () => {
  assert.equal(scopeKey({ mytool: {} }, "other"), null);
  assert.equal(scopeKey(undefined, "mytool"), null);
  assert.equal(scopeKey({}, "mytool"), null);
});
