import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProgramCommand } from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index";
import {
  analyzeShellCommand,
  shellCommandOutcomes,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation";
import type { ShellWord } from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/shell/language";

const policyContract = {
  source: "new-policy",
  referenceStatus: "newly-adopted",
} as const;

function word(text: string, start: number): ShellWord {
  return Object.freeze({ text, start, end: start + text.length, quote: "bare" as const });
}

function complete(command: string) {
  const analysis = analyzeShellCommand(command);
  assert.equal(analysis.kind, "complete");
  return analysis;
}

test("true and false have deterministic command outcomes without execution", () => {
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("true")), ["success"]);
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("false")), ["failure"]);
  assert.equal(policyContract.source, "new-policy");
});

test("redirection makes otherwise deterministic commands outcome-uncertain", () => {
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("true < missing")), ["success", "failure"]);
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("false > output")), ["success", "failure"]);
});

test("filesystem-dependent commands retain both possible outcomes", () => {
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("cd /tmp")), ["success", "failure"]);
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand("cat README.md")), ["success", "failure"]);
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("path-form interpreter information calls remain executable and opaque", () => {
  for (const executable of ["./python", "/tmp/node"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("--version", 0)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "execute", executable);
    assert.equal(semantic.opaque, true, executable);
  }
});

test("Git helper-capable commands remain hard-boundary while inspect commands are admitted", () => {
  for (const subcommand of ["status", "diff", "log", "show"]) {
    const semantic = analyzeProgramCommand({ executable: "git", arguments: [word(subcommand, 0)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "inspect", subcommand);
    assert.equal(semantic.hardBoundary, false, subcommand);
  }
  for (const subcommand of ["push", "config", "help", "grep", "blame", "gc"]) {
    const semantic = analyzeProgramCommand({ executable: "git", arguments: [word(subcommand, 0)] });
    assert.ok(semantic);
    assert.equal(semantic.hardBoundary, true, subcommand);
  }
  const diffWithExtDiff = analyzeProgramCommand({ executable: "git", arguments: [word("diff", 0), word("--ext-diff", 5)] });
  assert.ok(diffWithExtDiff);
  assert.equal(diffWithExtDiff.hardBoundary, true);
  const grepWithTextconv = analyzeProgramCommand({ executable: "git", arguments: [word("grep", 0), word("--textconv", 5)] });
  assert.ok(grepWithTextconv);
  assert.equal(grepWithTextconv.hardBoundary, true);
  const unknownGit = analyzeProgramCommand({ executable: "git", arguments: [word("mystery", 0)] });
  assert.ok(unknownGit);
  assert.equal(unknownGit.hardBoundary, true);
});

test("Git bounded add and commit commands are admitted as modify operations", () => {
  const add = analyzeProgramCommand({ executable: "git", arguments: [word("add", 0), word("src/app.ts", 4)] });
  assert.ok(add);
  assert.equal(add.commandClass, "modify");
  assert.equal(add.hardBoundary, false);

  const commit = analyzeProgramCommand({
    executable: "git",
    arguments: [word("commit", 0), word("-m", 7), word("msg", 10)],
  });
  assert.ok(commit);
  assert.equal(commit.commandClass, "modify");
  assert.equal(commit.hardBoundary, false);

  // Commit without message has hardBoundary = true
  const commitNoMsg = analyzeProgramCommand({ executable: "git", arguments: [word("commit", 0)] });
  assert.ok(commitNoMsg);
  assert.equal(commitNoMsg.hardBoundary, true);

  // Commit with -c has hardBoundary = true
  const commitWithConfig = analyzeProgramCommand({
    executable: "git",
    arguments: [word("commit", 0), word("-c", 7), word("core.hooksPath=/tmp", 10), word("-m", 30), word("msg", 33)],
  });
  assert.ok(commitWithConfig);
  assert.equal(commitWithConfig.hardBoundary, true);

  const commitSkippingHooks = analyzeProgramCommand({
    executable: "git",
    arguments: [word("commit", 0), word("--no-verify", 7), word("-m", 19), word("msg", 22)],
  });
  assert.ok(commitSkippingHooks);
  assert.equal(commitSkippingHooks.hardBoundary, true);

  // Add with -p or an unmodeled option has hardBoundary = true
  const addInteractive = analyzeProgramCommand({ executable: "git", arguments: [word("add", 0), word("-p", 4)] });
  assert.ok(addInteractive);
  assert.equal(addInteractive.hardBoundary, true);
  const addUnknownOption = analyzeProgramCommand({
    executable: "git",
    arguments: [word("add", 0), word("--intent-to-add", 4), word("src/app.ts", 19)],
  });
  assert.ok(addUnknownOption);
  assert.equal(addUnknownOption.hardBoundary, true);
});

test("Git rm is a destructive operation", () => {
  const semantic = analyzeProgramCommand({ executable: "git", arguments: [word("rm", 0), word("file.txt", 3)] });
  assert.ok(semantic);
  assert.equal(semantic.commandClass, "destroy");
  assert.deepEqual(semantic.effects, ["delete"]);
});

test("non-system path-form Git helper boundaries remain opaque execution", () => {
  const semantic = analyzeProgramCommand({ executable: "/tmp/git", arguments: [word("commit", 0)] });
  assert.ok(semantic);
  assert.equal(semantic.commandClass, "execute");
  assert.equal(semantic.opaque, true);
  assert.equal(semantic.hardBoundary, true);
});

test("fixed system path-form Git reuses bare-name semantics", () => {
  for (const executable of ["/bin/git", "/usr/bin/git"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("add", 0), word(".git/hooks/pre-commit", 4)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "modify", executable);
    assert.deepEqual(semantic.effects, ["read", "write"], executable);
    assert.deepEqual(semantic.paths.map((entry) => entry.path), [
      { text: ".", role: "source" },
      { text: ".git/hooks/pre-commit", role: "source" },
    ], executable);
    assert.equal(semantic.opaque, false, executable);
    assert.equal(semantic.hardBoundary, false, executable);
  }
});

test("path traversal and non-system Git paths do not obtain system identity", () => {
  for (const executable of ["/usr/bin/../bin/git", "/workspace/bin/git", "/usr/bin/GIT"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("add", 0), word("src/app.ts", 4)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "execute", executable);
    assert.equal(semantic.opaque, true, executable);
  }
});

test("bounded find predicates expose only recursive start paths", () => {
  const semantic = analyzeProgramCommand({
    executable: "find",
    arguments: [
      word("src", 0),
      word("lib", 4),
      word("-name", 8),
      word("*.ts", 14),
      word("-type", 19),
      word("f", 25),
      word("-maxdepth", 27),
      word("2", 37),
    ],
  });
  assert.ok(semantic);
  assert.equal(semantic.commandClass, "inspect");
  assert.deepEqual(semantic.effects, ["read"]);
  assert.deepEqual(semantic.paths.map(({ path: value }) => value), [
    { text: "src", role: "source" },
    { text: "lib", role: "source" },
  ]);
  assert.equal(semantic.recursive, true);
});

test("a supported inspection command has explicit class and read effect", () => {
  assert.deepEqual(analyzeShellCommand("cat README.md"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "README.md", role: "source" }],
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("a wrapper preserves the underlying command semantics", () => {
  assert.deepEqual(analyzeShellCommand("env -i cat README.md"), {
    kind: "complete",
    executable: "cat",
    wrappers: ["env"],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "README.md", role: "source" }],
  });
  assert.equal(policyContract.source, "new-policy");
});

test("a redirection contributes a write effect and target path", () => {
  assert.deepEqual(analyzeShellCommand("printf ok > result.txt"), {
    kind: "complete",
    executable: "printf",
    wrappers: [],
    commandClass: "inspect",
    effects: ["write"],
    paths: [{ text: "result.txt", role: "target" }],
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("an input redirection contributes a read source path", () => {
  assert.deepEqual(analyzeShellCommand("cat < input.txt"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "input.txt", role: "source" }],
  });
  assert.equal(policyContract.source, "new-policy");
});

test("read-write redirection is governed by the write-side target contract", () => {
  for (const command of ["printf x <> output.txt", "printf x 2<> output.txt"]) {
    assert.deepEqual(analyzeShellCommand(command), {
      kind: "complete",
      executable: "printf",
      wrappers: [],
      commandClass: "inspect",
      effects: ["write"],
      paths: [{ text: "output.txt", role: "target" }],
    }, command);
  }
});

test("redirection to or from /dev/null is treated as a discard stream without paths or write effect", () => {
  assert.deepEqual(analyzeShellCommand("git status 2>/dev/null"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: ".", role: "source" }],
  });
  assert.deepEqual(analyzeShellCommand("printf ok > /dev/null"), {
    kind: "complete",
    executable: "printf",
    wrappers: [],
    commandClass: "inspect",
    effects: [],
    paths: [],
  });
  assert.deepEqual(analyzeShellCommand("printf ok 2> /dev/null"), {
    kind: "complete",
    executable: "printf",
    wrappers: [],
    commandClass: "inspect",
    effects: [],
    paths: [],
  });
  assert.deepEqual(analyzeShellCommand("cat < /dev/null"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [],
  });
  assert.deepEqual(analyzeShellCommand("cat '/dev/null'"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: "/dev/null", role: "source" }],
  });
  assert.deepEqual(analyzeShellCommand("printf ok > /dev/sda"), {
    kind: "complete",
    executable: "printf",
    wrappers: [],
    commandClass: "inspect",
    effects: ["write"],
    paths: [{ text: "/dev/sda", role: "target" }],
  });
});

