import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";

// 端到端测试（lex→parse 管线）归本文件：断言重心在 parser 行为，lexer 只是输入通道。

/** 解析一行输入：lex→parse 管线；等价于 parse(lex(input).tokens)。 */
function parseInput(input: string) {
  return parse(lex(input).tokens);
}

test("parser: simple command", () => {
  const { program, error } = parseInput("cat file.txt");
  assert.equal(error, null);
  assert.equal(program.commands.length, 1);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "cat");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file.txt");
});

test("parser: control operators separate commands", () => {
  const { program } = parseInput("cd dir && cat file");
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.executable?.value, "cat");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
});

test("parser: semicolon separated", () => {
  const { program } = parseInput("echo a; echo b");
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, ";");
});

test("parser: pipeline", () => {
  const { program } = parseInput("cat file | grep pattern");
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, "|");
});

test("parser: stdout redirection", () => {
  const { program } = parseInput("echo hello > out.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.fd, 1);
  assert.equal(cmd.redirections[0]!.target?.value, "out.txt");
});

test("parser: consumes an adjacent stderr fd prefix", () => {
  const { program } = parseInput("cmd 2> err.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "cmd");
  assert.deepEqual(cmd.args.map((arg) => arg.value), []);
  assert.equal(cmd.redirections[0]!.kind, "stderr");
  assert.equal(cmd.redirections[0]!.fd, 2);
});

test("parser: preserves a spaced numeric argument before redirect", () => {
  const { program } = parseInput("cmd 2 > err.txt");
  const cmd = program.commands[0]!;
  assert.deepEqual(cmd.args.map((arg) => arg.value), ["2"]);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.fd, 1);
});

test("parser: stdin redirection", () => {
  const { program } = parseInput("sort < in.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdin");
  assert.equal(cmd.redirections[0]!.fd, 0);
  assert.equal(cmd.redirections[0]!.target?.value, "in.txt");
});

test("parser: append redirection", () => {
  const { program } = parseInput("echo hello >> out.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdoutAppend");
});

test("parser: distinguishes fd duplication from file redirection", () => {
  const { program } = parseInput("cat file 2>&1");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections[0]!.kind, "fdDuplicate");
  assert.equal(cmd.redirections[0]!.fd, 2);
  assert.equal(cmd.redirections[0]!.target?.value, "1");
});

test("parser: env assignments", () => {
  const { program } = parseInput("VAR=value cmd");
  const cmd = program.commands[0]!;
  assert.equal(cmd.envAssignments.length, 1);
  assert.equal(cmd.envAssignments[0]!.value, "VAR=value");
  assert.equal(cmd.executable?.value, "cmd");
});

test("parser: multiple env assignments", () => {
  const { program } = parseInput("A=1 B=2 cmd arg");
  const cmd = program.commands[0]!;
  assert.equal(cmd.envAssignments.length, 2);
  assert.equal(cmd.executable?.value, "cmd");
});

test("parser: env with PATH override", () => {
  const { program } = parseInput("env PATH=/tmp rm file");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.envAssignments.length, 1, `got ${cmd.envAssignments.length}`);
  if (cmd.envAssignments.length > 0) {
    assert.equal(cmd.envAssignments[0]!.value, "PATH=/tmp");
  }
  assert.equal(cmd.executable?.value, "rm");
});

test("parser: command wrapper", () => {
  const { program } = parseInput("command cp src dst");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "command");
  assert.equal(cmd.executable?.value, "cp");
  assert.equal(cmd.args.length, 2);
});

test("parser: timeout wrapper", () => {
  const lexResult = lex("timeout 5 sleep 10");
  assert.equal(lexResult.tokens.length, 4);
  const { program } = parse(lexResult.tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.executable?.value, "sleep", `got '${cmd.executable?.value}'`);
});

test("parser: nohup wrapper", () => {
  const { program } = parseInput("nohup long-running &");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "nohup");
  assert.equal(cmd.executable?.value, "long-running");
});

test("parser: exec wrapper", () => {
  const { program } = parseInput("exec bash -c 'echo hi'");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "exec");
  assert.equal(cmd.executable?.value, "bash");
});

// D-037：parser 拥有 wrapper 链——嵌套 wrapper 入栈，executable 永不承载 wrapper，
// wrapper positional（timeout <duration>）由 parser 消费丢弃，args 只含真实命令参数
test("parser: nested wrapper chain (timeout env)", () => {
  const { program } = parseInput("timeout 5 env rm file");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 2);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.wrapper[1]!.value, "env");
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file");
  // wrapper positional 保留在 wrapperArgs（供 token 级扫描），不入 args
  assert.equal(cmd.wrapperArgs.length, 1);
  assert.equal(cmd.wrapperArgs[0]!.value, "5");
});

test("parser: nested wrapper with env option and assignments", () => {
  const { program } = parseInput("timeout 5 env -i PATH=/x rm file");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 2);
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file");
  assert.equal(cmd.envAssignments.length, 1);
  assert.equal(cmd.envAssignments[0]!.value, "PATH=/x");
});

test("parser: nested wrapper chain (env command)", () => {
  const { program } = parseInput("env command rm file");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 2);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.wrapper[1]!.value, "command");
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file");
});

