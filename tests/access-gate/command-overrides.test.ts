// tests/access-gate/command-overrides.test.ts
// command-overrides 加载、别名、命令定义和 reclassify 覆盖测试

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { analyzeSemantics } from "../../src/access-gate/command-semantics/registry";
import { resetOverrides } from "../../src/access-gate/command-semantics/overrides";
import type { SemanticContext } from "../../src/access-gate/command-semantics/types";

// ─── helpers ───

function parseCmd(input: string) {
  const { program } = parse(lex(input).tokens);
  return program.commands[0]!;
}

function setupProject(overridesContent: string): { root: string; ctx: SemanticContext; cleanup: () => void } {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, "pi-keel-overrides-project-"));
  const agentDir = mkdtempSync(join(parent, "pi-keel-overrides-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "command-overrides.yaml"), overridesContent, "utf-8");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const ctx: SemanticContext = { projectRoot: root, stagingDir: join(root, "staging"), cwd: root };

  return {
    root,
    ctx,
    cleanup: () => {
      resetOverrides();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(root, { recursive: true, force: true });
      rmSync(agentDir, { recursive: true, force: true });
    },
  };
}

// 无 overrides 文件的默认上下文（缓存必须在测试前清理）
const DEFAULT_CTX: SemanticContext = { projectRoot: "/tmp/pi-keel-test", stagingDir: "/tmp/pi-keel-test/staging", cwd: "/tmp/pi-keel-test" };

// ─── aliases ───

test("aliases: fd → find（search adapter 接管）", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  fd: find
`);
  try {
    // fd . 应被 find adapter 识别，产生 search intent
    const sem = analyzeSemantics(parseCmd("fd . -name '*.ts'"), _ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.intents.some((i) => i.operation === "search"), "应有 search intent");
    assert.equal(sem.intents[0]!.rawPath, ".");
  } finally {
    cleanup();
  }
});

test("aliases: bat → cat（read adapter 接管）", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  bat: cat
`);
  try {
    const sem = analyzeSemantics(parseCmd("bat file.txt"), _ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.intents.some((i) => i.operation === "read"));
    assert.equal(sem.intents[0]!.rawPath, "file.txt");
  } finally {
    cleanup();
  }
});

test("aliases: 别名目标不存在 → unknown", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  nosuchtool: nosuchadapter
`);
  try {
    const sem = analyzeSemantics(parseCmd("nosuchtool arg"), _ctx);
    assert.equal(sem.class, "unknown");
    assert.ok(sem.reason.includes("nosuchadapter"), `reason 应提到别名目标: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 路径前缀键覆盖目录内路径形式（bin/: cat → ./bin/mytool）", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  "bin/": cat
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/mytool file.txt"), _ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.intents.some((i) => i.operation === "read"), "应有 read intent");
    assert.equal(sem.intents[0]!.rawPath, "file.txt");
  } finally {
    cleanup();
  }
});

test("aliases: 路径形式精确键优先于前缀键", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  "./bin/foo": git
  "bin/": cat
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/foo status"), _ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.reason.includes("show working tree"), `精确键应优先: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 最长路径前缀键优先", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  "bin/": cat
  "bin/tools/": git
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/tools/mytool status"), _ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.reason.includes("show working tree"), `最长前缀应优先: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 裸名键不再隐式覆盖路径形式（basename 冲突消除）", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  mytool: cat
`);
  try {
    // 裸名键只作用于裸调用；路径形式默认 execute（D-031），不被隐式 basename 覆盖
    const sem = analyzeSemantics(parseCmd("./bin/mytool run.ts"), _ctx);
    assert.equal(sem.class, "execute");
  } finally {
    cleanup();
  }
});

test("aliases: 前缀键不误伤其他目录同名工具", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  "bin/": cat
`);
  try {
    const sem = analyzeSemantics(parseCmd("./vendor/mytool run.ts"), _ctx);
    assert.equal(sem.class, "execute");
  } finally {
    cleanup();
  }
});