test("source and target paths retain their command order", () => {
  assert.deepEqual(analyzeShellCommand("cat input.txt > output.txt"), {
    kind: "complete",
    executable: "cat",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read", "write"],
    paths: [
      { text: "input.txt", role: "source" },
      { text: "output.txt", role: "target" },
    ],
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("Git inspect commands are bounded repository reads", () => {
  assert.deepEqual(analyzeShellCommand("git status"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: ".", role: "source" }],
  });
  assert.deepEqual(analyzeShellCommand("git diff -- src/app.ts"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [
      { text: ".", role: "source" },
      { text: "src/app.ts", role: "source" },
    ],
  });
});

test("Git command-local cwd facts keep token order and path bases", () => {
  const semantic = analyzeProgramCommand({
    executable: "git",
    arguments: [word("-C", 0), word("a", 3), word("--git-dir=.git", 5), word("-C", 19), word("b", 22), word("status", 24)],
  });

  assert.deepEqual(semantic?.cwdChanges, [
    { path: { text: "a", role: "source" }, start: 0, base: "invocation-cwd" },
    { path: { text: "b", role: "source" }, start: 19, base: "command-cwd" },
  ]);
  assert.deepEqual(semantic?.paths.map((entry) => ({ text: entry.path.text, role: entry.path.role, base: entry.base })), [
    { text: "a", role: "source", base: "invocation-cwd" },
    { text: ".git", role: "source", base: "command-cwd" },
    { text: "b", role: "source", base: "command-cwd" },
    { text: ".", role: "source", base: "command-cwd" },
  ]);
});

test("Git mutating commands expose their file paths and risk class", () => {
  assert.deepEqual(analyzeShellCommand("git add src/app.ts"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "modify",
    effects: ["read", "write"],
    paths: [
      { text: ".", role: "source" },
      { text: "src/app.ts", role: "source" },
    ],
  });
  assert.equal(analyzeShellCommand("git reset --hard HEAD").kind, "complete");
  assert.equal((analyzeShellCommand("git reset --hard HEAD") as { commandClass: string }).commandClass, "destroy");
});

test("Python tool option values do not hide the semantic subcommand", () => {
  assert.equal((analyzeShellCommand("ruff --config pyproject.toml format") as { commandClass: string }).commandClass, "modify");
});

test("Python tool option values and configs are not mistaken for target paths", () => {
  assert.deepEqual(complete("ruff format --config pyproject.toml src").paths, [
    { text: "pyproject.toml", role: "source" },
    { text: "src", role: "target" },
  ]);
  assert.deepEqual(complete("black --line-length 88 src").paths, [
    { text: "src", role: "target" },
  ]);
});

test("Python, uv, Node and package runners use explicit family semantics", () => {
  assert.equal((analyzeShellCommand("ruff check src") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("black src") as { commandClass: string }).commandClass, "modify");
  assert.equal((analyzeShellCommand("pytest tests") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("npm view react") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("npm run test") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("npm --prefix /tmp/deps ci") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("uv --directory project run pytest tests") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("npx --version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("npx vite") as { commandClass: string }).commandClass, "execute");
});

test("Git option values and revisions are not mistaken for file paths", () => {
  assert.deepEqual(analyzeShellCommand("git archive --output=/tmp/out.tar HEAD"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "modify",
    effects: ["read", "write"],
    paths: [
      { text: ".", role: "source" },
      { text: "/tmp/out.tar", role: "target" },
    ],
  });
  assert.deepEqual(analyzeShellCommand("git diff HEAD"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: ".", role: "source" }],
  });
  assert.equal((analyzeShellCommand("git branch") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("git clean --dry-run") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("git stash list") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("git config --list") as { commandClass: string }).commandClass, "inspect");
  for (const command of ["git diff --output=/tmp/out HEAD", "git show --output=/tmp/out HEAD", "git log --output /tmp/out"]) {
    assert.deepEqual(analyzeShellCommand(command), {
      kind: "complete",
      executable: "git",
      wrappers: [],
      commandClass: "inspect",
      effects: ["read", "write"],
      paths: [
        { text: ".", role: "source" },
        { text: "/tmp/out", role: "target" },
      ],
    }, command);
  }
  assert.deepEqual(analyzeShellCommand("git commit --file=/etc/msg"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "modify",
    effects: ["read", "write"],
    paths: [
      { text: ".", role: "source" },
      { text: "/etc/msg", role: "source" },
    ],
  });
  assert.deepEqual(complete("git init /tmp/repo").paths, [
    { text: ".", role: "target" },
    { text: "/tmp/repo", role: "target" },
  ]);
  assert.deepEqual(complete("git clone /etc/repo /workspace/project/clone").paths, [
    { text: "/etc/repo", role: "source" },
    { text: "/workspace/project/clone", role: "target" },
  ]);
  assert.deepEqual(complete("git clone file:///etc/repo /workspace/project/clone").paths, [
    { text: "/etc/repo", role: "source" },
    { text: "/workspace/project/clone", role: "target" },
  ]);
  assert.deepEqual(complete("git clone FILE:///etc/repo /workspace/project/clone").paths, [
    { text: "/etc/repo", role: "source" },
    { text: "/workspace/project/clone", role: "target" },
  ]);
  assert.deepEqual(complete("git submodule add --reference=/etc/repo file:///workspace/project/remote vendor/repo").paths, [
    { text: ".", role: "source" },
    { text: "add", role: "source" },
    { text: "/etc/repo", role: "source" },
    { text: "/workspace/project/remote", role: "source" },
    { text: "vendor/repo", role: "source" },
  ]);
  assert.deepEqual(complete("git fetch file:///workspace/project/remote").paths, [
    { text: ".", role: "source" },
    { text: "/workspace/project/remote", role: "source" },
  ]);
  assert.deepEqual(complete("git fetch --depth 1 file:///workspace/project/remote").paths, [
    { text: ".", role: "source" },
    { text: "/workspace/project/remote", role: "source" },
  ]);
  assert.deepEqual(complete("git push file:///workspace/project/remote main").paths, [
    { text: ".", role: "source" },
    { text: "/workspace/project/remote", role: "target" },
  ]);
  assert.deepEqual(complete("git clone --depth 1 https://host/repo.git").paths, [
    { text: ".", role: "target" },
  ]);
  assert.deepEqual(complete("git clone --template /tmp/template --reference=/tmp/reference https://host/repo.git /workspace/project/clone").paths, [
    { text: "/tmp/template", role: "source" },
    { text: "/tmp/reference", role: "source" },
    { text: "/workspace/project/clone", role: "target" },
  ]);
  assert.equal(complete("git clone --separate-git-dir=/tmp/repo.git https://host/repo.git /workspace/project/clone").commandClass, "modify");
  assert.deepEqual(complete("git config --file=/etc/gitconfig user.name attacker").paths, [
    { text: ".", role: "source" },
    { text: "/etc/gitconfig", role: "target" },
  ]);
  assert.deepEqual(complete("uv --directory=/tmp help").paths, [{ text: "/tmp", role: "source" }]);
  assert.deepEqual(complete("ruff format --check").paths, [{ text: ".", role: "source" }]);
  assert.deepEqual(complete("ruff clean"), {
    kind: "complete",
    executable: "ruff",
    wrappers: [],
    commandClass: "destroy",
    effects: ["delete", "write"],
    paths: [{ text: ".", role: "target" }],
  });
});

test("bounded coreutils option values do not become path operands", () => {
  for (const [command, expectedPaths] of [
    ["head -n 5 README.md", ["README.md"]],
    ["head -n5 README.md", ["README.md"]],
    ["head --lines=5 README.md", ["README.md"]],
    ["tail --lines 5 README.md", ["README.md"]],
    ["tail -n -5 README.md", ["README.md"]],
    ["mkdir -m 755 dist", ["dist"]],
    ["touch -d 2020-01-01 file", ["file"]],
    ["od -A x file", ["file"]],
    ["od -Ax file", ["file"]],
    ["od -w file", ["file"]],
    ["od --strings file", ["file"]],
    ["od -w16 file", ["file"]],
    ["touch -d -5 file", ["file"]],
    ["grep --color pattern README.md", ["README.md"]],
    ["grep --include '*.ts' pattern README.md", ["README.md"]],
    ["ls -la README.md", ["README.md"]],
    ["head -- -file", ["-file"]],
    ["wc -l README.md", ["README.md"]],
    ["wc -c -w file", ["file"]],
    ["cut -d: -f1 README.md", ["README.md"]],
    ["cut -d : -f 1 README.md", ["README.md"]],
    ["cut -b 1-10 file", ["file"]],
    ["cut --output-delimiter=, -f1 file", ["file"]],
    ["stat -c %s package.json", ["package.json"]],
    ["stat --printf=%s package.json", ["package.json"]],
    ["stat -L package.json", ["package.json"]],
    ["diff -u fileA fileB", ["fileA", "fileB"]],
    ["diff -U 3 fileA fileB", ["fileA", "fileB"]],
    ["diff --unified=5 fileA fileB", ["fileA", "fileB"]],
    ["file package.json", ["package.json"]],
    ["file -b -i package.json", ["package.json"]],
    ["du file", ["file"]],
    ["du -d 2 file", ["file"]],
    ["du", ["."]],
    ["df file", ["file"]],
    ["df -h", ["."]],
    ["rm file.txt", ["file.txt"]],
    ["rm -f a.txt b.txt", ["a.txt", "b.txt"]],
    ["rm -v file.txt", ["file.txt"]],
    ["rm -- -file.txt", ["-file.txt"]],
  ] as const) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "complete", command);
    assert.deepEqual(analysis.paths.map(({ text }) => text), expectedPaths, command);
  }
});

test("known coreutils reject options outside their bounded contract", () => {
  for (const command of [
    "head --unknown README.md",
    "touch --unknown file",
    "head --lines",
    "tail -n",
    "grep --color=always pattern README.md",
    "ln -L source link",
    "rm -r dir",
    "rm -R dir",
    "rm --recursive dir",
    "rm -d empty_dir",
    "rm --dir empty_dir",
    "rm -i file",
    "rm --no-preserve-root file",
    "rm",
    "rm -f",
    "wc --files0-from=file",
    "wc --unknown",
    "cut --unknown file",
    "stat --unknown file",
    "stat",
    "stat -L",
    "diff --diff-program=prog a b",
    "diff -D NAME a b",
    "diff a",
    "diff a b c",
    "diff",
    "file -z file",
    "file -C file",
    "file -f list",
    "file",
    "du --files0-from=file",
    "du --unknown",
    "df --output=source",
    "df --unknown",
  ]) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "reject", command);
    if (analysis.kind === "reject") assert.equal(analysis.code, "unsupported-syntax", command);
  }
});

