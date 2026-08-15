// command-overrides 加载、别名、命令定义和 reclassify 覆盖测试

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { analyzeSemantics } from "../../../src/access-gate/command-semantics/registry";
import { resetConfig } from "../../../src/access-gate/config";

// ─── helpers ───

function parseCmd(input: string) {
  const { program } = parse(lex(input).tokens);
  return program.commands[0]!;
}

function setupProject(overridesContent: string): { root: string; cleanup: () => void } {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, "pi-keel-overrides-project-"));
  const agentDir = mkdtempSync(join(parent, "pi-keel-overrides-agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  // 测试内容视为 config.yaml 的 commands 段：统一缩进包裹（D-041 集中配置）
  const indented = overridesContent.split("\n").map((l) => (l.trim() === "" ? "" : `  ${l}`)).join("\n");
  writeFileSync(join(agentDir, "pi-keel", "config.yaml"), `commands:\n${indented}\n`, "utf-8");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  return {
    root,
    cleanup: () => {
      resetConfig();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(root, { recursive: true, force: true });
      rmSync(agentDir, { recursive: true, force: true });
    },
  };
}

// ─── aliases ───

test("aliases: fd → find（search adapter 接管）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  fd: find
`);
  try {
    // fd . 应被 find adapter 识别，产生 search intent
    const sem = analyzeSemantics(parseCmd("fd . -name '*.ts'"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.intents.some((i) => i.operation === "search"), "应有 search intent");
    assert.equal(sem.intents[0]!.rawPath, ".");
  } finally {
    cleanup();
  }
});

test("aliases: bat → cat（read adapter 接管）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  bat: cat
`);
  try {
    const sem = analyzeSemantics(parseCmd("bat file.txt"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.intents.some((i) => i.operation === "read"));
    assert.equal(sem.intents[0]!.rawPath, "file.txt");
  } finally {
    cleanup();
  }
});

test("aliases: 别名目标不存在 → unknown", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  nosuchtool: nosuchadapter
`);
  try {
    const sem = analyzeSemantics(parseCmd("nosuchtool arg"));
    assert.equal(sem.commandClass, "unknown");
    assert.ok(sem.reason.includes("nosuchadapter"), `reason 应提到别名目标: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 路径前缀键覆盖目录内路径形式（含 ./ 归一化）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "bin/": cat
`);
  try {
    // 键 "bin/" 经 ./ 归一化命中 "./bin/tool"（./ 无管理意义，不要求用户写 "./bin/" 键）
    const sem = analyzeSemantics(parseCmd("./bin/tool file.txt"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.intents.some((i) => i.operation === "read"), "应有 read intent");
    assert.equal(sem.intents[0]!.rawPath, "file.txt");
  } finally {
    cleanup();
  }
});

test("aliases: 路径形式精确键优先于前缀键", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "./bin/eslint": node
  "bin/": cat
`);
  try {
    // 精确键（npm 本地 eslint → node）优先于前缀键（bin/ → cat）
    const sem = analyzeSemantics(parseCmd("./bin/eslint --version"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("version/help"), `精确键应优先（node 语义）: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 最长路径前缀键优先", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "bin/": cat
  "./bin/scripts/": node
`);
  try {
    // 项目 bin/scripts/ 目录用 node 语义，bin/ 其他工具用 cat 语义
    const sem = analyzeSemantics(parseCmd("./bin/scripts/deploy --version"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("version/help"), `最长前缀应优先（node 语义）: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 裸名键不再隐式覆盖路径形式（basename 冲突消除）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  mytool: cat
`);
  try {
    // 裸名键只作用于裸调用；路径形式默认 execute（D-031），不被隐式 basename 覆盖
    const sem = analyzeSemantics(parseCmd("./bin/mytool run.ts"));
    assert.equal(sem.commandClass, "execute");
  } finally {
    cleanup();
  }
});

test("aliases: 前缀键不误伤其他目录同名工具", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "bin/": cat
`);
  try {
    const sem = analyzeSemantics(parseCmd("./vendor/mytool run.ts"));
    assert.equal(sem.commandClass, "execute");
  } finally {
    cleanup();
  }
});

test("aliases: 路径前缀键目标不存在 → unknown", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "bin/": nosuchadapter
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/nosuchtool arg"));
    assert.equal(sem.commandClass, "unknown");
    assert.ok(sem.reason.includes("nosuchadapter"), `reason 应提到别名目标: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: ./ 归一化对精确键同样生效（bin/eslint 命中 ./bin/eslint）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "bin/eslint": node
`);
  try {
    // 与前缀键一致：精确键也归一化前导 ./，两侧对称
    const sem = analyzeSemantics(parseCmd("./bin/eslint --version"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("version/help"), `应命中精确键（node 语义）: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: ./ 精确键与无 ./ 键等价（./bin/eslint 命中 bin/eslint）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  "./bin/eslint": node
`);
  try {
    const sem = analyzeSemantics(parseCmd("bin/eslint --version"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("version/help"), `应命中精确键（node 语义）: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 别名目标为 commands 定义时链式解析", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  mytool: my-linter
commands:
  my-linter:
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("mytool src/"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("user-defined"), `应复用命令定义: ${sem.reason}`);
    assert.deepStrictEqual(sem.effects, ["read"]);
  } finally {
    cleanup();
  }
});

