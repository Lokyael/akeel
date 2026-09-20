import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";
import {
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

const unifiedPolicy = Symbol("unified-policy");
type TestPolicy = Readonly<Record<string, unknown>> & Readonly<{ [unifiedPolicy]: ReturnType<typeof freezeUnifiedPolicySnapshot> }>;
type TestAdmission = Readonly<{ readonly value: NonNullable<ReturnType<typeof projectUnifiedAdmission>>; readonly hasUI: boolean }>;

function freezeShellPolicySnapshot(input: Record<string, unknown>): TestPolicy {
  const allowed = ["read", "write", "inspect", "modify", "execute", "opaque", "destroy", "unknown", "blockedPaths", "allowedRoots", "blockedRoots"];
  const required = ["read", "write", "inspect", "modify", "execute", "destroy", "unknown"];
  if (Reflect.ownKeys(input).some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    required.some((key) => !["allow", "ask", "deny"].includes(input[key] as string))) {
    throw new TypeError("invalid shell policy snapshot");
  }
  const blockedPaths = Object.freeze([...(input.blockedPaths as readonly string[] | undefined ?? [])]);
  const allowedRoots = Object.freeze([...(input.allowedRoots as readonly string[] | undefined ?? [])]);
  const blockedRoots = Object.freeze([...(input.blockedRoots as readonly string[] | undefined ?? [])]);
  let unified: ReturnType<typeof freezeUnifiedPolicySnapshot>;
  try {
    unified = freezeUnifiedPolicySnapshot({
      paths: {
        read: input.read,
        write: input.write,
        edit: "deny",
        list: "deny",
        search: "deny",
        blockedPaths,
        allowedRoots,
        blockedRoots,
      },
      commands: {
        inspect: input.inspect,
        modify: input.modify,
        execute: input.execute,
        opaque: input.opaque ?? "deny",
        destroy: input.destroy,
        unknown: input.unknown,
      },
    });
  } catch {
    throw new TypeError("invalid shell policy snapshot");
  }
  const result = { ...input, blockedPaths, allowedRoots, blockedRoots };
  Object.defineProperty(result, unifiedPolicy, { value: unified, enumerable: false });
  return Object.freeze(result) as unknown as TestPolicy;
}

function evaluateShellAdmission(admissionValue: TestAdmission, policyValue: TestPolicy) {
  const verdict = authorizeAdmission(
    admissionValue.value,
    createMandatoryBoundaries({ credentialRoots: ["/__test-agent-dir__"] }),
    policyValue[unifiedPolicy],
  );
  if (verdict.kind !== "approval-required") return verdict;
  return admissionValue.hasUI ? { kind: "ask", executed: false } as const : { kind: "deny", code: "no-ui" } as const;
}

function createCredentialBoundary(roots: readonly string[]) {
  return createMandatoryBoundaries({ credentialRoots: roots });
}

function shellAdmissionHitsCredentialBoundary(admissionValue: TestAdmission, boundaries: unknown): boolean {
  const allow = freezeUnifiedPolicySnapshot({
    paths: { read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow", allowedRoots: [], blockedRoots: [], blockedPaths: [] },
    commands: { inspect: "allow", modify: "allow", execute: "allow", opaque: "allow", destroy: "allow", unknown: "allow" },
  });
  return authorizeAdmission(admissionValue.value, boundaries, allow).kind === "deny";
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

function admission(command: string, hasUI = false): TestAdmission {
  const compilation = compileManagedCall(
    { surface: "bash", arguments: { command } },
    createCompileEnvironment({ cwd: "/workspace/project", pathEvidence: createLinuxPathEvidence() }),
  );
  const value = projectUnifiedAdmission(compilation);
  assert.ok(value);
  return Object.freeze({ value, hasUI });
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

test("recursive Shell search remains policy-governed outside credential roots", () => {
  assert.deepEqual(evaluateShellAdmission(
    admission("grep -r pattern /workspace/project"),
    freezeShellPolicySnapshot({ ...policy, read: "allow", inspect: "allow" }),
  ), {
    kind: "allow",
  });
});

test("recursive Shell search over a credential root is hard denied", () => {
  assert.deepEqual(evaluateShellAdmission(
    admission("grep -r pattern /__test-agent-dir__"),
    freezeShellPolicySnapshot({ ...policy, read: "allow", inspect: "allow" }),
  ), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("opaque execution follows its independent policy axis", () => {
  const command = admission("pytest tests/");
  assert.deepEqual(evaluateShellAdmission(command, freezeShellPolicySnapshot({ ...policy, execute: "allow", opaque: "deny" })), {
    kind: "deny",
    code: "policy-denied",
  });
  assert.deepEqual(evaluateShellAdmission(admission("pytest tests/", true), freezeShellPolicySnapshot({ ...policy, execute: "allow", opaque: "ask" })), {
    kind: "ask",
    executed: false,
  });
  assert.deepEqual(evaluateShellAdmission(command, freezeShellPolicySnapshot({ ...policy, execute: "allow", opaque: "allow" })), {
    kind: "allow",
  });
});

test("opaque policy does not bypass unknown command policy", () => {
  assert.deepEqual(evaluateShellAdmission(
    admission("mystery-command"),
    freezeShellPolicySnapshot({ ...policy, unknown: "deny", opaque: "allow" }),
  ), { kind: "deny", code: "policy-denied" });
});

test("opaque policy does not bypass hard boundaries", () => {
  assert.deepEqual(evaluateShellAdmission(
    admission("/bin/rm /workspace/project/file"),
    freezeShellPolicySnapshot({ ...policy, destroy: "allow", opaque: "allow" }),
  ), { kind: "deny", code: "hard-boundary" });
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
    code: "policy-denied",
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
  assert.deepEqual(evaluateShellAdmission(admission("/tmp/cat README.md"), freezeShellPolicySnapshot({
    ...policy,
    execute: "allow",
    allowedRoots: ["/workspace/project", "/tmp"],
    blockedRoots: [],
    blockedPaths: [],
  })), {
    kind: "deny",
    code: "policy-denied",
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
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/git push"), freezeShellPolicySnapshot({
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
  assert.deepEqual(evaluateShellAdmission(admission("ln source destination"), restricted), {
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

test("redirection to /dev/null is admitted under review without write policy or path violation", () => {
  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace"],
    blockedRoots: [],
    blockedPaths: [],
  });

  assert.deepEqual(
    evaluateShellAdmission(admission("git status 2>/dev/null"), reviewPolicy),
    { kind: "allow" },
  );
  assert.deepEqual(
    evaluateShellAdmission(admission("printf ok > /dev/null"), reviewPolicy),
    { kind: "allow" },
  );
  assert.deepEqual(
    evaluateShellAdmission(admission("cat < /dev/null"), reviewPolicy),
    { kind: "allow" },
  );
  assert.deepEqual(
    evaluateShellAdmission(admission("printf ok > /dev/sda"), reviewPolicy),
    { kind: "deny", code: "hard-boundary" },
  );
  assert.deepEqual(
    evaluateShellAdmission(admission("cat /dev/null"), reviewPolicy),
    { kind: "deny", code: "hard-boundary" },
  );
});

test("redirection uncertainty retains a destructive fallback", () => {
  assert.deepEqual(evaluateShellAdmission(admission("true < missing || /bin/rm /tmp/marker"), freezeShellPolicySnapshot(policy)), {
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
    evaluateShellAdmission(admission("/bin/rm /tmp/output"), freezeShellPolicySnapshot(policy)),
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
    evaluateShellAdmission(admission("node script.js"), freezeShellPolicySnapshot({ ...policy, execute: "ask", opaque: "allow", blockedPaths: [] })),
    { kind: "deny", code: "no-ui" },
  );
  assert.deepEqual(
    evaluateShellAdmission(admission("mystery input"), freezeShellPolicySnapshot({ ...policy, unknown: "allow", opaque: "allow", blockedPaths: [] })),
    { kind: "allow" },
  );
});

test("optional od operands remain subject to path boundaries", () => {
  assert.deepEqual(evaluateShellAdmission(
    admission("od -w /etc/passwd"),
    freezeShellPolicySnapshot({ ...policy, read: "allow", inspect: "allow", blockedPaths: ["/etc/passwd"] }),
  ), {
    kind: "deny",
    code: "hard-boundary",
  });
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

test("wc, cut, and stat are governed by inspect and read policy instead of unknown policy", () => {
  const allowPolicy = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    inspect: "allow",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedPaths: [],
  });
  assert.deepEqual(evaluateShellAdmission(admission("wc -l /workspace/project/README.md"), allowPolicy), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("cut -d: -f1 /workspace/project/README.md"), allowPolicy), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("stat /workspace/project/README.md"), allowPolicy), { kind: "allow" });

  const denyRead = freezeShellPolicySnapshot({
    ...policy,
    read: "deny",
    inspect: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedPaths: [],
  });
  assert.deepEqual(evaluateShellAdmission(admission("wc -l /workspace/project/README.md"), denyRead), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("cut -d: -f1 /workspace/project/README.md"), denyRead), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("stat /workspace/project/README.md"), denyRead), { kind: "deny", code: "policy-denied" });
});

test("wc, cut, and stat operands remain subject to hard path boundaries", () => {
  const restricted = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    inspect: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
    blockedPaths: ["/workspace/project/secret.txt"],
  });
  assert.deepEqual(evaluateShellAdmission(admission("wc -l /workspace/project/secret.txt"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("cut -f1 /workspace/project/.git/config"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("stat /etc/passwd"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/wc /workspace/project/README.md"), restricted), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/wc /workspace/project/secret.txt"), restricted), { kind: "deny", code: "hard-boundary" });
});

test("diff, file, du, and df are governed by inspect and read policy instead of unknown policy", () => {
  const allowPolicy = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    inspect: "allow",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedPaths: [],
  });
  assert.deepEqual(evaluateShellAdmission(admission("diff /workspace/project/a.txt /workspace/project/b.txt"), allowPolicy), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("file /workspace/project/README.md"), allowPolicy), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("du /workspace/project/a.txt"), allowPolicy), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("df /workspace/project"), allowPolicy), { kind: "allow" });

  const denyRead = freezeShellPolicySnapshot({
    ...policy,
    read: "deny",
    inspect: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedPaths: [],
  });
  assert.deepEqual(evaluateShellAdmission(admission("diff /workspace/project/a.txt /workspace/project/b.txt"), denyRead), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("file /workspace/project/README.md"), denyRead), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("du /workspace/project/a.txt"), denyRead), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("df /workspace/project"), denyRead), { kind: "deny", code: "policy-denied" });
});