test("bounded wc, cut, and stat extract inspect class, read effects, and source paths", () => {
  const wcWithFile = complete("wc -l README.md");
  assert.equal(wcWithFile.commandClass, "inspect");
  assert.deepEqual(wcWithFile.effects, ["read"]);
  assert.deepEqual(wcWithFile.paths, [{ text: "README.md", role: "source" }]);
  assert.equal(wcWithFile.semantic.recursive, false);

  const wcStdin = complete("wc -c -w");
  assert.equal(wcStdin.commandClass, "inspect");
  assert.deepEqual(wcStdin.effects, ["read"]);
  assert.deepEqual(wcStdin.paths, []);

  const cutWithFile = complete("cut -d: -f1 README.md");
  assert.equal(cutWithFile.commandClass, "inspect");
  assert.deepEqual(cutWithFile.effects, ["read"]);
  assert.deepEqual(cutWithFile.paths, [{ text: "README.md", role: "source" }]);

  const cutStdin = complete("cut -b 1-10");
  assert.equal(cutStdin.commandClass, "inspect");
  assert.deepEqual(cutStdin.effects, ["read"]);
  assert.deepEqual(cutStdin.paths, []);

  const statWithFile = complete("stat -c %s package.json");
  assert.equal(statWithFile.commandClass, "inspect");
  assert.deepEqual(statWithFile.effects, ["read"]);
  assert.deepEqual(statWithFile.paths, [{ text: "package.json", role: "source" }]);
});

