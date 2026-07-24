// tests/access-gate/command-semantics-adapters.test.ts
// filesystem + text-transform adapter 测试

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { normalizeCommand } from "../../src/access-gate/command-semantics/normalize";
import { analyzeSemantics } from "../../src/access-gate/command-semantics/registry";
import type { SemanticContext } from "../../src/access-gate/command-semantics/types";

const CTX: SemanticContext = { projectRoot: "/p", stagingDir: "/s", cwd: "/p" };

void test("fs: rm produces write intent", () => {
  const { program } = parse(lex("rm file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "write");
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

void test("fs: cp produces read + write intents", () => {
  const { program } = parse(lex("cp src.txt dst.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 2);
  assert.equal(sem.intents[0]!.operation, "read");
  assert.equal(sem.intents[0]!.rawPath, "src.txt");
  assert.equal(sem.intents[1]!.operation, "write");
  assert.equal(sem.intents[1]!.rawPath, "dst.txt");
});

void test("fs: mv produces write intents", () => {
  const { program } = parse(lex("mv old.txt new.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 2);
  assert.equal(sem.intents[0]!.operation, "write");
  assert.equal(sem.intents[1]!.operation, "write");
});

void test("fs: chmod skips mode arg", () => {
  const { program } = parse(lex("chmod 644 file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

void test("fs: chown skips owner arg", () => {
  const { program } = parse(lex("chown user:group file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

void test("fs: rm ~/.ssh/id_rsa produces write intent on protected path", () => {
  const { program } = parse(lex("rm ~/.ssh/id_rsa").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents[0]!.rawPath, "~/.ssh/id_rsa");
});

void test("fs: env rm ~/.ssh/id_rsa after normalization produces same intents", () => {
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  const sem = analyzeSemantics(norm!.command, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "~/.ssh/id_rsa");
});

void test("fs: command cp src dst after normalization produces read+write", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  const sem = analyzeSemantics(norm!.command, CTX);
  assert.equal(sem.class, "mutating");
  assert.equal(sem.intents.length, 2);
});

void test("tx: sort -o writes to output file", () => {
  const { program } = parse(lex("sort -o output.txt input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  // sort -o 产生写 intent → 应为 mutating
  assert.equal(sem.class, "mutating");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "output.txt"));
});

void test("tx: sort without -o is readOnly", () => {
  const { program } = parse(lex("sort input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("tx: sed -i is mutating (in-place)", () => {
  const { program } = parse(lex("sed -i 's/foo/bar/' file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("tx: sed without -i is readOnly", () => {
  const { program } = parse(lex("sed 's/foo/bar/' file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("tx: uniq -o writes to output file", () => {
  const { program } = parse(lex("uniq -o output.txt input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "output.txt"));
});

void test("tx: unknown option sets opaque", () => {
  const { program } = parse(lex("sort --unknown-flag input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.opaque, true);
});

void test("tx: sed --in-place is mutating", () => {
  const { program } = parse(lex("sed --in-place -e 's/foo/bar/' file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("tx: unclassified command falls through", () => {
  const { program } = parse(lex("unknowncmd file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "unclassified");
  assert.equal(sem.intents.length, 0);
});

// ─── Search adapter ───

void test("search: find . produces search intent", () => {
  const { program } = parse(lex("find . -type f").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, ".");
});

void test("search: find without path defaults to .", () => {
  const { program } = parse(lex("find -type f -name '*.ts'").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents[0]!.rawPath, ".");
});

void test("search: find /etc is protected", () => {
  const { program } = parse(lex("find /etc -name shadow").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents[0]!.rawPath, "/etc");
});

void test("search: grep -r searches directory", () => {
  const { program } = parse(lex("grep -r pattern src/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, "src/");
});

void test("search: grep combined flags preserve recursive search", () => {
  const { program } = parse(lex("grep -rn pattern src/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, "src/");
});

void test("search: grep without -r produces a read intent", () => {
  const { program } = parse(lex("grep pattern file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  // 非递归 grep 读取文件，但不产生 search intent
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "read");
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

void test("search: grep -f extracts file opt read intent", () => {
  const { program } = parse(lex("grep -f patterns.txt src/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "patterns.txt"));
});

void test("search: rg searches default root", () => {
  const { program } = parse(lex("rg pattern").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
});

void test("search: rg -f extracts pattern file", () => {
  const { program } = parse(lex("rg -f patterns.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "patterns.txt"));
});

void test("search: rg skips values for glob and type options", () => {
  const { program } = parse(lex("rg --glob '*.ts' --type ts pattern src/ /etc").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "search").map((intent) => intent.rawPath),
    ["src/", "/etc"],
  );
});

void test("search: rg skips context counts", () => {
  const { program } = parse(lex("rg -n -C 3 pattern AGENTS.md").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "search").map((intent) => intent.rawPath),
    ["AGENTS.md"],
  );
});

void test("search: pattern file option makes the first positional argument a root", () => {
  const { program } = parse(lex("rg -f patterns.txt src/ /etc").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "search").map((intent) => intent.rawPath),
    ["src/", "/etc"],
  );
});

// ─── ls adapter ───

void test("ls: defaults to . list intent", () => {
  const { program } = parse(lex("ls").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "list");
  assert.equal(sem.intents[0]!.rawPath, ".");
});

void test("ls: explicit path produces list intent", () => {
  const { program } = parse(lex("ls /etc").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "list");
  assert.equal(sem.intents[0]!.rawPath, "/etc");
});

void test("ls: multiple paths produce list intents", () => {
  const { program } = parse(lex("ls src/ tests/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  const listIntents = sem.intents.filter((i) => i.operation === "list");
  assert.equal(listIntents.length, 2);
  assert.deepEqual(listIntents.map((i) => i.rawPath), ["src/", "tests/"]);
});

void test("ls: flags like -la are skipped, path still recognized", () => {
  const { program } = parse(lex("ls -la /home").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "list");
  assert.equal(sem.intents[0]!.rawPath, "/home");
});

void test("ls: -- after options treats everything as path", () => {
  const { program } = parse(lex("ls -l -- -f").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.ok(sem.intents.some((i) => i.operation === "list" && i.rawPath === "-f"));
});

// ─── Read adapter ───

void test("read: head -250 reads stdin without a path intent", () => {
  const { program } = parse(lex("head -250").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.intents.length, 0);
});

void test("read: head checks explicit files", () => {
  const { program } = parse(lex("head -n 5 /etc/passwd").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.deepEqual(sem.intents.map((intent) => [intent.operation, intent.rawPath]), [["read", "/etc/passwd"]]);
});

void test("read: cat checks multiple files", () => {
  const { program } = parse(lex("cat first.txt second.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["first.txt", "second.txt"]);
});

void test("read: tail skips line-count values and checks files", () => {
  const { program } = parse(lex("tail --lines=5 file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["file.txt"]);
});

void test("read: wc checks files after flags", () => {
  const { program } = parse(lex("wc -l file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["file.txt"]);
});

void test("read: cut skips delimiter and field values", () => {
  const { program } = parse(lex("cut -d : -f 1 /etc/passwd").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["/etc/passwd"]);
});

// ─── Git adapter ───

void test("git: status is readOnly", () => {
  const { program } = parse(lex("git status").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("git: rev-list is readOnly", () => {
  const { program } = parse(lex("git rev-list --left-right --count origin/main...HEAD").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
  assert.equal(sem.opaque, false);
});

void test("git: add produces read intents", () => {
  const { program } = parse(lex("git add src/file.ts").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "src/file.ts"));
});

void test("git: rm produces write intents for every path", () => {
  const { program } = parse(lex("git rm --cached first.md second.md").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "write").map((intent) => intent.rawPath),
    ["first.md", "second.md"],
  );
});

void test("git: checkout -- writes path", () => {
  const { program } = parse(lex("git checkout -- src/file.ts").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "src/file.ts"));
});

void test("git: clone is mutating", () => {
  const { program } = parse(lex("git clone https://example.test/repo").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("git: push --force is dangerous", () => {
  const { program } = parse(lex("git push --force origin main").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "dangerous");
});

void test("git: -C option adds list intent", () => {
  const { program } = parse(lex("git -C /repo status").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.ok(sem.intents.some((i) => i.operation === "list" && i.rawPath === "/repo"), `intents: ${JSON.stringify(sem.intents)}`);
});

// ─── Package adapter ───

void test("npm: install is mutating", () => {
  const { program } = parse(lex("npm install express").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("npm: test is mutating", () => {
  const { program } = parse(lex("npm test").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("npm: view is readOnly", () => {
  const { program } = parse(lex("npm view express").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("pnpm: run is mutating", () => {
  const { program } = parse(lex("pnpm run build").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("yarn: add is mutating", () => {
  const { program } = parse(lex("yarn add lodash").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
})

// ─── npx adapter ───

void test("npx: execute package is mutating", () => {
  const { program } = parse(lex("npx some-package").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("npx: execute with args is mutating", () => {
  const { program } = parse(lex("npx tsx --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("npx: version flag is readOnly", () => {
  const { program } = parse(lex("npx --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("npx: help flag is readOnly", () => {
  const { program } = parse(lex("npx --help").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
})

// --- interpreter adapter ---

void test("python: execute script is mutating", () => {
  const { program } = parse(lex("python script.py").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("python3: execute inline is mutating", () => {
  const { program } = parse(lex('python3 -c "print(1)"').tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("python: version flag is readOnly", () => {
  const { program } = parse(lex("python --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("python3: -V flag is readOnly", () => {
  const { program } = parse(lex("python3 -V").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("node: execute script is mutating", () => {
  const { program } = parse(lex("node server.js").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("node: version flag is readOnly", () => {
  const { program } = parse(lex("node --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("ruby: execute is mutating", () => {
  const { program } = parse(lex("ruby script.rb").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("perl: version is readOnly", () => {
  const { program } = parse(lex("perl --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});
;
;

// ─── Build adapter ───

void test("cargo: build is mutating", () => {
  const { program } = parse(lex("cargo build").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("cargo: test is mutating", () => {
  const { program } = parse(lex("cargo test").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("go: build is mutating", () => {
  const { program } = parse(lex("go build ./...").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("go: version is readOnly", () => {
  const { program } = parse(lex("go version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("make: is mutating", () => {
  const { program } = parse(lex("make install").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "mutating");
});

void test("noop: true is readOnly", () => {
  const { program } = parse(lex("true").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("noop: false is readOnly", () => {
  const { program } = parse(lex("false").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("noop: echo is readOnly", () => {
  const { program } = parse(lex("echo hello").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});

void test("noop: : (colon noop) is readOnly", () => {
  const { program } = parse(lex(": 'no operation'").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "readOnly");
});
