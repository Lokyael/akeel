import assert from "node:assert/strict";
import test from "node:test";
import {
  compileShell,
  evaluateShellAdmission,
  freezeShellPolicySnapshot,
  projectShellAdmission,
} from "../../../../src/access-gate/access-decision/core/index";

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

test("path-form destructive executables retain their command and path semantics", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, blockedPaths: ["/etc/passwd"] });

  assert.deepEqual(evaluateShellAdmission(admission("/bin/rm /etc/passwd"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/tmp/cat README.md"), restricted), {
    kind: "deny",
    code: "policy-denied",
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
    evaluateShellAdmission(admission("node script.js"), freezeShellPolicySnapshot({ ...policy, execute: "ask" })),
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
    allowedRoots: ["/workspace/project", "/tmp/pi-work"],
  });

  assert.deepEqual(evaluateShellAdmission(admission("cat /workspace/project/README.md"), scoped), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("mkdir /tmp/pi-work/output", true), scoped), { kind: "allow" });
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

  assert.deepEqual(evaluateShellAdmission(admission("grep -r pattern"), scoped), {
    kind: "deny",
    code: "hard-boundary",
  });
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
