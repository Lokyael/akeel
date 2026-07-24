import { guidanceFor } from "./guidance-catalog";
import type {
  DecisionCode,
  Enforcement,
  GateDecision,
  GateEvidence,
  Guidance,
  HardDenyCode,
  ProfileDenyCode,
} from "./decision-types";
import { evidenceKind } from "./access-request";

export class DecisionBuilder {
  private _disposition: "deny" | "ask" = "deny";
  private _code: DecisionCode | null = null;
  private _enforcement: Enforcement | null = null;
  private _evidence: GateEvidence[] = [];
  private _approvalEvidence: GateEvidence[] = [];
  private _guidanceOverride: readonly Guidance[] | undefined;

  static hard(code: HardDenyCode, subject: string, span?: { start: number; end: number }): GateDecision {
    return new DecisionBuilder().hard(code, subject, span).build();
  }

  static profile(code: ProfileDenyCode, subject: string): GateDecision {
    return new DecisionBuilder().profile(code, subject).build();
  }

  static approval(evidence: readonly GateEvidence[]): GateDecision {
    return new DecisionBuilder().ask(evidence).build();
  }

  hard(code: HardDenyCode, subject: string, span?: { start: number; end: number }): this {
    this._disposition = "deny";
    this._code = code;
    this._enforcement = "hard";
    this._evidence.push({ kind: evidenceKind(code), subject, span });
    return this;
  }

  profile(code: ProfileDenyCode, subject: string): this {
    this._disposition = "deny";
    this._code = code;
    this._enforcement = "profile";
    this._evidence.push({ kind: "path", subject });
    return this;
  }

  ask(evidence: readonly GateEvidence[]): this {
    this._disposition = "ask";
    this._code = "approval-required";
    this._approvalEvidence = [...evidence];
    return this;
  }

  addEvidence(subject: string, kind: GateEvidence["kind"] = "path"): this {
    this._evidence.push({ kind, subject });
    return this;
  }

  withGuidance(guidance: readonly Guidance[]): this {
    this._guidanceOverride = guidance;
    return this;
  }

  build(): GateDecision {
    if (this._disposition === "ask") {
      return {
        disposition: "ask",
        code: "approval-required",
        evidence: this._approvalEvidence,
        approval: {
          code: "approval-required",
          scope: "tool-call",
          evidence: this._approvalEvidence,
          options: ["Allow once", "Deny"],
        },
      };
    }
    const code = this._code! as HardDenyCode | ProfileDenyCode | "user-denied";
    const enforcement = this._enforcement! as "hard" | "profile" | "user";
    const guidance = this._guidanceOverride !== undefined
      ? this._guidanceOverride
      : guidanceFor(code);
    if (enforcement === "hard") {
      return { disposition: "deny", code: code as HardDenyCode, enforcement: "hard", evidence: this._evidence, guidance };
    }
    return { disposition: "deny", code: code as ProfileDenyCode, enforcement: "profile", evidence: this._evidence, guidance };
  }
}

