import assert from "node:assert/strict";
import test from "node:test";
import {
  compileShell,
  isShellReject,
} from "../../../../src/access-gate/access-decision/core/index";
import { shellCompilationFacts } from "../../../../src/access-gate/access-decision/core/shell-compile";

const bashContract = {
  source: "bash-manual",
  referenceStatus: "independently-observed",
} as const;
const policyContract = {
  source: "new-policy",
  referenceStatus: "newly-adopted",
} as const;

const request = {
  surface: "bash",
  arguments: { command: "cat README.md" },
  cwd: "/workspace/project",
  hasUI: false,
} as const;

test("a supported shell request produces one opaque complete compilation", () => {
  const compilation = compileShell(request);

  assert.equal(isShellReject(compilation), false);
  assert.equal(Object.isFrozen(compilation), true);
  assert.equal(bashContract.source, "bash-manual");
  assert.deepEqual(Object.keys(compilation), []);
});

test("shell syntax that cannot be evaluated safely is a closed rejection", () => {
  const result = compileShell({
    ...request,
    arguments: { command: "cat \"$(pwd)/README.md\"" },
  });

  assert.deepEqual(result, {
    kind: "reject",
    code: "dynamic-value",
    anchor: { start: 4, end: 22 },
    resourceClass: "syntax",
  });
  assert.equal(isShellReject(result), true);
  assert.equal(bashContract.referenceStatus, "independently-observed");
});

test("backslash-newline continuation fails closed instead of changing a path", () => {
  const result = compileShell({
    ...request,
    arguments: { command: ["cat /etc/pass\\", "passwd"].join("\n") },
  });

  if (!isShellReject(result)) assert.fail("expected line continuation rejection");
  assert.equal(result.code, "unsupported-syntax");
});

test("brace grouping fails closed before nested commands reach policy", () => {
  const result = compileShell({
    ...request,
    arguments: { command: "{ rm /etc/passwd; }" },
  });

  if (!isShellReject(result)) assert.fail("expected brace grouping rejection");
  assert.equal(result.code, "unsupported-syntax");
});

test("Bash process substitution fails closed before the outer command is admitted", () => {
  const result = compileShell({
    ...request,
    arguments: { command: "cat <(rm -rf /)" },
  });

  assert.deepEqual(result, {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 5, end: 8 },
    resourceClass: "syntax",
  });
});

test("read-write redirection is modeled on the write side while clobber remains unsupported", () => {
  const result = compileShell({ ...request, arguments: { command: "printf x <> .secrets/file" } });
  assert.equal(isShellReject(result), false);

  const fdResult = compileShell({ ...request, arguments: { command: "printf x 2<> .secrets/file" } });
  assert.equal(isShellReject(fdResult), false);

  const clobber = compileShell({ ...request, arguments: { command: "printf x >| output" } });
  if (!isShellReject(clobber)) assert.fail("expected rejection for >|");
  assert.equal(clobber.code, "unsupported-syntax");
});

test("unsupported shell operators fail closed with a source anchor", () => {
  assert.deepEqual(compileShell({
    ...request,
    arguments: { command: "cat README.md | head" },
  }), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 14, end: 15 },
    resourceClass: "syntax",
  });
  assert.equal(bashContract.source, "bash-manual");
});

test("control operators are recognized even without surrounding whitespace", () => {
  assert.deepEqual(compileShell({
    ...request,
    arguments: { command: "cat README.md|head" },
  }), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 13, end: 14 },
    resourceClass: "syntax",
  });
});

test("Git repository locations resolve against the command cwd at their token position", () => {
  const compilation = compileShell({
    ...request,
    arguments: { command: "git -C a --git-dir=.git -C b status" },
  });
  if (isShellReject(compilation)) assert.fail("expected command-local Git locations to compile");

  assert.deepEqual(shellCompilationFacts(compilation)?.resolvedPaths[0]?.map((path) => path.candidate), [
    "/workspace/project/a/b",
    "/workspace/project/a",
    "/workspace/project/a/.git",
    "/workspace/project/a/b",
  ]);
});

test("Git command-local cwd values reject dynamic forms", () => {
  const dynamic = compileShell({ ...request, arguments: { command: "git -C \"$DIR\" status" } });
  if (!isShellReject(dynamic)) assert.fail("expected dynamic -C value to fail closed");
  assert.equal(dynamic.code, "dynamic-value");
});

test("additional file and execution-valued options fail closed", () => {
  for (const command of [
    "touch --reference=/etc/passwd output",
    "rg --ignore-file=/etc/passwd pattern",
    "rg --pre=/bin/rm README.md",
    "rg -g 'secret/**' pattern",
    "rg --glob='secret/**' pattern",
    "env PATH=/tmp cat README.md",
    "env LD_PRELOAD=/tmp/hook.so cat README.md",
    "BASH_ENV+=.evil bash",
    "/usr/bin/env rm /etc/passwd",
  ]) {
    const result = compileShell({ ...request, arguments: { command } });
    if (!isShellReject(result)) assert.fail(`expected rejection for ${command}`);
    assert.equal(result.code, "unsupported-syntax", command);
  }
});

