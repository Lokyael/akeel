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
  for (const subcommand of ["add", "commit", "push", "config", "help", "grep", "blame", "gc"]) {
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

test("Git rm is a destructive operation", () => {
  const semantic = analyzeProgramCommand({ executable: "git", arguments: [word("rm", 0), word("file.txt", 3)] });
  assert.ok(semantic);
  assert.equal(semantic.commandClass, "destroy");
  assert.deepEqual(semantic.effects, ["delete"]);
});

test("path-form Git helper boundaries are retained as opaque execution", () => {
  const semantic = analyzeProgramCommand({ executable: "/usr/bin/git", arguments: [word("commit", 0)] });
  assert.ok(semantic);
  assert.equal(semantic.commandClass, "execute");
  assert.equal(semantic.opaque, true);
  assert.equal(semantic.hardBoundary, true);
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

test("Herdr commands map to inspect, execute, and modify semantics with path extraction", () => {
  for (const command of [
    "herdr --version",
    "herdr -V",
    "herdr --help",
    "herdr status",
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