test("aliases: 别名目标为别名时不链式解析（单步契约，D-024）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  a: b
  b: cat
`);
  try {
    // 单步契约：a → b 后把 b 当作最终目标查 adapter（无 b adapter → unknown），
    // 不递归 b → cat——链式让语义需沿解析图追多跳才能确定，D-024 明确拒绝
    const sem = analyzeSemantics(parseCmd("a --version"));
    assert.equal(sem.commandClass, "unknown");
    assert.ok(sem.reason.includes("aliased to b"), `reason 应说明单步目标: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

test("aliases: 无 overrides 时不受影响", () => {
  resetConfig();
  // 无用户配置目录 → loadOverrides 找不到文件，回退到空配置
  const sem = analyzeSemantics(parseCmd("git status"));
  assert.equal(sem.commandClass, "inspect");
  assert.ok(sem.reason.includes("show working tree"));
});

test("only the global pi-keel/config.yaml is read; no project config exists", () => {
  resetConfig();
  const { cleanup } = setupProject("");
  try {
    // setupProject 只写了全局 pi-keel/config.yaml（commands 段为空）；
    // 项目目录中没有配置文件，也不存在项目级读取路径。
    const sem = analyzeSemantics(parseCmd("local-git status"));
    assert.equal(sem.commandClass, "unknown");
  } finally {
    cleanup();
  }
});

// ─── commands ───

test("commands: 简单命令（无子命令）→ 使用 YAML 定义的 class", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  my-linter:
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("my-linter src/"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
    assert.deepStrictEqual(sem.effects, ["read"]);
  } finally {
    cleanup();
  }
});

test("commands: 路径前缀键覆盖目录内命令定义（D-024 作用域）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  "bin/":
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("./bin/tool src/"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
    assert.deepStrictEqual(sem.effects, ["read"]);
  } finally {
    cleanup();
  }
});

test("commands: 带子命令定义 → 子命令匹配", () => {
  resetConfig();
  const { cleanup } = setupProject(`
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
    const ps = analyzeSemantics(parseCmd("docker ps"));
    assert.equal(ps.commandClass, "inspect");
    assert.ok(ps.reason.includes("ps"));

    const build = analyzeSemantics(parseCmd("docker build ."));
    assert.equal(build.commandClass, "execute");
    assert.ok(build.reason.includes("build"));
    assert.deepStrictEqual(build.effects, ["write", "network"]);
  } finally {
    cleanup();
  }
});

test("commands: 子命令未匹配 → 基类 + opaque", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  docker:
    class: execute
    effects: [execute, network]
    subcommands:
      ps: { class: inspect, effects: [read] }
`);
  try {
    const sem = analyzeSemantics(parseCmd("docker unknown-cmd"));
    assert.equal(sem.commandClass, "execute");
    assert.equal(sem.opaque, true);
    assert.ok(sem.reason.includes("unrecognized subcommand"));
  } finally {
    cleanup();
  }
});

