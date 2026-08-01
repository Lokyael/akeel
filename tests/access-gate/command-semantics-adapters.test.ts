// tests/access-gate/command-semantics-adapters.test.ts
// filesystem + text-transform adapter 测试

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { normalizeCommand } from "../../src/access-gate/command-semantics/normalize";
import { analyzeSemantics } from "../../src/access-gate/command-semantics/registry";
import type { CommandSemantics, SemanticContext } from "../../src/access-gate/command-semantics/types";

const CTX: SemanticContext = { projectRoot: "/p", stagingDir: "/s", cwd: "/p" };

/** Parse a command string and run semantic analysis on its first command node. */
function analyzeCmd(cmd: string): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  return analyzeSemantics(program.commands[0]!, CTX);
}

test("fs: rm produces write intent", () => {
  const { program } = parse(lex("rm file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "write");
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

test("fs: cp produces read + write intents", () => {
  const { program } = parse(lex("cp src.txt dst.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 2);
  assert.equal(sem.intents[0]!.operation, "read");
  assert.equal(sem.intents[0]!.rawPath, "src.txt");
  assert.equal(sem.intents[1]!.operation, "write");
  assert.equal(sem.intents[1]!.rawPath, "dst.txt");
});

test("fs: mv produces write intents", () => {
  const { program } = parse(lex("mv old.txt new.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 2);
  assert.equal(sem.intents[0]!.operation, "write");
  assert.equal(sem.intents[1]!.operation, "write");
});

test("fs: chmod skips mode arg", () => {
  const { program } = parse(lex("chmod 644 file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

test("fs: chown skips owner arg", () => {
  const { program } = parse(lex("chown user:group file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

test("fs: rm ~/.ssh/id_rsa produces write intent on protected path", () => {
  const { program } = parse(lex("rm ~/.ssh/id_rsa").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents[0]!.rawPath, "~/.ssh/id_rsa");
});

test("fs: env rm ~/.ssh/id_rsa after normalization produces same intents", () => {
  const { program } = parse(lex("env rm ~/.ssh/id_rsa").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  const sem = analyzeSemantics(norm!.command, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "~/.ssh/id_rsa");
});

test("fs: command cp src dst after normalization produces read+write", () => {
  const { program } = parse(lex("command cp src dst").tokens);
  const norm = normalizeCommand(program.commands[0]!);
  assert.notEqual(norm, null);
  const sem = analyzeSemantics(norm!.command, CTX);
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 2);
});

test("tx: sort -o writes to output file", () => {
  const { program } = parse(lex("sort -o output.txt input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  // sort -o 产生写 intent → 应为 modify
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "output.txt"));
});

test("tx: sort without -o is inspect", () => {
  const { program } = parse(lex("sort input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("tx: sed -i is modify (in-place)", () => {
  const { program } = parse(lex("sed -i 's/foo/bar/' file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("tx: sed without -i is inspect", () => {
  const { program } = parse(lex("sed 's/foo/bar/' file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("tx: uniq -o writes to output file", () => {
  const { program } = parse(lex("uniq -o output.txt input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "output.txt"));
});

test("tx: unknown option sets opaque", () => {
  const { program } = parse(lex("sort --unknown-flag input.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.opaque, true);
});

test("tx: sed --in-place is modify", () => {
  const { program } = parse(lex("sed --in-place -e 's/foo/bar/' file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("tx: unknown command falls through", () => {
  const { program } = parse(lex("unknowncmd file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "unknown");
  assert.equal(sem.intents.length, 0);
});

// ─── Search adapter ───

test("search: find . produces search intent", () => {
  const { program } = parse(lex("find . -type f").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, ".");
});

test("search: find without path defaults to .", () => {
  const { program } = parse(lex("find -type f -name '*.ts'").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents[0]!.rawPath, ".");
});

test("search: find /etc is protected", () => {
  const { program } = parse(lex("find /etc -name shadow").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents[0]!.rawPath, "/etc");
});

test("search: find -delete upgrades to modify", () => {
  const { program } = parse(lex("find . -name '*.tmp' -delete").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("search: find -exec upgrades to modify", () => {
  const { program } = parse(lex("find . -name '*.log' -exec rm {} \\;").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("search: find without destructive opts stays inspect", () => {
  const { program } = parse(lex("find . -type f").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("search: grep -r searches directory", () => {
  const { program } = parse(lex("grep -r pattern src/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, "src/");
});

test("search: grep combined flags preserve recursive search", () => {
  const { program } = parse(lex("grep -rn pattern src/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, "src/");
});

test("search: grep without -r produces a read intent", () => {
  const { program } = parse(lex("grep pattern file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  // 非递归 grep 读取文件，但不产生 search intent
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "read");
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

test("search: grep -f extracts file opt read intent", () => {
  const { program } = parse(lex("grep -f patterns.txt src/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "patterns.txt"));
});

test("search: rg searches default root", () => {
  const { program } = parse(lex("rg pattern").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "search");
});

test("search: rg -f extracts pattern file", () => {
  const { program } = parse(lex("rg -f patterns.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "patterns.txt"));
});

test("search: rg skips values for glob and type options", () => {
  const { program } = parse(lex("rg --glob '*.ts' --type ts pattern src/ /etc").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "search").map((intent) => intent.rawPath),
    ["src/", "/etc"],
  );
});

test("search: rg skips context counts", () => {
  const { program } = parse(lex("rg -n -C 3 pattern AGENTS.md").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "search").map((intent) => intent.rawPath),
    ["AGENTS.md"],
  );
});

test("search: pattern file option makes the first positional argument a root", () => {
  const { program } = parse(lex("rg -f patterns.txt src/ /etc").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "search").map((intent) => intent.rawPath),
    ["src/", "/etc"],
  );
});

// ─── ls adapter ───

test("ls: defaults to . list intent", () => {
  const { program } = parse(lex("ls").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "list");
  assert.equal(sem.intents[0]!.rawPath, ".");
});

test("ls: explicit path produces list intent", () => {
  const { program } = parse(lex("ls /etc").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "list");
  assert.equal(sem.intents[0]!.rawPath, "/etc");
});

test("ls: multiple paths produce list intents", () => {
  const { program } = parse(lex("ls src/ tests/").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  const listIntents = sem.intents.filter((i) => i.operation === "list");
  assert.equal(listIntents.length, 2);
  assert.deepEqual(listIntents.map((i) => i.rawPath), ["src/", "tests/"]);
});

test("ls: flags like -la are skipped, path still recognized", () => {
  const { program } = parse(lex("ls -la /home").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.operation, "list");
  assert.equal(sem.intents[0]!.rawPath, "/home");
});

test("ls: -- after options treats everything as path", () => {
  const { program } = parse(lex("ls -l -- -f").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "list" && i.rawPath === "-f"));
});

// ─── Read adapter ───

test("read: head -250 reads stdin without a path intent", () => {
  const { program } = parse(lex("head -250").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 0);
});

test("read: head checks explicit files", () => {
  const { program } = parse(lex("head -n 5 /etc/passwd").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.deepEqual(sem.intents.map((intent) => [intent.operation, intent.rawPath]), [["read", "/etc/passwd"]]);
});

test("read: cat checks multiple files", () => {
  const { program } = parse(lex("cat first.txt second.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["first.txt", "second.txt"]);
});

test("read: tail skips line-count values and checks files", () => {
  const { program } = parse(lex("tail --lines=5 file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["file.txt"]);
});

test("read: wc checks files after flags", () => {
  const { program } = parse(lex("wc -l file.txt").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["file.txt"]);
});

test("read: cut skips delimiter and field values", () => {
  const { program } = parse(lex("cut -d : -f 1 /etc/passwd").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.deepEqual(sem.intents.map((intent) => intent.rawPath), ["/etc/passwd"]);
});

// ─── Git adapter ───

test("git: status is inspect", () => {
  const { program } = parse(lex("git status").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("git: rev-list is inspect", () => {
  const { program } = parse(lex("git rev-list --left-right --count origin/main...HEAD").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
  assert.equal(sem.opaque, false);
});

test("git: add produces read intents", () => {
  const { program } = parse(lex("git add src/file.ts").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "src/file.ts"));
});

test("git: rm produces write intents for every path", () => {
  const { program } = parse(lex("git rm --cached first.md second.md").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.deepEqual(
    sem.intents.filter((intent) => intent.operation === "write").map((intent) => intent.rawPath),
    ["first.md", "second.md"],
  );
});

test("git: checkout -- writes path", () => {
  const { program } = parse(lex("git checkout -- src/file.ts").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "src/file.ts"));
});

test("git: clone is modify", () => {
  const { program } = parse(lex("git clone https://example.test/repo").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("git: push --force is destroy", () => {
  const { program } = parse(lex("git push --force origin main").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "destroy");
});

test("git: -C option adds list intent", () => {
  const { program } = parse(lex("git -C /repo status").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.ok(sem.intents.some((i) => i.operation === "list" && i.rawPath === "/repo"), `intents: ${JSON.stringify(sem.intents)}`);
});

// ─── Package adapter ───

test("npm: install is execute", () => {
  const { program } = parse(lex("npm install express").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("npm: test is execute", () => {
  const { program } = parse(lex("npm test").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("npm: view is inspect", () => {
  const { program } = parse(lex("npm view express").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("pnpm: run is execute", () => {
  const { program } = parse(lex("pnpm run build").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("yarn: add is execute", () => {
  const { program } = parse(lex("yarn add lodash").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
})

// ─── npx adapter ───

test("npx: execute package is execute", () => {
  const { program } = parse(lex("npx some-package").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("npx: execute with args is execute", () => {
  const { program } = parse(lex("npx tsx --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("npx: version flag is inspect", () => {
  const { program } = parse(lex("npx --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("npx: help flag is inspect", () => {
  const { program } = parse(lex("npx --help").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
})

// --- interpreter adapter ---

test("python: execute script is execute", () => {
  const { program } = parse(lex("python script.py").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("python3: execute inline is execute", () => {
  const { program } = parse(lex('python3 -c "print(1)"').tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("python: version flag is inspect", () => {
  const { program } = parse(lex("python --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("python3: -V flag is inspect", () => {
  const { program } = parse(lex("python3 -V").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("node: execute script is execute", () => {
  const { program } = parse(lex("node server.js").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("node: version flag is inspect", () => {
  const { program } = parse(lex("node --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("ruby: execute is execute", () => {
  const { program } = parse(lex("ruby script.rb").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("perl: version is inspect", () => {
  const { program } = parse(lex("perl --version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});
;
;

// ─── Build adapter ───

test("cargo: build is execute", () => {
  const { program } = parse(lex("cargo build").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("cargo: test is execute", () => {
  const { program } = parse(lex("cargo test").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("go: build is execute", () => {
  const { program } = parse(lex("go build ./...").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("go: version is inspect", () => {
  const { program } = parse(lex("go version").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("cargo: clean is modify (deletes target/ without invoking compiler)", () => {
  const { program } = parse(lex("cargo clean").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("go: mod tidy is modify (edits go.mod without compiling)", () => {
  const { program } = parse(lex("go mod tidy").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "modify");
});

test("make: is execute", () => {
  const { program } = parse(lex("make install").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "execute");
});

test("noop: true is inspect", () => {
  const { program } = parse(lex("true").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("noop: false is inspect", () => {
  const { program } = parse(lex("false").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("noop: echo is inspect", () => {
  const { program } = parse(lex("echo hello").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

test("noop: : (colon noop) is inspect", () => {
  const { program } = parse(lex(": 'no operation'").tokens);
  const sem = analyzeSemantics(program.commands[0]!, CTX);
  assert.equal(sem.class, "inspect");
});

// ─── Shell builtins adapter ───

test("builtins: source file.sh is execute with conservative read intent", () => {
  const s = analyzeCmd("source file.sh");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.operation, "read");
  assert.equal(s.intents[0]!.rawPath, "file.sh");
  assert.equal(s.intents[0]!.confidence, "conservative");
  assert.ok(s.effects.includes("execute"));
});

test("builtins: source ./file.sh is execute with exact read intent", () => {
  const s = analyzeCmd("source ./file.sh");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.operation, "read");
  assert.equal(s.intents[0]!.rawPath, "./file.sh");
  assert.equal(s.intents[0]!.confidence, "exact");
});

test("builtins: . ./file.sh is execute (dot command)", () => {
  const s = analyzeCmd(". ./file.sh");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.operation, "read");
  assert.equal(s.intents[0]!.rawPath, "./file.sh");
  assert.equal(s.intents[0]!.confidence, "exact");
});

test("builtins: source - has no path intent (stdin)", () => {
  const s = analyzeCmd("source -");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 0);
});

test("builtins: source with no args has no path intent", () => {
  const s = analyzeCmd("source");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 0);
});

test("builtins: source file.sh arg1 arg2 only extracts first non-option arg", () => {
  const s = analyzeCmd("source file.sh arg1 arg2");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.rawPath, "file.sh");
});

test("builtins: source /absolute/path.sh is execute with exact read intent", () => {
  const s = analyzeCmd("source /absolute/path.sh");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.operation, "read");
  assert.equal(s.intents[0]!.rawPath, "/absolute/path.sh");
  assert.equal(s.intents[0]!.confidence, "exact");
});

test("builtins: . with no args has no path intent", () => {
  const s = analyzeCmd(".");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 0);
});

test("builtins: source --help has path intent (source has no options)", () => {
  const s = analyzeCmd("source --help");
  assert.equal(s.class, "execute");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.rawPath, "--help");
  assert.equal(s.intents[0]!.confidence, "conservative");
});

test("builtins: . file.sh has exact confidence (POSIX dot does not search PATH)", () => {
  const s = analyzeCmd(". file.sh");
  assert.equal(s.intents.length, 1);
  assert.equal(s.intents[0]!.rawPath, "file.sh");
  assert.equal(s.intents[0]!.confidence, "exact");
});

// ─── Python tools adapter ───

test("python: ruff check is inspect", () => {
  assert.equal(analyzeCmd("ruff check src/").class, "inspect");
});

test("python: ruff format is modify", () => {
  assert.equal(analyzeCmd("ruff format src/").class, "modify");
});

test("python: ruff format --check is inspect (check-only)", () => {
  assert.equal(analyzeCmd("ruff format --check src/").class, "inspect");
});

test("python: ruff check --fix upgrades to modify", () => {
  assert.equal(analyzeCmd("ruff check --fix src/").class, "modify");
});

test("python: ruff defaults to inspect", () => {
  assert.equal(analyzeCmd("ruff").class, "inspect");
});

test("python: mypy is inspect", () => {
  assert.equal(analyzeCmd("mypy src/").class, "inspect");
});

test("python: mypy with flags is inspect", () => {
  assert.equal(analyzeCmd("mypy src/ --ignore-missing-imports").class, "inspect");
});

test("python: black is modify", () => {
  assert.equal(analyzeCmd("black src/").class, "modify");
});

test("python: black --check is inspect", () => {
  assert.equal(analyzeCmd("black --check src/").class, "inspect");
});

test("python: isort --check-only is inspect", () => {
  assert.equal(analyzeCmd("isort --check-only src/").class, "inspect");
});

test("python: pytest is execute", () => {
  assert.equal(analyzeCmd("pytest tests/").class, "execute");
});

test("python: pyright is inspect", () => {
  assert.equal(analyzeCmd("pyright src/").class, "inspect");
});

test("python: pylint is inspect", () => {
  assert.equal(analyzeCmd("pylint src/").class, "inspect");
});
