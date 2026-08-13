// tests/access-gate/shell-parse.test.ts — Shell IR lexer/parser 测试

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";

// ─── Lexer Tests ───

test("lexer: tokenizes a simple command", () => {
  const { tokens, unsafeSyntax } = lex("cat file.txt");
  assert.equal(unsafeSyntax, null);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0]!.value, "cat");
  assert.equal(tokens[1]!.value, "file.txt");
  assert.equal(tokens[0]!.kind, "word");
  assert.equal(tokens[1]!.kind, "word");
});

test("lexer: tracks source spans", () => {
  const { tokens } = lex("cat file.txt");
  assert.equal(tokens[0]!.span.start, 0);
  assert.equal(tokens[0]!.span.end, 3);
  assert.equal(tokens[1]!.span.start, 4);
  assert.equal(tokens[1]!.span.end, 12);
});

test("lexer: quoted word span covers quotes in place (no indexOf backfill drift)", () => {
  // 引号内含空格的词：raw 含引号，span 必须覆盖原文中的引号位置（T-059/B3）
  const { tokens } = lex('echo "a b" c');
  assert.equal(tokens[1]!.rawValue, '"a b"');
  assert.equal(tokens[1]!.span.start, 5);
  assert.equal(tokens[1]!.span.end, 10);
  assert.equal(tokens[2]!.span.start, 11);
});

test("lexer: repeated raw values keep per-token spans (scan-time positions)", () => {
  const { tokens } = lex("x x x");
  assert.deepEqual(tokens.map((t) => t.span), [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
    { start: 4, end: 5 },
  ]);
});

test("lexer: control operators (&&, ||, ;, |, &)", () => {
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

test("lexer: stdout redirect (>)", () => {
  const { tokens } = lex("echo hello > out.txt");
  assert.equal(tokens[2]!.kind, "redirect");
  assert.equal(tokens[2]!.value, ">");
  assert.equal(tokens[3]!.value, "out.txt");
});

test("lexer: stdout append (>>)", () => {
  const { tokens } = lex("echo hello >> out.txt");
  assert.equal(tokens[2]!.kind, "redirect");
  assert.equal(tokens[2]!.value, ">>");
});

test("lexer: stdin (<)", () => {
  const { tokens } = lex("cat < in.txt");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "<");
  assert.equal(tokens[2]!.value, "in.txt");
});

test("lexer: stderr redirect (2>)", () => {
  const { tokens } = lex("cmd 2> err.txt");
  assert.equal(tokens[1]!.value, "2");
  assert.equal(tokens[1]!.kind, "word");
  assert.equal(tokens[2]!.kind, "redirect");
  assert.equal(tokens[2]!.value, ">");
  assert.equal(tokens[3]!.value, "err.txt");
});

test("lexer: &> redirect", () => {
  const { tokens } = lex("cmd &> out.txt");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "&>");
  assert.equal(tokens[2]!.value, "out.txt");
});

test("lexer: &>> redirect", () => {
  const { tokens } = lex("cmd &>> out.txt");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "&>>");
});

test("lexer: heredoc (<<)", () => {
  const { tokens } = lex("cat << EOF");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "<<");
  assert.equal(tokens[2]!.value, "EOF");
});

test("lexer: here-string (<<<)", () => {
  const { tokens } = lex("cat <<< \"hello world\"");
  assert.equal(tokens[1]!.kind, "redirect");
  assert.equal(tokens[1]!.value, "<<<");
  assert.equal(tokens[2]!.value, '"hello world"');
});

test("lexer: single-quoted strings", () => {
  const { tokens } = lex("echo 'hello world'");
  assert.equal(tokens[1]!.value, "'hello world'");
  assert.equal(tokens[1]!.quoted, true);
});

test("lexer: double-quoted strings", () => {
  const { tokens } = lex('echo "hello world"');
  assert.equal(tokens[1]!.value, '"hello world"');
  assert.equal(tokens[1]!.quoted, true);
});

test("lexer: unquoted wildcards are dynamic", () => {
  const { tokens } = lex("cat *.txt");
  assert.equal(tokens[1]!.dynamic, true);
});

test("lexer: unquoted dollar is dynamic", () => {
  const { tokens } = lex("echo $HOME");
  assert.equal(tokens[1]!.dynamic, true);
});

test("lexer: quoted wildcards are not dynamic", () => {
  const { tokens } = lex('cat "*.txt"');
  assert.equal(tokens[1]!.quoted, true);
  assert.equal(tokens[1]!.dynamic, false);
});

