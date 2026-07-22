// tests/access-gate/shell-parse.test.ts — Shell IR lexer/parser 测试

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";

// ─── Lexer Tests ───

void test("lexer: tokenizes a simple command", () => {
  const { tokens, unsafeSyntax } = lex("cat file.txt");
  assert.equal(unsafeSyntax, null);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0]!.value, "cat");
  assert.equal(tokens[1]!.value, "file.txt");
  assert.equal(tokens[0]!.kind, "word");
  assert.equal(tokens[1]!.kind, "word");
});

void test("lexer: tracks source spans", () => {
  const { tokens } = lex("cat file.txt");
  assert.equal(tokens[0]!.span.start, 0);
  assert.equal(tokens[0]!.span.end, 3);
  assert.equal(tokens[1]!.span.start, 4);
  assert.equal(tokens[1]!.span.end, 12);
});

void test("lexer: control operators (&&, ||, ;, |, &)", () => {
  const { tokens } = lex("a && b || c; d | e & f");
  assert.equal(tokens.length, 11);
  assert.equal(tokens[1]!.value, "&&");
  assert.equal(tokens[1]!.kind, "operator");
  assert.equal(tokens[3]!.value, "||");
  assert.equal(tokens[3]!.kind, "operator");
  assert.equal(tokens[5]!.value, ";");
  assert.equal(tokens[5]!.kind, "operator");
  assert.equal(tokens[7]!.value, "|");
  assert.equal(tokens[7]!.kind, "operator");
  assert.equal(tokens[9]!.value, "&");
  assert.equal(tokens[9]!.kind, "operator");
});

void test("lexer: stdout redirect (>)", () => {
  const { tokens } = lex("echo hello > out.txt");
  assert.equal(tokens[2]!.kind, "redirect");
  assert.equal(tokens[2]!.value, ">");
  assert.equal(tokens[3]!.value, "out.txt");
});

void test("lexer: stdout append (>>)", () => {
  const { tokens } = lex("echo hello >> out.txt");
  assert.equal(tokens[2]!.kind, "redirect");
  assert.equal(tokens[2]!.value, ">>");
});

void test("lexer: stdin (<)", () => {
  const { tokens } = lex("cat < in.txt");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "<");
  assert.equal(tokens[2]!.value, "in.txt");
});

void test("lexer: stderr redirect (2>)", () => {
  const { tokens } = lex("cmd 2> err.txt");
  assert.equal(tokens[1]!.value, "2");
  assert.equal(tokens[1]!.kind, "word");
  assert.equal(tokens[2]!.kind, "redirect");
  assert.equal(tokens[2]!.value, ">");
  assert.equal(tokens[3]!.value, "err.txt");
});

void test("lexer: &> redirect", () => {
  const { tokens } = lex("cmd &> out.txt");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "&>");
  assert.equal(tokens[2]!.value, "out.txt");
});

void test("lexer: &>> redirect", () => {
  const { tokens } = lex("cmd &>> out.txt");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "&>>");
});

void test("lexer: heredoc (<<)", () => {
  const { tokens } = lex("cat << EOF");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "<<");
  assert.equal(tokens[2]!.value, "EOF");
});

void test("lexer: here-string (<<<)", () => {
  const { tokens } = lex("cat <<< \"hello world\"");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "<<<");
  assert.equal(tokens[2]!.value, '"hello world"');
});

void test("lexer: single-quoted strings", () => {
  const { tokens } = lex("echo 'hello world'");
  assert.equal(tokens[1]!.value, "'hello world'");
  assert.equal(tokens[1]!.quoted, true);
});

void test("lexer: double-quoted strings", () => {
  const { tokens } = lex('echo "hello world"');
  assert.equal(tokens[1]!.value, '"hello world"');
  assert.equal(tokens[1]!.quoted, true);
});

void test("lexer: unquoted wildcards are dynamic", () => {
  const { tokens } = lex("cat *.txt");
  assert.equal(tokens[1]!.dynamic, true);
});

void test("lexer: unquoted dollar is dynamic", () => {
  const { tokens } = lex("echo $HOME");
  assert.equal(tokens[1]!.dynamic, true);
});

void test("lexer: quoted wildcards are not dynamic", () => {
  const { tokens } = lex('cat "*.txt"');
  assert.equal(tokens[1]!.quoted, true);
  assert.equal(tokens[1]!.dynamic, false);
});

