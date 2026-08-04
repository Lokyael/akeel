// tests/access-gate/command-semantics-adapters-gaps.test.ts
// 补全 adapter 命令级测试（Task Record: 补全 adapter 命令级测试与 verifier 分支测试）
// 覆盖：fs 未测命令、text-transform 表达式/长选项、search 破坏性变体、read stdin、
//       git 全子命令、build/package 未测子命令、interpreters stdin、noop printf。
// 同时固化 sed -e / awk -e 修复：表达式选项不得产生路径 intent。

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../src/access-gate/shell-parse/lexer";
import { parse } from "../../src/access-gate/shell-parse/parser";
import { analyzeSemantics } from "../../src/access-gate/command-semantics/registry";
import type { CommandSemantics, SemanticContext } from "../../src/access-gate/command-semantics/types";

const CTX: SemanticContext = { projectRoot: "/p", stagingDir: "/s", cwd: "/p" };

function analyzeCmd(cmd: string): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  return analyzeSemantics(program.commands[0]!, CTX);
}

// ─── filesystem: 未测命令 ───

test("fs: touch produces write intent", () => {
  const sem = analyzeCmd("touch new.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "new.txt"));
});

test("fs: mkdir produces write intent", () => {
  const sem = analyzeCmd("mkdir -p src/components");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "src/components"));
});

test("fs: tee produces write intent", () => {
  const sem = analyzeCmd("tee output.log");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "output.log"));
});

test("fs: truncate produces write intent", () => {
  const sem = analyzeCmd("truncate -s 0 log.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "log.txt"));
});

test("fs: ln -s produces read source and write link", () => {
  const sem = analyzeCmd("ln -s target.txt link.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "target.txt"));
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "link.txt"));
});

test("fs: rmdir produces delete effect", () => {
  const sem = analyzeCmd("rmdir empty-dir");
  assert.equal(sem.class, "modify");
  assert.ok(sem.effects?.includes("delete"));
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "empty-dir"));
});

test("fs: install reads source and writes destination", () => {
  const sem = analyzeCmd("install -m 755 src.sh /usr/local/bin/");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "src.sh"));
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "/usr/local/bin/"));
});

test("fs: mktemp is modify without opaque", () => {
  const sem = analyzeCmd("mktemp -d");
  assert.equal(sem.class, "modify");
  assert.equal(sem.opaque, false);
});

test("fs: shred is destroy", () => {
  const sem = analyzeCmd("shred -u secret.txt");
  assert.equal(sem.class, "destroy");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "secret.txt"));
});

test("fs: dd is modify without opaque", () => {
  const sem = analyzeCmd("dd if=/dev/zero of=out.bin bs=1M count=1");
  assert.equal(sem.class, "modify");
  assert.equal(sem.opaque, false);
});

test("fs: rm -rf filters flags and keeps the path", () => {
  const sem = analyzeCmd("rm -rf build/");
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "build/");
  assert.ok(sem.effects?.includes("delete"));
});

test("fs: cp with a single arg has no path intents", () => {
  const sem = analyzeCmd("cp source.ts");
  assert.equal(sem.class, "modify");
  assert.equal(sem.intents.length, 0);
});

// ─── text-transform: -e 表达式不应产生路径 intent（修复回归）───

test("tx: sed -e does not treat the expression as a path", () => {
  const sem = analyzeCmd("sed -e 's/foo/bar/' file.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(!sem.intents.some((i) => i.rawPath === "s/foo/bar/"));
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "file.txt"));
});

test("tx: sed -f keeps the script file read intent", () => {
  const sem = analyzeCmd("sed -f script.sed file.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "script.sed"));
});

test("tx: awk -e does not treat the program as a path", () => {
  const sem = analyzeCmd("awk -e '{ print }' file.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(!sem.intents.some((i) => i.rawPath === "{ print }"));
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "file.txt"));
});

test("tx: awk -f keeps the script file read intent", () => {
  const sem = analyzeCmd("awk -f prog.awk file.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "prog.awk"));
});

test("tx: sed -i.bak is modify without opaque", () => {
  const sem = analyzeCmd("sed -i.bak 's/foo/bar/' file.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write"));
});