test("diff, file, du, and df operands and recursiveness remain subject to hard path boundaries", () => {
  const restricted = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    inspect: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/.git"],
    blockedPaths: ["/workspace/project/secret.txt"],
  });
  assert.deepEqual(evaluateShellAdmission(admission("diff /workspace/project/a.txt /workspace/project/secret.txt"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("file /etc/passwd"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("du /workspace/project"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("diff -r /workspace/project /workspace/project/backup"), restricted), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/diff /workspace/project/a.txt /workspace/project/b.txt"), restricted), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/diff /workspace/project/a.txt /workspace/project/secret.txt"), restricted), { kind: "deny", code: "hard-boundary" });
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

  const restricted = freezeShellPolicySnapshot({ ...policy, execute: "allow", opaque: "allow", blockedPaths: ["/etc/passwd"] });
  assert.deepEqual(evaluateShellAdmission(admission("uv run cat /etc/passwd"), restricted), {
    kind: "allow",
  });
});

test("interpreter scripts cannot bypass a blocked path", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, execute: "allow", blockedPaths: ["/etc/passwd"] });

  assert.deepEqual(evaluateShellAdmission(admission("bash -- /etc/passwd"), restricted), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("unmodeled command paths follow the opaque policy axis", () => {
  const restricted = freezeShellPolicySnapshot({ ...policy, execute: "allow", unknown: "allow" });

  for (const command of ["base64 /etc/passwd", "dd if=/etc/passwd of=/tmp/out", "/usr/bin/base64 /etc/passwd"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), restricted), {
      kind: "deny",
      code: "policy-denied",
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

test("trusted path-form Git mutations retain path and helper boundaries", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/git add .git/hooks/pre-commit"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/bin/git commit --file .git/config"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/git add src/app.ts"), develop), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/git push origin main"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Git inspect commands are admitted under develop and review while helper commands remain hard-boundary", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });
  const review = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "git status",
    "git diff -- src/app.ts",
    "git log",
    "git show",
    "git log --oneline -8 --decorate",
    "git diff --check",
    "git rev-parse --show-toplevel",
    "git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "allow",
    }, command);
    assert.deepEqual(evaluateShellAdmission(admission(command), review), {
      kind: "allow",
    }, command);
  }

  for (const command of ["git commit -m message", "git add src/app.ts"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "allow",
    }, command);
    assert.deepEqual(evaluateShellAdmission(admission(command), review), {
      kind: "deny",
      code: "policy-denied",
    }, command);
  }

  const guided = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "ask",
    execute: "ask",
    opaque: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });
  for (const command of ["git commit -m message", "git add src/app.ts"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command, true), guided), {
      kind: "ask",
      executed: false,
    }, command);
  }

  for (const command of [
    "git commit",
    "git commit -p -m message",
    "git commit -e -m message",
    "git commit -c core.hooksPath=/tmp -m message",
    "git add -p src/app.ts",
    "git add -i",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }

  for (const command of [
    "git push file:///workspace/project/remote main",
    "git config --list",
    "git grep --textconv pattern",
    "git diff --ext-diff",
    "git diff --textconv",
    "git help status",
    "git rm file.txt",
  ]) {
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
    "git --git-dir .git push",
    "git --git-dir=/workspace/project/.git push",
    "git --work-tree subdir push",
    "git -C subdir --git-dir=../.git push",
    "git -C subdir --work-tree=. push",
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

  for (const command of ["git -C subdir push", "git -Csubdir push", "git -C subdir -C nested push"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("Git inspect commands with command-local paths are admitted when within allowed roots", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    allowedRoots: ["/workspace/project/subdir"],
    blockedRoots: [],
  });

  for (const command of ["git -C subdir status", "git -Csubdir diff -- src/app.ts", "git -C subdir -C nested status"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "allow",
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
    "git remote -v",
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

test("Package-manager opaque options follow the opaque policy axis", () => {
  const scoped = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  const expected = new Map([
    ["npm view --prefix /tmp/deps react", "hard-boundary"],
    ["npm list --global", "policy-denied"],
    ["npm view --global=/tmp react", "policy-denied"],
    ["npm view --made-up react", "policy-denied"],
    ["npm --workspace=/tmp list", "hard-boundary"],
    ["uv help --made-up", "policy-denied"],
  ] as const);
  for (const [command, code] of expected) {
    assert.deepEqual(evaluateShellAdmission(admission(command), scoped), {
      kind: "deny",
      code,
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

test("develop may allow delegated runners while unknown commands remain governed", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  assert.deepEqual(evaluateShellAdmission(admission("git mystery"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });
  for (const command of ["python script.py", "node script.js", "pytest tests", "uv run pytest tests", "npm run test", "npx vite"]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "allow",
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

test("which lookup is admitted as bounded inspect under read policy", () => {
  const inspectPolicy = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    unknown: "deny",
    opaque: "deny",
  });
  assert.deepEqual(evaluateShellAdmission(admission("which herdr"), inspectPolicy), {
    kind: "allow",
  });
});

test("herdr commands follow policy classification and path boundaries", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    unknown: "ask",
    allowedRoots: ["/workspace/project", "/tmp/akeel"],
    blockedRoots: [],
  });

  assert.deepEqual(evaluateShellAdmission(admission("herdr agent"), develop), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr agent get child1"), develop), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr agent prompt child1 'review'"), develop), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr worktree create --cwd ."), develop), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr workspace close w1"), develop), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr worktree create --cwd /etc"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });

  const review = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  assert.deepEqual(evaluateShellAdmission(admission("herdr agent get child1"), review), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr workspace close w1"), review), {
    kind: "deny",
    code: "policy-denied",
  });
  assert.deepEqual(evaluateShellAdmission(admission("herdr agent prompt child1 'review'"), review), {
    kind: "deny",
    code: "policy-denied",
  });
});

test("Shell write and modification reject Git control artifacts even under allowing policy", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    write: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  for (const command of [
    "echo '#!/bin/sh' > .husky/pre-commit",
    "echo '#!/bin/sh' > .git/hooks/pre-commit",
    "echo '* filter=evil' > .gitattributes",
    "cp /workspace/project/script.sh .husky/pre-commit",
    "cp /workspace/project/script.sh .git/hooks/pre-commit",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }

  // Reading Git control artifacts remains allowed under develop
  for (const command of [
    "cat .husky/pre-commit",
    "cat .gitattributes",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command), develop), {
      kind: "allow",
    }, command);
  }
});

test("bounded rm enters policy evaluation while sensitive boundaries remain hard-boundary", () => {
  const askDestroy = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    write: "allow",
    destroy: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  const denyDestroy = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    write: "allow",
    destroy: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  const allowDestroy = freezeShellPolicySnapshot({
    ...policy,
    read: "allow",
    write: "allow",
    destroy: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  // Policy evaluation for bounded rm with UI
  assert.deepEqual(evaluateShellAdmission(admission("rm file.txt", true), askDestroy), {
    kind: "ask",
    executed: false,
  });
  assert.deepEqual(evaluateShellAdmission(admission("rm -f a.txt b.txt", true), askDestroy), {
    kind: "ask",
    executed: false,
  });
  // No UI fails closed with no-ui code
  assert.deepEqual(evaluateShellAdmission(admission("rm file.txt", false), askDestroy), {
    kind: "deny",
    code: "no-ui",
  });
  // Policy deny
  assert.deepEqual(evaluateShellAdmission(admission("rm file.txt", true), denyDestroy), {
    kind: "deny",
    code: "policy-denied",
  });
  // Policy allow
  assert.deepEqual(evaluateShellAdmission(admission("rm file.txt", true), allowDestroy), {
    kind: "allow",
  });

  // Sensitive and unbounded boundaries remain hard-boundary even under allowDestroy
  for (const command of [
    "rm /__test-agent-dir__/auth.json",
    "rm /__test-agent-dir__/auth.json.bak",
    "rm .git/config",
    "rm .gitattributes",
    "rm /etc/passwd",
    "/bin/rm file.txt",
    "rmdir empty_dir",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(command, true), allowDestroy), {
      kind: "deny",
      code: "hard-boundary",
    }, command);
  }
});

test("dual-plane executable identity enforces operand and artifact boundaries end-to-end", () => {
  const developPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "allow",
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: ["/workspace/project/blocked"],
    blockedPaths: ["/etc/passwd"],
  });

  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  // 1. System path-form reading credential -> hard-boundary even under develop
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/cat /__test-agent-dir__/auth.json", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 2. System path-form reading blocked path -> hard-boundary
  assert.deepEqual(evaluateShellAdmission(admission("/usr/bin/cat /etc/passwd", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 3. Custom path-form executable inside credential root -> hard-boundary
  assert.deepEqual(evaluateShellAdmission(admission("/__test-agent-dir__/auth.json", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 4. Custom path-form executable inside blocked root -> hard-boundary
  assert.deepEqual(evaluateShellAdmission(admission("/workspace/project/blocked/evil.sh", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 5. System path-form inspection tool reading allowed file under review -> allow
  assert.deepEqual(evaluateShellAdmission(admission("/bin/cat README.md", true), reviewPolicy), {
    kind: "allow",
  });

  // 6. Custom path-form in allowed workspace: develop allows, review denies
  assert.deepEqual(evaluateShellAdmission(admission("./scripts/build.sh", true), developPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("./scripts/build.sh", true), reviewPolicy), {
    kind: "deny",
    code: "policy-denied",
  });
});

test("bounded tr, sort, and uniq are allowed under review while blocked paths and awk/sed remain denied", () => {
  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  // 1. sort, uniq, tr with allowed files under review preset are admitted
  assert.deepEqual(evaluateShellAdmission(admission("sort file.txt", true), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("sort -u file.txt", true), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("uniq file.txt", true), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("tr 'a-z' 'A-Z'", true), reviewPolicy), {
    kind: "allow",
  });

  // 2. sort and uniq hitting credential roots trigger hard-boundary
  assert.deepEqual(evaluateShellAdmission(admission("sort /__test-agent-dir__/auth.json", true), reviewPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("uniq /__test-agent-dir__/auth.json", true), reviewPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 3. sort and uniq hitting blockedPaths trigger hard-boundary
  assert.deepEqual(evaluateShellAdmission(admission("sort /etc/passwd", true), reviewPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("uniq /etc/passwd", true), reviewPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 4. awk and sed remain unknown/opaque and are denied under review
  assert.deepEqual(evaluateShellAdmission(admission("awk '{print $1}' file.txt", true), reviewPolicy), {
    kind: "deny",
    code: "policy-denied",
  });
  assert.deepEqual(evaluateShellAdmission(admission("sed 's/a/b/' file.txt", true), reviewPolicy), {
    kind: "deny",
    code: "policy-denied",
  });
});

test("bounded chmod admits workspace files under develop, prompts in guided, denies in review, and hard-blocks credentials and git hooks", () => {
  const developPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "allow",
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  const guidedPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "ask",
    inspect: "allow",
    modify: "ask",
    execute: "ask",
    opaque: "ask",
    destroy: "deny",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  // 1. In workspace under develop: allow
  assert.deepEqual(evaluateShellAdmission(admission("chmod +x run.sh", true), developPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("chmod 755 run.sh", true), developPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("/bin/chmod +x run.sh", true), developPolicy), {
    kind: "allow",
  });

  // 2. In workspace under review: policy-denied (write: deny)
  assert.deepEqual(evaluateShellAdmission(admission("chmod +x run.sh", true), reviewPolicy), {
    kind: "deny",
    code: "policy-denied",
  });

  // 3. In workspace under guided: ask when UI present, no-ui deny when headless
  assert.deepEqual(evaluateShellAdmission(admission("chmod +x run.sh", true), guidedPolicy), {
    kind: "ask",
    executed: false,
  });
  assert.deepEqual(evaluateShellAdmission(admission("chmod +x run.sh", false), guidedPolicy), {
    kind: "deny",
    code: "no-ui",
  });

  // 4. Critical: Mandatory Boundary hard-blocks credential and Git control artifacts EVEN under develop!
  assert.deepEqual(evaluateShellAdmission(admission("chmod 777 /__test-agent-dir__/auth.json", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("chmod +x .git/hooks/pre-commit", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("chmod 600 .git/config", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("chmod 777 /etc/passwd", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Git inspect subcommands with safe filter options are allowed across develop, review, and guided presets", () => {
  const developPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "allow",
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  const guidedPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "ask",
    inspect: "allow",
    modify: "ask",
    execute: "ask",
    opaque: "ask",
    destroy: "deny",
    unknown: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  // 1. git log -S under review, develop, and guided: all allow because inspect is allow, read is allow, not opaque!
  assert.deepEqual(evaluateShellAdmission(admission("git log -S needle --oneline", false), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("git log -S needle --oneline", false), developPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("git log -S needle --oneline", false), guidedPolicy), {
    kind: "allow",
  });

  // 2. Complex filters are allowed under review
  assert.deepEqual(evaluateShellAdmission(admission("git log -G feat --grep=docs --author=alice -n 10", false), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("git log -5 --oneline", false), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("git branch --show-current", false), reviewPolicy), {
    kind: "allow",
  });

  // 3. High-risk option (--ext-diff) is hard-boundary blocked even under develop with UI
  assert.deepEqual(evaluateShellAdmission(admission("git log --ext-diff", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 4. Missing value is hard-boundary blocked even under develop
  assert.deepEqual(evaluateShellAdmission(admission("git log -S", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });

  // 5. git status -u variants and clustered short flags (-sb) are admitted across review, develop, and guided
  for (const cmd of [
    "git status -u",
    "git status -uno",
    "git status --untracked-files=all",
    "git status -sb",
    "git status -s -b",
    "git status --porcelain -b",
    "git status && git log -n 5 --oneline && git status -sb",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), reviewPolicy), { kind: "allow" }, cmd);
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), developPolicy), { kind: "allow" }, cmd);
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), guidedPolicy), { kind: "allow" }, cmd);
  }

  // 6. git stash list and show are admitted across review, develop, and guided
  for (const cmd of ["git stash list", "git stash show", "git stash show 'stash@{0}'"]) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), reviewPolicy), { kind: "allow" }, cmd);
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), developPolicy), { kind: "allow" }, cmd);
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), guidedPolicy), { kind: "allow" }, cmd);
  }

  // 7. Invalid status mode and mutating stash commands remain hard-boundary
  for (const cmd of ["git status -uevil", "git stash pop", "git stash drop", "git stash clear"]) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd, true), developPolicy), {
      kind: "deny",
      code: "hard-boundary",
    }, cmd);
  }
});

test("descriptor redirections and discard streams respect policy and mandatory boundaries", () => {
  const developPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "allow",
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  // 1. 2>/dev/null is inspect without write, so it is allowed under review
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2> /dev/null", false), reviewPolicy), {
    kind: "allow",
  });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2>&1", false), reviewPolicy), {
    kind: "allow",
  });

  // 2. 2> file is write, so it is policy-denied under review
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2> err.log", false), reviewPolicy), {
    kind: "deny",
    code: "policy-denied",
  });

  // 3. 2> file is allowed under develop in workspace
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2> err.log", false), developPolicy), {
    kind: "allow",
  });

  // 4. 2> credential artifact or git hook remains hard-boundary even under develop
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2> /__test-agent-dir__/auth.json", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2> .git/hooks/pre-commit", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md 2> /etc/passwd", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("deterministic commands true, false, and colon are admitted under review policy", () => {
  const developPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "allow",
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    unknown: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  const reviewPolicy = freezeShellPolicySnapshot({
    read: "allow",
    write: "deny",
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    unknown: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: ["/etc/passwd"],
  });

  // 1. Bare and system-form deterministic commands are inspect without opaque, so they are allowed under review
  for (const cmd of ["true", "false", ":", "/bin/true", "/usr/bin/false", "echo ok || true"]) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd, false), reviewPolicy), {
      kind: "allow",
    }, cmd);
  }

  // 2. Colon with write redirection is policy-denied under review because write is deny
  assert.deepEqual(evaluateShellAdmission(admission(": > out.log", false), reviewPolicy), {
    kind: "deny",
    code: "policy-denied",
  });

  // 3. Colon with write redirection is allowed under develop in workspace
  assert.deepEqual(evaluateShellAdmission(admission(": > out.log", false), developPolicy), {
    kind: "allow",
  });

  // 4. Colon with write redirection into credential boundary is hard-boundary
  assert.deepEqual(evaluateShellAdmission(admission(": > /__test-agent-dir__/auth.json", true), developPolicy), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("Git bounded restore and checkout commands are admitted as modify operations while unsafe forms remain hard-boundary", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });
  const review = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });
  const guided = freezeShellPolicySnapshot({
    ...policy,
    inspect: "allow",
    modify: "ask",
    execute: "ask",
    opaque: "ask",
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
  });

  const safeCommands = [
    "git restore src/app.ts",
    "git restore --staged src/app.ts",
    "git restore --source=HEAD src/app.ts",
    "git restore -- src/app.ts",
    "git checkout -- src/app.ts",
  ];

  for (const cmd of safeCommands) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd), develop), { kind: "allow" }, cmd);
    assert.deepEqual(evaluateShellAdmission(admission(cmd), review), { kind: "deny", code: "policy-denied" }, cmd);
    assert.deepEqual(evaluateShellAdmission(admission(cmd, true), guided), { kind: "ask", executed: false }, cmd);
  }

  const unsafeCommands = [
    "git restore",
    "git restore .",
    "git restore src/a.ts src/b.ts",
    "git restore '*.ts'",
    "git restore -p src/app.ts",
    "git restore --ours src/app.ts",
    "git restore --theirs src/app.ts",
    "git restore --source=origin/main src/app.ts",
    "git checkout src/app.ts",
    "git checkout main",
    "git checkout -- .",
    "git checkout -- src/a.ts src/b.ts",
    "git restore .git/hooks/pre-commit",
    "git restore .gitattributes",
    "git restore /etc/passwd",
  ];

  for (const cmd of unsafeCommands) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd), develop), { kind: "deny", code: "hard-boundary" }, cmd);
  }
});