test("bounded diff, file, du, and df extract inspect class, read effects, and correct recursiveness", () => {
  const diffCmd = complete("diff -u a.txt b.txt");
  assert.equal(diffCmd.commandClass, "inspect");
  assert.deepEqual(diffCmd.effects, ["read"]);
  assert.deepEqual(diffCmd.paths, [{ text: "a.txt", role: "source" }, { text: "b.txt", role: "source" }]);
  assert.equal(diffCmd.semantic.recursive, false);

  const diffRecursive = complete("diff -r dirA dirB");
  assert.equal(diffRecursive.commandClass, "inspect");
  assert.equal(diffRecursive.semantic.recursive, true);

  const fileCmd = complete("file package.json");
  assert.equal(fileCmd.commandClass, "inspect");
  assert.deepEqual(fileCmd.effects, ["read"]);
  assert.deepEqual(fileCmd.paths, [{ text: "package.json", role: "source" }]);
  assert.equal(fileCmd.semantic.recursive, false);

  const duCmd = complete("du -sh");
  assert.equal(duCmd.commandClass, "inspect");
  assert.deepEqual(duCmd.effects, ["read"]);
  assert.deepEqual(duCmd.paths, [{ text: ".", role: "source" }]);
  assert.equal(duCmd.semantic.recursive, true);

  const duExplicit = complete("du -h src");
  assert.equal(duExplicit.commandClass, "inspect");
  assert.deepEqual(duExplicit.paths, [{ text: "src", role: "source" }]);
  assert.equal(duExplicit.semantic.recursive, true);

  const dfCmd = complete("df -h");
  assert.equal(dfCmd.commandClass, "inspect");
  assert.deepEqual(dfCmd.effects, ["read"]);
  assert.deepEqual(dfCmd.paths, [{ text: ".", role: "source" }]);
  assert.equal(dfCmd.semantic.recursive, false);
});