test("tx: sed --in-place=.bak is modify without opaque", () => {
  const sem = analyzeCmd("sed --in-place=.bak 's/foo/bar/' file.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write"));
});

// ─── text-transform: 长选项与终止符 ───

test("tx: sort --output writes to the output file", () => {
  const sem = analyzeCmd("sort --output out.txt in.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "out.txt"));
});

test("tx: uniq --output writes to the output file", () => {
  const sem = analyzeCmd("uniq --output out.txt in.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "out.txt"));
});

test("tx: options after -- are treated as file arguments", () => {
  const sem = analyzeCmd("sort -- -o out.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.every((i) => i.operation === "read"));
  assert.ok(sem.intents.some((i) => i.rawPath === "-o"));
  assert.ok(sem.intents.some((i) => i.rawPath === "out.txt"));
});

test("tx: awk without -i is inspect", () => {
  const sem = analyzeCmd("awk '{ print }' data.txt");
  assert.equal(sem.class, "inspect");
});

// ─── text-transform: 遗漏修复 —— 常用修饰符 flag、取值表达式、位置参数路径意图 ───

test("tx: awk -F field separator is consumed without a path intent", () => {
  const sem = analyzeCmd("awk -F, '{ print $1 }' data.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
  assert.ok(!sem.intents.some((i) => i.rawPath === ","));
});

test("tx: awk -F attached value form is not opaque", () => {
  const sem = analyzeCmd("awk -F, '{ print }' data.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
});

test("tx: awk -v assignment is consumed without a path intent", () => {
  const sem = analyzeCmd("awk -v x=1 '{ print x }' data.txt");
  assert.equal(sem.opaque, false);
  assert.ok(!sem.intents.some((i) => i.rawPath === "x=1"));
});

test("tx: sed -n -e combo is not opaque", () => {
  const sem = analyzeCmd("sed -n -e 's/x/y/p' file.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
});

test("tx: sed -E and --sandbox are flags, not opaque", () => {
  const sem = analyzeCmd("sed --sandbox -E -e 's/x/y/' file.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
});

test("tx: sed -l line length is an expression value", () => {
  const sem = analyzeCmd("sed -l 80 file.txt");
  assert.equal(sem.opaque, false);
  assert.ok(!sem.intents.some((i) => i.rawPath === "80"));
});

test("tx: positional files produce read intents (path check not bypassed)", () => {
  const sed = analyzeCmd("sed 's/x/y/' /etc/passwd");
  assert.ok(sed.intents.some((i) => i.operation === "read" && i.rawPath === "/etc/passwd"));
  const awk = analyzeCmd("awk '{ print $1 }' ~/.ssh/config");
  assert.ok(awk.intents.some((i) => i.operation === "read" && i.rawPath === "~/.ssh/config"));
  const sort = analyzeCmd("sort -n file1.txt file2.txt");
  assert.ok(sort.intents.some((i) => i.operation === "read" && i.rawPath === "file1.txt"));
  const uniq = analyzeCmd("uniq -c /etc/passwd");
  assert.ok(uniq.intents.some((i) => i.operation === "read" && i.rawPath === "/etc/passwd"));
});

test("tx: sed -i turns positional files into write intents (in-place)", () => {
  const sem = analyzeCmd("sed -i 's/x/y/' file.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "file.txt"));
});

test("tx: sort common flags are not opaque", () => {
  const sem = analyzeCmd("sort -t, -k2 -n -r file.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "file.txt"));
});

test("tx: sort short inline output value produces a write intent", () => {
  const sem = analyzeCmd("sort -oout.txt in.txt");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "out.txt"));
});

test("tx: awk attached -v value is consumed without a path intent", () => {
  const sem = analyzeCmd("awk -vx=1 '{ print x }' data.txt");
  assert.equal(sem.opaque, false);
  assert.ok(!sem.intents.some((i) => i.rawPath === "x=1"));
});

test("tx: sed attached -e expression is consumed without a path intent", () => {
  const sem = analyzeCmd("sed -es/x/y/ file.txt");
  assert.equal(sem.opaque, false);
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "file.txt"));
});

test("tx: expression option with no value is consumed without opaque", () => {
  const sem = analyzeCmd("sed -e");
  assert.equal(sem.opaque, false);
  assert.equal(sem.intents.length, 0);
});

test("tx: sed -i without positional files stays a conservative write", () => {
  const sem = analyzeCmd("sed -i 's/x/y/'");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write"));
});

// ─── search: 破坏性变体与取值选项 ───

test("search: find -execdir upgrades to modify", () => {
  const sem = analyzeCmd("find . -name '*.js' -execdir rm {} +");
  assert.equal(sem.class, "modify");
});

test("search: find -ok upgrades to modify", () => {
  const sem = analyzeCmd("find . -ok rm {} \\;");
  assert.equal(sem.class, "modify");
});

test("search: find -maxdepth skips the value", () => {
  const sem = analyzeCmd("find . -maxdepth 2 -name '*.ts'");
  assert.equal(sem.class, "inspect");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, ".");
});

test("search: tree -L skips the level value", () => {
  const sem = analyzeCmd("tree -L 2 .");
  assert.equal(sem.intents[0]!.operation, "search");
  assert.equal(sem.intents[0]!.rawPath, ".");
});

// ─── read: stdin 与终止符 ───

test("read: cat - skips stdin and keeps files", () => {
  const sem = analyzeCmd("cat - file.txt");
  assert.equal(sem.intents.length, 1);
  assert.equal(sem.intents[0]!.rawPath, "file.txt");
});

test("read: diff reads both files", () => {
  const sem = analyzeCmd("diff -u a.txt b.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "a.txt"));
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "b.txt"));
});

test("read: less/more/file read intents", () => {
  for (const cmd of ["less notes.md", "more README.md", "file logo.png"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.class, "inspect", cmd);
    assert.ok(sem.intents.some((i) => i.operation === "read"), cmd);
  }
});

test("read: stat format option value is skipped", () => {
  const sem = analyzeCmd("stat -c %s file.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(!sem.intents.some((i) => i.rawPath === "%s"));
  assert.ok(sem.intents.some((i) => i.rawPath === "file.txt"));
});

test("read: du depth value is skipped", () => {
  const sem = analyzeCmd("du -sh dir");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.rawPath === "dir"));
});

test("read: df is inspect", () => {
  const sem = analyzeCmd("df -h");
  assert.equal(sem.class, "inspect");
});

test("read: head -- treats following tokens as files", () => {
  const sem = analyzeCmd("head -- -n file.txt");
  assert.equal(sem.intents.length, 2);
  assert.equal(sem.intents[0]!.rawPath, "-n");
  assert.equal(sem.intents[1]!.rawPath, "file.txt");
});

// ─── git: 全子命令表驱动 ───

const GIT_INSPECT = [
  "git diff",
  "git log --oneline",
  "git show HEAD",
  "git blame src/a.ts",
  "git branch",
  "git grep pattern",
  "git stash list",
  "git stash show",
  "git ls-files",
  "git ls-tree HEAD",
  "git describe",
];

const GIT_MODIFY = [
  "git commit -m msg",
  "git merge main",
  "git rebase main",
  "git tag v1.0",
  "git stash push",
  "git stash pop",
  "git stash apply",
  "git stash drop",
  "git reset HEAD~1",
  "git fetch origin",
  "git pull origin main",
  "git init",
  "git remote add origin url",
];

const GIT_DESTROY = ["git reset --hard HEAD", "git stash clear"];

for (const cmd of GIT_INSPECT) {
  test(`git: ${cmd} is inspect`, () => {
    assert.equal(analyzeCmd(cmd).class, "inspect");
  });
}
for (const cmd of GIT_MODIFY) {
  test(`git: ${cmd} is modify`, () => {
    assert.equal(analyzeCmd(cmd).class, "modify");
  });
}
for (const cmd of GIT_DESTROY) {
  test(`git: ${cmd} is destroy`, () => {
    assert.equal(analyzeCmd(cmd).class, "destroy");
  });
}

test("git: --git-dir adds a list intent", () => {
  const sem = analyzeCmd("git --git-dir=/srv/repo status");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "list" && i.rawPath === "/srv/repo"));
});