void test("lexer: unterminated single quote", () => {
  const { tokens, unsafeSyntax } = lex("echo 'hello");
  assert.equal(unsafeSyntax, "unterminated quote");
});

void test("lexer: unterminated double quote", () => {
  const { tokens, unsafeSyntax } = lex('echo "hello');
  assert.equal(unsafeSyntax, "unterminated quote");
});

void test("lexer: comment (strips # to end)", () => {
  const { tokens } = lex("echo hello # this is a comment");
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0]!.value, "echo");
  assert.equal(tokens[1]!.value, "hello");
});

void test("lexer: backslash continuation (\\\\n)", () => {
  const { tokens } = lex("echo \\\nhello");
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0]!.value, "echo");
  assert.equal(tokens[1]!.value, "hello");
});

void test("lexer: empty input", () => {
  const { tokens } = lex("");
  assert.equal(tokens.length, 0);
});

void test("lexer: comment does not strip in middle of word", () => {
  const { tokens } = lex("echo foo#bar");
  // 没有前导空白的 # 不是注释
  assert.equal(tokens.length, 2);
  assert.equal(tokens[1]!.value, "foo#bar");
});

// ─── Parser Tests ───

void test("parser: simple command", () => {
  const { program, error } = parse(lex("cat file.txt").tokens);
  assert.equal(error, null);
  assert.equal(program.commands.length, 1);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "cat");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file.txt");
});

void test("parser: control operators separate commands", () => {
  const { program } = parse(lex("cd dir && cat file").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.executable?.value, "cat");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
});

void test("parser: semicolon separated", () => {
  const { program } = parse(lex("echo a; echo b").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, ";");
});

void test("parser: pipeline", () => {
  const { program } = parse(lex("cat file | grep pattern").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, "|");
});

