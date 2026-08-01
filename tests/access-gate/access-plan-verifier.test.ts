// tests/access-gate/access-plan-verifier.test.ts
// 直接测试 access-plan-verifier 的每条校验分支（Task Record: 补全 adapter 命令级测试与 verifier 分支测试）
// 手法：compileShellCall 产生合法 plan → 深拷贝后逐字段篡改 → 深度冻结 →
//       new WeakSet 注册 → 直接调用 validateCompleteAccessPlan 断言 false。

import assert from "node:assert/strict";
import test from "node:test";
import { makeContext } from "./helpers";
import { compileShellCall, ANALYSIS_LIMITS } from "../../src/access-gate/gate";
import type { AccessOperation } from "../../src/access-gate/gate";
import { validateCompleteAccessPlan } from "../../src/access-gate/gate/access-plan-verifier";

const env = makeContext("pi-access-verifier-");
const base = (() => {
  const result = compileShellCall({ ...env, command: "echo hi > out.txt" });
  assert.equal(result.kind, "complete");
  return result.plan;
})();

function cloneCandidate(candidate: { cwd: string; certainty: string; branch: string }) {
  return { cwd: candidate.cwd, certainty: candidate.certainty, branch: candidate.branch };
}

function cloneOperation<T extends { span: { start: number; end: number } }>(operation: T): T {
  return { ...operation, span: { ...operation.span } };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    for (const symbol of Object.getOwnPropertySymbols(value)) deepFreeze((value as Record<PropertyKey, unknown>)[symbol]);
    Object.freeze(value);
  }
  return value;
}

/** 深拷贝 base plan，交给 mutator 篡改，深度冻结后返回。 */
function tampered(mutate: (draft: ReturnType<typeof baseClone>) => void): object {
  const draft = baseClone();
  mutate(draft);
  return deepFreeze(draft);
}

function baseClone() {
  return {
    ...base,
    operations: base.operations.map(cloneOperation),
    commands: base.commands.slice(),
    paths: base.paths.slice(),
    effects: base.effects.slice(),
    cwdCandidates: base.cwdCandidates.map(cloneCandidate),
    coverage: {
      ...base.coverage,
      commandSpans: base.coverage.commandSpans.map((span) => ({ ...span })),
      redirectionSpans: base.coverage.redirectionSpans.map((span) => ({ ...span })),
    },
    resourceUsage: { ...base.resourceUsage },
  };
}

function verify(plan: object): boolean {
  const issuedPlans = new WeakSet<object>();
  issuedPlans.add(plan);
  return validateCompleteAccessPlan(plan, issuedPlans);
}

test("verifier accepts the plan produced by the compiler", () => {
  assert.equal(verify(base), true);
});

test("rejects redirection spans that do not match redirection path operations", () => {
  const plan = tampered((draft) => {
    draft.coverage.redirectionSpans = [{ start: 0, end: 1 }];
  });
  assert.equal(verify(plan), false);
});

test("rejects a missing redirection span entry", () => {
  const plan = tampered((draft) => {
    draft.coverage.redirectionSpans = [];
  });
  assert.equal(verify(plan), false);
});

test("rejects effect operations that do not match declared command effects", () => {
  const plan = tampered((draft) => {
    draft.effects = draft.effects.slice(0, -1);
  });
  assert.equal(verify(plan), false);
});

test("rejects an effect operation with a mismatched span", () => {
  const plan = tampered((draft) => {
    draft.operations = draft.operations.map((operation) =>
      operation.kind === "effect" && operation.effect === "read"
        ? { ...operation, span: { start: 5, end: 6 } }
        : operation,
    );
  });
  assert.equal(verify(plan), false);
});

test("rejects usage.commandCount inconsistent with coverage.commandCount", () => {
  const plan = tampered((draft) => {
    draft.resourceUsage.commandCount = draft.coverage.commandCount + 1;
  });
  assert.equal(verify(plan), false);
});

test("rejects usage.operationCount inconsistent with operations length", () => {
  const plan = tampered((draft) => {
    draft.resourceUsage.operationCount = draft.operations.length + 1;
  });
  assert.equal(verify(plan), false);
});

test("rejects usage.cwdCandidateCount inconsistent with coverage", () => {
  const plan = tampered((draft) => {
    draft.resourceUsage.cwdCandidateCount = draft.coverage.cwdCandidateCount + 1;
  });
  assert.equal(verify(plan), false);
});

test("rejects coverage.cwdCandidateCount inconsistent with per-operation candidates", () => {
  const plan = tampered((draft) => {
    draft.coverage.cwdCandidateCount = draft.coverage.cwdCandidateCount + 1;
  });
  assert.equal(verify(plan), false);
});

test("rejects duplicate cwd candidates", () => {
  const plan = tampered((draft) => {
    draft.cwdCandidates = [draft.cwdCandidates[0]!, draft.cwdCandidates[0]!];
  });
  assert.equal(verify(plan), false);
});

test("rejects input length above the analysis budget", () => {
  const plan = tampered((draft) => {
    draft.resourceUsage.inputLength = ANALYSIS_LIMITS.maxInputLength + 1;
  });
  assert.equal(verify(plan), false);
});

test("rejects coverage.commandCount above the operations length", () => {
  const plan = tampered((draft) => {
    draft.coverage.commandCount = draft.operations.length + 1;
    draft.resourceUsage.commandCount = draft.coverage.commandCount;
  });
  assert.equal(verify(plan), false);
});

test("rejects a negative usage count", () => {
  const plan = tampered((draft) => {
    draft.resourceUsage.inputLength = -1;
  });
  assert.equal(verify(plan), false);
});

test("rejects a fractional coverage count", () => {
  const plan = tampered((draft) => {
    draft.coverage.commandCount = 1.5;
  });
  assert.equal(verify(plan), false);
});

test("rejects a path operation with an invalid source", () => {
  const plan = tampered((draft) => {
    draft.operations = draft.operations.map((operation) =>
      operation.kind === "path" ? ({ ...operation, source: "garbage" } as unknown as AccessOperation) : operation,
    );
  });
  assert.equal(verify(plan), false);
});

test("rejects an effect operation with an invalid confidence", () => {
  const plan = tampered((draft) => {
    draft.operations = draft.operations.map((operation) =>
      operation.kind === "effect" ? ({ ...operation, confidence: "garbage" } as unknown as AccessOperation) : operation,
    );
  });
  assert.equal(verify(plan), false);
});

test("rejects a path input above the max argument length", () => {
  const longInput = "x".repeat(ANALYSIS_LIMITS.maxArgumentLength + 1);
  const plan = tampered((draft) => {
    draft.operations = draft.operations.map((operation) =>
      operation.kind === "path" ? { ...operation, input: longInput } : operation,
    );
  });
  assert.equal(verify(plan), false);
});

test("rejects an operation array above the max operations budget", () => {
  const plan = tampered((draft) => {
    const filler = draft.commands[0]!;
    const extra = Array.from({ length: ANALYSIS_LIMITS.maxOperations }, () => ({ ...filler }));
    draft.operations = [...draft.operations, ...extra];
  });
  assert.equal(verify(plan), false);
});