test("lexer: unterminated single quote", () => {
  const { unsafeSyntax } = lex("echo 'hello");
  assert.equal(unsafeSyntax, "unterminated quote");
});

test("lexer: unterminated double quote", () => {
  const { unsafeSyntax } = lex('echo "hello');
  assert.equal(unsafeSyntax, "unterminated quote");
});

test("lexer: comment (strips # to end)", () => {
  const { tokens } = lex("echo hello # this is a comment");
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0]!.value, "echo");
  assert.equal(tokens[1]!.value, "hello");
});

test("lexer: backslash continuation (\\\\n)", () => {
  const { tokens } = lex("echo \\\nhello");
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0]!.value, "echo");
  assert.equal(tokens[1]!.value, "hello");
});

test("lexer: newline separates commands", () => {
  const { tokens } = lex("cat a.txt\nrm x");
  const ops = tokens.filter((t) => t.kind === "operator").map((t) => t.value);
  assert.deepEqual(ops, ["newline"]);
});

test("lexer: newline after && is a continuation, not a separator", () => {
  const { tokens } = lex("a &&\nb");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
});

test("lexer: newline after | is a continuation, not a separator", () => {
  const { tokens } = lex("a |\nb");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
});

test("lexer: newline after || is a continuation, not a separator", () => {
  const { tokens } = lex("a ||\nb");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
});

test("lexer: newline after & is a continuation, not a separator", () => {
  const { tokens } = lex("a &\nb");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
});

test("lexer: newline inside single quotes is a literal word character", () => {
  const { tokens } = lex("echo 'a\nb'");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
  assert.equal(tokens.length, 2);
});

test("lexer: newline after ; is still a separator", () => {
  const { tokens } = lex("a ;\nb");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), true);
});

test("lexer: newline inside double quotes is a literal word character", () => {
  const { tokens } = lex('echo "a\nb"');
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
  assert.equal(tokens.length, 2);
});

test("lexer: newline after a redirect operator is a continuation (target may span lines)", () => {
  const { tokens } = lex("echo hi >\n/tmp/x");
  assert.equal(tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
  assert.equal(tokens[3]!.value, "/tmp/x");
});

test("lexer: newline preceded by trailing whitespace still separates", () => {
  // 回归锁：换行判断必须扫描整个空白 run（run 第一个字符是空格/制表符时换行不能被吞）
  const { tokens } = lex("cat a.txt \nrm x");
  assert.equal(tokens.filter((t) => t.kind === "operator" && t.value === "newline").length, 1);
  const tab = lex("cat a.txt\t\nrm x");
  assert.equal(tab.tokens.filter((t) => t.kind === "operator" && t.value === "newline").length, 1);
  // 延续场景同样成立：&& 后有空格再换行仍是延续
  const cont = lex("a && \nb");
  assert.equal(cont.tokens.some((t) => t.kind === "operator" && t.value === "newline"), false);
});

test("lexer: leading newline is a separator before the first command", () => {
  const { tokens } = lex("\nls");
  assert.equal(tokens[0]!.kind, "operator");
  assert.equal(tokens[0]!.value, "newline");
  assert.equal(tokens[1]!.value, "ls");
});

test("lexer: consecutive blank lines collapse into one newline token", () => {
  const { tokens } = lex("a\n\nb");
  assert.equal(tokens.filter((t) => t.kind === "operator" && t.value === "newline").length, 1);
  assert.equal(tokens[1]!.value, "newline");
  assert.equal(tokens[2]!.value, "b");
});

test("lexer: empty input", () => {
  const { tokens } = lex("");
  assert.equal(tokens.length, 0);
});

test("lexer: comment does not strip in middle of word", () => {
  const { tokens } = lex("echo foo#bar");
  // 没有前导空白的 # 不是注释
  assert.equal(tokens.length, 2);
  assert.equal(tokens[1]!.value, "foo#bar");
});

// ─── Parser Tests ───

test("parser: simple command", () => {
  const { program, error } = parse(lex("cat file.txt").tokens);
  assert.equal(error, null);
  assert.equal(program.commands.length, 1);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "cat");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file.txt");
});

test("parser: control operators separate commands", () => {
  const { program } = parse(lex("cd dir && cat file").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.executable?.value, "cat");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
});

test("parser: semicolon separated", () => {
  const { program } = parse(lex("echo a; echo b").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, ";");
});

test("parser: pipeline", () => {
  const { program } = parse(lex("cat file | grep pattern").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, "|");
});

