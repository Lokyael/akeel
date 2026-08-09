// tests/access-gate/command-semantics-registry.test.ts
// 注册表回退（registry.ts）：无 adapter 命令的分类、路径形式可执行文件、basename 归一化

import { defineAdapterTests } from "./helpers";
import { buildCommandIndex } from "../../src/access-gate/command-semantics/registry";
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