test("git: rm carries the delete effect", () => {
  const sem = analyzeCmd("git rm old.txt");
  assert.ok(sem.effects?.includes("delete"));
});

test("git: branch delete variants are destroy", () => {
  for (const cmd of ["git branch -d feature", "git branch -D feature", "git branch --delete feature"]) {
    assert.equal(analyzeCmd(cmd).class, "destroy", cmd);
  }
});

test("git: branch force create/move is modify", () => {
  for (const cmd of ["git branch -f feature", "git branch --force feature main"]) {
    assert.equal(analyzeCmd(cmd).class, "modify", cmd);
  }
});

test("git: branch listing variants stay inspect", () => {
  for (const cmd of ["git branch", "git branch -a", "git branch --merged main", "git branch --list"]) {
    assert.equal(analyzeCmd(cmd).class, "inspect", cmd);
  }
});

test("git: clean dry-run is inspect, real clean is destroy", () => {
  assert.equal(analyzeCmd("git clean -n").class, "inspect");
  assert.equal(analyzeCmd("git clean --dry-run").class, "inspect");
  assert.equal(analyzeCmd("git clean -fd").class, "destroy");
});

test("git: mv carries write intents", () => {
  const sem = analyzeCmd("git mv old.ts new.ts");
  assert.equal(sem.class, "modify");
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "old.ts"));
  assert.ok(sem.intents.some((i) => i.operation === "write" && i.rawPath === "new.ts"));
});