test("commands: 同名命令覆盖内置 adapter（用户定义优先）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  git:
    class: inspect
    effects: [read]
`);
  try {
    // 用户将 git 整体定义为 inspect — 应直接返回，不走 git adapter
    const sem = analyzeSemantics(parseCmd("git push --force origin main"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

// ─── reclassify ───

test("reclassify: 匹配 pattern 时覆盖分类", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
`);
  try {
    // git branch（无 -d）不受影响
    const list = analyzeSemantics(parseCmd("git branch"));
    assert.equal(list.commandClass, "inspect");

    // git branch -d → reclassify 为 destroy，且 opaque 已被清除
    const del = analyzeSemantics(parseCmd("git branch -d old-branch"));
    assert.equal(del.commandClass, "destroy");
    assert.equal(del.opaque, false);
    assert.ok(del.reason.includes("reclassified to destroy"));
  } finally {
    cleanup();
  }
});

test("reclassify: 路径形式按 basename 对齐 adapter 身份（/usr/local/bin/git → 应用规则）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "status"
    class: modify
`);
  try {
    // adapter 已按 basename 识别命令身份（/usr/local/bin/git → git adapter），
    // reclassify 应对齐该身份，否则用户声明在路径形式下静默失效
    const sem = analyzeSemantics(parseCmd("/usr/local/bin/git status"));
    assert.equal(sem.commandClass, "modify");
    assert.ok(sem.reason.includes("reclassified"));
  } finally {
    cleanup();
  }
});

test("reclassify: 不匹配时保留原分类", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
`);
  try {
    const sem = analyzeSemantics(parseCmd("git status"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(!sem.reason.includes("reclassified"));
  } finally {
    cleanup();
  }
});

test("reclassify: pattern 是无效正则时跳过", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "[invalid"
    class: destroy
`);
  try {
    const sem = analyzeSemantics(parseCmd("git status"));
    assert.equal(sem.commandClass, "inspect");
  } finally {
    cleanup();
  }
});

test("reclassify: 只匹配指定命令名", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "status"
    class: execute
`);
  try {
    // cargo status 不应匹配 git 的 reclassify
    const sem = analyzeSemantics(parseCmd("cargo status"));
    assert.notEqual(sem.commandClass, "execute");
  } finally {
    cleanup();
  }
});

// ─── 组合 ───

test("组合: aliases + reclassify 同时生效", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  g: git
reclassify:
  - command: git
    pattern: "status"
    class: execute
`);
  try {
    // g → git（别名），然后 status 被 reclassify
    const sem = analyzeSemantics(parseCmd("g status"));
    assert.equal(sem.commandClass, "execute");
  } finally {
    cleanup();
  }
});

test("组合: commands 定义优先于别名和内置", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  g: git
commands:
  g:
    class: inspect
    effects: [read]
`);
  try {
    // commands 中的 g 定义直接生效，不走 git adapter
    const sem = analyzeSemantics(parseCmd("g push --force"));
    assert.equal(sem.commandClass, "inspect");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

test("组合: 别名 + commands → commands 优先于别名", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  g: git
commands:
  g:
    class: execute
    effects: [execute]
`);
  try {
    // g 在 commands 中有定义 → 直接使用，不走别名 → git adapter
    const sem = analyzeSemantics(parseCmd("g anything"));
    assert.equal(sem.commandClass, "execute");
    assert.ok(sem.reason.includes("user-defined"), `reason: ${sem.reason}`);
  } finally {
    cleanup();
  }
});

// ─── 运行时校验 ───

test("校验: commands 中无效 class 抛出明确错误", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  badtool:
    class: bogus
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("badtool arg")),
      /invalid class/,
    );
  } finally {
    cleanup();
  }
});

test("校验: commands 中无效 effects 抛出明确错误（F）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  badfx:
    class: inspect
    effects: [bogus]
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("badfx arg")),
      /invalid effect "bogus"/,
    );
  } finally {
    cleanup();
  }
});

test("校验: reclassify 中无效 class 抛出明确错误", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: git
    pattern: "status"
    class: bogus
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("git status")),
      /invalid class/,
    );
  } finally {
    cleanup();
  }
});

test("校验: subcommands 中无效 class 抛出明确错误", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  tool:
    class: execute
    subcommands:
      x: { class: badclass }
`);
  try {
    assert.throws(
      () => analyzeSemantics(parseCmd("tool x")),
      /invalid class/,
    );
  } finally {
    cleanup();
  }
});