test("parser: deep nested wrappers each consume their positional", () => {
  const { program } = parseInput("timeout 5 env timeout 3 cmd");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 3);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.wrapper[1]!.value, "env");
  assert.equal(cmd.wrapper[2]!.value, "timeout");
  assert.equal(cmd.executable?.value, "cmd");
  assert.equal(cmd.args.length, 0);
});

test("parser: bare wrapper leaves executable null", () => {
  const { program } = parseInput("timeout 5");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.executable, null);
});

test("parser: cd && cat", () => {
  const { program } = parseInput("cd project/sub && cat file");
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[0]!.args.length, 1);
  assert.equal(program.commands[0]!.args[0]!.value, "project/sub");
});

test("parser: dynamic token from glob", () => {
  const { program } = parseInput("ls *.ts");
  assert.equal(program.dynamic, true);
});

test("parser: dynamic token from variable", () => {
  const cmd = parseInput("cat $HOME/file").program.commands[0]!;
  // $HOME/file is dynamic
  assert.ok(cmd.args.some((a) => a.dynamic));
});

test("parser: empty command produces error", () => {
  const { error } = parseInput("");
  assert.equal(error, "empty command");
});

test("parser: unterminated quote propagated from lexer", () => {
  const lexResult = lex("echo 'hello");
  assert.equal(lexResult.unsafeSyntax, "unterminated quote");
});

test("parser: redirect target not in args", () => {
  const { program } = parseInput("cat > output.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.target?.value, "output.txt");
  // output.txt consumed by redirect, not in args
  assert.equal(cmd.args.length, 0);
});

test("parser: preserving quoted arguments", () => {
  const { program } = parseInput('grep "hello world" file.txt');
  const cmd = program.commands[0]!;
  assert.equal(cmd.args.length, 2);
  assert.equal(cmd.args[0]!.raw, '"hello world"');
  assert.equal(cmd.args[0]!.quoted, true);
  assert.equal(cmd.args[1]!.value, "file.txt");
});

test("parser: a && b || c chain", () => {
  const { program } = parseInput("a && b || c");
  assert.equal(program.commands.length, 3);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
  assert.equal(program.commands[2]!.operatorBefore, "||");
});

test("parser: background operator", () => {
  const { program } = parseInput("sleep 10 & wait");
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "sleep");
  assert.equal(program.commands[1]!.executable?.value, "wait");
  assert.equal(program.commands[1]!.operatorBefore, "&");
});

test("parser: here-string target", () => {
  const { program } = parseInput("cat <<< \"hello world\"");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "hereString");
  assert.equal(cmd.redirections[0]!.target?.value, "hello world");
});

test("parser: sort -o flags are args (parser is semantic-free)", () => {
  const { program } = parseInput("sort -o output.txt input.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sort");
  assert.equal(cmd.args.length, 3);
  assert.equal(cmd.args[0]!.value, "-o");
  assert.equal(cmd.args[1]!.value, "output.txt");
  assert.equal(cmd.args[2]!.value, "input.txt");
});

test("parser: dd arg parsing", () => {
  const { program } = parseInput("dd if=/dev/zero of=out.bin bs=1024 count=1");
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "dd");
  assert.ok(cmd.args.some((a) => a.value === "if=/dev/zero"));
  assert.ok(cmd.args.some((a) => a.value === "of=out.bin"));
});

test("lexer+parser: end-to-end env rm path", () => {
  // env rm ~/.ssh/id_rsa: wrapper=env, executable=rm, args=[~/.ssh/id_rsa]
  const { program } = parseInput("env rm ~/.ssh/id_rsa");
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "~/.ssh/id_rsa");
});

test("lexer+parser: sed --in-place is args", () => {
  const { program } = parseInput("sed --in-place -e 's/foo/bar/' file.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sed");
  // args: --in-place, -e, 's/foo/bar/', file.txt
  assert.equal(cmd.args.length, 4);
});

test("parser: newline separates commands like a semicolon", () => {
  const { program } = parseInput("cat a.txt\nrm x");
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cat");
  assert.equal(program.commands[0]!.args.length, 1);
  assert.equal(program.commands[0]!.args[0]!.value, "a.txt");
  assert.equal(program.commands[1]!.executable?.value, "rm");
  assert.equal(program.commands[1]!.operatorBefore, "newline");
});

test("parser: newline continuation keeps && and pipeline semantics", () => {
  const and = parseInput("a &&\nb");
  assert.equal(and.program.commands.length, 2);
  assert.equal(and.program.commands[1]!.operatorBefore, "&&");
  const pipe = parseInput("a |\nb");
  assert.equal(pipe.program.commands[1]!.operatorBefore, "|");
});

test("parser: <> open-readwrite redirect is modeled on the write side", () => {
  const { program } = parseInput("cat <> f.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.target?.value, "f.txt");
});

test("parser: 2<> open-readwrite redirect is modeled as stderr", () => {
  const { program } = parseInput("cat 2<> f.txt");
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stderr");
  assert.equal(cmd.redirections[0]!.fd, 2);
});
