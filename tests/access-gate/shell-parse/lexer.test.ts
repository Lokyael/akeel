
import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";

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