test("script-taking interpreters fail closed before nested commands execute", () => {
  for (const command of [
    "bash -c 'rm /etc/passwd'",
    "bash -xc 'rm /etc/passwd'",
    "sh -c 'rm /etc/passwd'",
    "sh -xc 'rm /etc/passwd'",
    "python -c 'rm /etc/passwd'",
    "node -e 'rm /etc/passwd'",
    "node -p \"require('fs').readFileSync('/etc/passwd')\"",
    "node --print \"require('fs').readFileSync('/etc/passwd')\"",
    "node --require /etc/passwd script.js",
    "bash -o vi /etc/passwd",
    "python -W ignore /etc/passwd",
    "node --conditions development /etc/passwd",
    "tsx -e 'rm -rf /'",
    "ruby -e 'File.read(\"/etc/passwd\")'",
    "perl -e 'open(F, \"/etc/passwd\")'",
  ]) {
    const result = compileShell({ ...request, arguments: { command } });
    if (!isShellReject(result)) assert.fail(`expected rejection for ${command}`);
    assert.equal(result.code, "security-boundary", command);
  }
});

test("interpreter script operands remain visible to path admission", () => {
  const result = compileShell({ ...request, arguments: { command: "bash -- /etc/passwd" } });
  assert.equal(isShellReject(result), false);
});

test("npx tsx script operands remain visible to path admission", () => {
  const result = compileShell({ ...request, arguments: { command: "npx tsx -- /etc/passwd" } });
  assert.equal(isShellReject(result), false);
});

test("unmodeled file-valued options fail closed instead of hiding paths", () => {
  for (const command of [
    "grep --file=/etc/passwd pattern",
    "grep --file /etc/passwd pattern",
    "grep -f/etc/passwd pattern",
    "grep -Ef/etc/passwd pattern",
    "cp -at/etc input",
    "touch -ar/etc/passwd output",
    "cat --files0-from=/etc/passwd",
    "cat --files0-from /etc/passwd",
    "rg --file=/etc/passwd pattern",
    "rg --file /etc/passwd pattern",
    "rg -ePAT /etc/passwd",
    "rg -e PAT /etc/passwd",
    "rg -f/etc/passwd pattern",
    "rg --files-from /workspace/project/list pattern",
    "rg --files-from=/workspace/project/list pattern",
    "find -files0-from /workspace/project/list",
    "find -files0-from=/workspace/project/list",
    "rg --follow pattern /workspace/project",
    "rg -L pattern /workspace/project",
    "cp -L source destination",
    "cp --dereference source destination",
    "ls -LR /workspace/project",
    "ls -R --dereference /workspace/project",
    "grep -R pattern /workspace/project",
    "find -L /workspace/project",
    "find -name marker",
    "find . -name marker",
    "rg --files /etc/passwd",
    "grep --exclude-from=/etc/passwd pattern",
    "grep -ePAT /etc/passwd",
    "grep --regexp=PAT /etc/passwd",
    "cp --target-directory=/etc input",
    "cp --target-directory /etc input",
    "cp -t/etc input",
  ]) {
    const result = compileShell({ ...request, arguments: { command } });
    if (!isShellReject(result)) assert.fail(`expected rejection for ${command}`);
    assert.equal(result.code, "unsupported-syntax", command);
  }
});

test("rg value options consume their operands before path extraction", () => {
  for (const command of [
    "rg --max-columns 100 pattern /workspace/project",
    "rg --max-columns=100 pattern /workspace/project",
    "rg -M100 pattern /workspace/project",
    "rg -M 100 pattern /workspace/project",
    "rg --type-not generated pattern /workspace/project",
    "rg -T generated pattern /workspace/project",
    "rg --threads 2 pattern /workspace/project",
    "rg -j2 pattern /workspace/project",
    "rg --engine pcre2 pattern /workspace/project",
    "rg -r replacement pattern /workspace/project",
  ]) {
    const result = compileShell({ ...request, arguments: { command } });
    assert.equal(isShellReject(result), false, command);
  }
});

test("find action options fail closed before nested commands execute", () => {
  for (const command of ["find . -exec rm /tmp/x \\;", "find . -delete"]) {
    const result = compileShell({ ...request, arguments: { command } });
    if (!isShellReject(result)) assert.fail(`expected rejection for ${command}`);
    assert.equal(result.code, "security-boundary", command);
  }
});

test("unsupported compound keywords fail closed before nested commands execute", () => {
  const result = compileShell({
    ...request,
    arguments: { command: "for x in a; do rm /etc/passwd; done" },
  });

  if (!isShellReject(result)) assert.fail("expected compound keyword rejection");
  assert.equal(result.code, "unsupported-syntax");
});

