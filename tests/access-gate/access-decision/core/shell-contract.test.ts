import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { PROBES } from "./fixtures";

function bash(script: string): string {
  return execFileSync("bash", ["--noprofile", "--norc", "-c", script], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
}

test("Bash and-or lists short-circuit without changing the current directory", () => {
  const output = bash('false && cd /tmp; printf "%s\\n" "$PWD"; true || cd /tmp; printf "%s\\n" "$PWD"');
  const [afterFalse, afterTrue] = output.trimEnd().split("\n");
  assert.equal(afterFalse, process.cwd());
  assert.equal(afterTrue, process.cwd());
});

test("Bash and-or lists associate left-to-right", () => {
  assert.equal(bash("false && printf A || printf B").trim(), "B");
  assert.equal(bash("true || printf A && printf B").trim(), "B");
});

test("Bash quote and escape rules keep quoted tildes literal", () => {
  const output = bash('printf "<%s>\\n" ~/x "~/x" \\~/x').trimEnd().split("\n");
  assert.deepEqual(output, [`<${process.env.HOME}/x>`, "<~/x>", "<~/x>"]);
});

test("Bash repeats one bound scalar for adjacent parameter references", () => {
  assert.equal(bash('for f in a b; do printf "%s\\n" "$f$f"; done'), "aa\nbb\n");
});

test("shell probes are independently observed against Bash, not legacy outputs", () => {
  const shellProbes = PROBES.filter((probe) => probe.id.startsWith("shell-"));
  assert.equal(shellProbes.length, 3);
  assert.ok(shellProbes.every((probe) => probe.source === "bash-manual"));
  assert.ok(shellProbes.every((probe) => probe.referenceStatus === "independently-observed"));
});