test("aliases: 路径前缀键目标不存在 → unknown", () => {
  resetOverrides();
  const { ctx: _ctx, cleanup } = setupProject(`
aliases:
  "bin/": nosuchadapter
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/nosuchtool arg"), _ctx);
    assert.equal(sem.class, "unknown");
    assert.ok(sem.reason.includes("nosuchadapter"), `reason 应提到别名目标: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 无 overrides 时不受影响", () => {
  resetOverrides();
  // DEFAULT_CTX 指向不存在的目录 → loadOverrides 找不到文件，回退到空配置
  const sem = analyzeSemantics(parseCmd("git status"), DEFAULT_CTX);
  assert.equal(sem.class, "inspect");
  assert.ok(sem.reason.includes("show working tree"));
});

test("only the global pi-keel/command-overrides.yaml is read; no project config exists", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject("");
  try {
    // setupProject 只写了全局 pi-keel/command-overrides.yaml（内容为空）；
    // 项目目录中没有配置文件，也不存在项目级读取路径。
    const sem = analyzeSemantics(parseCmd("local-git status"), ctx);
    assert.equal(sem.class, "unknown");
  } finally {
    cleanup();
  }
});

// ─── commands ───

test("commands: 简单命令（无子命令）→ 使用 YAML 定义的 class", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  my-linter:
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("my-linter src/"), ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
    assert.deepStrictEqual(sem.effects, ["read"]);
  } finally {
    cleanup();
  }
});

test("commands: 路径前缀键覆盖目录内命令定义（D-034 作用域）", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  "bin/":
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/tool src/"), ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
    assert.deepStrictEqual(sem.effects, ["read"]);
  } finally {
    cleanup();
  }
});

test("commands: 带子命令定义 → 子命令匹配", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  docker:
    class: execute
    effects: [execute, network]
    subcommands:
      ps: { class: inspect, effects: [read] }
      images: { class: inspect, effects: [read] }
      build: { class: execute, effects: [write, network] }
`);
  try {
    const ps = analyzeSemantics(parseCmd("docker ps"), ctx);
    assert.equal(ps.class, "inspect");
    assert.ok(ps.reason.includes("ps"));

    const build = analyzeSemantics(parseCmd("docker build ."), ctx);
    assert.equal(build.class, "execute");
    assert.ok(build.reason.includes("build"));
    assert.deepStrictEqual(build.effects, ["write", "network"]);
  } finally {
    cleanup();
  }
});

test("commands: 子命令未匹配 → 基类 + opaque", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  docker:
    class: execute
    effects: [execute, network]
    subcommands:
      ps: { class: inspect, effects: [read] }
`);
  try {
    const sem = analyzeSemantics(parseCmd("docker unknown-cmd"), ctx);
    assert.equal(sem.class, "execute");
    assert.equal(sem.opaque, true);
    assert.ok(sem.reason.includes("unrecognized subcommand"));
  } finally {
    cleanup();
  }
});

test("commands: 同名命令覆盖内置 adapter（用户定义优先）", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  git:
    class: inspect
    effects: [read]
`);
  try {
    // 用户将 git 整体定义为 inspect — 应直接返回，不走 git adapter
    const sem = analyzeSemantics(parseCmd("git push --force origin main"), ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

// ─── reclassify ───

test("reclassify: 匹配 pattern 时覆盖分类", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
`);
  try {
    // git branch（无 -d）不受影响
    const list = analyzeSemantics(parseCmd("git branch"), ctx);
    assert.equal(list.class, "inspect");

    // git branch -d → reclassify 为 destroy，且 opaque 已被清除
    const del = analyzeSemantics(parseCmd("git branch -d old-branch"), ctx);
    assert.equal(del.class, "destroy");
    assert.equal(del.opaque, false);
    assert.ok(del.reason.includes("reclassified to destroy"));
  } finally {
    cleanup();
  }
});

test("reclassify: 不匹配时保留原分类", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
`);
  try {
    const sem = analyzeSemantics(parseCmd("git status"), ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(!sem.reason.includes("reclassified"));
  } finally {
    cleanup();
  }
});

test("reclassify: pattern 是无效正则时跳过", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "[invalid"
    class: destroy
`);
  try {
    const sem = analyzeSemantics(parseCmd("git status"), ctx);
    assert.equal(sem.class, "inspect");
  } finally {
    cleanup();
  }
});

test("reclassify: 只匹配指定命令名", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "status"
    class: execute
`);
  try {
    // cargo status 不应匹配 git 的 reclassify
    const sem = analyzeSemantics(parseCmd("cargo status"), ctx);
    assert.notEqual(sem.class, "execute");
  } finally {
    cleanup();
  }
});

// ─── 组合 ───

test("组合: aliases + reclassify 同时生效", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
aliases:
  g: git
reclassify:
  - command: git
    pattern: "status"
    class: execute
`);
  try {
    // g → git（别名），然后 status 被 reclassify
    const sem = analyzeSemantics(parseCmd("g status"), ctx);
    assert.equal(sem.class, "execute");
  } finally {
    cleanup();
  }
});