test("parser: stdout redirection", () => {
  const { program } = parse(lex("echo hello > out.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.fd, 1);
  assert.equal(cmd.redirections[0]!.target?.value, "out.txt");
});

test("parser: consumes an adjacent stderr fd prefix", () => {
  const { program } = parse(lex("cmd 2> err.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "cmd");
  assert.deepEqual(cmd.args.map((arg) => arg.value), []);
  assert.equal(cmd.redirections[0]!.kind, "stderr");
  assert.equal(cmd.redirections[0]!.fd, 2);
});

test("parser: preserves a spaced numeric argument before redirect", () => {
  const { program } = parse(lex("cmd 2 > err.txt").tokens);
  const cmd = program.commands[0]!;
  assert.deepEqual(cmd.args.map((arg) => arg.value), ["2"]);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.fd, 1);
});

test("parser: stdin redirection", () => {
  const { program } = parse(lex("sort < in.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdin");
  assert.equal(cmd.redirections[0]!.fd, 0);
  assert.equal(cmd.redirections[0]!.target?.value, "in.txt");
});

test("parser: append redirection", () => {
  const { program } = parse(lex("echo hello >> out.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdoutAppend");
});

test("parser: distinguishes fd duplication from file redirection", () => {
  const { program } = parse(lex("cat file 2>&1").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections[0]!.kind, "fdDuplicate");
  assert.equal(cmd.redirections[0]!.fd, 2);
  assert.equal(cmd.redirections[0]!.target?.value, "1");
});

test("parser: env assignments", () => {
  const { program } = parse(lex("VAR=value cmd").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.envAssignments.length, 1);
  assert.equal(cmd.envAssignments[0]!.value, "VAR=value");
  assert.equal(cmd.executable?.value, "cmd");
});

test("parser: multiple env assignments", () => {
  const { program } = parse(lex("A=1 B=2 cmd arg").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.envAssignments.length, 2);
  assert.equal(cmd.executable?.value, "cmd");
});

test("parser: env with PATH override", () => {
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

test("parser: command wrapper", () => {
  const { program } = parse(lex("command cp src dst").tokens);
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
  const { program } = parse(lex("nohup long-running &").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "nohup");
  assert.equal(cmd.executable?.value, "long-running");
});

test("parser: exec wrapper", () => {
  const { program } = parse(lex("exec bash -c 'echo hi'").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "exec");
  assert.equal(cmd.executable?.value, "bash");
});

// D-037：parser 拥有 wrapper 链——嵌套 wrapper 入栈，executable 永不承载 wrapper，
// wrapper positional（timeout <duration>）由 parser 消费丢弃，args 只含真实命令参数
test("parser: nested wrapper chain (timeout env)", () => {
  const { program } = parse(lex("timeout 5 env rm file").tokens);
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
  const { program } = parse(lex("timeout 5 env -i PATH=/x rm file").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 2);
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file");
  assert.equal(cmd.envAssignments.length, 1);
  assert.equal(cmd.envAssignments[0]!.value, "PATH=/x");
});

test("parser: nested wrapper chain (env command)", () => {
  const { program } = parse(lex("env command rm file").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 2);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.wrapper[1]!.value, "command");
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "file");
});

test("parser: deep nested wrappers each consume their positional", () => {
  const { program } = parse(lex("timeout 5 env timeout 3 cmd").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 3);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.wrapper[1]!.value, "env");
  assert.equal(cmd.wrapper[2]!.value, "timeout");
  assert.equal(cmd.executable?.value, "cmd");
  assert.equal(cmd.args.length, 0);
});

test("parser: bare wrapper leaves executable null", () => {
  const { program } = parse(lex("timeout 5").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "timeout");
  assert.equal(cmd.executable, null);
});

test("parser: cd && cat", () => {
  const { program } = parse(lex("cd project/sub && cat file").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cd");
  assert.equal(program.commands[0]!.args.length, 1);
  assert.equal(program.commands[0]!.args[0]!.value, "project/sub");
});

test("parser: dynamic token from glob", () => {
  const { program } = parse(lex("ls *.ts").tokens);
  assert.equal(program.dynamic, true);
});

test("parser: dynamic token from variable", () => {
  const lexResult = lex("cat $HOME/file");
  const cmd = parse(lexResult.tokens).program.commands[0]!;
  // $HOME/file is dynamic
  assert.ok(cmd.args.some((a) => a.dynamic));
});

test("parser: empty command produces error", () => {
  const { error } = parse(lex("").tokens);
  assert.equal(error, "empty command");
});

test("parser: unterminated quote propagated from lexer", () => {
  const lexResult = lex("echo 'hello");
  assert.equal(lexResult.unsafeSyntax, "unterminated quote");
});

test("parser: redirect target not in args", () => {
  const { program } = parse(lex("cat > output.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.target?.value, "output.txt");
  // output.txt consumed by redirect, not in args
  assert.equal(cmd.args.length, 0);
});

test("parser: preserving quoted arguments", () => {
  const { program } = parse(lex('grep "hello world" file.txt').tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.args.length, 2);
  assert.equal(cmd.args[0]!.raw, '"hello world"');
  assert.equal(cmd.args[0]!.quoted, true);
  assert.equal(cmd.args[1]!.value, "file.txt");
});

test("parser: a && b || c chain", () => {
  const { program } = parse(lex("a && b || c").tokens);
  assert.equal(program.commands.length, 3);
  assert.equal(program.commands[0]!.operatorBefore, "start");
  assert.equal(program.commands[1]!.operatorBefore, "&&");
  assert.equal(program.commands[2]!.operatorBefore, "||");
});

test("parser: background operator", () => {
  const { program } = parse(lex("sleep 10 & wait").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "sleep");
  assert.equal(program.commands[1]!.executable?.value, "wait");
  assert.equal(program.commands[1]!.operatorBefore, "&");
});

test("parser: here-string target", () => {
  const { program } = parse(lex("cat <<< \"hello world\"").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "hereString");
  assert.equal(cmd.redirections[0]!.target?.value, "hello world");
});

test("parser: sort -o flags are args (parser is semantic-free)", () => {
  const { program } = parse(lex("sort -o output.txt input.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sort");
  assert.equal(cmd.args.length, 3);
  assert.equal(cmd.args[0]!.value, "-o");
  assert.equal(cmd.args[1]!.value, "output.txt");
  assert.equal(cmd.args[2]!.value, "input.txt");
});

test("parser: dd arg parsing", () => {
  const { program } = parse(lex("dd if=/dev/zero of=out.bin bs=1024 count=1").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "dd");
  assert.ok(cmd.args.some((a) => a.value === "if=/dev/zero"));
  assert.ok(cmd.args.some((a) => a.value === "of=out.bin"));
});

test("lexer+parser: end-to-end env rm path", () => {
  // env rm ~/.ssh/id_rsa: wrapper=env, executable=rm, args=[~/.ssh/id_rsa]
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.wrapper.length, 1);
  assert.equal(cmd.wrapper[0]!.value, "env");
  assert.equal(cmd.executable?.value, "rm");
  assert.equal(cmd.args.length, 1);
  assert.equal(cmd.args[0]!.value, "~/.ssh/id_rsa");
});

test("lexer+parser: sed --in-place is args", () => {
  const { program } = parse(lex("sed --in-place -e 's/foo/bar/' file.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.executable?.value, "sed");
  // args: --in-place, -e, 's/foo/bar/', file.txt
  assert.equal(cmd.args.length, 4);
});

test("parser: newline separates commands like a semicolon", () => {
  const { program } = parse(lex("cat a.txt\nrm x").tokens);
  assert.equal(program.commands.length, 2);
  assert.equal(program.commands[0]!.executable?.value, "cat");
  assert.equal(program.commands[0]!.args.length, 1);
  assert.equal(program.commands[0]!.args[0]!.value, "a.txt");
  assert.equal(program.commands[1]!.executable?.value, "rm");
  assert.equal(program.commands[1]!.operatorBefore, "newline");
});

test("parser: newline continuation keeps && and pipeline semantics", () => {
  const and = parse(lex("a &&\nb").tokens);
  assert.equal(and.program.commands.length, 2);
  assert.equal(and.program.commands[1]!.operatorBefore, "&&");
  const pipe = parse(lex("a |\nb").tokens);
  assert.equal(pipe.program.commands[1]!.operatorBefore, "|");
});

test("parser: <> open-readwrite redirect is modeled on the write side", () => {
  const { program } = parse(lex("cat <> f.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stdout");
  assert.equal(cmd.redirections[0]!.target?.value, "f.txt");
});

test("parser: 2<> open-readwrite redirect is modeled as stderr", () => {
  const { program } = parse(lex("cat 2<> f.txt").tokens);
  const cmd = program.commands[0]!;
  assert.equal(cmd.redirections.length, 1);
  assert.equal(cmd.redirections[0]!.kind, "stderr");
  assert.equal(cmd.redirections[0]!.fd, 2);
});
