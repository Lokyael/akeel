// wrapper normalization + control-flow 测试

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { normalizeCommand } from "../../../src/access-gate/command-semantics/normalize";
import { analyzeControlFlow, initialCwd, resolveCdTarget } from "../../../src/access-gate/command-semantics/control-flow";

test("control: unavailable cd target returns exists=false without throwing", () => {
  const result = resolveCdTarget("missing/subdir", "/path/that/does/not/exist");
  assert.deepEqual(result, { cwd: "/path/that/does/not/exist/missing/subdir", exists: false });
});

test("normalize: env rm keeps underlying executable", () => {
  const { program } = parse(lex("env rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "rm");
  assert.equal(norm.command.args.length, 1);
  assert.equal(norm.command.args[0]!.value, "file");
});

test("normalize: env with VAR=value keeps rm", () => {
  const { program } = parse(lex("env PATH=/tmp rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "rm");
  assert.equal(norm.command.args.length, 1);
  assert.equal(norm.command.args[0]!.value, "file");
});

test("normalize: command cp keeps underlying executable", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "cp");
  assert.equal(norm.command.args.length, 2);
});

test("normalize: timeout 5 sleep 10 becomes sleep", () => {
  const { program } = parse(lex("timeout 5 sleep 10").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "sleep");
  assert.equal(norm.command.args.length, 1);
  assert.equal(norm.command.args[0]!.value, "10");
});

test("normalize: nohup command preserves executable", () => {
  const { program } = parse(lex("nohup long-running &").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "long-running");
});

test("normalize: exec bash -c preserves bash", () => {
  const { program } = parse(lex("exec bash -c 'echo hi'").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "bash");
});

test("normalize: naked command stays unchanged", () => {
  const { program } = parse(lex("cat file.txt").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "cat");
});

test("normalize: env rm ~/.ssh/id_rsa has correct path arg", () => {
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "rm");
  assert.equal(norm.command.args[0]!.value, "~/.ssh/id_rsa");
});

test("normalize: command cp src dst has correct args", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "cp");
  assert.equal(norm.command.args[0]!.value, "src");
  assert.equal(norm.command.args[1]!.value, "dst");
});

test("normalize: nested timeout env rm", () => {
  const { program } = parse(lex("timeout 30 env rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "rm");
  assert.equal(norm.command.args.length, 1);
  assert.equal(norm.command.args[0]!.value, "file");
});

test("normalize: env with options before command", () => {
  const { program } = parse(lex("env -i PATH=/usr/bin rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "rm");
});

// ─── Control Flow ───

test("control: simple command keeps initial cwd", () => {
  const { program } = parse(lex("cat file.txt").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, false);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project");
  assert.equal(result.nodes[0]!.effectiveCwd.certainty, "exact");
});

// ─── D-045：cd 目标存在性双候选建模 ───

function cwdSet(result: ReturnType<typeof analyzeControlFlow>, index: number): string[] {
  return result.nodes[index]!.effectiveCwd.candidates.map((c) => c.cwd);
}

test("control: cd to non-existent target with ; successor yields dual candidates (D-045)", () => {
  const { program } = parse(lex("cd missing ; cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, false);
  // 目标不存在且后继为 ; → 双候选 {目标, cd 前 cwd}，conservative
  assert.equal(result.nodes[0]!.effectiveCwd.certainty, "conservative");
  assert.deepEqual(cwdSet(result, 0), ["/project/missing", "/project"]);
  // 后继命令沿用双候选（真实 cwd 侧保持复查）
  assert.deepEqual(cwdSet(result, 1), ["/project/missing", "/project"]);
});

test("control: cd to non-existent target with && successor keeps single candidate (D-045)", () => {
  const { program } = parse(lex("cd missing && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  // && 短路：不虚构旧 cwd 分支，保持单候选（与既有行为一致，不产生幽灵询问）
  assert.equal(result.nodes[0]!.effectiveCwd.certainty, "exact");
  assert.deepEqual(cwdSet(result, 0), ["/project/missing"]);
  assert.deepEqual(cwdSet(result, 1), ["/project/missing"]);
});

test("control: cd to existing directory with ; successor stays single exact candidate (D-045)", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cflow-"));
  try {
    const sub = join(root, "sub");
    mkdirSync(sub, { recursive: true });
    const { program } = parse(lex("cd sub ; cat file").tokens);
    const result = analyzeControlFlow(program, initialCwd(root));
    assert.equal(result.opaque, false);
    assert.equal(result.nodes[0]!.effectiveCwd.certainty, "exact");
    assert.deepEqual(cwdSet(result, 0), [sub]);
    assert.deepEqual(cwdSet(result, 1), [sub]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: ; chain with distinct missing targets accumulates candidates with dedup (D-045)", () => {
  const { program } = parse(lex("cd /a ; cd /b ; cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  // cmd1 后 {/a, /project}；cmd2 解析 /b 失败 → 失败分支并入 {/a, /project} → {/b, /a, /project}
  assert.equal(result.nodes[2]!.effectiveCwd.certainty, "conservative");
  assert.deepEqual(cwdSet(result, 2), ["/b", "/a", "/project"]);
});

test("control: resolveCdTarget reports exists for a real directory (D-045)", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cflow-"));
  try {
    assert.equal(resolveCdTarget("sub", root).exists, false);
    mkdirSync(join(root, "sub"), { recursive: true });
    assert.deepEqual(resolveCdTarget("sub", root), { cwd: join(root, "sub"), exists: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: cd changes cwd for next command", () => {
  const { program } = parse(lex("cd subdir && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
  // cd 的 effectiveCwd 是其目标目录
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project/subdir");
  // cat 沿用 cd 后的 cwd
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/project/subdir");
});

test("control: cd path is opaque", () => {
  const { program } = parse(lex("cd - && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, true);
});

test("control: pipeline does not propagate cwd changes", () => {
  const { program } = parse(lex("cd subdir | cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
});

test("control: multiple sequential cd commands", () => {
  const { program } = parse(lex("cd a && cd b && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 3);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project/a");
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/project/a/b");
  assert.equal(result.nodes[2]!.effectiveCwd.cwd, "/project/a/b");
});

test("control: cd to absolute path", () => {
  const { program } = parse(lex("cd /etc && cat shadow").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/etc");
});

test("control: nested wrapper cd is tracked (D-037)", () => {
  // 曾绕过：parser 把 env 放 executable 槽，cd 沉入 args，analyzeCd 不识别 → cwd 不追踪
  const { program } = parse(lex("timeout 5 env cd subdir && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project/subdir");
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/project/subdir");
});

test("control: dynamic program is opaque", () => {
  const { program } = parse(lex("cat $HOME/file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, true);
});

test("control: glob in command is opaque", () => {
  const { program } = parse(lex("ls *.ts").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, true);
});

test("control: empty cwd analysis for env rm", () => {
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.equal(norm.executable, "rm");
});

test("control: nohup wrapper preserves cwd", () => {
  const { program } = parse(lex("nohup sleep 10 &").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project");
});