test("bounded rm extracts target paths and destroy command class", () => {
  const analysis = complete("rm -f file.txt");
  assert.equal(analysis.commandClass, "destroy");
  assert.deepEqual(analysis.effects, ["delete", "write"]);
  assert.deepEqual(analysis.paths, [{ text: "file.txt", role: "target" }]);
  assert.equal(analysis.semantic.recursive, false);
  assert.equal(analysis.semantic.hardBoundary, false);

  const pathForm = complete("/bin/rm file.txt");
  assert.equal(pathForm.commandClass, "destroy");
  assert.equal(pathForm.semantic.hardBoundary, true);
});

test("copy-like commands distinguish source and target operands", () => {
  for (const command of ["cp source destination", "mv source destination", "ln source link"]) {
    const analysis = complete(command);
    assert.deepEqual(analysis.paths, [
      { text: "source", role: "source" },
      { text: command.startsWith("ln ") ? "link" : "destination", role: "target" },
    ], command);
  }
});

test("Herdr commands map to inspect, execute, and modify semantics with path extraction", () => {
  for (const command of [
    "herdr --version",
    "herdr -V",
    "herdr --help",
    "herdr status",
    "herdr agent",
    "herdr agent list",
    "herdr agent get child1",
    "herdr agent read child1 --source recent-unwrapped --lines 80",
    "herdr agent wait child1",
    "herdr workspace list",
    "herdr workspace get w1",
    "herdr worktree list",
  ]) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "complete", command);
    if (analysis.kind === "complete") {
      assert.equal(analysis.commandClass, "inspect", command);
      assert.deepEqual(analysis.effects, ["read"], command);
    }
  }

  for (const command of [
    "herdr agent start child1 --kind pi --pane 1",
    "herdr agent prompt child1 'review' --wait",
  ]) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "complete", command);
    if (analysis.kind === "complete") {
      assert.equal(analysis.commandClass, "execute", command);
      assert.deepEqual(analysis.effects, ["execute"], command);
      assert.equal(analysis.semantic.opaquePathAccess, true, command);
    }
  }

  const wsCreate = analyzeShellCommand("herdr workspace create --cwd . --label test --no-focus");
  assert.equal(wsCreate.kind, "complete");
  if (wsCreate.kind === "complete") {
    assert.equal(wsCreate.commandClass, "modify");
    assert.deepEqual(wsCreate.effects, ["read", "write"]);
    assert.deepEqual(wsCreate.paths, [{ text: ".", role: "source" }]);
  }

  const wtCreate = analyzeShellCommand("herdr worktree create --cwd . --branch feature --path /tmp/wt --no-focus");
  assert.equal(wtCreate.kind, "complete");
  if (wtCreate.kind === "complete") {
    assert.equal(wtCreate.commandClass, "modify");
    assert.deepEqual(wtCreate.effects, ["read", "write"]);
    assert.deepEqual(wtCreate.paths, [
      { text: ".", role: "source" },
      { text: "/tmp/wt", role: "target" },
    ]);
  }

  for (const command of [
    "herdr workspace close w1",
    "herdr worktree remove --workspace w1",
  ]) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "complete", command);
    if (analysis.kind === "complete") {
      assert.equal(analysis.commandClass, "modify", command);
      assert.notEqual(analysis.commandClass, "destroy", "herdr worktree remove must not be destroy");
      assert.deepEqual(analysis.effects, ["read", "write"], command);
    }
  }

  const unknown = analyzeShellCommand("herdr unknown-command");
  assert.equal(unknown.kind, "complete");
  if (unknown.kind === "complete") {
    assert.equal(unknown.commandClass, "unknown");
    assert.equal(unknown.semantic.opaquePathAccess, true);
  }
});

