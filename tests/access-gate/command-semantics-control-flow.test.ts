// tests/access-gate/command-semantics-control-flow.test.ts
// wrapper normalization + control-flow 测试

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { normalizeCommand } from "../../src/access-gate/command-semantics/normalize";
import { analyzeControlFlow, initialCwd } from "../../src/access-gate/command-semantics/control-flow";

// ─── Wrapper Normalization ───

void test("normalize: env rm keeps underlying executable", () => {
  const { program } = parse(lex("env rm file").tokens);
  const cmd = program.commands[0]!;
  const norm = normalizeCommand(cmd);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "rm");
  assert.equal(norm!.command.args.length, 1);
  assert.equal(norm!.command.args[0]!.value, "file");
});

void test("normalize: env with VAR=value keeps rm", () => {
  const { program } = parse(lex("env PATH=/tmp rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "rm");
  assert.equal(norm!.command.args.length, 1);
  assert.equal(norm!.command.args[0]!.value, "file");
});

void test("normalize: command cp keeps underlying executable", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "cp");
  assert.equal(norm!.command.args.length, 2);
});

void test("normalize: timeout 5 sleep 10 becomes sleep", () => {
  const { program } = parse(lex("timeout 5 sleep 10").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "sleep");
  assert.equal(norm!.command.args.length, 1);
  assert.equal(norm!.command.args[0]!.value, "10");
});

void test("normalize: nohup command preserves executable", () => {
  const { program } = parse(lex("nohup long-running &").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "long-running");
});

void test("normalize: exec bash -c preserves bash", () => {
  const { program } = parse(lex("exec bash -c 'echo hi'").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "bash");
});

void test("normalize: naked command stays unchanged", () => {
  const { program } = parse(lex("cat file.txt").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "cat");
  assert.equal(norm!.wrappers.length, 0);
});

void test("normalize: env rm ~/.ssh/id_rsa has correct path arg", () => {
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "rm");
  assert.equal(norm!.command.args[0]!.value, "~/.ssh/id_rsa");
});

void test("normalize: command cp src dst has correct args", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "cp");
  assert.equal(norm!.command.args[0]!.value, "src");
  assert.equal(norm!.command.args[1]!.value, "dst");
});

void test("normalize: nested timeout env rm", () => {
  const { program } = parse(lex("timeout 30 env rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "rm");
  assert.equal(norm!.command.args.length, 1);
  assert.equal(norm!.command.args[0]!.value, "file");
});

void test("normalize: env with options before command", () => {
  const { program } = parse(lex("env -i PATH=/usr/bin rm file").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "rm");
});

// ─── Control Flow ───

void test("control: simple command keeps initial cwd", () => {
  const { program } = parse(lex("cat file.txt").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, false);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project");
  assert.equal(result.nodes[0]!.effectiveCwd.certainty, "exact");
});

void test("control: cd changes cwd for next command", () => {
  const { program } = parse(lex("cd subdir && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
  // cd 的 effectiveCwd 是其目标目录
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project/subdir");
  // cat 沿用 cd 后的 cwd
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/project/subdir");
});

void test("control: cd path is opaque", () => {
  const { program } = parse(lex("cd - && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, true);
});

void test("control: pipeline does not propagate cwd changes", () => {
  const { program } = parse(lex("cd subdir | cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
});

void test("control: multiple sequential cd commands", () => {
  const { program } = parse(lex("cd a && cd b && cat file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 3);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project/a");
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/project/a/b");
  assert.equal(result.nodes[2]!.effectiveCwd.cwd, "/project/a/b");
});

void test("control: cd to absolute path", () => {
  const { program } = parse(lex("cd /etc && cat shadow").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[1]!.effectiveCwd.cwd, "/etc");
});

void test("control: dynamic program is opaque", () => {
  const { program } = parse(lex("cat $HOME/file").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, true);
});

void test("control: glob in command is opaque", () => {
  const { program } = parse(lex("ls *.ts").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.opaque, true);
});

void test("control: empty cwd analysis for env rm", () => {
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  assert.equal(norm!.executable, "rm");
});

void test("control: nohup wrapper preserves cwd", () => {
  const { program } = parse(lex("nohup sleep 10 &").tokens);
  const result = analyzeControlFlow(program, initialCwd("/project"));
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]!.effectiveCwd.cwd, "/project");
});
