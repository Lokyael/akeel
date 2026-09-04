import type { Decision } from "./types";

export type RenderedDecision = Decision;

export function renderDecision(decision: Decision): RenderedDecision {
  if (decision.kind === "allow") return Object.freeze({ kind: "allow" });
  if (decision.kind === "ask") return Object.freeze({ kind: "ask", executed: false });
  return Object.freeze({ kind: "deny", code: decision.code });
}