test("fixed system path-form coreutils obtain system identity and reuse bare-name semantics", () => {
  for (const executable of ["/bin/cat", "/usr/bin/cat"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("README.md", 0)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "inspect", executable);
    assert.deepEqual(semantic.effects, ["read"], executable);
    assert.deepEqual(semantic.paths.map((entry) => entry.path), [
      { text: "README.md", role: "source" },
    ], executable);
    assert.equal(semantic.opaque, false, executable);
  }

  for (const executable of ["/bin/diff", "/usr/bin/diff"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("a.txt", 0), word("b.txt", 6)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "inspect", executable);
    assert.deepEqual(semantic.effects, ["read"], executable);
    assert.deepEqual(semantic.paths.map((entry) => entry.path), [
      { text: "a.txt", role: "source" },
      { text: "b.txt", role: "source" },
    ], executable);
  }
});

test("system path-form rm permanently retains destroy and hardBoundary", () => {
  for (const executable of ["/bin/rm", "/usr/bin/rm"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("file.txt", 0)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "destroy", executable);
    assert.equal(semantic.hardBoundary, true, executable);
  }
});

test("custom path-form and non-standard prefix executables remain opaque execution", () => {
  for (const executable of ["/tmp/cat", "/opt/bin/cat", "/usr/local/bin/git"]) {
    const semantic = analyzeProgramCommand({ executable, arguments: [word("arg", 0)] });
    assert.ok(semantic);
    assert.equal(semantic.commandClass, "execute", executable);
    assert.equal(semantic.opaque, true, executable);
  }

  const scriptAnalysis = analyzeShellCommand("./tool.sh arg");
  assert.equal(scriptAnalysis.kind, "complete");
  if (scriptAnalysis.kind === "complete") {
    assert.equal(scriptAnalysis.commandClass, "execute");
    assert.equal(scriptAnalysis.semantic.opaquePathAccess, true);
  }
});

