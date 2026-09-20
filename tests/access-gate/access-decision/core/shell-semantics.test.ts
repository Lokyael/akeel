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
  assert.deepEqual(shellCommandOutcomes(analyzeShellCommand(":")), ["success"]);
  assert.equal(policyContract.source, "new-policy");
});

test("deterministic commands true, false, and colon are inspect with zero effects and zero paths", () => {
  for (const cmd of ["true", "false", ":"]) {
    const analysis = complete(cmd);
    assert.equal(analysis.commandClass, "inspect", cmd);
    assert.deepEqual(analysis.effects, [], cmd);
    assert.deepEqual(analysis.paths, [], cmd);
    const semantic = (analysis as { readonly semantic?: { readonly opaquePathAccess?: boolean } }).semantic;
    assert.equal(semantic?.opaquePathAccess, false, cmd);
  }
});

test("system path-form true and false reuse bare inspect semantics", () => {
  for (const cmd of ["/bin/true", "/usr/bin/true", "/bin/false", "/usr/bin/false"]) {
    const analysis = complete(cmd);
    assert.equal(analysis.commandClass, "inspect", cmd);
    assert.deepEqual(analysis.effects, [], cmd);
    assert.deepEqual(analysis.paths, [], cmd);
    const semantic = (analysis as { readonly semantic?: { readonly opaquePathAccess?: boolean } }).semantic;
    assert.equal(semantic?.opaquePathAccess, false, cmd);
  }
});

