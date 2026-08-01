import assert from "node:assert/strict";
import test from "node:test";
import { compileShellCall, compileDirectToolCall } from "../../src/access-gate/gate";
import { evaluateRequest } from "../../src/access-gate/gate/evaluate-request";
import type { CompileResult, CompilerContext } from "../../src/access-gate/gate/access-request";
import type { GateDecision } from "../../src/access-gate/gate/decision-types";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";
import { makeContext } from "./helpers";

function context(): CompilerContext & { cleanup: () => void } {
  return makeContext("pi-invariants-");
}

function profile(): ResolvedProfile {
  return {
    name: "test", description: "test",
    shellPolicy: { inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" },
    pathPolicy: { default: { read: "allow", list: "allow", search: "allow", write: "deny" }, rules: [] },
  };
}

function complete(result: CompileResult) {
  assert.equal(result.kind, "complete");
  return result.plan;
}

function disposition(decision: GateDecision): string {
  return decision.disposition;
}

test("Shell grep and Direct grep produce equivalent search path operations", () => {
  const shell = context();
  const direct = context();
  try {
    const shellReq = complete(compileShellCall({ ...shell, command: "grep -rn pattern allowed" }));
    const directReq = complete(compileDirectToolCall({ ...direct, surface: "grep", args: { pattern: "pattern", path: "allowed" } }));
    const shellPath = shellReq.operations.filter((o): o is typeof o & { kind: "path" } => o.kind === "path" && o.operation === "search");
    const directPath = directReq.operations.filter((o): o is typeof o & { kind: "path" } => o.kind === "path" && o.operation === "search");
    assert.equal(shellPath.length, directPath.length);
    if (shellPath[0] && directPath[0]) {
      assert.equal(shellPath[0].input, directPath[0].input);
      assert.equal(shellPath[0].operation, directPath[0].operation);
    }
  } finally { shell.cleanup(); direct.cleanup(); }
});

test("Shell and Direct read produce equivalent decisions for an allowed file", () => {
  const shell = context();
  const direct = context();
  try {
    const p = profile();
    const shellDec = evaluateRequest(complete(compileShellCall({ ...shell, command: "cat allowed" })), p);
    const directDec = evaluateRequest(complete(compileDirectToolCall({ ...direct, surface: "read", args: { path: "allowed" } })), p);
    assert.equal(disposition(shellDec), "allow");
    assert.equal(disposition(directDec), "allow");
  } finally { shell.cleanup(); direct.cleanup(); }
});

test("both Shell and Direct deny write on a write-denied profile", () => {
  const shell = context();
  const direct = context();
  try {
    const p = profile();
    const shellDec = evaluateRequest(complete(compileShellCall({ ...shell, command: "touch allowed/new" })), p);
    const directDec = evaluateRequest(complete(compileDirectToolCall({ ...direct, surface: "write", args: { path: "allowed/new", content: "x" } })), p);
    assert.equal(disposition(shellDec), "deny");
    assert.equal(disposition(directDec), "deny");
  } finally { shell.cleanup(); direct.cleanup(); }
});

test("cwd candidates for cd && cmd include the target directory", () => {
  const env = context();
  try {
    const req = complete(compileShellCall({ ...env, command: "cd allowed && grep -rn pattern ." }));
    const search = req.operations.filter((o): o is typeof o & { kind: "path" } => o.kind === "path" && o.operation === "search");
    assert.equal(search.length, 1);
    assert.ok(search[0]!.cwdCandidates.some((c: { cwd: string }) => c.cwd.endsWith("/allowed")));
  } finally { env.cleanup(); }
});

test("cwd candidates for cd || cmd preserve the original cwd", () => {
  const env = context();
  try {
    const req = complete(compileShellCall({ ...env, command: "cd allowed || grep -rn pattern ." }));
    const search = req.operations.filter((o): o is typeof o & { kind: "path" } => o.kind === "path" && o.operation === "search");
    assert.equal(search[0]!.cwdCandidates.every((c: { cwd: string }) => c.cwd === env.cwd), true);
  } finally { env.cleanup(); }
});

test("pipeline does not propagate cd cwd across stages", () => {
  const env = context();
  try {
    const req = complete(compileShellCall({ ...env, command: "cd allowed | grep -rn pattern ." }));
    const search = req.operations.filter((o): o is typeof o & { kind: "path" } => o.kind === "path" && o.operation === "search");
    assert.equal(search[0]!.cwdCandidates[0]?.cwd, env.cwd);
  } finally { env.cleanup(); }
});

test("adding a path intent does not make a decision weaker", () => {
  const env = context();
  try {
    const p: ResolvedProfile = { ...profile(), pathPolicy: { default: { read: "allow" as const, list: "allow" as const, search: "allow" as const, write: "ask" as const }, rules: [] } };
    const single = complete(compileShellCall({ ...env, command: "echo data > first.txt" }));
    const double = complete(compileShellCall({ ...env, command: "echo data > first.txt > second.txt" }));
    const singleDec = evaluateRequest(single, p);
    const doubleDec = evaluateRequest(double, p);
    assert.equal(disposition(singleDec), "ask");
    assert.equal(disposition(doubleDec), "ask");
    const doubleEvidence = doubleDec.disposition === "ask" ? doubleDec.evidence.length : 0;
    const singleEvidence = singleDec.disposition === "ask" ? singleDec.evidence.length : 0;
    assert.ok(doubleEvidence >= singleEvidence);
  } finally { env.cleanup(); }
});

test("denied path blocks even when another path is allowed", () => {
  const env = context();
  try {
    const p = profile();
    const req = complete(compileShellCall({ ...env, command: "cat allowed /etc/passwd" }));
    const dec = evaluateRequest(req, p);
    assert.equal(disposition(dec), "deny");
  } finally { env.cleanup(); }
});