test("system path-form invocation extracts operand paths and preserves transparent inspect semantics", () => {
  const catAnalysis = complete("/usr/bin/cat foo.txt");
  assert.equal(catAnalysis.commandClass, "inspect");
  assert.deepEqual(catAnalysis.effects, ["read"]);
  assert.deepEqual(catAnalysis.paths, [{ text: "foo.txt", role: "source" }]);
  assert.equal(catAnalysis.semantic.opaquePathAccess, false);

  const diffAnalysis = complete("/usr/bin/diff a.txt b.txt");
  assert.equal(diffAnalysis.commandClass, "inspect");
  assert.deepEqual(diffAnalysis.effects, ["read"]);
  assert.deepEqual(diffAnalysis.paths, [
    { text: "a.txt", role: "source" },
    { text: "b.txt", role: "source" },
  ]);
  assert.equal(diffAnalysis.semantic.opaquePathAccess, false);
});

test("custom path-form invocation extracts executable as source path and marks opaque", () => {
  const scriptAnalysis = complete("./scripts/build.sh");
  assert.equal(scriptAnalysis.commandClass, "execute");
  assert.equal(scriptAnalysis.semantic.opaquePathAccess, true);
  assert.deepEqual(scriptAnalysis.paths, [{ text: "./scripts/build.sh", role: "source" }]);

  const homeRelativeScript = complete("~/bin/custom.sh");
  assert.equal(homeRelativeScript.commandClass, "execute");
  assert.equal(homeRelativeScript.semantic.opaquePathAccess, true);
  assert.deepEqual(homeRelativeScript.paths, [
    { text: "~/bin/custom.sh", role: "source", pathKind: "home-relative" },
  ]);
});