// ─── 缓存隔离 ───

test("缓存: 不同 global agentDir 加载不同的 overrides", () => {
  resetConfig();
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
    const sem1 = analyzeSemantics(parseCmd("t1 status"));
    assert.equal(sem1.commandClass, "inspect");

    process.env.PI_CODING_AGENT_DIR = agent2;
    const sem2 = analyzeSemantics(parseCmd("t2 status"));
    assert.equal(sem2.commandClass, "inspect");
    const sem3 = analyzeSemantics(parseCmd("t1 status"));
    assert.equal(sem3.commandClass, "unknown");
  } finally {
    p2.cleanup();
    p1.cleanup();
  }
});

// ─── 边界 ───

test("边界: 空 overrides 不影响正常分析", () => {
  resetConfig();
  const { cleanup } = setupProject(`
# 只有注释，无实际内容
`);
  try {
    const sem = analyzeSemantics(parseCmd("git log"));
    assert.equal(sem.commandClass, "inspect");
  } finally {
    cleanup();
  }
});

test("边界: 无效 YAML 不崩溃，回退到空配置", () => {
  resetConfig();
  const { cleanup } = setupProject(`{invalid: [::`);
  try {
    const sem = analyzeSemantics(parseCmd("git log"));
    assert.equal(sem.commandClass, "inspect");
  } finally {
    cleanup();
  }
});

// ─── 路径 fallback 与覆盖层优先级 ───

test("commands: 路径键优先于路径 fallback（用户定义直接生效）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
commands:
  ./deploy.sh:
    class: inspect
    effects: [read]
`);
  try {
    const sem = analyzeSemantics(parseCmd("./deploy.sh -x"));
    assert.equal(sem.commandClass, "inspect", "user-defined path command must win over execute fallback");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

test("reclassify: 可覆盖路径 fallback 的 execute", () => {
  resetConfig();
  const { cleanup } = setupProject(`
reclassify:
  - command: ./node_modules/.bin/tsx
    pattern: run\\.ts
    class: inspect
`);
  try {
    const sem = analyzeSemantics(parseCmd("./node_modules/.bin/tsx run.ts"));
    assert.equal(sem.commandClass, "inspect", "reclassify must override the path-form execute fallback");
    assert.equal(sem.opaque, false);
    assert.ok(sem.reason.includes("reclassified to inspect"));
  } finally {
    cleanup();
  }
});

test("aliases: 仍先于 adapter/fallback 生效（裸名映射到已知 adapter）", () => {
  resetConfig();
  const { cleanup } = setupProject(`
aliases:
  myinsp: ls
`);
  try {
    const sem = analyzeSemantics(parseCmd("myinsp /tmp"));
    assert.equal(sem.commandClass, "inspect", "alias to known adapter wins over unknown fallback");
  } finally {
    cleanup();
  }
});