test("unmodeled command prefixes fail closed before nested commands execute", () => {
  for (const command of [
    "X=1 cd /tmp; cat secret",
    "builtin cd /tmp; cat secret",
    "time rm /etc/passwd",
    "! rm /etc/passwd",
    "coproc rm /etc/passwd",
    "command -p rm /etc/passwd",
    "exec -a x rm /etc/passwd",
    "timeout -s KILL 1 rm /etc/passwd",
    "env -S \"rm /etc/passwd\"",
    "nohup -- rm /etc/passwd",
    "timeout 1 -- rm /etc/passwd",
    "timeout 1 --preserve-status /bin/cat /etc/passwd",
    "timeout 1 --signal=KILL /bin/cat /etc/passwd",
    "timeout 1 -k 2 /bin/cat /etc/passwd",
  ]) {
    const result = compileShell({ ...request, arguments: { command } });
    if (!isShellReject(result)) assert.fail(`expected rejection for ${command}`);
    assert.equal(result.code, "unsupported-syntax", command);
  }
});

test("unsupported cd forms fail closed instead of inventing a cwd", () => {
  for (const command of ["cd", "cd -", "cd -- /tmp", "cd >out /tmp", "cd ~root", "command cd /tmp"]) {
    const result = compileShell({ ...request, arguments: { command } });
    if (!isShellReject(result)) assert.fail(`expected rejection for ${command}`);
    assert.equal(result.code, "unsupported-syntax", command);
  }
});

test("a static evaluation boundary is rejected before any policy decision", () => {
  assert.deepEqual(compileShell({
    ...request,
    arguments: { command: "eval cat README.md" },
  }), {
    kind: "reject",
    code: "security-boundary",
    anchor: { start: 0, end: 4 },
    resourceClass: "security",
  });
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("an unquoted glob is rejected instead of being treated as one literal path", () => {
  assert.deepEqual(compileShell({
    ...request,
    arguments: { command: "cat *.md" },
  }), {
    kind: "reject",
    code: "dynamic-value",
    anchor: { start: 4, end: 8 },
    resourceClass: "syntax",
  });
  assert.equal(bashContract.referenceStatus, "independently-observed");
});

test("a newline that separates commands is rejected before semantic classification", () => {
  assert.deepEqual(compileShell({
    ...request,
    arguments: { command: "cat README.md\nrm result.txt" },
  }), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 13, end: 14 },
    resourceClass: "syntax",
  });
  assert.equal(bashContract.source, "bash-manual");
});

test("a leading command-separating newline is not silently discarded", () => {
  assert.deepEqual(compileShell({
    ...request,
    arguments: { command: "\ncat README.md" },
  }), {
    kind: "reject",
    code: "unsupported-syntax",
    anchor: { start: 0, end: 1 },
    resourceClass: "syntax",
  });
  assert.equal(bashContract.referenceStatus, "independently-observed");
});

test("Shell host paths are included in the input budget", () => {
  const result = compileShell({
    ...request,
    cwd: `/${"x".repeat(16_384)}`,
  });
  assert.deepEqual(result, {
    kind: "reject",
    code: "resource-limit",
    anchor: { start: 0, end: 13 },
    resourceClass: "input",
  });
});

test("a Shell command containing NUL is rejected as invalid input", () => {
  const command = "cat safe.txt\u0000rm -rf /";
  assert.deepEqual(compileShell({ ...request, arguments: { command } }), {
    kind: "reject",
    code: "invalid-request",
    anchor: { start: 0, end: 0 },
    resourceClass: "input",
  });
});

test("a shell command beyond the byte budget is rejected before word materialization", () => {
  const command = `printf ${"x".repeat(16_385)}`;
  assert.deepEqual(compileShell({ ...request, arguments: { command } }), {
    kind: "reject",
    code: "resource-limit",
    anchor: { start: 0, end: command.length },
    resourceClass: "input",
  });
});

test("a bounded and-or flow compiles as one opaque canonical result", () => {
  const compilation = compileShell({
    ...request,
    arguments: { command: "false && cd /tmp || cat README.md" },
  });

  assert.equal(isShellReject(compilation), false);
  assert.equal(Object.isFrozen(compilation), true);
  assert.deepEqual(Object.keys(compilation), []);
});

test("a flow above the command budget is rejected before semantic expansion", () => {
  const command = Array.from({ length: 129 }, () => "true").join(";");
  assert.deepEqual(compileShell({ ...request, arguments: { command } }), {
    kind: "reject",
    code: "resource-limit",
    anchor: { start: 0, end: command.length },
    resourceClass: "input",
  });
});

test("a flow whose CWD candidate set exceeds its bound is rejected", () => {
  const command = Array.from({ length: 12 }, (_, index) => `cd dir-${index}`).join(";");
  assert.deepEqual(compileShell({ ...request, arguments: { command } }), {
    kind: "reject",
    code: "resource-limit",
    anchor: { start: 0, end: command.length },
    resourceClass: "input",
  });
});