test("git: cherry-pick and revert are modify", () => {
  for (const cmd of ["git cherry-pick abc123", "git revert abc123"]) {
    assert.equal(analyzeCmd(cmd).class, "modify", cmd);
  }
});

test("git: config is modify without opaque", () => {
  const sem = analyzeCmd("git config user.name zev");
  assert.equal(sem.class, "modify");
  assert.equal(sem.opaque, false);
});

test("git: apply and gc are modify", () => {
  for (const cmd of ["git apply patch.diff", "git gc"]) {
    assert.equal(analyzeCmd(cmd).class, "modify", cmd);
  }
});

test("git: submodule carries network effect", () => {
  const sem = analyzeCmd("git submodule update --init");
  assert.equal(sem.class, "modify");
  assert.ok(sem.effects?.includes("network"));
});

test("git: ls-remote carries network effect", () => {
  const sem = analyzeCmd("git ls-remote origin");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.effects?.includes("network"));
});

test("git: fsck and archive are inspect", () => {
  for (const cmd of ["git fsck", "git archive HEAD"]) {
    assert.equal(analyzeCmd(cmd).class, "inspect", cmd);
  }
});

test("git: push carries the network effect", () => {
  const sem = analyzeCmd("git push origin main");
  assert.ok(sem.effects?.includes("network"));
});

test("git: fetch, pull, clone, remote carry the network effect", () => {
  for (const cmd of ["git fetch origin", "git pull origin main", "git clone https://github.com/x/y.git", "git remote add origin url"]) {
    assert.ok(analyzeCmd(cmd).effects?.includes("network"), cmd);
  }
});

// ─── build: 未测子命令 ───

const CARGO_INSPECT = ["cargo search serde", "cargo --version"];
const CARGO_EXECUTE = ["cargo run --bin app", "cargo check", "cargo update"];

for (const cmd of CARGO_INSPECT) {
  test(`build: ${cmd} is inspect`, () => {
    assert.equal(analyzeCmd(cmd).class, "inspect");
  });
}
for (const cmd of CARGO_EXECUTE) {
  test(`build: ${cmd} is execute`, () => {
    assert.equal(analyzeCmd(cmd).class, "execute");
  });
}