void test("parser: stdout redirection", () => {
  const { program } = parse(lex("echo hello > out.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.fd, 1);
  assert.equal(cmd.redirections[0]!.target?.value, "out.txt");
});

void test("parser: consumes an adjacent stderr fd prefix", () => {
  const { program } = parse(lex("cmd 2> err.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "cmd");
  assert.deepEqual(cmd.args.map((arg) => arg.value), []);
  assert.equal(cmd.redirections[0]!.kind, "stderr");
  assert.equal(cmd.redirections[0]!.fd, 2);
});

void test("parser: preserves a spaced numeric argument before redirect", () => {
  const { program } = parse(lex("cmd 2 > err.txt").tokens);
  const cmd = program.commands[0]!;
  assert.deepEqual(cmd.args.map((arg) => arg.value), ["2"]);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.fd, 1);
});

void test("parser: stdin redirection", () => {
  const { program } = parse(lex("sort < in.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdin");
  assert.equal(cmd.redirections[0]!.fd, 0);
  assert.equal(cmd.redirections[0]!.target?.value, "in.txt");
});

void test("parser: append redirection", () => {
  const { program } = parse(lex("echo hello >> out.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdoutAppend");
});

void test("parser: env assignments", () => {
  const { program } = parse(lex("VAR=value cmd").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.envAssignments.length, 1);
  assert.equal(cmd.envAssignments[0]!.value, "VAR=value");
  assert.equal(cmd.executable?.value, "cmd");
});

void test("parser: multiple env assignments", () => {
  const { program } = parse(lex("A=1 B=2 cmd arg").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.envAssignments.length, 2);
  assert.equal(cmd.executable?.value, "cmd");
});

void test("parser: env wrapper", () => {
  const { program } = parse(lex("env rm file").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.executable?.value, "rm");
});

void test("parser: env with PATH override", () => {
  const lexResult = lex("env PATH=/tmp rm file");
  const { program } = parse(lexResult.tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.envAssignments.length, 1, `got ${cmd.envAssignments.length}`);
  if (cmd.envAssignments.length > 0) {
    assert.equal(cmd.envAssignments[0]!.value, "PATH=/tmp");
  }
  assert.equal(cmd.executable?.value, "rm");
});

void test("parser: command wrapper", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "command");
  assert.equal(cmd.executable?.value, "cp");
  assert.equal(cmd.args.length, 2);
});

void test("parser: timeout wrapper", () => {
  const lexResult = lex("timeout 5 sleep 10");
  assert.equal(lexResult.tokens.length, 4);
  const { program } = parse(lexResult.tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.executable?.value, "sleep", `got '${cmd.executable?.value}'`);
});

void test("parser: nohup wrapper", () => {
  const { program } = parse(lex("nohup long-running &").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "nohup");
  assert.equal(cmd.executable?.value, "long-running");
});

void test("parser: exec wrapper", () => {
  const { program } = parse(lex("exec bash -c 'echo hi'").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "exec");
  assert.equal(cmd.executable?.value, "bash");
});

void test("parser: cd && cat", () => {
  const { program } = parse(lex("cd project/sub && cat file").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[0]!.args.length, 1);
  assert.equal(program.commands[0]!.args[0]!.value, "project/sub");
});

void test("parser: dynamic token from glob", () => {
  const { program } = parse(lex("ls *.ts").tokens);
  assert.equal(program.dynamic, true);
});

void test("parser: dynamic token from variable", () => {
  const lexResult = lex("cat $HOME/file");
  const cmd = parse(lexResult.tokens).program.commands[0]!;
  // $HOME/file is dynamic
  assert.ok(cmd.args.some((a) => a.dynamic));
});

void test("parser: empty command produces error", () => {
  const { error } = parse(lex("").tokens);
  assert.equal(error, "empty command");
});

void test("parser: unterminated quote propagated from lexer", () => {
  const lexResult = lex("echo 'hello");
  assert.equal(lexResult.unsafeSyntax, "unterminated quote");
});

void test("parser: redirect target not in args", () => {
  const { program } = parse(lex("cat > output.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.target?.value, "output.txt");
  // output.txt consumed by redirect, not in args
  assert.equal(cmd.args.length, 0);
});

void test("parser: preserving quoted arguments", () => {
  const { program } = parse(lex('grep "hello world" file.txt').tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.args.length, 2);
  assert.equal(cmd.args[0]!.raw, '"hello world"');
  assert.equal(cmd.args[0]!.quoted, true);
  assert.equal(cmd.args[1]!.value, "file.txt");
});

void test("parser: a && b || c chain", () => {
  const { program } = parse(lex("a && b || c").tokens);
  assert.equal(program.commands.length, 3);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
  assert.equal(program.commands[2]!.operatorBefore, "||");
});

void test("parser: background operator", () => {
  const { program } = parse(lex("sleep 10 & wait").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "sleep");
  assert.equal(program.commands[1]!.executable?.value, "wait");
  assert.equal(program.commands[1]!.operatorBefore, "&");
});

void test("parser: here-string target", () => {
  const { program } = parse(lex("cat <<< \"hello world\"").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "hereString");
  assert.equal(cmd.redirections[0]!.target?.value, "hello world");
});

void test("parser: sort -o flags are args (parser is semantic-free)", () => {
  const { program } = parse(lex("sort -o output.txt input.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sort");
  assert.equal(cmd.args.length, 3);
  assert.equal(cmd.args[0]!.value, "-o");
  assert.equal(cmd.args[1]!.value, "output.txt");
  assert.equal(cmd.args[2]!.value, "input.txt");
});

void test("parser: dd arg parsing", () => {
  const { program } = parse(lex("dd if=/dev/zero of=out.bin bs=1024 count=1").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "dd");
  assert.ok(cmd.args.some((a) => a.value === "if=/dev/zero"));
  assert.ok(cmd.args.some((a) => a.value === "of=out.bin"));
});

void test("lexer+parser: end-to-end env rm path", () => {
  // env rm ~/.ssh/id_rsa: wrapper=env, executable=rm, args=[~/.ssh/id_rsa]
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "~/.ssh/id_rsa");
});

void test("lexer+parser: end-to-end command cp", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "command");
  assert.equal(cmd.executable?.value, "cp");
  assert.equal(cmd.args.length, 2);
});

void test("lexer+parser: end-to-end cd && cat", () => {
  const { program } = parse(lex("cd /etc && cat shadow").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[1]!.executable?.value, "cat");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
});

void test("lexer+parser: sort -o output.txt input.txt is all args", () => {
  const { program } = parse(lex("sort -o output.txt input.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sort");
  assert.equal(cmd.args.length, 3);
  // parser doesn't understand -o semantics
  assert.equal(cmd.args[0]!.value, "-o");
  assert.equal(cmd.args[1]!.value, "output.txt");
  assert.equal(cmd.args[2]!.value, "input.txt");
});

void test("lexer+parser: sed --in-place is args", () => {
  const { program } = parse(lex("sed --in-place -e 's/foo/bar/' file.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sed");
  // args: --in-place, -e, 's/foo/bar/', file.txt
  assert.equal(cmd.args.length, 4);
});
