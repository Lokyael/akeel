/**
 * integration.test.ts — 端到端流水线验证。
 *
 * 验证完整流水线（PLAN gate → bash/threat → permission）的协作正确性。
 * 不 mock 模块，使用真实 pipeline 函数。
 */

import { evaluateBashCommand } from "../../src/security-gate/pipeline/bash";
import { evaluateToolPermission } from "../../src/security-gate/pipeline/permission";
import { applyPlanGate } from "../../src/security-gate/pipeline/plan-gate";
import { createPhaseController } from "../../src/security-gate/phase";
import { DEFAULT_CONFIGS } from "../../src/security-gate/config/index";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SecurityConfig } from "../../src/security-gate/types";

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string): void {
    if (condition) { passed++; }
    else { console.error(`  FAIL: ${message}`); failed++; }
  }

  function testConfig(overrides?: Partial<SecurityConfig>): SecurityConfig {
    return {
      level: "standard",
      permission: {
        "*": "ask",
        path: { "*": "allow" },
        hardPath: [".env", "*.pem"],
        read: { "*": "allow" },
        write: { "*": "ask" },
        edit: { "*": "ask" },
        external_directory: "ask",
        bash: {},
      },
      ...overrides,
    };
  }

  const noopCtx = {
    hasUI: false,
  } as unknown as ExtensionContext;

  // ═══════════════════════════════════════════════════════════════
  // 1. PLAN gate → bash pipeline: 只读命令通过
  // ═══════════════════════════════════════════════════════════════

  console.log("\n1. PLAN gate → bash: read-only commands pass through");

  const controller = createPhaseController();

  const planResult = applyPlanGate(controller, {
    surface: "bash",
    toolPath: undefined,
    bashCommand: "echo hello",
    cwd: process.cwd(),
    config: DEFAULT_CONFIGS.standard,
  });
  assert(planResult.kind === "allow", "PLAN allows echo");

  const bashResult = await evaluateBashCommand({
    command: "echo hello",
    cwd: process.cwd(),
    ctx: noopCtx,
    config: DEFAULT_CONFIGS.standard,
  });
  assert(bashResult.kind === "allow", "bash pipeline allows echo");

  // ═══════════════════════════════════════════════════════════════
  // 2. PLAN gate → bash pipeline: 危险命令被拦截
  // ═══════════════════════════════════════════════════════════════

  console.log("\n2. PLAN gate → bash: dangerous commands are blocked");

  const blockPlan = applyPlanGate(controller, {
    surface: "bash",
    toolPath: undefined,
    bashCommand: "sudo rm -rf /",
    cwd: process.cwd(),
    config: DEFAULT_CONFIGS.standard,
  });
  assert(blockPlan.kind === "block", "PLAN blocks rm -rf /");

  const blockBash = await evaluateBashCommand({
    command: "eval 'rm -rf /'",
    cwd: process.cwd(),
    ctx: noopCtx,
    config: DEFAULT_CONFIGS.standard,
  });
  assert(blockBash.kind === "block", "bash pipeline blocks eval");

  // ═══════════════════════════════════════════════════════════════
  // 3. hardPath 不可变路径拦截
  // ═══════════════════════════════════════════════════════════════

  console.log("\n3. hardPath immutable paths are blocked");

  const toolResult = await evaluateToolPermission({
    surface: "read",
    value: ".env",
    cwd: process.cwd(),
    ctx: noopCtx,
    config: testConfig(),
  });
  assert(toolResult?.kind === "block", "tool read of .env is blocked by hardPath");

  const bashReadResult = await evaluateBashCommand({
    command: "cat .env",
    cwd: process.cwd(),
    ctx: noopCtx,
    config: testConfig(),
  });
  assert(bashReadResult.kind === "block", "bash cat .env is blocked by hardPath");

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════

  console.log(`\n  RESULTS: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void main();
