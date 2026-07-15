/**
 * pipeline/plan-gate.ts — PLAN mode gate for all tool calls.
 * Delegates command classification to command-taxonomy via phase.ts.
 */

import { checkGate, isPlanMode } from "../phase";

export interface PlanGateInput {
  surface: string;
  toolPath?: string;
  bashCommand?: string;
}

export interface PlanGateResult {
  /** If blocked, reason string. Otherwise null. */
  blocked: string | null;
  /** True if in PLAN mode (all segments passed gate → auto-allow in later stages). */
  planPreAuthorized: boolean;
}

/** Apply PLAN mode gate. Returns blocking reason or null + pre-auth flag. */
export function applyPlanGate(input: PlanGateInput): PlanGateResult {
  const block = checkGate(input.surface, input.toolPath, input.bashCommand);
  if (block) return { blocked: block, planPreAuthorized: false };
  return { blocked: null, planPreAuthorized: isPlanMode() };
}