test("组合: commands 定义优先于别名和内置", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
aliases:
  g: git
commands:
  g:
    class: inspect
    effects: [read]
`);
  try {
    // commands 中的 g 定义直接生效，不走 git adapter
    const sem = analyzeSemantics(parseCmd("g push --force"), ctx);
    assert.equal(sem.class, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

test("组合: 别名 + commands → commands 优先于别名", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
aliases:
  g: git
commands:
  g:
    class: execute
    effects: [execute]
`);
  try {
    // g 在 commands 中有定义 → 直接使用，不走别名 → git adapter
    const sem = analyzeSemantics(parseCmd("g anything"), ctx);
    assert.equal(sem.class, "execute");
    assert.ok(sem.reason.includes("user-defined"), `reason: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

// ─── 运行时校验 ───

test("校验: commands 中无效 class 抛出明确错误", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  badtool:
    class: bogus
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("badtool arg"), ctx),
      /invalid class/,
    );
  } finally {
    cleanup();
  }
});

test("校验: reclassify 中无效 class 抛出明确错误", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "status"
    class: bogus
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("git status"), ctx),
      /invalid class/,
    );
  } finally {
    cleanup();
  }
});

test("校验: subcommands 中无效 class 抛出明确错误", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  tool:
    class: execute
    subcommands:
      x: { class: badclass }
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("tool x"), ctx),
      /invalid class/,
    );
  } finally {
    cleanup();
  }
});

// ─── 缓存隔离 ───

test("缓存: 不同 global agentDir 加载不同的 overrides", () => {
  resetOverrides();
  const p1 = setupProject(`
aliases:
  t1: git
`);
  const agent1 = process.env.PI_CODING_AGENT_DIR;
  const p2 = setupProject(`
aliases:
  t2: git
`);
  const agent2 = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = agent1;
    const sem1 = analyzeSemantics(parseCmd("t1 status"), p1.ctx);
    assert.equal(sem1.class, "inspect");

    process.env.PI_CODING_AGENT_DIR = agent2;
    const sem2 = analyzeSemantics(parseCmd("t2 status"), p2.ctx);
    assert.equal(sem2.class, "inspect");
    const sem3 = analyzeSemantics(parseCmd("t1 status"), p2.ctx);
    assert.equal(sem3.class, "unknown");
  } finally {
    p2.cleanup();
    p1.cleanup();
  }
});

// ─── 边界 ───

test("边界: 空 overrides 不影响正常分析", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
# 只有注释，无实际内容
`);
  try {
    const sem = analyzeSemantics(parseCmd("git log"), ctx);
    assert.equal(sem.class, "inspect");
  } finally {
    cleanup();
  }
});

test("边界: 无效 YAML 不崩溃，回退到空配置", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`{invalid: [::`);
  try {
    const sem = analyzeSemantics(parseCmd("git log"), ctx);
    assert.equal(sem.class, "inspect");
  } finally {
    cleanup();
  }
});

// ─── 路径 fallback 与覆盖层优先级 ───

test("commands: 路径键优先于路径 fallback（用户定义直接生效）", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
commands:
  ./deploy.sh:
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("./deploy.sh -x"), ctx);
    assert.equal(sem.class, "inspect", "user-defined path command must win over execute fallback");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

test("reclassify: 可覆盖路径 fallback 的 execute", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
reclassify:
  - command: ./node_modules/.bin/tsx
    pattern: run\\.ts
    class: inspect
`);
  try {
    const sem = analyzeSemantics(parseCmd("./node_modules/.bin/tsx run.ts"), ctx);
    assert.equal(sem.class, "inspect", "reclassify must override the path-form execute fallback");
    assert.equal(sem.opaque, false);
    assert.ok(sem.reason.includes("reclassified to inspect"));
  } finally {
    cleanup();
  }
});

test("aliases: 仍先于 adapter/fallback 生效（裸名映射到已知 adapter）", () => {
  resetOverrides();
  const { ctx, cleanup } = setupProject(`
aliases:
  myinsp: ls
`);
  try {
    const sem = analyzeSemantics(parseCmd("myinsp /tmp"), ctx);
    assert.equal(sem.class, "inspect", "alias to known adapter wins over unknown fallback");
  } finally {
    cleanup();
  }
});