test("bounded pipelines evaluate under policy presets with mandatory boundaries preserved", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: [],
    write: "allow",
    modify: "allow",
    inspect: "allow",
  });
  const review = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: [],
    write: "deny",
    modify: "deny",
    inspect: "allow",
  });
  const guided = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: [],
    write: "ask",
    modify: "ask",
    inspect: "allow",
  });

  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | head -n 5"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("git log -5 | grep fix"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("git diff origin/main..main | grep -E pattern"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("git diff origin/main..main --summary"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee"), review), { kind: "allow" });

  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee out.txt"), develop), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee out.txt"), review), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee out.txt", true), guided), { kind: "ask", executed: false });

  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee .git/hooks/pre-commit"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });
  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee .gitattributes"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });

  assert.deepEqual(evaluateShellAdmission(admission("cat README.md | tee /etc/crontab"), develop), {
    kind: "deny",
    code: "hard-boundary",
  });
});

test("build tools respect policy presets and enforce anti-destroy hard-boundaries", () => {
  const develop = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: [],
    write: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    inspect: "allow",
  });
  const review = freezeShellPolicySnapshot({
    ...policy,
    allowedRoots: ["/workspace/project"],
    blockedRoots: [],
    blockedPaths: [],
    write: "deny",
    modify: "deny",
    execute: "deny",
    opaque: "deny",
    destroy: "deny",
    inspect: "allow",
  });

  // 1. In review preset: inspect commands are allowed, execute commands are policy-denied
  assert.deepEqual(evaluateShellAdmission(admission("cargo --version"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("go version"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("make --version"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("mvn dependency:tree"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("gradle tasks"), review), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("java -version"), review), { kind: "allow" });

  assert.deepEqual(evaluateShellAdmission(admission("cargo build"), review), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("go test ./..."), review), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("make all"), review), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("mvn compile"), review), { kind: "deny", code: "policy-denied" });
  assert.deepEqual(evaluateShellAdmission(admission("gradle build"), review), { kind: "deny", code: "policy-denied" });

  // 2. In develop preset: execute commands are allowed
  assert.deepEqual(evaluateShellAdmission(admission("cargo build"), develop), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("go test ./..."), develop), { kind: "allow" });
  assert.deepEqual(evaluateShellAdmission(admission("make test"), develop), { kind: "allow" });

  // 3. In develop preset (even with destroy: allow): ALL clean commands MUST be hard-denied!
  for (const cmd of [
    "cargo clean",
    "cargo +nightly clean",
    "go clean",
    "go clean -cache",
    "make clean",
    "make distclean",
    "gmake mrproper",
    "mvn clean",
    "mvn clean compile",
    "mvn org.apache.maven.plugins:maven-clean-plugin:clean",
    "gradle clean",
    "gradle :app:clean",
    "gradlew clean",
  ]) {
    assert.deepEqual(evaluateShellAdmission(admission(cmd), develop), { kind: "deny", code: "hard-boundary" }, cmd);
  }
});


