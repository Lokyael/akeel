/**
 * phase.ts — PLAN/BUILD mode state machine.
 *
 * Pure state: zero external dependencies. No imports from taxonomy, policy, or pi types.
 * Responsibility: track whether the session is in PLAN (default) or BUILD mode.
 *
 * Gate logic (checkGate) lives in pipeline/plan-gate.ts.
 * Command registration (/plan, /build) lives in index.ts.
 */

export interface PhaseController {
  getMode(): "plan" | "build";
  setPlan(): void;
  setBuild(): void;
  reset(): void;
}

export function createPhaseController(): PhaseController {
  let mode: "plan" | "build" = "plan";
  return {
    getMode: () => mode,
    setPlan: () => { mode = "plan"; },
    setBuild: () => { mode = "build"; },
    reset: () => { mode = "plan"; },
  };
}
