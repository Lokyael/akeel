import assert from "node:assert/strict";
import test from "node:test";
import {
  compileShell,
  createCredentialBoundary,
  evaluateShellAdmission as evaluateShellAdmissionCore,
  freezeShellPolicySnapshot,
  projectShellAdmission,
  shellAdmissionHitsCredentialBoundary,
} from "../../../../src/access-gate/access-decision/core/index";

function evaluateShellAdmission(admissionValue: unknown, policyValue: Parameters<typeof evaluateShellAdmissionCore>[1]) {
  return evaluateShellAdmissionCore(admissionValue, policyValue);
}

const policyContract = {
  source: "new-policy",
  referenceStatus: "newly-adopted",
} as const;

const policy = {
  read: "allow",
  write: "allow",
  inspect: "allow",
  modify: "ask",
  execute: "deny",
  destroy: "allow",
  unknown: "deny",
  blockedPaths: ["/etc/passwd"],
} as const;

function admission(command: string, hasUI = false) {
  const compilation = compileShell({
    surface: "bash",
    arguments: { command },
    cwd: "/workspace/project",
    hasUI,
  });
  const result = projectShellAdmission(compilation);
  assert.ok(result);
  return result;
}

test("Shell Policy Snapshot requires explicit read and write modes", () => {
  assert.throws(
    () => freezeShellPolicySnapshot({ ...policy, read: undefined, write: undefined } as never),
    /invalid shell policy snapshot/,
  );
});

test("Shell Policy Snapshot is deeply immutable and has a closed field set", () => {
  const snapshot = freezeShellPolicySnapshot(policy);

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.blockedPaths), true);
  assert.deepEqual(snapshot.blockedPaths, ["/etc/passwd"]);
  assert.equal(policyContract.referenceStatus, "newly-adopted");
  assert.throws(
    () => freezeShellPolicySnapshot({ ...policy, extra: "ignored" } as never),
    /invalid shell policy snapshot/,
  );
});

test("recursive reads account for blocked descendants", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, modify: "allow", blockedRoots: ["/workspace/project/.git"] });

  for (const command of [
    "rg --hidden pattern",
    "find /workspace/project",
    "ls -R /workspace/project",
    "grep -r pattern /workspace/project",
    "grep --recursive pattern /workspace/project",
    "grep --directories=recurse pattern /workspace/project",
    "grep -d recurse pattern /workspace/project",
    "grep --directories recurse pattern /workspace/project",
    "cp -r /workspace/project /tmp/out",
    "mv -r /workspace/project /tmp/out",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), restricted), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("recursive Shell search remains policy-governed without a direct credential path", () => {
  assert.deepEqual(evaluateShellAdmission(
    admission("grep -r pattern /__test-agent-dir__"),
    freezeShellPolicySnapshot({ ...policy, read: "allow", inspect: "allow" }),
  ), {
    kind: "allow",
  });
});

test("credential artifact paths are identified before Shell policy evaluation", () => {
  assert.equal(shellAdmissionHitsCredentialBoundary(
    admission("cat /__test-agent-dir__/auth.json.bak"),
    createCredentialBoundary(["/__test-agent-dir__"]),
  ), true);
});

