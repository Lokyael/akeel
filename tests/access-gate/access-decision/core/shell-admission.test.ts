import assert from "node:assert/strict";
import test from "node:test";
import { projectUnifiedAdmission as projectShellAdmission } from "../../../../packages/access-gate/src/access-gate/access-decision/core/authorization/index";
import {
  compileManagedCall,
  createCompileEnvironment,
  createLinuxPathEvidence,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/index";

function compileShell(request: Readonly<{
  readonly surface: "bash";
  readonly arguments: Readonly<{ readonly command: string }>;
  readonly cwd: string;
  readonly hasUI: boolean;
  readonly home?: string;
}>) {
  return compileManagedCall(
    { surface: request.surface, arguments: request.arguments },
    createCompileEnvironment({ cwd: request.cwd, home: request.home, pathEvidence: createLinuxPathEvidence() }),
  );
}

const pathContract = {
  source: "linux-manual",
  referenceStatus: "externally-proven",
} as const;

const request = {
  surface: "bash",
  arguments: { command: "cat input.txt > output.txt" },
  cwd: "/workspace/project",
  hasUI: false,
} as const;

test("a complete Shell compilation projects to one sealed opaque Admission", () => {
  const compilation = compileShell(request);
  const admission = projectShellAdmission(compilation);

  assert.ok(admission);
  assert.notEqual(admission, compilation);
  assert.equal(Object.isFrozen(admission), true);
  assert.deepEqual(Object.keys(admission), []);
  assert.equal(pathContract.referenceStatus, "externally-proven");
});

test("a copied Shell compilation cannot be projected into Admission", () => {
  const compilation = compileShell(request);
  const copied = { ...compilation };

  assert.equal(projectShellAdmission(copied), undefined);
  assert.equal(pathContract.source, "linux-manual");
});

test("a rejected Shell compilation has no Admission projection", () => {
  const rejected = compileShell({
    ...request,
    arguments: { command: "cat \"$(pwd)\"" },
  });

  assert.equal(projectShellAdmission(rejected), undefined);
  assert.equal(pathContract.referenceStatus, "externally-proven");
});

test("an unresolved home-relative path is rejected before Admission", () => {
  const rejected = compileShell({
    ...request,
    arguments: { command: "cat ~/input.txt" },
  });

  assert.deepEqual(rejected, {
    kind: "reject",
    code: "invalid-request",
    anchor: { start: 0, end: 15 },
    resourceClass: "input",
  });
  assert.equal(pathContract.source, "linux-manual");
});

test("an explicit home context permits a home-relative Admission candidate", () => {
  const compilation = compileShell({
    ...request,
    home: "/home/agent",
    arguments: { command: "cat ~/input.txt" },
  });

  assert.ok(projectShellAdmission(compilation));
  assert.equal(pathContract.referenceStatus, "externally-proven");
});