test("build: cargo install is execute with network", () => {
  const sem = analyzeCmd("cargo install cargo-binstall");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("build: cargo unknown subcommand is opaque", () => {
  const sem = analyzeCmd("cargo bogus-thing");
  assert.equal(sem.class, "unknown");
  assert.equal(sem.opaque, true);
});

const GO_INSPECT = ["go doc fmt", "go list ./...", "go version"];
for (const cmd of GO_INSPECT) {
  test(`build: ${cmd} is inspect`, () => {
    assert.equal(analyzeCmd(cmd).class, "inspect");
  });
}

test("build: go get is execute with network", () => {
  const sem = analyzeCmd("go get example.com/foo");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("build: cargo fmt and fix are modify", () => {
  for (const cmd of ["cargo fmt", "cargo fix"]) {
    assert.equal(analyzeCmd(cmd).class, "modify", cmd);
  }
});

test("build: cargo clippy/doc/bench are execute", () => {
  for (const cmd of ["cargo clippy", "cargo doc", "cargo bench"]) {
    assert.equal(analyzeCmd(cmd).class, "execute", cmd);
  }
});

test("build: cargo add/remove are modify with network", () => {
  for (const cmd of ["cargo add serde", "cargo remove serde"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.class, "modify", cmd);
    assert.ok(sem.effects?.includes("network"), cmd);
  }
});

test("build: cargo tree and metadata are inspect", () => {
  for (const cmd of ["cargo tree", "cargo metadata"]) {
    assert.equal(analyzeCmd(cmd).class, "inspect", cmd);
  }
});

test("build: go fmt and clean are modify", () => {
  for (const cmd of ["go fmt", "go clean"]) {
    assert.equal(analyzeCmd(cmd).class, "modify", cmd);
  }
});

test("build: go mod download is execute with network", () => {
  const sem = analyzeCmd("go mod download");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("build: go vet/generate are execute, go env is inspect", () => {
  for (const cmd of ["go vet", "go generate"]) {
    assert.equal(analyzeCmd(cmd).class, "execute", cmd);
  }
  assert.equal(analyzeCmd("go env GOPATH").class, "inspect");
});

test("build: go mod tidy is modify", () => {
  assert.equal(analyzeCmd("go mod tidy").class, "modify");
});

test("build: make -f still executes", () => {
  assert.equal(analyzeCmd("make -f Makefile build").class, "execute");
});

// ─── package: 未测子命令 ───

const NPM_INSPECT = ["npm view react", "npm outdated", "npm ls", "npm search lodash"];
for (const cmd of NPM_INSPECT) {
  test(`pkg: ${cmd} is inspect`, () => {
    assert.equal(analyzeCmd(cmd).class, "inspect");
  });
}

const NPM_EXECUTE = ["npm remove left-pad", "npm uninstall left-pad", "npm update", "npm exec tsc", "npm build"];
for (const cmd of NPM_EXECUTE) {
  test(`pkg: ${cmd} is execute`, () => {
    assert.equal(analyzeCmd(cmd).class, "execute");
  });
}

test("pkg: npm install is execute with network", () => {
  const sem = analyzeCmd("npm install");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("pkg: npm init is modify", () => {
  assert.equal(analyzeCmd("npm init -y").class, "modify");
});

test("pkg: npm publish is execute with network", () => {
  const sem = analyzeCmd("npm publish");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("pkg: yarn add and install are execute with network", () => {
  for (const cmd of ["yarn add lodash", "yarn install"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.class, "execute");
    assert.ok(sem.effects?.includes("network"));
  }
});

test("pkg: yarn remove and upgrade are execute", () => {
  for (const cmd of ["yarn remove lodash", "yarn upgrade lodash"]) {
    assert.equal(analyzeCmd(cmd).class, "execute");
  }
});

test("pkg: npm run-script shortcuts are execute", () => {
  for (const cmd of ["npm start", "npm stop", "npm restart"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.class, "execute", cmd);
    assert.equal(sem.opaque, false, cmd);
  }
});

test("pkg: npm prune/pack/link are execute", () => {
  for (const cmd of ["npm prune", "npm pack", "npm link", "npm unlink"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.class, "execute", cmd);
    assert.equal(sem.opaque, false, cmd);
  }
});

test("pkg: pnpm add is execute with network", () => {
  const sem = analyzeCmd("pnpm add lodash");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("pkg: npm cache/config/version/dedupe are modify or execute", () => {
  for (const cmd of ["npm cache clean", "npm version patch", "npm dedupe"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.opaque, false, cmd);
    assert.notEqual(sem.class, "unknown", cmd);
  }
});

test("pkg: npm config get is inspect, config set is modify", () => {
  assert.equal(analyzeCmd("npm config get registry").class, "inspect");
  assert.equal(analyzeCmd("npm config set registry https://mirror").class, "modify");
});

test("pkg: npm audit/whoami/ping/help/root are inspect with network where relevant", () => {
  for (const cmd of ["npm audit", "npm whoami", "npm ping", "npm help", "npm root"]) {
    const sem = analyzeCmd(cmd);
    assert.equal(sem.class, "inspect", cmd);
    assert.equal(sem.opaque, false, cmd);
  }
  assert.ok(analyzeCmd("npm audit").effects?.includes("network"));
  assert.ok(analyzeCmd("npm whoami").effects?.includes("network"));
});

test("pkg: npm ci is execute with network", () => {
  const sem = analyzeCmd("npm ci");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("pkg: npm --prefix ci is execute with network", () => {
  const sem = analyzeCmd("npm --prefix /tmp/deps ci");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("pkg: pnpm ci is execute with network", () => {
  const sem = analyzeCmd("pnpm ci");
  assert.equal(sem.class, "execute");
  assert.ok(sem.effects?.includes("network"));
});

test("pkg: npx help flags are inspect", () => {
  for (const cmd of ["npx --help", "npx -v"]) {
    assert.equal(analyzeCmd(cmd).class, "inspect");
  }
});

test("pkg: npm unknown subcommand is opaque", () => {
  const sem = analyzeCmd("npm bogus");
  assert.equal(sem.class, "unknown");
  assert.equal(sem.opaque, true);
});

// ─── interpreters: stdin 脚本 ───

test("interp: python - reads the script from stdin as execute", () => {
  assert.equal(analyzeCmd("python -").class, "execute");
});

test("interp: venv and system path interpreters are classified", () => {
  assert.equal(analyzeCmd(".venv/bin/python --version").class, "inspect");
  assert.equal(analyzeCmd("/usr/bin/python3 --version").class, "inspect");
  assert.equal(analyzeCmd("./.venv/bin/python -m pytest").class, "execute");
});

test("interp: versioned interpreter names are classified", () => {
  assert.equal(analyzeCmd("python3.11 --version").class, "inspect");
  assert.equal(analyzeCmd("python3.12 -m pip list").class, "execute");
  assert.equal(analyzeCmd("nodejs --version").class, "inspect");
});

test("interp: tsx is managed as a TS interpreter (bare and path forms)", () => {
  assert.equal(analyzeCmd("tsx --version").class, "inspect");
  assert.equal(analyzeCmd("tsx -v").class, "inspect");
  assert.equal(analyzeCmd("tsx --help").class, "inspect");
  assert.equal(analyzeCmd("tsx script.ts").class, "execute");
  assert.equal(analyzeCmd("tsx watch src/x.ts").class, "execute");
  assert.equal(analyzeCmd("tsx -e 'console.log(1)'").class, "execute");
  assert.equal(analyzeCmd("./node_modules/.bin/tsx run.ts").class, "execute");
  assert.equal(analyzeCmd("node_modules/.bin/tsx --version").class, "inspect");
});

test("unknown: path-form executables without adapter classify as execute", () => {
  const s = analyzeCmd("./node_modules/.bin/some-tool run.ts");
  assert.equal(s.class, "execute");
  assert.equal(s.opaque, false);
  assert.equal(analyzeCmd("/usr/local/bin/mytool --version").class, "execute");
  assert.equal(analyzeCmd("scripts/deploy.sh -x").class, "execute");
  assert.equal(analyzeCmd("../bin/helper --help").class, "execute");
});

test("unknown: bare-name executables without adapter stay unknown", () => {
  const s = analyzeCmd("mycustomtool --help");
  assert.equal(s.class, "unknown");
  assert.equal(s.opaque, false);
});

test("interp: path form of other adapters resolves by basename", () => {
  const sem = analyzeCmd("/bin/sed 's/x/y/' file.txt");
  assert.equal(sem.class, "inspect");
  assert.ok(sem.intents.some((i) => i.operation === "read" && i.rawPath === "file.txt"));
});

test("interp: node --help is inspect", () => {
  assert.equal(analyzeCmd("node --help").class, "inspect");
});

// ─── noop: printf ───

test("noop: printf is inspect", () => {
  assert.equal(analyzeCmd("printf 'hello\\n'").class, "inspect");
});