test("path-form destructive executables retain their command and path semantics", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, blockedPaths: ["/etc/passwd"] });

  assert.deepEqual(evaluateShellAdmission(admission("/bin/rm /etc/passwd"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/tmp/cat README.md"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/tmp/cat README.md"), freezeShellPolicySnapshot({
    ...policy,
    execute: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: [],
  })), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("unknown Git commands remain hard-boundary without a path policy", () => {
  assert.deepEqual(evaluateShellAdmission(admission("git mystery"), freezeShellPolicySnapshot({
    ...policy,
    unknown: "allow",
    blockedPaths: [],
    allowedRoots: [],
    blockedRoots: [],
  })), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("path-form Git helper boundaries cannot be widened by execute policy", () => {
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/git status"), freezeShellPolicySnapshot({
    ...policy,
    execute: "allow",
    blockedPaths: [],
    allowedRoots: [],
    blockedRoots: [],
  })), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("a lone dash remains a positional path or file operand", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, blockedPaths: ["/workspace/project/-", "/etc/passwd"] });

  for (const command of ["touch -", "cp source -", "grep - /etc/passwd", "rg - /etc/passwd"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), restricted), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("operands after -- remain visible to path policy", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, blockedPaths: ["/workspace/project/-secret"] });

  assert.deepEqual(evaluateShellAdmission(admission("cat -- -secret"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("implicit CWD reads are included in path boundary checks", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, blockedRoots: ["/workspace/project"] });

  assert.deepEqual(evaluateShellAdmission(admission("ls"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("find"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
  const exactCwd = freezeShellPolicySnapshot({ ...policy, blockedPaths: ["/workspace/project"] });
  for (const command of ["ls 1>/tmp/out", "ls 2>/tmp/out", "ls 0</tmp/in"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), exactCwd), {
      kind: "deny",
      code: "hard-boundary",
    });
  }
  assert.deepEqual(evaluateShellAdmission(admission("ls > /tmp/out"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("copy and move source operands consume read policy", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, read: "deny", write: "allow", modify: "allow" });

  assert.deepEqual(evaluateShellAdmission(admission("cp source destination"), restricted), {
    kind: "deny",
    code: "policy-denied",
  });
  assert.deepEqual(evaluateShellAdmission(admission("mv source destination"), restricted), {
    kind: "deny",
    code: "policy-denied",
  });
});

test("Shell path effects obey the corresponding read and write policy modes", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, read: "deny", write: "deny" });

  assert.deepEqual(evaluateShellAdmission(admission("cat input.txt"), restricted), {
    kind: "deny",
    code: "policy-denied",
  });
  assert.deepEqual(evaluateShellAdmission(admission("printf x > output.txt"), restricted), {
    kind: "deny",
    code: "policy-denied",
  });
});

test("read-write redirection follows the write-side policy contract", () => {
  const writeAllowed = freezeShellPolicySnapshot({ ...policy, read: "deny", write: "allow" });

  assert.deepEqual(evaluateShellAdmission(admission("printf x <> output.txt"), writeAllowed), { kind: "allow" });
});

test("redirection uncertainty retains a destructive fallback", () => {
  assert.deepEqual(evaluateShellAdmission(admission("true < missing || rm -rf /tmp/marker"), freezeShellPolicySnapshot(policy)), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("a hard path boundary wins over an allow policy", () => {
  assert.deepEqual(
    evaluateShellAdmission(admission("cat /etc/passwd"), freezeShellPolicySnapshot(policy)),
    { kind: "deny", code: "hard-boundary" },
  );
  assert.equal(policyContract.source, "new-policy");
});

test("a destructive command remains a hard boundary even when its class is allowed", () => {
  assert.deepEqual(
    evaluateShellAdmission(admission("rm /tmp/output"), freezeShellPolicySnapshot(policy)),
    { kind: "deny", code: "hard-boundary" },
  );
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("an ask policy without UI cannot execute", () => {
  assert.deepEqual(
    evaluateShellAdmission(
      admission("mkdir generated", false),
      freezeShellPolicySnapshot({ ...policy, modify: "ask" }),
    ),
    { kind: "deny", code: "no-ui" },
  );
  assert.equal(policyContract.source, "new-policy");
});

test("an ask policy with UI returns a non-executing ask", () => {
  assert.deepEqual(
    evaluateShellAdmission(
      admission("mkdir generated", true),
      freezeShellPolicySnapshot({ ...policy, modify: "ask" }),
    ),
    { kind: "ask", executed: false },
  );
  assert.equal(policyContract.referenceStatus, "newly-adopted");
});

test("a later hard boundary wins over an earlier policy denial", () => {
  assert.deepEqual(
    evaluateShellAdmission(
      admission("mkdir generated; cat /etc/passwd", true),
      freezeShellPolicySnapshot({ ...policy, modify: "deny" }),
    ),
    { kind: "deny", code: "hard-boundary" },
  );
});

test("a later policy denial wins over earlier asks as one aggregate decision", () => {
  assert.deepEqual(
    evaluateShellAdmission(
      admission("mkdir generated; mystery input", true),
      freezeShellPolicySnapshot({ ...policy, modify: "ask", unknown: "deny", blockedPaths: [] }),
    ),
    { kind: "deny", code: "policy-denied" },
  );
});

test("widening policy modes cannot widen a hard path boundary", () => {
  const narrow = evaluateShellAdmission(
    admission("cat /etc/passwd"),
    freezeShellPolicySnapshot({ ...policy, inspect: "deny" }),
  );
  const wide = evaluateShellAdmission(
    admission("cat /etc/passwd"),
    freezeShellPolicySnapshot({ ...policy, inspect: "allow" }),
  );

  assert.deepEqual(narrow, { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(wide, narrow);
});

test("execute and unknown classes use their own closed policy modes", () => {
  assert.deepEqual(
    evaluateShellAdmission(admission("node script.js"), freezeShellPolicySnapshot({ ...policy, execute: "ask", blockedPaths: [] })),
    { kind: "deny", code: "no-ui" },
  );
  assert.deepEqual(
    evaluateShellAdmission(admission("mystery input"), freezeShellPolicySnapshot({ ...policy, unknown: "allow", blockedPaths: [] })),
    { kind: "allow" },
  );
});

test("od is governed by read policy instead of unknown policy", () => {
  assert.deepEqual(
    evaluateShellAdmission(admission("od /etc/passwd"), freezeShellPolicySnapshot({
      ...policy,
      read: "deny",
      unknown: "allow",
      blockedPaths: [],
    })),
    { kind: "deny", code: "policy-denied" },
  );
});

test("uv run is governed by execute policy instead of unknown policy", () => {
  assert.deepEqual(
    evaluateShellAdmission(admission("uv run pytest tests/test_app.py"), freezeShellPolicySnapshot({
      ...policy,
      execute: "deny",
      unknown: "allow",
      blockedPaths: [],
    })),
    { kind: "deny", code: "policy-denied" },
  );

  const restricted = freezeShellPolicySnapshot({ ...policy, execute: "allow", blockedPaths: ["/etc/passwd"] });
  assert.deepEqual(evaluateShellAdmission(admission("uv run cat /etc/passwd"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("interpreter scripts cannot bypass a blocked path", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, execute: "allow", blockedPaths: ["/etc/passwd"] });

  assert.deepEqual(evaluateShellAdmission(admission("bash -- /etc/passwd"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("unmodeled command paths cannot bypass configured path boundaries", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, execute: "allow", unknown: "allow" });

  for (const command of ["tee /etc/passwd", "dd if=/etc/passwd of=/tmp/out", "/usr/bin/tee /etc/passwd"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), restricted), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("an allowed project or staging root admits candidates within that root", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project", "/tmp/akeel"],
  });

  assert.deepEqual(evaluateShellAdmission(admission("cat /workspace/project/README.md"), scoped), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("mkdir /tmp/akeel/output", true), scoped), { kind: "allow" });
});

test("a path outside every allowed root is a hard boundary", () => {
  const scoped = freezeShellPolicySnapshot({ ...policy, allowedRoots: ["/workspace/project"] });

  assert.deepEqual(evaluateShellAdmission(admission("cat /workspace/projectile/README.md"), scoped), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("a blocked root wins over an otherwise allowed root", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
  });

  assert.deepEqual(evaluateShellAdmission(admission("cat /workspace/project/.git/config"), scoped), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("recursive grep without an explicit path checks the current directory", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
  });

  for (const command of ["grep -r pattern", "grep -r pattern > /workspace/project/result"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git helper-capable commands remain hard-boundary under develop", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of ["git status", "git diff -- src/app.ts", "git commit -m message", "git add src/app.ts", "git push file:///workspace/project/remote main", "git config --list", "git grep --textconv pattern", "git help status", "git rm file.txt"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git repository scope remains subject to blocked descendants", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
  });

  assert.deepEqual(evaluateShellAdmission(admission("git status"), scoped), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Uncanonicalized Git path bases fail closed without a configured path boundary", () => {
  const unrestricted = freezeShellPolicySnapshot({ ...policy, blockedPaths: [], allowedRoots: [], blockedRoots: [] });

  for (const command of [
    "git -C",
    "git fetch file:///workspace/project/remote --depth",
    "git init --template",
    "git archive --output",
    "git archive --remote=https://host/repo HEAD",
    "git push --receive-pack=/tmp/evil origin",
    "git push --exec=/tmp/evil origin",
    "git clone --depth= https://host/repo /workspace/project/clone",
    "git submodule add --reference",
    "git -c core.hooksPath=/tmp/hooks status",
    "git -ccore.hooksPath=/tmp/hooks status",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), unrestricted), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git output options with equals forms remain bounded when their paths are allowed", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project", "/tmp"],
    blockedRoots: [],
  });

  assert.deepEqual(evaluateShellAdmission(admission("git archive --output=/tmp/out.tar HEAD"), scoped), { kind: "allow" });
});

test("Unknown Git global options remain hard boundaries without path policy", () => {
  const unrestricted = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    execute: "allow",
    unknown: "allow",
    blockedPaths: [],
    allowedRoots: [],
    blockedRoots: [],
  });

  assert.deepEqual(evaluateShellAdmission(
    admission("git --exec-path=/tmp clone https://host/repo /workspace/project/clone"),
    unrestricted,
  ), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Git helper boundaries win over canonical command-local repository paths", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "git --git-dir .git status",
    "git --git-dir=/workspace/project/.git status",
    "git --work-tree subdir status",
    "git -C subdir --git-dir=../.git status",
    "git -C subdir --work-tree=. status",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git repository locations retain path boundaries", () => {
  const blocked = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
  });
  assert.deepEqual(evaluateShellAdmission(admission("git --git-dir .git status"), blocked), {
    kind: "deny",
    code: "hard-boundary",
  });

  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });
  for (const command of ["git --git-dir=/tmp/repo status", "git --work-tree=/tmp status"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git helper boundaries win over command-local paths", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    allowedRoots: ["/workspace/project/subdir"],
    blockedRoots: [],
  });

  for (const command of ["git -C subdir status", "git -Csubdir diff -- src/app.ts", "git -C subdir -C nested status"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git command-local paths retain blocked descendant boundaries", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/subdir/.git"],
  });

  assert.deepEqual(evaluateShellAdmission(admission("git -C subdir status"), scoped), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Git command-local paths outside the allowed project remain hard boundaries", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "git -C /tmp status",
    "git -C /workspace/project/subdir -C /etc status",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git helper and hook boundaries reject local file transports", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "git fetch file:///workspace/project/remote",
    "git pull file://localhost/workspace/project/remote",
    "git push file:///workspace/project/remote main",
    "git -C subdir fetch ./remote",
    "git submodule add file:///workspace/project/remote vendor/submodule",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git local file transports outside scope or with a remote host remain hard boundaries", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "git fetch file:///etc/repo",
    "git fetch https://host/repo",
    "git fetch FILE:///etc/repo",
    "git fetch file:///workspace/project/remote%00evil",
    "git pull file://localhost/etc/repo",
    "git pull https://host/repo",
    "git push file://remote-host/workspace/project/remote main",
    "git push ssh://host/repo main",
    "git --git-dir=file://remote-host/workspace/project/.git status",
    "git fetch origin",
    "git ls-remote https://host/repo",
    "git submodule add file://remote-host/workspace/project/remote vendor/submodule",
    "git submodule add origin vendor/submodule",
    "git submodule add https://host/repo vendor/submodule",
    "git clone --recurse-submodules https://host/repo /workspace/project/clone",
    "git clone --recursive=vendor https://host/repo /workspace/project/clone",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git file and repository targets cannot escape the allowed project", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "git diff --output=/tmp/out HEAD",
    "git diff -- '*.txt'",
    "git add ':(exclude)secret.txt'",
    "git add -- ':!secret.txt'",
    "git add -- ':/root/path'",
    "git add --pathspec-from-file=/tmp/spec",
    "git show --output=/tmp/out HEAD",
    "git commit --file=/etc/msg",
    "git init /tmp/repo",
    "git clone /etc/repo /workspace/project/clone",
    "git clone https://host/repo /workspace/project/clone",
    "git clone host:repo /workspace/project/clone",
    "git clone file:///etc/repo /workspace/project/clone",
    "git clone FILE:///etc/repo /workspace/project/clone",
    "git ls-remote file:///etc/repo",
    "git ls-remote origin",
    "git remote show origin",
    "git remote update",
    "git fetch file:///etc/repo",
    "git pull file:///etc/repo",
    "git push file:///etc/repo",
    "git fetch /etc/repo",
    "git pull ../etc/repo",
    "git push -- /etc/repo",
    "git fetch --upload-pack=/tmp/evil origin",
    "git fetch origin",
    "git pull origin",
    "git push origin main",
    "git submodule update",
    "git submodule foreach \"rm -rf /etc\"",
    "git init --template=/etc",
    "git init --separate-git-dir=/etc/repo.git",
    "git submodule add /etc/repo vendor/repo",
    "git submodule add file:///etc/repo vendor/repo",
    "git submodule add --reference=/etc/repo file:///workspace/project/remote vendor/repo",
    "git --work-tree=/workspace/project ls-remote file:///etc/repo",
    "git clone --separate-git-dir=/tmp/repo.git https://host/repo.git /workspace/project/clone",
    "git clone --upload-pack=/tmp/evil https://host/repo.git /workspace/project/clone",
    "git clone --config core.hooksPath=/tmp/hooks https://host/repo.git /workspace/project/clone",
    "git clone --output=/tmp/out https://host/repo.git /workspace/project/clone",
    "git clone https://host/repo.git /workspace/project/clone extra",
    "git -c diff.external=/tmp/evil diff",
    "git config --global user.name attacker",
    "git config --system user.name attacker",
    "git config --file=/etc/gitconfig user.name attacker",
    "git config -f /etc/gitconfig user.name attacker",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Package-manager path options and unknown options participate in the same boundary", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "npm view --prefix /tmp/deps react",
    "npm list --global",
    "npm view --global=/tmp react",
    "npm view --made-up react",
    "npm --workspace=/tmp list",
    "uv help --made-up",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Default Ruff scopes and cache cleanup are checked as unsafe CWD access", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
  });

  for (const command of ["ruff format --check", "ruff check --fix", "ruff clean"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("unknown Git commands and delegated runners remain hard-boundary under develop", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    execute: "allow",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of ["git mystery", "python script.py", "node script.js", "pytest tests", "uv run pytest tests", "npm run test", "npx vite"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("recursive paths cannot traverse a blocked component before reaching an allowed descendant", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
  });

  assert.deepEqual(evaluateShellAdmission(admission("find /workspace/project/.git/../src"), scoped), {
    kind: "deny",
    code: "hard-boundary",
  });
});