test("colon with target redirection contributes target path and write effect", () => {
  const analysis = complete(": > output.txt");
  assert.equal(analysis.commandClass, "inspect");
  assert.deepEqual(analysis.effects, ["write"]);
  assert.equal(analysis.paths.length, 1);
  assert.equal(analysis.paths[0]?.text, "output.txt");
  assert.equal(analysis.paths[0]?.role, "target");
  assert.deepEqual(shellCommandOutcomes(analysis), ["success", "failure"]);
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

test("Git status supports -u and --untracked-files while rejecting invalid modes", () => {
  for (const flag of ["-u", "-uno", "-uall", "-unormal", "--untracked-files", "--untracked-files=no", "--untracked-files=all", "--untracked-files=normal"]) {
    const semantic = analyzeProgramCommand({ executable: "git", arguments: [word("status", 0), word(flag, 7)] });
    assert.ok(semantic, flag);
    assert.equal(semantic.commandClass, "inspect", flag);
    assert.equal(semantic.hardBoundary, false, flag);
    assert.deepEqual(semantic.effects, ["read"], flag);
  }

  for (const bad of ["-uevil", "--untracked-files=evil", "--untracked-files="]) {
    const semantic = analyzeProgramCommand({ executable: "git", arguments: [word("status", 0), word(bad, 7)] });
    assert.ok(semantic, bad);
    assert.equal(semantic.hardBoundary, true, bad);
  }
});

test("Git stash supports read-only list and show while rejecting mutating actions", () => {
  // Read-only inspect variants
  const list = analyzeProgramCommand({ executable: "git", arguments: [word("stash", 0), word("list", 6)] });
  assert.ok(list);
  assert.equal(list.commandClass, "inspect");
  assert.equal(list.hardBoundary, false);
  assert.deepEqual(list.effects, ["read"]);

  const show = analyzeProgramCommand({ executable: "git", arguments: [word("stash", 0), word("show", 6)] });
  assert.ok(show);
  assert.equal(show.commandClass, "inspect");
  assert.equal(show.hardBoundary, false);
  assert.deepEqual(show.effects, ["read"]);

  const showRev = analyzeProgramCommand({ executable: "git", arguments: [word("stash", 0), word("show", 6), word("stash@{0}", 11)] });
  assert.ok(showRev);
  assert.equal(showRev.commandClass, "inspect");
  assert.equal(showRev.hardBoundary, false);

  const showWithStat = analyzeProgramCommand({ executable: "git", arguments: [word("stash", 0), word("show", 6), word("--stat", 11)] });
  assert.ok(showWithStat);
  assert.equal(showWithStat.commandClass, "inspect");
  assert.equal(showWithStat.hardBoundary, false);

  // Mutating or invalid actions trigger hardBoundary
  for (const args of [
    [word("stash", 0)],
    [word("stash", 0), word("pop", 6)],
    [word("stash", 0), word("drop", 6)],
    [word("stash", 0), word("clear", 6)],
    [word("stash", 0), word("push", 6)],
    [word("stash", 0), word("apply", 6)],
    [word("stash", 0), word("list", 6), word("extra", 11)],
    [word("stash", 0), word("show", 6), word("stash@{0}", 11), word("extra", 20)],
  ]) {
    const cmdStr = args.map((a) => a.text).join(" ");
    const semantic = analyzeProgramCommand({ executable: "git", arguments: args });
    assert.ok(semantic, cmdStr);
    assert.equal(semantic.hardBoundary, true, cmdStr);
  }
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

test("which resolves one bare command name as bounded inspect without path access", () => {
  const analysis = complete("which herdr");
  assert.equal(analysis.executable, "which");
  assert.equal(analysis.commandClass, "inspect");
  assert.deepEqual(analysis.effects, ["read"]);
  assert.deepEqual(analysis.paths, []);
  assert.equal((analysis as { readonly semantic?: { readonly opaquePathAccess?: boolean } }).semantic?.opaquePathAccess, false);
});

test("which rejects options, multiple targets, and path-form targets", () => {
  for (const command of ["which -a herdr", "which herdr git", "which ./herdr"]) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "reject", command);
    assert.equal(analysis.code, "unsupported-syntax", command);
  }
});

test("system path-form which does not reuse transparent bare-name semantics", () => {
  for (const command of ["/bin/which herdr", "/usr/bin/which herdr"]) {
    const analysis = complete(command);
    assert.equal(analysis.commandClass, "execute", command);
    assert.deepEqual(analysis.effects, ["execute"], command);
    assert.equal(analysis.semantic.opaquePathAccess, true, command);
  }
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
  assert.deepEqual(analyzeShellCommand("git status -sb"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: ".", role: "source" }],
  });
  assert.deepEqual(analyzeShellCommand("git status -s -b"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: ".", role: "source" }],
  });
  assert.deepEqual(analyzeShellCommand("git status --porcelain -b"), {
    kind: "complete",
    executable: "git",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [{ text: ".", role: "source" }],
  });
  assert.deepEqual(analyzeShellCommand("git diff -b"), {
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

test("uv path options extract source paths while python and scalars do not become paths", () => {
  assert.deepEqual(complete("uv --directory=/tmp help").paths, [{ text: "/tmp", role: "source" }]);
  assert.deepEqual(complete("uv --python 3.12 --config-file=/tmp/uv.toml help").paths, [
    { text: "/tmp/uv.toml", role: "source" },
  ]);
  assert.deepEqual(complete("uv --python 3.12 help").paths, []);
});

test("package managers extract filesystem paths but do not emit workspace or filter selectors as paths", () => {
  assert.deepEqual(complete("npm --prefix /tmp/deps view react").paths, [
    { text: "/tmp/deps", role: "source" },
  ]);
  assert.deepEqual(complete("npm --workspace=@scope/pkg run test").paths, []);
  assert.deepEqual(complete("pnpm --filter my-app test").paths, []);
  assert.deepEqual(complete("yarn -w @scope/pkg test").paths, []);
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
    ["grep -E pattern README.md", ["README.md"]],
    ["grep --extended-regexp pattern README.md", ["README.md"]],
    ["grep -F pattern README.md", ["README.md"]],
    ["grep --fixed-strings pattern README.md", ["README.md"]],
    ["grep -Ein pattern README.md", ["README.md"]],
    ["grep -Fn pattern README.md", ["README.md"]],
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

test("bounded tee extracts inspect with zero paths when operandless, and modify with target paths when given files", () => {
  assert.deepEqual(analyzeShellCommand("tee"), {
    kind: "complete",
    executable: "tee",
    wrappers: [],
    commandClass: "inspect",
    effects: ["read"],
    paths: [],
  });
  assert.deepEqual(analyzeShellCommand("tee -a output.log"), {
    kind: "complete",
    executable: "tee",
    wrappers: [],
    commandClass: "modify",
    effects: ["write"],
    paths: [{ text: "output.log", role: "target" }],
  });
  assert.deepEqual(analyzeShellCommand("tee --append -i out1.txt out2.txt"), {
    kind: "complete",
    executable: "tee",
    wrappers: [],
    commandClass: "modify",
    effects: ["write"],
    paths: [
      { text: "out1.txt", role: "target" },
      { text: "out2.txt", role: "target" },
    ],
  });
  assert.deepEqual(analyzeShellCommand("tee -p file.txt"), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 4, end: 6 },
    resourceClass: "syntax",
  });
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
    "touch",
    "touch -c",
    "mkdir",
    "mkdir -p",
    "mkdir -m 755",
    "cp",
    "cp -r",
    "cp source",
    "mv",
    "mv -f",
    "mv source",
    "ln",
    "ln -s",
    "ln source",
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

test("Herdr commands with unknown options are opaque and fail-closed", () => {
  for (const command of [
    "herdr --unknown-flag status",
    "herdr status --unknown-flag",
    "herdr agent list --unknown-opt",
  ]) {
    const analysis = analyzeShellCommand(command);
    assert.equal(analysis.kind, "complete", command);
    if (analysis.kind === "complete") {
      assert.equal(analysis.semantic.opaquePathAccess, true, `expected opaque for ${command}`);
    }
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

test("bounded tr, sort, and uniq extract inspect class, read effects, and bounded paths", () => {
  const trCmd = complete("tr 'a-z' 'A-Z'");
  assert.equal(trCmd.commandClass, "inspect");
  assert.deepEqual(trCmd.effects, []);
  assert.deepEqual(trCmd.paths, []);

  const trDelete = complete("tr -d '\\n'");
  assert.equal(trDelete.commandClass, "inspect");
  assert.deepEqual(trDelete.effects, []);
  assert.deepEqual(trDelete.paths, []);

  const sortFile = complete("sort file.txt");
  assert.equal(sortFile.commandClass, "inspect");
  assert.deepEqual(sortFile.effects, ["read"]);
  assert.deepEqual(sortFile.paths, [{ text: "file.txt", role: "source" }]);

  const sortMulti = complete("sort -u file1.txt file2.txt");
  assert.equal(sortMulti.commandClass, "inspect");
  assert.deepEqual(sortMulti.effects, ["read"]);
  assert.deepEqual(sortMulti.paths, [
    { text: "file1.txt", role: "source" },
    { text: "file2.txt", role: "source" },
  ]);

  const sortOptions = complete("sort -n -r -k 2 file.txt");
  assert.equal(sortOptions.commandClass, "inspect");
  assert.deepEqual(sortOptions.effects, ["read"]);
  assert.deepEqual(sortOptions.paths, [{ text: "file.txt", role: "source" }]);

  const sortStdin = complete("sort");
  assert.equal(sortStdin.commandClass, "inspect");
  assert.deepEqual(sortStdin.effects, ["read"]);
  assert.deepEqual(sortStdin.paths, []);

  const uniqFile = complete("uniq file.txt");
  assert.equal(uniqFile.commandClass, "inspect");
  assert.deepEqual(uniqFile.effects, ["read"]);
  assert.deepEqual(uniqFile.paths, [{ text: "file.txt", role: "source" }]);

  const uniqFlags = complete("uniq -c -i file.txt");
  assert.equal(uniqFlags.commandClass, "inspect");
  assert.deepEqual(uniqFlags.effects, ["read"]);
  assert.deepEqual(uniqFlags.paths, [{ text: "file.txt", role: "source" }]);

  const uniqStdin = complete("uniq");
  assert.equal(uniqStdin.commandClass, "inspect");
  assert.deepEqual(uniqStdin.effects, ["read"]);
  assert.deepEqual(uniqStdin.paths, []);
});

test("sort rejects output, temporary directory, and code-execution options", () => {
  for (const cmd of [
    "sort -o out.txt in.txt",
    "sort --output=out.txt in.txt",
    "sort --compress-program=gzip in.txt",
    "sort --files0-from=files.txt",
    "sort -T /tmp in.txt",
    "sort --temporary-directory=/tmp in.txt",
    "sort -m a.txt b.txt",
    "sort --merge a.txt b.txt",
  ]) {
    const analysis = analyzeShellCommand(cmd);
    assert.equal(analysis.kind, "reject", cmd);
    if (analysis.kind === "reject") {
      assert.equal(analysis.code, "unsupported-syntax", cmd);
    }
  }
});

test("uniq rejects multiple file operands to prevent silent file overwrites", () => {
  for (const cmd of [
    "uniq in.txt out.txt",
    "uniq a.txt b.txt c.txt",
  ]) {
    const analysis = analyzeShellCommand(cmd);
    assert.equal(analysis.kind, "reject", cmd);
    if (analysis.kind === "reject") {
      assert.equal(analysis.code, "unsupported-syntax", cmd);
    }
  }
});

test("bounded chmod extracts modify class, write effects, and target paths", () => {
  const plusX = complete("chmod +x run.sh");
  assert.equal(plusX.commandClass, "modify");
  assert.deepEqual(plusX.effects, ["write"]);
  assert.deepEqual(plusX.paths, [{ text: "run.sh", role: "target" }]);

  const minusW = complete("chmod -w file.txt");
  assert.equal(minusW.commandClass, "modify");
  assert.deepEqual(minusW.effects, ["write"]);
  assert.deepEqual(minusW.paths, [{ text: "file.txt", role: "target" }]);

  const symbolicCompound = complete("chmod u=rwx,go=rx script.sh");
  assert.equal(symbolicCompound.commandClass, "modify");
  assert.deepEqual(symbolicCompound.effects, ["write"]);
  assert.deepEqual(symbolicCompound.paths, [{ text: "script.sh", role: "target" }]);

  const octalStandard = complete("chmod 755 run.sh");
  assert.equal(octalStandard.commandClass, "modify");
  assert.deepEqual(octalStandard.effects, ["write"]);
  assert.deepEqual(octalStandard.paths, [{ text: "run.sh", role: "target" }]);

  const octalZeroPrefix = complete("chmod 0644 file.txt");
  assert.equal(octalZeroPrefix.commandClass, "modify");
  assert.deepEqual(octalZeroPrefix.effects, ["write"]);
  assert.deepEqual(octalZeroPrefix.paths, [{ text: "file.txt", role: "target" }]);

  const withFlagsAndMulti = complete("chmod -v +x a.sh b.sh");
  assert.equal(withFlagsAndMulti.commandClass, "modify");
  assert.deepEqual(withFlagsAndMulti.effects, ["write"]);
  assert.deepEqual(withFlagsAndMulti.paths, [
    { text: "a.sh", role: "target" },
    { text: "b.sh", role: "target" },
  ]);

  const endOfOptions = complete("chmod -- -x file.txt");
  assert.equal(endOfOptions.commandClass, "modify");
  assert.deepEqual(endOfOptions.effects, ["write"]);
  assert.deepEqual(endOfOptions.paths, [{ text: "file.txt", role: "target" }]);

  const systemChmod = complete("/bin/chmod +x run.sh");
  assert.equal(systemChmod.commandClass, "modify");
  assert.deepEqual(systemChmod.effects, ["write"]);
  assert.deepEqual(systemChmod.paths, [{ text: "run.sh", role: "target" }]);

  const pathFormChmod = complete("./chmod +x run.sh");
  assert.equal(pathFormChmod.commandClass, "execute");
  assert.equal(pathFormChmod.semantic.opaquePathAccess, true);
  assert.deepEqual(pathFormChmod.paths, [{ text: "./chmod", role: "source" }]);
});

test("chmod rejects recursive options with security-boundary", () => {
  for (const cmd of [
    "chmod -R 755 dir",
    "chmod --recursive +x dir",
    "chmod -vR 755 dir",
    "/usr/bin/chmod -R 755 dir",
  ]) {
    const analysis = analyzeShellCommand(cmd);
    assert.equal(analysis.kind, "reject", cmd);
    if (analysis.kind === "reject") {
      assert.equal(analysis.code, "security-boundary", cmd);
    }
  }
});

test("chmod rejects privilege-elevation special bits with security-boundary", () => {
  for (const cmd of [
    "chmod 4755 exploit",
    "chmod 2755 exploit",
    "chmod 1777 exploit",
    "chmod 6755 exploit",
    "chmod u+s exploit",
    "chmod g+s exploit",
    "chmod +t exploit",
    "chmod a+s exploit",
    "chmod u=rws,g=rx exploit",
  ]) {
    const analysis = analyzeShellCommand(cmd);
    assert.equal(analysis.kind, "reject", cmd);
    if (analysis.kind === "reject") {
      assert.equal(analysis.code, "security-boundary", cmd);
    }
  }
});

test("Git inspect subcommands accept safe display and filter options without becoming opaque or emitting pseudo-paths", () => {
  const logSearch = complete("git log -S needle --oneline");
  assert.equal(logSearch.commandClass, "inspect");
  assert.deepEqual(logSearch.effects, ["read"]);
  assert.deepEqual(logSearch.paths, [{ text: ".", role: "source" }]);
  assert.equal(logSearch.semantic.opaquePathAccess, false);
  assert.equal(logSearch.semantic.hardBoundary, false);

  const logFilters = complete("git log -G ^feat --grep=docs --author=alice --since=2026-01-01 --until=2026-12-31 -n 10 --format=oneline");
  assert.equal(logFilters.commandClass, "inspect");
  assert.deepEqual(logFilters.effects, ["read"]);
  assert.deepEqual(logFilters.paths, [{ text: ".", role: "source" }]);
  assert.equal(logFilters.semantic.opaquePathAccess, false);
  assert.equal(logFilters.semantic.hardBoundary, false);

  const logFlags = complete("git log --graph --no-merges --topo-order --reverse -p");
  assert.equal(logFlags.commandClass, "inspect");
  assert.deepEqual(logFlags.effects, ["read"]);
  assert.deepEqual(logFlags.paths, [{ text: ".", role: "source" }]);
  assert.equal(logFlags.semantic.opaquePathAccess, false);
  assert.equal(logFlags.semantic.hardBoundary, false);

  const diffFilter = complete("git diff --diff-filter=ACMRT");
  assert.equal(diffFilter.commandClass, "inspect");
  assert.deepEqual(diffFilter.effects, ["read"]);
  assert.deepEqual(diffFilter.paths, [{ text: ".", role: "source" }]);
  assert.equal(diffFilter.semantic.opaquePathAccess, false);
  assert.equal(diffFilter.semantic.hardBoundary, false);

  const diffSummary = complete("git diff --summary");
  assert.equal(diffSummary.commandClass, "inspect");
  assert.deepEqual(diffSummary.effects, ["read"]);
  assert.deepEqual(diffSummary.paths, [{ text: ".", role: "source" }]);
  assert.equal(diffSummary.semantic.opaquePathAccess, false);
  assert.equal(diffSummary.semantic.hardBoundary, false);

  const diffRevisionSummary = complete("git diff origin/main..main --summary");
  assert.equal(diffRevisionSummary.commandClass, "inspect");
  assert.deepEqual(diffRevisionSummary.effects, ["read"]);
  assert.deepEqual(diffRevisionSummary.paths, [{ text: ".", role: "source" }]);
  assert.equal(diffRevisionSummary.semantic.opaquePathAccess, false);
  assert.equal(diffRevisionSummary.semantic.hardBoundary, false);

  const logSummary = complete("git log --summary");
  assert.equal(logSummary.commandClass, "inspect");
  assert.deepEqual(logSummary.effects, ["read"]);
  assert.deepEqual(logSummary.paths, [{ text: ".", role: "source" }]);
  assert.equal(logSummary.semantic.opaquePathAccess, false);
  assert.equal(logSummary.semantic.hardBoundary, false);

  const logNumeric = complete("git log -5 --oneline");
  assert.equal(logNumeric.commandClass, "inspect");
  assert.deepEqual(logNumeric.effects, ["read"]);
  assert.deepEqual(logNumeric.paths, [{ text: ".", role: "source" }]);
  assert.equal(logNumeric.semantic.opaquePathAccess, false);
  assert.equal(logNumeric.semantic.hardBoundary, false);

  const revListNumeric = complete("git rev-list -3 HEAD");
  assert.equal(revListNumeric.commandClass, "inspect");
  assert.deepEqual(revListNumeric.effects, ["read"]);
  assert.deepEqual(revListNumeric.paths, [{ text: ".", role: "source" }]);
  assert.equal(revListNumeric.semantic.opaquePathAccess, false);
  assert.equal(revListNumeric.semantic.hardBoundary, false);

  const branchShowCurrent = complete("git branch --show-current");
  assert.equal(branchShowCurrent.commandClass, "inspect");
  assert.deepEqual(branchShowCurrent.effects, ["read"]);
  assert.deepEqual(branchShowCurrent.paths, [{ text: ".", role: "source" }]);
  assert.equal(branchShowCurrent.semantic.opaquePathAccess, false);
  assert.equal(branchShowCurrent.semantic.hardBoundary, false);
});

test("Git local read-only display options remain bounded and non-opaque", () => {
  for (const command of [
    "git log --oneline -8 --decorate",
    "git diff --check",
    "git rev-parse --show-toplevel",
    "git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'",
  ]) {
    const analysis = complete(command);
    assert.equal(analysis.commandClass, "inspect", command);
    assert.deepEqual(analysis.effects, ["read"], command);
    assert.deepEqual(analysis.paths, [{ text: ".", role: "source" }], command);
    assert.equal(analysis.semantic.opaquePathAccess, false, command);
    assert.equal(analysis.semantic.hardBoundary, false, command);
  }
});

test("Git inspect subcommands fail-closed on missing option values, external drivers, and unknown options", () => {
  const missingVal = complete("git log -S");
  assert.equal(missingVal.semantic.hardBoundary, true);

  const extDiff = complete("git log --ext-diff");
  assert.equal(extDiff.semantic.hardBoundary, true);

  const textconv = complete("git diff --textconv");
  assert.equal(textconv.semantic.hardBoundary, true);

  const unknown = complete("git log --unknown-inspect-option");
  assert.equal(unknown.semantic.opaquePathAccess, true);

  const unknownDisplayOption = complete("git log --decorate-refs=refs/heads/main");
  assert.equal(unknownDisplayOption.semantic.opaquePathAccess, true);

  for (const command of ["git show --decorate", "git log --check", "git diff --show-toplevel"]) {
    const analysis = complete(command);
    assert.equal(analysis.semantic.opaquePathAccess, true, command);
  }
});

test("Git non-inspect subcommands isolate inspect-only options and do not permit them", () => {
  const checkoutWithInspectOpt = complete("git checkout -S pattern");
  assert.equal(checkoutWithInspectOpt.semantic.opaquePathAccess, true);

  const addWithInspectOpt = complete("git add -S pattern");
  assert.equal(addWithInspectOpt.semantic.opaquePathAccess || addWithInspectOpt.semantic.hardBoundary, true);

  const commitWithNumeric = complete("git commit -m msg -5");
  assert.equal(commitWithNumeric.semantic.opaquePathAccess || commitWithNumeric.semantic.hardBoundary, true);

  const checkoutWithNumeric = complete("git checkout -5");
  assert.equal(checkoutWithNumeric.semantic.opaquePathAccess || checkoutWithNumeric.semantic.hardBoundary, true);
});

test("standard descriptor redirections emit target path and write effect", () => {
  const errWrite = complete("echo 'error message' 2> err.log");
  assert.equal(errWrite.commandClass, "inspect");
  assert.deepEqual(errWrite.effects, ["write"]);
  assert.deepEqual(errWrite.paths, [{ text: "err.log", role: "target" }]);

  const appendWrite = complete("echo 'line' 1>> out.log 2>> err.log");
  assert.equal(appendWrite.commandClass, "inspect");
  assert.deepEqual(appendWrite.effects, ["write"]);
  assert.deepEqual(appendWrite.paths, [
    { text: "out.log", role: "target" },
    { text: "err.log", role: "target" },
  ]);
});

test("generalized /dev/null discard redirection emits no target path or write effect", () => {
  const inspectWithDiscard = complete("cat README.md 2> /dev/null");
  assert.equal(inspectWithDiscard.commandClass, "inspect");
  assert.deepEqual(inspectWithDiscard.effects, ["read"]);
  assert.deepEqual(inspectWithDiscard.paths, [{ text: "README.md", role: "source" }]);

  const statusWithDiscard = complete("git status 2>> /dev/null");
  assert.equal(statusWithDiscard.commandClass, "inspect");
  assert.deepEqual(statusWithDiscard.effects, ["read"]);
  assert.deepEqual(statusWithDiscard.paths, [{ text: ".", role: "source" }]);

  const attachedDiscard = complete("echo test 2>/dev/null");
  assert.deepEqual(attachedDiscard.paths, []);
  assert.deepEqual(attachedDiscard.effects, []);
});

test("2>&1 stream duplication modifier emits no target path or write effect", () => {
  const inspectWithDup = complete("git log 2>&1");
  assert.equal(inspectWithDup.commandClass, "inspect");
  assert.deepEqual(inspectWithDup.effects, ["read"]);
  assert.deepEqual(inspectWithDup.paths, [{ text: ".", role: "source" }]);

  const combined = complete("git status 1> status.txt 2>&1");
  assert.deepEqual(combined.effects, ["read", "write"]);
  assert.deepEqual(combined.paths, [
    { text: ".", role: "source" },
    { text: "status.txt", role: "target" },
  ]);
});

test("malformed descriptor redirections fail closed", () => {
  for (const cmd of ["cat 2>", "cat 1>>", "cat 2> 2>&1", "cat 2> > out"]) {
    const analysis = analyzeShellCommand(cmd);
    assert.equal(analysis.kind, "reject", cmd);
    if (analysis.kind === "reject") {
      assert.equal(analysis.code, "unsupported-syntax", cmd);
    }
  }
});

test("bounded git restore and git checkout single-file mutations extract target paths without hard-boundary", () => {
  for (const cmd of [
    "git restore src/app.ts",
    "git restore --staged src/app.ts",
    "git restore --worktree src/app.ts",
    "git restore -W -S src/app.ts",
    "git restore --source=HEAD src/app.ts",
    "git restore -s HEAD src/app.ts",
    "git restore --source=HEAD -- src/app.ts",
    "git restore -- src/app.ts",
    "git checkout -- src/app.ts",
  ]) {
    const result = analyzeProgramCommand({
      executable: "git",
      arguments: cmd.split(" ").slice(1).map((text, idx) => word(text, idx * 5)),
    });
    assert.ok(result, cmd);
    assert.equal(result.commandClass, "modify", cmd);
    assert.deepEqual(result.effects, ["read", "write"], cmd);
    assert.equal(result.hardBoundary, false, cmd);
    assert.deepEqual(
      result.paths.map((p) => ({ text: p.path.text, role: p.path.role })),
      [
        { text: ".", role: "source" },
        { text: "src/app.ts", role: "target" },
      ],
      cmd,
    );
  }
});

test("unsafe git restore and git checkout forms remain hard-boundary", () => {
  for (const cmd of [
    "git restore",
    "git restore .",
    "git restore src/a.ts src/b.ts",
    "git restore '*.ts'",
    "git restore -p src/app.ts",
    "git restore --patch src/app.ts",
    "git restore --ours src/app.ts",
    "git restore --theirs src/app.ts",
    "git restore --merge src/app.ts",
    "git restore --conflict=diff3 src/app.ts",
    "git restore --recurse-submodules src/app.ts",
    "git restore --source=origin/main src/app.ts",
    "git restore --source=main src/app.ts",
    "git checkout src/app.ts",
    "git checkout main",
    "git checkout -b new-branch",
    "git checkout -- .",
    "git checkout -- src/a.ts src/b.ts",
  ]) {
    const result = analyzeProgramCommand({
      executable: "git",
      arguments: cmd.split(" ").slice(1).map((text, idx) => word(text, idx * 5)),
    });
    assert.ok(result, cmd);
    assert.equal(result.hardBoundary, true, cmd);
  }
});

function hardBoundaryOf(cmd: string): boolean {
  const analysis = analyzeShellCommand(cmd);
  if (analysis.kind !== "complete") return false;
  return (analysis as { semantic?: { hardBoundary?: boolean } }).semantic?.hardBoundary === true;
}

function cwdChangesOf(cmd: string) {
  const analysis = analyzeShellCommand(cmd);
  if (analysis.kind !== "complete") return [];
  return (analysis as { semantic?: { cwdChanges?: readonly { path: { text: string } }[] } }).semantic?.cwdChanges ?? [];
}

test("Cargo commands classify inspect, destroy hard-boundary, and execute with paths", () => {
  assert.equal((analyzeShellCommand("cargo --version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("cargo -V") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("cargo metadata") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("cargo tree") as { commandClass: string }).commandClass, "inspect");

  // Destroy clean must be hard-boundary
  const cleanCmd = analyzeShellCommand("cargo clean") as { commandClass: string; effects: readonly string[] };
  assert.equal(cleanCmd.commandClass, "destroy");
  assert.deepEqual(cleanCmd.effects, ["delete"]);
  assert.equal(hardBoundaryOf("cargo clean"), true);

  // Normal build/test commands
  assert.equal((analyzeShellCommand("cargo build") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("cargo test") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("cargo clippy") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("cargo check") as { commandClass: string }).commandClass, "execute");

  // Path options extraction
  const withManifest = complete("cargo --manifest-path crates/foo/Cargo.toml test");
  assert.deepEqual(withManifest.paths, [{ text: "crates/foo/Cargo.toml", role: "source" }]);

  const withTargetDir = complete("cargo build --target-dir /tmp/target");
  assert.deepEqual(withTargetDir.paths, [{ text: "/tmp/target", role: "target" }]);
});

test("Go commands classify inspect, destroy hard-boundary, CWD changes, and target paths", () => {
  assert.equal((analyzeShellCommand("go version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("go env") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("go list ./...") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("go doc fmt") as { commandClass: string }).commandClass, "inspect");

  // Destroy clean
  for (const cmd of ["go clean", "go clean -cache", "go clean -modcache"]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }

  // Execute build/test
  assert.equal((analyzeShellCommand("go test ./...") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("go build") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("go vet ./...") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("go mod tidy") as { commandClass: string }).commandClass, "execute");

  // Path & CWD options
  const withOutput = complete("go build -o /tmp/bin/app .");
  assert.deepEqual(withOutput.paths, [{ text: "/tmp/bin/app", role: "target" }]);

  const goCwd = cwdChangesOf("go test -C pkg/foo ./...");
  assert.ok(goCwd.length > 0);
  assert.equal(goCwd[0]?.path.text, "pkg/foo");
});

test("Make and Gmake classify inspect, destroy targets, and CWD/makefile paths", () => {
  assert.equal((analyzeShellCommand("make --version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("make -p") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("make -n") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("make --dry-run") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("gmake -v") as { commandClass: string }).commandClass, "inspect");

  // Destroy targets
  for (const cmd of ["make clean", "make distclean", "gmake mrproper", "make clobber"]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }

  // Execute normal targets
  assert.equal((analyzeShellCommand("make") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("make all") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("make test") as { commandClass: string }).commandClass, "execute");

  // Path & CWD options
  const withMakefile = complete("make -f custom.mk build");
  assert.deepEqual(withMakefile.paths, [{ text: "custom.mk", role: "source" }]);

  const makeCwd = cwdChangesOf("make -C subproject build");
  assert.ok(makeCwd.length > 0);
  assert.equal(makeCwd[0]?.path.text, "subproject");
});

test("Maven commands classify inspect, destroy clean (veto), and file paths", () => {
  assert.equal((analyzeShellCommand("mvn --version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("mvn -v") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("mvn dependency:tree") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("mvn help:effective-pom") as { commandClass: string }).commandClass, "inspect");

  // Destroy clean (including mixed targets)
  for (const cmd of ["mvn clean", "mvn clean install", "mvn clean test -B", "mvnw clean"]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }

  // Normal execute
  assert.equal((analyzeShellCommand("mvn compile") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("mvn test -DskipTests") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("mvn package") as { commandClass: string }).commandClass, "execute");

  // Path options
  const withPom = complete("mvn -f sub/pom.xml compile");
  assert.deepEqual(withPom.paths, [{ text: "sub/pom.xml", role: "source" }]);

  const withSettings = complete("mvn -s custom-settings.xml test");
  assert.deepEqual(withSettings.paths, [{ text: "custom-settings.xml", role: "source" }]);
});

test("Gradle commands classify inspect, destroy clean, and project/buildfile paths", () => {
  assert.equal((analyzeShellCommand("gradle --version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("gradle -v") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("gradle tasks") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("gradle dependencies") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("gradle -m build") as { commandClass: string }).commandClass, "inspect");

  // Destroy clean
  for (const cmd of ["gradle clean", "gradle cleanTest", "gradle clean build", "gradlew clean"]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }

  // Normal execute
  assert.equal((analyzeShellCommand("gradle build") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("gradle test") as { commandClass: string }).commandClass, "execute");

  // Path options
  const withProjectDir = complete("gradle -p subproject test");
  assert.deepEqual(withProjectDir.paths, [{ text: "subproject", role: "source" }]);

  const withBuildFile = complete("gradle -b build.gradle.kts check");
  assert.deepEqual(withBuildFile.paths, [{ text: "build.gradle.kts", role: "source" }]);
});

test("Java and javac classify inspect and path-aware execute", () => {
  assert.equal((analyzeShellCommand("java -version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("java --version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("java -help") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("javac -version") as { commandClass: string }).commandClass, "inspect");
  assert.equal((analyzeShellCommand("javac --version") as { commandClass: string }).commandClass, "inspect");

  // java -jar extracts jar source path
  const javaJar = complete("java -jar /tmp/app.jar");
  assert.equal(javaJar.commandClass, "execute");
  assert.deepEqual(javaJar.paths, [{ text: "/tmp/app.jar", role: "source" }]);

  // java class execution
  assert.equal((analyzeShellCommand("java com.example.Main") as { commandClass: string }).commandClass, "execute");

  // javac extracts target dir and source files
  const javacCmd = complete("javac -d /tmp/classes src/Main.java");
  assert.equal(javacCmd.commandClass, "execute");
  assert.deepEqual(javacCmd.paths, [
    { text: "/tmp/classes", role: "target" },
    { text: "src/Main.java", role: "source" },
  ]);
});

test("Build tools stress tests: toolchain prefixes, subprojects, clean variants, and javac options", () => {
  // 1. Rust toolchain prefix: cargo +<toolchain>
  for (const cmd of ["cargo +nightly clean", "cargo +stable-2024-01-01 clean", "cargo +beta clean"]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }
  assert.equal((analyzeShellCommand("cargo +nightly test") as { commandClass: string }).commandClass, "execute");
  assert.equal((analyzeShellCommand("cargo +nightly metadata") as { commandClass: string }).commandClass, "inspect");

  // 2. Gradle subproject tasks with colons
  for (const cmd of [
    "gradle :clean",
    "gradle :app:clean",
    "gradle :core:service:cleanTest",
    "gradle app:clean",
    "gradlew :app:clean",
  ]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }
  assert.equal((analyzeShellCommand("gradle :app:dependencies") as { commandClass: string }).commandClass, "inspect");

  // 3. Maven fully qualified plugin goals
  for (const cmd of [
    "mvn org.apache.maven.plugins:maven-clean-plugin:clean",
    "mvn clean:clean",
    "mvn clean:clean compile",
  ]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }

  // 4. Make clean variants
  for (const cmd of ["make clean_all", "make cleanall", "make core-clean", "make sub_clean"]) {
    const analysis = analyzeShellCommand(cmd) as { commandClass: string; effects: readonly string[] };
    assert.equal(analysis.commandClass, "destroy", cmd);
    assert.deepEqual(analysis.effects, ["delete"], cmd);
    assert.equal(hardBoundaryOf(cmd), true, cmd);
  }

  // 5. Javac option values (17, UTF-8) are not mistaken for source files
  const javacOptionsCmd = complete("javac -source 17 -target 17 --release 17 -encoding UTF-8 src/Main.java");
  assert.equal(javacOptionsCmd.commandClass, "execute");
  assert.deepEqual(javacOptionsCmd.paths, [{ text: "src/Main.java", role: "source" }]);

  // 6. Unknown options fail-closed to opaque in inspect commands
  const opaqueCargo = analyzeShellCommand("cargo metadata --unknown-arg");
  assert.equal((opaqueCargo as { semantic?: { opaquePathAccess?: boolean } }).semantic?.opaquePathAccess, true);

  const opaqueGo = analyzeShellCommand("go list --unknown-arg");
  assert.equal((opaqueGo as { semantic?: { opaquePathAccess?: boolean } }).semantic?.opaquePathAccess, true);

  const opaqueMvn = analyzeShellCommand("mvn dependency:tree --unknown-arg");
  assert.equal((opaqueMvn as { semantic?: { opaquePathAccess?: boolean } }).semantic?.opaquePathAccess, true);

  // 7. Go extracts explicit .go files as source paths
  const goRunCmd = complete("go run /tmp/main.go");
  assert.equal(goRunCmd.commandClass, "execute");
  assert.deepEqual(goRunCmd.paths, [{ text: "/tmp/main.go", role: "source" }]);

  // 8. Javac @argfile extracts argument file as source path
  const javacArgfile = complete("javac @sources.txt");
  assert.equal(javacArgfile.commandClass, "execute");
  assert.deepEqual(javacArgfile.paths, [{ text: "sources.txt", role: "source" }]);

  // 9. Maven attached options (-fsub/pom.xml)
  const mvnAttached = complete("mvn -fsub/pom.xml compile");
  assert.deepEqual(mvnAttached.paths, [{ text: "sub/pom.xml", role: "source" }]);

  // 10. Gradle init script (-I /tmp/init.gradle)
  const gradleInit = complete("gradle -I /tmp/init.gradle build");
  assert.deepEqual(gradleInit.paths, [{ text: "/tmp/init.gradle", role: "source" }]);

  // 11. Cargo search is inspect
  assert.equal((analyzeShellCommand("cargo search serde") as { commandClass: string }).commandClass, "inspect");
});




